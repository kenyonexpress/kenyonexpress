-- 217_coupon_qr_redemption.sql
--
-- The claim wiring 182 promised: redeemed_at called itself "the per-unit
-- single-use gate" while nothing in the database or the code ever set it, so
-- the gate was a filter on a column that stayed NULL forever. A printed flyer
-- could be scanned, applied and charged any number of times, capped only by
-- the campaign's own limits, which 194 enforces per campaign code and which an
-- 8-digit unit code never matches (claim_order_discount looks it up in
-- discount_campaigns.code and coupons.code, finds neither, and answers NULL,
-- the "unknown code, nothing to cap" path).
--
-- TWO FUNCTIONS, BOTH service_role ONLY:
--
--   redeem_coupon_qr(code, order, user, agorot)  the atomic claim. Locks the
--     unit row FOR UPDATE, which IS the single-use lock: two redemptions of
--     the same flyer serialize on the row, the loser reads redeemed_at NOT
--     NULL and is refused. Campaign-level caps are delegated to the live
--     claim_order_discount (194) inside the same transaction, so a unit
--     redemption and its campaign ledger row commit or vanish together.
--     Idempotent per (code, order): a replay of an order that already spent
--     this unit answers ok/already_claimed, the 096 lesson that a retried
--     webhook must not read its own success as somebody else's.
--
--   expire_coupon_qr_codes()  the nightly sweep. Stamps expired_at on
--     unredeemed codes past their own expires_at or whose campaign has ended
--     or been archived. Moves no money and changes no entitlement: the redeem
--     function re-checks expiry inside its own lock, same division of labour
--     as expire_vouchers vs redeem_voucher. What the sweep buys is truthful
--     inventory (an admin counting unspent codes in a batch does not count
--     dead ones) and an indexed short-circuit for the cart lookup.
--
-- THE TWO NEW COLUMNS on coupon_qr_codes:
--
--   expires_at  optional per-code deadline, NULL = the campaign window alone
--     governs. Lets one print run die with its flyer ("תוקף עד סוף ספטמבר")
--     while the campaign keeps running for the next batch.
--   expired_at  the sweep's stamp. Split from redeemed_at because a spent
--     code and a dead code are different answers at the till and different
--     rows in a batch report.
--
-- Money: p_amount_agorot is integer agorot, same as every function 194 ships.

ALTER TABLE public.coupon_qr_codes
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

ALTER TABLE public.coupon_qr_codes
  ADD COLUMN IF NOT EXISTS expired_at timestamptz;

COMMENT ON COLUMN public.coupon_qr_codes.expires_at IS
  'Optional per-code deadline. NULL means the campaign window alone governs.';

COMMENT ON COLUMN public.coupon_qr_codes.expired_at IS
  'Set by expire_coupon_qr_codes() once the code or its campaign is past due. '
  'Reporting and lookup short-circuit; redeem_coupon_qr re-checks expiry itself.';

-- The sweep's working set: only codes that are neither spent nor already
-- stamped. Partial, so a mostly-redeemed table costs the sweep near nothing.
CREATE INDEX IF NOT EXISTS coupon_qr_codes_expiry_due_idx
  ON public.coupon_qr_codes (expires_at)
  WHERE redeemed_at IS NULL AND expired_at IS NULL;

-- ---------------------------------------------------------------- the claim

