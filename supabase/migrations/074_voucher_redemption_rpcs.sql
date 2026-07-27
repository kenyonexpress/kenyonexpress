-- 074_voucher_redemption_rpcs.sql
--
-- The scan-time half of the voucher subsystem. 073 shipped the tables and
-- deliberately left this out, so `POST /api/supplier/vouchers/redeem` has been
-- calling two functions that do not exist on the hosted project: a voucher
-- could be issued and paid for, and never redeemed.
--
-- ADAPTED FROM 054 SECTIONS 5-7, NOT VERBATIM. Two model changes and one
-- security fix separate this from the original:
--
--   1. ESCROW RELEASE (C11 version b, decided 2026-07-27). 054 was written when
--      the platform kept the whole prepayment and the supplier got nothing, so
--      redemption moved no money at all. Under the current model the platform
--      keeps platform_percent of the prepayment and the remainder is HELD for
--      the supplier until the voucher is redeemed. redeem_voucher() therefore
--      closes that hold in the same transaction as the status flip: one
--      statement decides both, so a released hold without a redeemed voucher is
--      not a reachable state.
--
--   2. EXPIRY IS NOT FORFEITURE (C6). A voucher that expires unscanned refunds
--      the supplier's hold and credits the customer's wallet with what they
--      paid. Neither the platform nor the supplier keeps money for a service
--      never rendered. The credit is a separate function from the status sweep
--      on purpose: if the money leg fails, the statuses are still correct and
--      the credit retries on the next run, keyed so it can only land once.
--
--   3. escrow_holds accepts a voucher. The table was keyed to coupon_codes,
--      the legacy instance table, with coupon_code_id NOT NULL. It now takes
--      either a coupon_code_id or a voucher_id and exactly one of them.
--
-- Idempotent, forward-only. Depends on: 073 (vouchers, voucher_redemptions),
-- 072 (supplier_members, is_supplier_member), 047 (escrow_holds, escrow_status),
-- 046 (wallet_accounts, wallet_entries, fn_wallet_transfer),
-- 019 (check_user_rate_limit).

-- ---------------------------------------------------------------------------
-- 1. escrow_holds holds a voucher, not only a legacy coupon code
-- ---------------------------------------------------------------------------

ALTER TABLE public.escrow_holds
  ADD COLUMN IF NOT EXISTS voucher_id uuid REFERENCES public.vouchers(id) ON DELETE RESTRICT;

ALTER TABLE public.escrow_holds ALTER COLUMN coupon_code_id DROP NOT NULL;

COMMENT ON COLUMN public.escrow_holds.voucher_id IS
  'The voucher this hold belongs to, one hold per voucher. Set on every hold written since 074; the two legacy rows carry coupon_code_id instead. held_agorot is the whole prepayment for that unit, commission_agorot the platform take, release_agorot what the supplier receives when the voucher is redeemed.';

-- Multiple NULLs are distinct under a Postgres unique index, so this coexists
-- with the pre-existing UNIQUE (coupon_code_id) without either blocking the
-- other.
CREATE UNIQUE INDEX IF NOT EXISTS escrow_holds_voucher_id_key
  ON public.escrow_holds (voucher_id) WHERE voucher_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS escrow_holds_status_supplier_idx
  ON public.escrow_holds (supplier_id, status, held_at DESC);

-- A hold that points at neither instance cannot be released to anybody, and one
-- that points at both has two contradictory owners.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.escrow_holds'::regclass
      AND conname = 'escrow_holds_exactly_one_instance'
  ) THEN
    ALTER TABLE public.escrow_holds
      ADD CONSTRAINT escrow_holds_exactly_one_instance
      CHECK (num_nonnulls(coupon_code_id, voucher_id) = 1) NOT VALID;
  END IF;
END $$;

DO $$ BEGIN
  ALTER TABLE public.escrow_holds VALIDATE CONSTRAINT escrow_holds_exactly_one_instance;
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE
    '074: escrow_holds_exactly_one_instance stays NOT VALID, existing rows violate it. New rows are still checked.';
END $$;

