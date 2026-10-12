-- 227: the discount claim becomes replayable, releasable and swept, so the
-- checkout can finally call it.
--
-- WHAT PRODUCTION ALREADY HAD. 194 built the whole claim layer -
-- claim_order_discount / release_order_discount over discount_redemptions and
-- coupon_redemptions, both counters incremented under a FOR UPDATE row lock,
-- once per order via the *_once_per_order unique indexes. Nothing in the
-- application ever called it from the purchase path: `coupons.used_count` sat
-- at whatever the seed left it, `max_uses` was a read of a counter no flow
-- advanced, and "single use" meant unlimited use. Measured 2026-09-10 in a
-- rolled-back DO block: two orders against a max_uses=1 coupon -> first 'ok',
-- second 'exhausted' (the lock works), but a REPLAY of the first order also
-- answered 'exhausted', which is the exact defect fn_claim_discount's own
-- comment fixed for campaigns: the limit check ran before the replay check.
-- A webhook retry or a checkout replay of an order that already holds the
-- claim must be idempotent success, not a refusal.
--
-- WHAT THIS FILE CHANGES, all additive or CREATE OR REPLACE:
--
--   1. claim_order_discount: replay check FIRST in both branches. An order
--      that already holds a live claim answers NULL (success) without touching
--      any counter. An order whose claim was RELEASED (the sweep below, or an
--      admin cancel) re-claims: the row is revived and the counter re-advanced,
--      subject to the same limit checks as a fresh claim.
--   2. release_expired_order_discounts(): the sweep. A claim is a hold, and a
--      hold whose order died must lapse, exactly like stock_reservations. An
--      order that is 'pending' or 'cancelled' past its expires_at gets its
--      redemption rows released and the counters handed back; a QR unit whose
--      redeemed_order_id points at such an order is un-redeemed so the flyer
--      is spendable again. Runs from /api/cron/stock every 10 minutes.
--   3. consume_order_discount(p_order_id): the stranded-payment case. An order
--      the sweep already released can still finalize (stranded-payments
--      verifies up to 24h back; the order expires after 30 minutes). The money
--      moved, so the use is real: revive the released rows and re-advance the
--      counters. Idempotent - a second call finds nothing released.
--   4. discount_redemptions_amount_positive loosens from > 0 to >= 0, matching
--      coupon_redemptions. The QR till route defaults amount_agorot to 0, so
--      every till redemption without an explicit amount died on this CHECK
--      inside claim_order_discount as an unhandled 23514.
--
-- LOCK ORDER. claim_order_discount locks the campaign/coupon row first and
-- then touches redemptions; the sweep and consume touch redemptions first.
-- The overlap (a re-claim racing the sweep on the same order's row) is
-- vanishingly rare, self-healing (deadlock detection aborts one side; the
-- cron retries in 10 minutes, the checkout surfaces a retryable failure), and
-- not worth serializing every sweep against every campaign row.

BEGIN;

ALTER TABLE public.discount_redemptions
  DROP CONSTRAINT IF EXISTS discount_redemptions_amount_positive;
ALTER TABLE public.discount_redemptions
  ADD CONSTRAINT discount_redemptions_amount_positive CHECK (amount_agorot >= 0);

CREATE OR REPLACE FUNCTION public.claim_order_discount(
  p_order_id uuid,
  p_user_id uuid,
  p_code text,
  p_amount_agorot integer DEFAULT 0
) RETURNS text
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
AS $$
DECLARE
  v_code     text := upper(btrim(coalesce(p_code, '')));
  v_campaign public.discount_campaigns%ROWTYPE;
  v_coupon   public.coupons%ROWTYPE;
  v_used     integer;
  v_existing record;
BEGIN
  IF v_code = '' THEN RETURN NULL; END IF;

  SELECT * INTO v_campaign
    FROM public.discount_campaigns c
   WHERE upper(c.code) = v_code AND c.deleted_at IS NULL
   FOR UPDATE;

  IF FOUND THEN
    -- Replay check FIRST, before any limit is evaluated (fn_claim_discount's
    -- own lesson). A live claim by THIS order is idempotent success; with the
    -- old order the limit checks saw the use this very order created and
    -- answered 'exhausted' to a retry of a payment that already succeeded.
    SELECT r.id, r.released_at INTO v_existing
      FROM public.discount_redemptions r
     WHERE r.campaign_id = v_campaign.id AND r.order_id = p_order_id;
    IF FOUND AND v_existing.released_at IS NULL THEN RETURN NULL; END IF;

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

    IF v_existing.id IS NOT NULL THEN
      -- A released claim re-claimed: the sweep freed it, the order came back.
      UPDATE public.discount_redemptions
         SET released_at = NULL, amount_agorot = p_amount_agorot
       WHERE id = v_existing.id;
    ELSE
      INSERT INTO public.discount_redemptions (campaign_id, user_id, order_id, amount_agorot)
      VALUES (v_campaign.id, p_user_id, p_order_id, p_amount_agorot)
      ON CONFLICT (campaign_id, order_id) DO NOTHING;
      IF NOT FOUND THEN RETURN NULL; END IF;
    END IF;

    UPDATE public.discount_campaigns
       SET used_count = coalesce(used_count, 0) + 1, updated_at = now()
     WHERE id = v_campaign.id;
    RETURN NULL;
  END IF;

  SELECT * INTO v_coupon
    FROM public.coupons c
   WHERE upper(c.code) = v_code
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Same replay-first order as the campaign branch above.
  SELECT r.id, r.released_at INTO v_existing
    FROM public.coupon_redemptions r
   WHERE r.coupon_id = v_coupon.id AND r.order_id = p_order_id;
  IF FOUND AND v_existing.released_at IS NULL THEN RETURN NULL; END IF;

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

  IF v_existing.id IS NOT NULL THEN
    UPDATE public.coupon_redemptions
       SET released_at = NULL, amount_agorot = p_amount_agorot
     WHERE id = v_existing.id;
  ELSE
    INSERT INTO public.coupon_redemptions (coupon_id, user_id, order_id, amount_agorot)
    VALUES (v_coupon.id, p_user_id, p_order_id, p_amount_agorot)
    ON CONFLICT (coupon_id, order_id) DO NOTHING;
    IF NOT FOUND THEN RETURN NULL; END IF;
  END IF;

  UPDATE public.coupons
     SET used_count = coalesce(used_count, 0) + 1
   WHERE id = v_coupon.id;
  RETURN NULL;
END;
$$;

-- The sweep. Mirrors release_expired_stock_reservations in role and cadence:
-- bookkeeping that hands back holds whose order died. 'paid' orders are never
-- touched - their claims are spent, not held.
CREATE OR REPLACE FUNCTION public.release_expired_order_discounts()
RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
AS $$
DECLARE
  v_campaigns integer := 0;
  v_coupons   integer := 0;
BEGIN
  WITH dead AS (
    SELECT o.id FROM public.orders o
     WHERE o.status IN ('pending', 'cancelled')
       AND o.expires_at IS NOT NULL
       AND o.expires_at < now()
  ), freed AS (
    UPDATE public.discount_redemptions r
       SET released_at = now()
     WHERE r.released_at IS NULL
       AND r.order_id IN (SELECT id FROM dead)
    RETURNING r.campaign_id
  ), dec AS (
    UPDATE public.discount_campaigns c
       SET used_count = GREATEST(0, coalesce(c.used_count, 0) - f.cnt),
           updated_at = now()
      FROM (SELECT campaign_id, count(*)::integer AS cnt FROM freed GROUP BY campaign_id) f
     WHERE c.id = f.campaign_id
    RETURNING f.cnt
  )
  SELECT coalesce(sum(cnt), 0)::integer INTO v_campaigns FROM dec;

  WITH dead AS (
    SELECT o.id FROM public.orders o
     WHERE o.status IN ('pending', 'cancelled')
       AND o.expires_at IS NOT NULL
       AND o.expires_at < now()
  ), freed AS (
    UPDATE public.coupon_redemptions r
       SET released_at = now()
     WHERE r.released_at IS NULL
       AND r.order_id IN (SELECT id FROM dead)
    RETURNING r.coupon_id
  ), dec AS (
    UPDATE public.coupons c
       SET used_count = GREATEST(0, coalesce(c.used_count, 0) - f.cnt)
      FROM (SELECT coupon_id, count(*)::integer AS cnt FROM freed GROUP BY coupon_id) f
     WHERE c.id = f.coupon_id
    RETURNING f.cnt
  )
  SELECT coalesce(sum(cnt), 0)::integer INTO v_coupons FROM dec;

  -- A printed flyer burned by a checkout that never paid becomes spendable
  -- again. The campaign-side ledger row above keeps the history either way.
  UPDATE public.coupon_qr_codes q
     SET redeemed_at = NULL, redeemed_order_id = NULL
   WHERE q.redeemed_at IS NOT NULL
     AND q.redeemed_order_id IN (
       SELECT o.id FROM public.orders o
        WHERE o.status IN ('pending', 'cancelled')
          AND o.expires_at IS NOT NULL
          AND o.expires_at < now()
     );

  RETURN v_campaigns + v_coupons;
END;
$$;

-- The stranded payment that outlived the sweep: the order expired at 30
-- minutes, the sweep released its claim, and the payment then verified (the
-- stranded-payments cron looks back 24 hours). The card was charged with the
-- discount in it, so the use is real; put it back on the books.
CREATE OR REPLACE FUNCTION public.consume_order_discount(p_order_id uuid)
RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO ''
AS $$
DECLARE
  v_campaigns integer := 0;
  v_coupons   integer := 0;
BEGIN
  WITH revived AS (
    UPDATE public.discount_redemptions r
       SET released_at = NULL
     WHERE r.order_id = p_order_id AND r.released_at IS NOT NULL
    RETURNING r.campaign_id
  ), inc AS (
    UPDATE public.discount_campaigns c
       SET used_count = coalesce(c.used_count, 0) + f.cnt, updated_at = now()
      FROM (SELECT campaign_id, count(*)::integer AS cnt FROM revived GROUP BY campaign_id) f
     WHERE c.id = f.campaign_id
    RETURNING f.cnt
  )
  SELECT coalesce(sum(cnt), 0)::integer INTO v_campaigns FROM inc;

  WITH revived AS (
    UPDATE public.coupon_redemptions r
       SET released_at = NULL
     WHERE r.order_id = p_order_id AND r.released_at IS NOT NULL
    RETURNING r.coupon_id
  ), inc AS (
    UPDATE public.coupons c
       SET used_count = coalesce(c.used_count, 0) + f.cnt
      FROM (SELECT coupon_id, count(*)::integer AS cnt FROM revived GROUP BY coupon_id) f
     WHERE c.id = f.coupon_id
    RETURNING f.cnt
  )
  SELECT coalesce(sum(cnt), 0)::integer INTO v_coupons FROM inc;

  RETURN v_campaigns + v_coupons;
END;
$$;

-- New objects grant EXECUTE to PUBLIC by default; these are service-role-only
-- like every other function in this family (claim_order_discount kept its ACL
-- through CREATE OR REPLACE, the two new ones need it said explicitly).
REVOKE ALL ON FUNCTION public.release_expired_order_discounts() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.consume_order_discount(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_expired_order_discounts() TO service_role;
GRANT EXECUTE ON FUNCTION public.consume_order_discount(uuid) TO service_role;

COMMIT;