CREATE OR REPLACE FUNCTION public.redeem_coupon_qr(
  p_code          text,
  p_order_id      uuid,
  p_user_id       uuid,
  p_amount_agorot integer DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_code          text := btrim(coalesce(p_code, ''));
  v_unit          public.coupon_qr_codes%ROWTYPE;
  v_campaign_code text;
  v_refusal       text;
BEGIN
  -- A claim with no order is a claim nothing could ever release or audit.
  IF p_order_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_order');
  END IF;

  -- Shape gate matching coupon_qr_codes_code_format, so a malformed input is
  -- refused without burning a lock.
  IF v_code !~ '^[0-9]{8}$' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unknown');
  END IF;

  -- FOR UPDATE is the whole point: two redemptions of the same printed code
  -- serialize here, and the second reads what the first wrote. Without it,
  -- both read redeemed_at NULL and both succeed, which is the read-then-write
  -- bug 194's header retells about stock.
  SELECT * INTO v_unit
    FROM public.coupon_qr_codes
   WHERE code = v_code
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unknown');
  END IF;

  IF v_unit.redeemed_at IS NOT NULL THEN
    -- Replay before refusal, the 096 ordering: the order that spent this unit
    -- retrying (webhook redelivery, checkout retry) is idempotent success,
    -- not a second attempt.
    IF v_unit.redeemed_order_id = p_order_id THEN
      RETURN jsonb_build_object('ok', true, 'reason', 'already_claimed',
                                'campaign_id', v_unit.campaign_id);
    END IF;
    RETURN jsonb_build_object('ok', false, 'reason', 'redeemed');
  END IF;

  IF v_unit.expired_at IS NOT NULL
     OR (v_unit.expires_at IS NOT NULL AND v_unit.expires_at <= now()) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'expired');
  END IF;

  SELECT c.code INTO v_campaign_code
    FROM public.discount_campaigns c
   WHERE c.id = v_unit.campaign_id
     AND c.deleted_at IS NULL;

  IF v_campaign_code IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'campaign_gone');
  END IF;

  -- Campaign caps (window, active, max_uses, per-user) belong to 194 and are
  -- not restated here. Same transaction: if the campaign refuses, the unit
  -- row was not yet touched; if the unit update below failed, the campaign
  -- ledger row rolls back with it.
  v_refusal := public.claim_order_discount(p_order_id, p_user_id, v_campaign_code, p_amount_agorot);
  IF v_refusal IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', v_refusal);
  END IF;

  UPDATE public.coupon_qr_codes
     SET redeemed_at = now(),
         redeemed_order_id = p_order_id
   WHERE id = v_unit.id;

  RETURN jsonb_build_object('ok', true,
                            'campaign_id', v_unit.campaign_id,
                            'amount_agorot', p_amount_agorot);
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_coupon_qr(text, uuid, uuid, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_coupon_qr(text, uuid, uuid, integer)
  TO service_role;

COMMENT ON FUNCTION public.redeem_coupon_qr(text, uuid, uuid, integer) IS
  'Atomically spends one printed QR coupon code for an order. Locks the unit '
  'row FOR UPDATE (the single-use gate), delegates campaign caps to '
  'claim_order_discount, idempotent per (code, order). service_role only.';

-- ---------------------------------------------------------------- the sweep

CREATE OR REPLACE FUNCTION public.expire_coupon_qr_codes()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH swept AS (
    UPDATE public.coupon_qr_codes u
       SET expired_at = now()
     WHERE u.redeemed_at IS NULL
       AND u.expired_at IS NULL
       AND (
         (u.expires_at IS NOT NULL AND u.expires_at <= now())
         OR EXISTS (
           SELECT 1
             FROM public.discount_campaigns c
            WHERE c.id = u.campaign_id
              AND (c.deleted_at IS NOT NULL
                   OR (c.expires_at IS NOT NULL AND c.expires_at <= now()))
         )
       )
     RETURNING 1
  )
  SELECT count(*)::integer FROM swept;
$$;

REVOKE ALL ON FUNCTION public.expire_coupon_qr_codes()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_coupon_qr_codes()
  TO service_role;

COMMENT ON FUNCTION public.expire_coupon_qr_codes() IS
  'Nightly sweep: stamps expired_at on unredeemed QR coupon codes past their '
  'own expires_at or whose campaign ended or was archived. Moves no money; '
  'redeem_coupon_qr re-checks expiry inside its own lock. service_role only.';