-- ---------------------------------------------------------------------------
-- 2. voucher_success_payload(): the shape the counter sees on a good scan
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.voucher_success_payload(v public.vouchers)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT jsonb_build_object(
    'outcome',                     'success',
    'voucher_id',                  v.id,
    'code',                        v.code,
    'status',                      v.status::text,
    'product_name',                (SELECT p.name_he FROM public.products p WHERE p.id = v.product_id),
    'supplier_name',               (SELECT s.name FROM public.suppliers s WHERE s.id = v.supplier_id),
    'customer_name',               (SELECT pr.full_name FROM public.profiles pr WHERE pr.id = v.user_id),
    'face_value_agorot',           v.face_value_agorot,
    'coupon_price_agorot',         v.coupon_price_agorot,
    'remaining_amount_due_agorot', v.remaining_amount_due_agorot,
    'redeemed_at',                 v.redeemed_at,
    'offer_valid_until',           v.offer_valid_until
  );
$$;

-- ---------------------------------------------------------------------------
-- 3. redeem_voucher(): the ONLY redemption path.
--
--    Atomicity: exactly one conditional UPDATE can change money state. The
--    first transaction locks the row; a concurrent scan re-evaluates the
--    predicate after that commit, matches zero rows, and reports
--    already_redeemed. No read-then-write window exists.
--
--    Supplier identity comes from supplier_members, never from the request and
--    never from the QR payload, so a forged payload naming another supplier
--    changes nothing.
--
--    Anti-enumeration: wrong_supplier / not_found collapse to not_found for the
--    caller. The true outcome is recorded in voucher_redemptions.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.redeem_voucher(
  p_code            text,
  p_scan_method     text DEFAULT 'manual',
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_uid            uuid := auth.uid();
  v_code           text := upper(regexp_replace(coalesce(p_code, ''), '[^0-9A-Za-z]', '', 'g'));
  v_method         text := CASE WHEN p_scan_method IN ('camera', 'manual') THEN p_scan_method ELSE 'manual' END;
  v_has_membership boolean;
  v_voucher        public.vouchers%ROWTYPE;
  v_probe          public.vouchers%ROWTYPE;
  v_prior          public.voucher_redemptions%ROWTYPE;
  v_outcome        public.voucher_scan_outcome;
  v_supplier_id    uuid;
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('outcome', 'unauthorized');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.supplier_members
    WHERE user_id = v_uid AND is_active
  ) INTO v_has_membership;

  IF NOT v_has_membership THEN
    INSERT INTO public.voucher_redemptions
      (code_entered, scanned_by, scan_method, outcome)
    VALUES
      (left(v_code, 32), v_uid, v_method, 'unauthorized'::public.voucher_scan_outcome);
    RETURN jsonb_build_object('outcome', 'unauthorized');
  END IF;

  -- Replay guard: an identical retried request returns the first answer.
  IF p_idempotency_key IS NOT NULL AND length(p_idempotency_key) > 0 THEN
    SELECT * INTO v_prior
    FROM public.voucher_redemptions
    WHERE idempotency_key = p_idempotency_key;

    IF FOUND THEN
      -- Reusing one key for a different code is a client bug, not something to
      -- resolve by guessing which voucher was meant.
      IF v_prior.code_entered IS DISTINCT FROM left(v_code, 32) THEN
        RETURN jsonb_build_object('outcome', 'invalid_request', 'replayed', true);
      END IF;

      IF v_prior.outcome = 'success'::public.voucher_scan_outcome AND v_prior.voucher_id IS NOT NULL THEN
        SELECT * INTO v_voucher FROM public.vouchers WHERE id = v_prior.voucher_id;
        RETURN public.voucher_success_payload(v_voucher) || jsonb_build_object('replayed', true);
      END IF;

      RETURN jsonb_build_object('outcome', v_prior.outcome::text, 'replayed', true);
    END IF;
  END IF;

  -- Brute-force guard over the code space: 30 attempts per minute per user.
  IF NOT public.check_user_rate_limit(v_uid, 'voucher_scan', 30, 60) THEN
    INSERT INTO public.voucher_redemptions
      (code_entered, scanned_by, scan_method, outcome, idempotency_key)
    VALUES
      (left(v_code, 32), v_uid, v_method, 'rate_limited'::public.voucher_scan_outcome, p_idempotency_key);
    RETURN jsonb_build_object('outcome', 'rate_limited');
  END IF;

  -- The atomic single-use guard. supplier_id must be one of the caller's own
  -- active memberships; status and expiry are re-checked inside the predicate.
  UPDATE public.vouchers v
  SET status                  = 'redeemed'::public.voucher_status,
      redeemed_at             = now(),
      redeemed_by_supplier_id = v.supplier_id,
      redeemed_by_user_id     = v_uid,
      redeemed_amount_collected_agorot = v.remaining_amount_due_agorot
  WHERE v.code = v_code
    AND v.status = 'issued'::public.voucher_status
    AND v.expires_at > now()
    AND v.supplier_id IN (
      SELECT supplier_id FROM public.supplier_members
      WHERE user_id = v_uid AND is_active
    )
  RETURNING v.* INTO v_voucher;

  IF FOUND THEN
    v_outcome     := 'success'::public.voucher_scan_outcome;
    v_supplier_id := v_voucher.supplier_id;

    -- C11(b): the supplier's share of the prepayment has been held since the
    -- order was paid. Redemption is what closes it. Same transaction as the
    -- status flip above, and predicated on status = 'held', so a replayed call
    -- (which cannot get here anyway, the voucher is no longer 'issued') could
    -- not release it twice.
    UPDATE public.escrow_holds
    SET status                  = 'released'::public.escrow_status,
        released_at             = now(),
        release_idempotency_key = coalesce(release_idempotency_key,
                                           'voucher:' || v_voucher.id::text || ':release')
    WHERE voucher_id = v_voucher.id
      AND status = 'held'::public.escrow_status;

    UPDATE public.order_items
    SET settlement_status = 'escrow_released'::public.settlement_status
    WHERE id = v_voucher.order_item_id
      AND settlement_status = 'escrow_held'::public.settlement_status
      AND NOT EXISTS (
        SELECT 1 FROM public.vouchers sib
        WHERE sib.order_item_id = v_voucher.order_item_id
          AND sib.status = 'issued'::public.voucher_status
      );
  ELSE
    SELECT * INTO v_probe FROM public.vouchers WHERE code = v_code;

    IF NOT FOUND THEN
      v_outcome := 'not_found'::public.voucher_scan_outcome;
    ELSIF NOT EXISTS (
      SELECT 1 FROM public.supplier_members
      WHERE user_id = v_uid AND is_active AND supplier_id = v_probe.supplier_id
    ) THEN
      v_outcome     := 'wrong_supplier'::public.voucher_scan_outcome;
      v_supplier_id := NULL;
    ELSE
      v_supplier_id := v_probe.supplier_id;
      IF v_probe.status = 'redeemed'::public.voucher_status THEN
        v_outcome := 'already_redeemed'::public.voucher_scan_outcome;
      ELSIF v_probe.status = 'cancelled'::public.voucher_status THEN
        v_outcome := 'cancelled'::public.voucher_scan_outcome;
      ELSIF v_probe.status = 'refunded'::public.voucher_status THEN
        v_outcome := 'refunded'::public.voucher_scan_outcome;
      ELSE
        -- status 'expired', or still 'issued' with expires_at already past
        -- because the sweep has not run yet.
        v_outcome := 'expired'::public.voucher_scan_outcome;
      END IF;
    END IF;

    v_voucher := v_probe;
  END IF;

  INSERT INTO public.voucher_redemptions
    (voucher_id, code_entered, supplier_id, scanned_by, scan_method, outcome,
     idempotency_key, amount_collected_agorot)
  VALUES
    (v_voucher.id, left(v_code, 32), v_supplier_id, v_uid, v_method, v_outcome,
     p_idempotency_key,
     CASE WHEN v_outcome = 'success'::public.voucher_scan_outcome
          THEN v_voucher.remaining_amount_due_agorot END);

  IF v_outcome = 'success'::public.voucher_scan_outcome THEN
    RETURN public.voucher_success_payload(v_voucher);
  ELSIF v_outcome = 'already_redeemed'::public.voucher_scan_outcome THEN
    -- Honest detail only for the voucher's own supplier.
    RETURN jsonb_build_object(
      'outcome', 'already_redeemed',
      'redeemed_at', v_voucher.redeemed_at
    );
  ELSIF v_outcome = 'expired'::public.voucher_scan_outcome THEN
    RETURN jsonb_build_object(
      'outcome', 'expired',
      'expires_at', v_voucher.expires_at,
      'offer_valid_until', v_voucher.offer_valid_until
    );
  ELSIF v_outcome IN ('cancelled'::public.voucher_scan_outcome,
                      'refunded'::public.voucher_scan_outcome) THEN
    RETURN jsonb_build_object('outcome', v_outcome::text);
  ELSE
    -- not_found and wrong_supplier collapse to one answer (anti-enumeration).
    RETURN jsonb_build_object('outcome', 'not_found');
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.voucher_success_payload(public.vouchers) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.redeem_voucher(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redeem_voucher(text, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. log_voucher_scan(): audit for attempts rejected before the DB is reached
--    (a QR that failed the HMAC check, a malformed code). Cannot manufacture a
--    success: the outcome is clamped to the app-layer rejection set.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.log_voucher_scan(
  p_code_entered text,
  p_scan_method  text DEFAULT 'manual',
  p_outcome      text DEFAULT 'invalid_signature'
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_uid     uuid := auth.uid();
  v_outcome public.voucher_scan_outcome;
BEGIN
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  IF p_outcome NOT IN ('invalid_signature', 'invalid_request', 'not_found') THEN
    v_outcome := 'invalid_request'::public.voucher_scan_outcome;
  ELSE
    v_outcome := p_outcome::public.voucher_scan_outcome;
  END IF;

  INSERT INTO public.voucher_redemptions
    (code_entered, supplier_id, scanned_by, scan_method, outcome)
  VALUES (
    left(coalesce(p_code_entered, ''), 32),
    (SELECT supplier_id FROM public.supplier_members
      WHERE user_id = v_uid AND is_active ORDER BY created_at LIMIT 1),
    v_uid,
    CASE WHEN p_scan_method IN ('camera', 'manual') THEN p_scan_method ELSE 'manual' END,
    v_outcome
  );
END;
$$;

REVOKE ALL ON FUNCTION public.log_voucher_scan(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_voucher_scan(text, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Lifecycle sweeps. Service role only: none of these is a customer or
--    supplier action.
-- ---------------------------------------------------------------------------

-- issued -> expired, plus the supplier's hold refunded. Redemption already
-- refuses an expired voucher whether or not this has run, so the status flip is
-- display hygiene; the hold refund is not, which is why it happens here rather
-- than waiting for someone to notice.
CREATE OR REPLACE FUNCTION public.expire_vouchers()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_ids uuid[];
BEGIN
  WITH swept AS (
    UPDATE public.vouchers
    SET status = 'expired'::public.voucher_status,
        status_reason = coalesce(status_reason, 'auto-expired')
    WHERE status = 'issued'::public.voucher_status
      AND expires_at <= now()
    RETURNING id
  )
  SELECT array_agg(id) INTO v_ids FROM swept;

  UPDATE public.escrow_holds
  SET status = 'refunded'::public.escrow_status,
      refunded_at = now()
  WHERE voucher_id = ANY(coalesce(v_ids, ARRAY[]::uuid[]))
    AND status = 'held'::public.escrow_status;

  RETURN coalesce(array_length(v_ids, 1), 0);
END;
$$;

-- C6: an expired voucher is not forfeited to anybody. The customer gets what
-- they paid online back as wallet credit.
--
-- Separate from the sweep on purpose. This moves money; the sweep does not.
-- Keyed 'voucher:<id>:expiry_credit', so a retry after a partial run credits
-- nothing twice, and a voucher missed by one run is picked up by the next.
CREATE OR REPLACE FUNCTION public.credit_expired_vouchers()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_voucher   public.vouchers%ROWTYPE;
  v_source    uuid;
  v_target    uuid;
  v_count     integer := 0;
BEGIN
  SELECT id INTO v_source FROM public.wallet_accounts WHERE code = 'platform:adjustments';
  IF v_source IS NULL THEN
    RAISE EXCEPTION 'platform:adjustments wallet account is missing; refusing to credit';
  END IF;

  FOR v_voucher IN
    SELECT v.* FROM public.vouchers v
    WHERE v.status = 'expired'::public.voucher_status
      AND v.coupon_price_agorot > 0
      AND NOT EXISTS (
        SELECT 1 FROM public.wallet_entries w
        WHERE w.idempotency_key = 'voucher:' || v.id::text || ':expiry_credit'
      )
    ORDER BY v.expires_at
    LIMIT 500
  LOOP
    SELECT id INTO v_target FROM public.wallet_accounts WHERE user_id = v_voucher.user_id;
    IF v_target IS NULL THEN
      INSERT INTO public.wallet_accounts (user_id) VALUES (v_voucher.user_id)
      RETURNING id INTO v_target;
    END IF;

    PERFORM public.fn_wallet_transfer(
      v_source,
      v_target,
      round(v_voucher.coupon_price_agorot::numeric / 100, 2),
      'voucher_expiry_credit',
      'voucher:' || v_voucher.id::text || ':expiry_credit',
      v_voucher.order_id
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN v_count;
END;
$$;

-- issued -> cancelled for a whole order. Redeemed vouchers are untouched: the
-- value was already consumed at the business and cannot be un-consumed.
CREATE OR REPLACE FUNCTION public.cancel_vouchers_for_order(
  p_order_id uuid,
  p_reason   text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_ids uuid[];
BEGIN
  WITH cancelled AS (
    UPDATE public.vouchers
    SET status        = 'cancelled'::public.voucher_status,
        cancelled_at  = now(),
        status_reason = p_reason
    WHERE order_id = p_order_id
      AND status = 'issued'::public.voucher_status
    RETURNING id
  )
  SELECT array_agg(id) INTO v_ids FROM cancelled;

  UPDATE public.escrow_holds
  SET status = 'refunded'::public.escrow_status,
      refunded_at = now()
  WHERE voucher_id = ANY(coalesce(v_ids, ARRAY[]::uuid[]))
    AND status = 'held'::public.escrow_status;

  RETURN coalesce(array_length(v_ids, 1), 0);
END;
$$;

-- issued -> refunded for a whole order, same rule about redeemed rows. A
-- goodwill refund after redemption is a wallet credit, not a status change.
CREATE OR REPLACE FUNCTION public.refund_vouchers_for_order(
  p_order_id uuid,
  p_reason   text DEFAULT NULL
)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_ids uuid[];
BEGIN
  WITH refunded AS (
    UPDATE public.vouchers
    SET status        = 'refunded'::public.voucher_status,
        refunded_at   = now(),
        status_reason = p_reason
    WHERE order_id = p_order_id
      AND status = 'issued'::public.voucher_status
    RETURNING id
  )
  SELECT array_agg(id) INTO v_ids FROM refunded;

  UPDATE public.escrow_holds
  SET status = 'refunded'::public.escrow_status,
      refunded_at = now()
  WHERE voucher_id = ANY(coalesce(v_ids, ARRAY[]::uuid[]))
    AND status = 'held'::public.escrow_status;

  RETURN coalesce(array_length(v_ids, 1), 0);
END;
$$;

REVOKE ALL ON FUNCTION public.expire_vouchers() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.credit_expired_vouchers() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_vouchers_for_order(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refund_vouchers_for_order(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_vouchers() TO service_role;
GRANT EXECUTE ON FUNCTION public.credit_expired_vouchers() TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_vouchers_for_order(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_vouchers_for_order(uuid, text) TO service_role;
