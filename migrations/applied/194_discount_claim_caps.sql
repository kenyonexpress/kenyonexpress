-- 194_discount_claim_caps.sql
--
-- Make `max_uses` and `max_uses_per_user` mean something.
--
-- THE HOLE, WHICH THE CODE ALREADY DESCRIBES
--
-- `src/server/actions/payments/checkout.ts` carries this, next to the charge:
--
--     nothing increments `coupons.used_count`, so `max_uses` is enforced as a
--     read of a counter no part of this flow advances
--
-- That is exact, and it means a single-use code is not single-use. It is
-- unlimited-use, for everybody, forever. The check reads a counter, the counter
-- stays at zero, and the check passes every time. Nothing errors and nothing
-- logs, because from the code's point of view the coupon simply has uses left.
--
-- `max_uses_per_user` is worse than unenforced on the `coupons` side: the
-- column does not exist. `discount_campaigns` HAS both columns and a
-- `discount_redemptions` table to count against, and `growth/discount.ts:147`
-- reads `used_count >= max_uses` there too -- against a counter that also has
-- no writer. Two coupon systems, the same defect in both, and one of them looks
-- complete enough that nobody re-checked.
--
-- Measured 2026-09-09: `coupons` 0 rows, `discount_campaigns` 0 rows,
-- `discount_redemptions` 0 rows. Nothing has been lost yet. The hole opens the
-- moment the first code is created, and a marketing code is created by
-- somebody in a hurry.
--
-- THE SHAPE IS COPIED FROM THE STOCK RESERVATION, ON PURPOSE
--
-- 117 already solved this exact problem for stock: check and claim in one
-- statement under `FOR UPDATE`, before the card is charged, all-or-nothing,
-- released when the order is cancelled. A discount cap is the same kind of
-- scarce thing as the last unit in stock, and it is worth having one shape in
-- the codebase for "hold a limited thing while the shopper pays" rather than
-- two that differ in ways nobody chose.
--
-- So: `claim_order_discount` is `reserve_order_stock`, and
-- `release_order_discount` is `release_order_stock`. They are called from the
-- same two places.
--
-- WHY A READ-THEN-WRITE IN TYPESCRIPT WOULD NOT DO
--
-- Because it is the bug that was already fixed once here. `finalize.ts` used to
-- SELECT `stock_quantity` and UPDATE to `max(0, stock - qty)`; two concurrent
-- finalizes read the same number and wrote the same result, and the floor hid
-- it. `SELECT used_count; UPDATE used_count + 1` is that bug with a different
-- column. The counter must be read and advanced inside one lock or it is
-- decoration.

BEGIN;

-- ------------------------------------------------------- the missing column
--
-- Nullable, and NULL means unlimited. `DEFAULT 1` so a code created without a
-- thought is single-use per customer, which is what almost every marketing code
-- means and the direction that is recoverable: a customer refused a second use
-- opens a support ticket, a code reused without limit is money that is gone.
-- Unlimited stays expressible by setting NULL explicitly rather than by a magic
-- number.
--
-- Safe on live data because there is none: `coupons` holds 0 rows.

ALTER TABLE public.coupons
  ADD COLUMN IF NOT EXISTS max_uses_per_user integer DEFAULT 1;

ALTER TABLE public.coupons
  DROP CONSTRAINT IF EXISTS coupons_max_uses_per_user_positive;
ALTER TABLE public.coupons
  ADD CONSTRAINT coupons_max_uses_per_user_positive
  CHECK (max_uses_per_user IS NULL OR max_uses_per_user > 0);

COMMENT ON COLUMN public.coupons.max_uses_per_user IS
  'Uses allowed per customer. NULL = unlimited. Enforced by claim_order_discount().';

-- --------------------------------------------------- the redemption records

CREATE TABLE IF NOT EXISTS public.coupon_redemptions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id     uuid NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
  user_id       uuid NOT NULL,
  order_id      uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  amount_agorot integer NOT NULL DEFAULT 0 CHECK (amount_agorot >= 0),
  created_at    timestamptz NOT NULL DEFAULT now(),
  -- Set when the order is cancelled or refunded. The row is KEPT rather than
  -- deleted: "this customer used the code and then cancelled" is a fact worth
  -- having when the same customer tries again, and a deleted row cannot be
  -- distinguished from one that never existed.
  released_at   timestamptz
);

-- One redemption per (coupon, order). A replayed finalize or a retried webhook
-- must not count twice; this is the constraint that makes the claim idempotent
-- rather than a guard someone has to remember to write.
CREATE UNIQUE INDEX IF NOT EXISTS coupon_redemptions_once_per_order
  ON public.coupon_redemptions (coupon_id, order_id);

-- The per-user count, which is the read in the hot path.
CREATE INDEX IF NOT EXISTS coupon_redemptions_by_user
  ON public.coupon_redemptions (coupon_id, user_id) WHERE released_at IS NULL;

-- The campaign side has the table already and is missing the same column, for
-- the same reason: nothing ever released a claim because nothing ever made one.
ALTER TABLE public.discount_redemptions
  ADD COLUMN IF NOT EXISTS released_at timestamptz;

CREATE UNIQUE INDEX IF NOT EXISTS discount_redemptions_once_per_order
  ON public.discount_redemptions (campaign_id, order_id);

CREATE INDEX IF NOT EXISTS discount_redemptions_by_user
  ON public.discount_redemptions (campaign_id, user_id) WHERE released_at IS NULL;

-- ------------------------------------------------------------------- claim

CREATE OR REPLACE FUNCTION public.claim_order_discount(
  p_order_id uuid,
  p_user_id  uuid,
  p_code     text,
  p_amount_agorot integer DEFAULT 0
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_code     text := upper(btrim(coalesce(p_code, '')));
  v_campaign public.discount_campaigns%ROWTYPE;
  v_coupon   public.coupons%ROWTYPE;
  v_used     integer;
BEGIN
  -- No code is not a refusal. A checkout without a discount calls this and
  -- gets NULL, so the caller has one path rather than two.
  IF v_code = '' THEN RETURN NULL; END IF;

  -- Campaigns first, matching resolveAppliedCoupon(): `discount_campaigns` is
  -- the platform's own table and `coupons` is supplier-scoped, so checking the
  -- campaign first means a marketing code is never shadowed by a supplier one.
  SELECT * INTO v_campaign
    FROM public.discount_campaigns c
   WHERE upper(c.code) = v_code AND c.deleted_at IS NULL
   FOR UPDATE;

  IF FOUND THEN
    IF NOT v_campaign.is_active THEN RETURN 'inactive'; END IF;
    IF v_campaign.starts_at IS NOT NULL AND v_campaign.starts_at > now() THEN
      RETURN 'not_started';
    END IF;
    IF v_campaign.expires_at IS NOT NULL AND v_campaign.expires_at <= now() THEN
      RETURN 'expired';
    END IF;
    IF v_campaign.max_uses IS NOT NULL
       AND coalesce(v_campaign.used_count, 0) >= v_campaign.max_uses THEN
      RETURN 'exhausted';
    END IF;

    IF v_campaign.max_uses_per_user IS NOT NULL THEN
      SELECT count(*) INTO v_used
        FROM public.discount_redemptions r
       WHERE r.campaign_id = v_campaign.id
         AND r.user_id = p_user_id
         AND r.released_at IS NULL
         AND r.order_id <> p_order_id;
      IF v_used >= v_campaign.max_uses_per_user THEN RETURN 'per_user_exhausted'; END IF;
    END IF;

    INSERT INTO public.discount_redemptions (campaign_id, user_id, order_id, amount_agorot)
    VALUES (v_campaign.id, p_user_id, p_order_id, p_amount_agorot)
    ON CONFLICT (campaign_id, order_id) DO NOTHING;

    -- Only when a row was actually written. A replay finds the conflict, writes
    -- nothing, and must not advance the counter a second time.
    IF FOUND THEN
      UPDATE public.discount_campaigns
         SET used_count = coalesce(used_count, 0) + 1, updated_at = now()
       WHERE id = v_campaign.id;
    END IF;
    RETURN NULL;
  END IF;

  SELECT * INTO v_coupon
    FROM public.coupons c
   WHERE upper(c.code) = v_code
   FOR UPDATE;

  IF NOT FOUND THEN
    -- An unknown code is not refused here. The cart already prices an unknown
    -- code at zero discount, so the shopper is charged full price and there is
    -- nothing to cap. Refusing would turn a stale cookie into a failed
    -- checkout.
    RETURN NULL;
  END IF;

  IF v_coupon.is_active IS FALSE THEN RETURN 'inactive'; END IF;
  IF v_coupon.expires_at IS NOT NULL AND v_coupon.expires_at <= now() THEN
    RETURN 'expired';
  END IF;
  IF v_coupon.max_uses IS NOT NULL
     AND coalesce(v_coupon.used_count, 0) >= v_coupon.max_uses THEN
    RETURN 'exhausted';
  END IF;

  IF v_coupon.max_uses_per_user IS NOT NULL THEN
    SELECT count(*) INTO v_used
      FROM public.coupon_redemptions r
     WHERE r.coupon_id = v_coupon.id
       AND r.user_id = p_user_id
       AND r.released_at IS NULL
       AND r.order_id <> p_order_id;
    IF v_used >= v_coupon.max_uses_per_user THEN RETURN 'per_user_exhausted'; END IF;
  END IF;

  INSERT INTO public.coupon_redemptions (coupon_id, user_id, order_id, amount_agorot)
  VALUES (v_coupon.id, p_user_id, p_order_id, p_amount_agorot)
  ON CONFLICT (coupon_id, order_id) DO NOTHING;

  IF FOUND THEN
    UPDATE public.coupons
       SET used_count = coalesce(used_count, 0) + 1
     WHERE id = v_coupon.id;
  END IF;
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.claim_order_discount(uuid, uuid, text, integer) IS
  'Claims one use of a discount code for an order, under FOR UPDATE. Returns NULL on success or a refusal reason. Idempotent per (code, order).';

-- ----------------------------------------------------------------- release

CREATE OR REPLACE FUNCTION public.release_order_discount(p_order_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_released integer := 0;
  v_n        integer;
BEGIN
  WITH freed AS (
    UPDATE public.discount_redemptions r
       SET released_at = now()
     WHERE r.order_id = p_order_id AND r.released_at IS NULL
    RETURNING r.campaign_id
  ), decremented AS (
    UPDATE public.discount_campaigns c
       SET used_count = GREATEST(0, coalesce(c.used_count, 0) - 1), updated_at = now()
      FROM freed f WHERE c.id = f.campaign_id
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_n FROM decremented;
  v_released := v_n;

  WITH freed AS (
    UPDATE public.coupon_redemptions r
       SET released_at = now()
     WHERE r.order_id = p_order_id AND r.released_at IS NULL
    RETURNING r.coupon_id
  ), decremented AS (
    UPDATE public.coupons c
       SET used_count = GREATEST(0, coalesce(c.used_count, 0) - 1)
      FROM freed f WHERE c.id = f.coupon_id
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_n FROM decremented;

  RETURN v_released + v_n;
END;
$$;

COMMENT ON FUNCTION public.release_order_discount(uuid) IS
  'Gives back every discount claim held by an order. Called wherever release_order_stock is.';

-- --------------------------------------------------------------------- RLS
--
-- A redemption row says which customer used which code. It is read by the
-- claim function (definer, bypasses RLS) and by nothing on the client, so no
-- client role gets a policy and the DML grants go with them. The shape 172
-- installed: a RESTRICTIVE deny cannot be outvoted by a permissive policy
-- somebody adds later, which zero policies can.

ALTER TABLE public.coupon_redemptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "coupon_redemptions_deny_all_client_roles" ON public.coupon_redemptions;
CREATE POLICY "coupon_redemptions_deny_all_client_roles"
  ON public.coupon_redemptions
  AS RESTRICTIVE
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON public.coupon_redemptions FROM anon, authenticated;

-- EXECUTE is the real access surface on a definer function, so it is named
-- rather than left at the default. A bare CREATE grants EXECUTE to PUBLIC, and
-- these two advance a counter that decides whether money comes off an order.
REVOKE ALL ON FUNCTION public.claim_order_discount(uuid, uuid, text, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_order_discount(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_order_discount(uuid, uuid, text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_order_discount(uuid) TO service_role;

COMMIT;
