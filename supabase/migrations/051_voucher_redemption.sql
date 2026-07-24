-- 051_voucher_redemption.sql
-- Voucher lifecycle for the absolute-price coupon model (2026-07-24).
-- Authoritative document: ARCHITECTURE-VOUCHER-REDEMPTION.md
--
-- Business model, superseding every escrow/payout description of the coupon
-- flow that came before it:
--   * The admin sets an absolute coupon_price on the product.
--   * The customer pays exactly that amount online through Cardcom.
--   * The balance (full price - coupon price) is collected by the business at
--     scan time. The platform never touches it.
--   * Everything charged online stays with the platform: platform_percent is
--     100 on every voucher. No escrow row, no payout line, no split.
--   * A scan burns the voucher permanently. Every non-issued state is terminal.
--   * offer_valid_until is a per-product calendar deadline, enforced here and
--     displayed to the customer (Israeli consumer protection law).
--   * There is no tenant_id. Row visibility is decided by auth.uid() alone.
--
-- Forward-only and fully idempotent. Touches no earlier migration and no part
-- of the legacy coupon_codes redemption path.
-- Depends on: 008 (suppliers/profiles), 019 (check_user_rate_limit),
-- 027 (supplier_members, is_supplier_member), 042 (products.supplier_id),
-- 003 (is_admin).

-- Defensive: 001 may have stopped early on a live DB before defining this.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 1. Enums
-- ---------------------------------------------------------------------------

-- Separate from public.coupon_status on purpose: the legacy path must not be
-- able to drift into the new one through a shared type.
DO $$ BEGIN
  CREATE TYPE public.voucher_status AS ENUM (
    'issued',
    'redeemed',
    'expired',
    'cancelled',
    'refunded'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.voucher_scan_outcome AS ENUM (
    'success',
    'already_redeemed',
    'expired',
    'cancelled',
    'refunded',
    'wrong_supplier',
    'not_found',
    'invalid_signature',
    'invalid_request',
    'unauthorized',
    'rate_limited'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ---------------------------------------------------------------------------
-- 2. Product fields the model needs
--    coupon_price_ils is the absolute amount charged online. It is NOT a
--    percent and has no default: a coupon product without one cannot issue.
-- ---------------------------------------------------------------------------

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS coupon_price_ils  numeric(12,2),
  ADD COLUMN IF NOT EXISTS offer_valid_until timestamptz;

COMMENT ON COLUMN public.products.coupon_price_ils IS
  'Absolute shekel amount the customer pays online for the coupon, set per product by the admin. Not a percent, no default. The balance (price_ils - coupon_price_ils) is collected by the business at redemption.';
COMMENT ON COLUMN public.products.offer_valid_until IS
  'Calendar deadline of the offer. Vouchers expire automatically at this instant and the date is displayed to the customer (consumer protection).';

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.products'::regclass
      AND conname = 'products_coupon_price_within_price'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_coupon_price_within_price
      CHECK (
        coupon_price_ils IS NULL
        OR (coupon_price_ils > 0 AND coupon_price_ils <= price_ils)
      ) NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS products_offer_valid_until_idx
  ON public.products (offer_valid_until)
  WHERE offer_valid_until IS NOT NULL AND deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 3. vouchers
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.vouchers (
  id                       uuid                  PRIMARY KEY DEFAULT gen_random_uuid(),
  code                     text                  NOT NULL UNIQUE,
  qr_payload               text                  NOT NULL,
  qr_key_id                text                  NOT NULL DEFAULT 'v1',

  order_id                 uuid                  NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  order_item_id            uuid                  NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  product_id               uuid                  NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  supplier_id              uuid                  NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  user_id                  uuid                  NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,

  status                   public.voucher_status NOT NULL DEFAULT 'issued'::public.voucher_status,

  -- Money snapshots in agorot. Later product edits never move charged money.
  face_value_agorot            integer           NOT NULL CHECK (face_value_agorot >= 0),
  coupon_price_agorot          integer           NOT NULL CHECK (coupon_price_agorot >= 0),
  remaining_amount_due_agorot  integer           NOT NULL CHECK (remaining_amount_due_agorot >= 0),
  platform_percent             numeric(5,2)      NOT NULL DEFAULT 100,

  offer_valid_until        timestamptz           NOT NULL,
  expires_at               timestamptz           NOT NULL,
  issued_at                timestamptz           NOT NULL DEFAULT now(),

  redeemed_at              timestamptz,
  redeemed_by_supplier_id  uuid                  REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  redeemed_by_user_id      uuid                  REFERENCES auth.users(id) ON DELETE SET NULL,
  redeemed_amount_collected_agorot integer       CHECK (redeemed_amount_collected_agorot IS NULL OR redeemed_amount_collected_agorot >= 0),

  cancelled_at             timestamptz,
  refunded_at              timestamptz,
  status_reason            text,

  created_at               timestamptz           NOT NULL DEFAULT now(),
  updated_at               timestamptz           NOT NULL DEFAULT now(),

  -- The customer paid coupon_price online, the business collects the rest.
  CONSTRAINT vouchers_conservation
    CHECK (face_value_agorot = coupon_price_agorot + remaining_amount_due_agorot),
  -- Nothing leaves the platform on a voucher.
  CONSTRAINT vouchers_platform_percent_full
    CHECK (platform_percent = 100),
  -- Crockford base32 without the ambiguous I, L, O, U.
  CONSTRAINT vouchers_code_format
    CHECK (code ~ '^[0-9A-HJKMNP-TV-Z]{10}$'),
  -- offer_valid_until always wins over the rolling per-product TTL.
  CONSTRAINT vouchers_expires_within_offer
    CHECK (expires_at <= offer_valid_until),
  -- Redemption is all-or-nothing: a redeemed row carries the full provenance,
  -- a non-redeemed row carries none of it.
  CONSTRAINT vouchers_redeemed_fields
    CHECK (
      (status = 'redeemed'::public.voucher_status
        AND redeemed_at IS NOT NULL
        AND redeemed_by_supplier_id IS NOT NULL
        AND redeemed_by_user_id IS NOT NULL)
      OR
      (status <> 'redeemed'::public.voucher_status
        AND redeemed_at IS NULL
        AND redeemed_by_supplier_id IS NULL
        AND redeemed_by_user_id IS NULL)
    )
);

COMMENT ON TABLE public.vouchers IS
  'Absolute-price coupon vouchers. coupon_price_agorot was charged online and stays with the platform (platform_percent 100); remaining_amount_due_agorot is collected by the business at scan. Every non-issued status is terminal.';
COMMENT ON COLUMN public.vouchers.qr_payload IS
  'KEV1.<base64url payload>.<base64url HMAC-SHA256>. Proves the QR was minted by the platform. It is not an authorization token: single use is decided by redeem_voucher().';
COMMENT ON COLUMN public.vouchers.expires_at IS
  'min(issued_at + products.coupon_expiry_days, products.offer_valid_until). Redemption checks it directly, so a missed expiry sweep can never let a stale voucher through.';
COMMENT ON COLUMN public.vouchers.remaining_amount_due_agorot IS
  'Balance the customer owes the business at redemption. The platform never receives it and never settles it.';

CREATE UNIQUE INDEX IF NOT EXISTS vouchers_code_idx
  ON public.vouchers (code);
CREATE INDEX IF NOT EXISTS vouchers_user_status_idx
  ON public.vouchers (user_id, status, issued_at DESC);
CREATE INDEX IF NOT EXISTS vouchers_supplier_status_idx
  ON public.vouchers (supplier_id, status);
CREATE INDEX IF NOT EXISTS vouchers_order_item_idx
  ON public.vouchers (order_item_id);
CREATE INDEX IF NOT EXISTS vouchers_order_idx
  ON public.vouchers (order_id);
CREATE INDEX IF NOT EXISTS vouchers_active_expiry_idx
  ON public.vouchers (expires_at)
  WHERE status = 'issued'::public.voucher_status;
CREATE INDEX IF NOT EXISTS vouchers_redeemed_by_supplier_idx
  ON public.vouchers (redeemed_by_supplier_id, redeemed_at DESC)
  WHERE status = 'redeemed'::public.voucher_status;

DROP TRIGGER IF EXISTS set_updated_at ON public.vouchers;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.vouchers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. voucher_redemptions: append-only audit of EVERY scan attempt
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.voucher_redemptions (
  id                      uuid                        PRIMARY KEY DEFAULT gen_random_uuid(),
  voucher_id              uuid                        REFERENCES public.vouchers(id) ON DELETE SET NULL,
  code_entered            text                        NOT NULL,
  supplier_id             uuid                        REFERENCES public.suppliers(id) ON DELETE SET NULL,
  scanned_by              uuid                        REFERENCES auth.users(id) ON DELETE SET NULL,
  scan_method             text                        CHECK (scan_method IN ('camera', 'manual')),
  outcome                 public.voucher_scan_outcome NOT NULL,
  idempotency_key         text,
  amount_collected_agorot integer                     CHECK (amount_collected_agorot IS NULL OR amount_collected_agorot >= 0),
  metadata                jsonb                       NOT NULL DEFAULT '{}'::jsonb,
  created_at              timestamptz                 NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.voucher_redemptions IS
  'Append-only audit of every voucher scan attempt, successful or not. Written only by redeem_voucher() / log_voucher_scan(). This is what a dispute is settled with.';

-- The single-use arbiter. Even without the conditional UPDATE in
-- redeem_voucher(), a second successful redemption cannot be recorded.
CREATE UNIQUE INDEX IF NOT EXISTS voucher_redemptions_one_success_per_voucher
  ON public.voucher_redemptions (voucher_id)
  WHERE outcome = 'success'::public.voucher_scan_outcome AND voucher_id IS NOT NULL;

-- Replay guard for retried HTTP requests.
CREATE UNIQUE INDEX IF NOT EXISTS voucher_redemptions_idempotency_key_idx
  ON public.voucher_redemptions (idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS voucher_redemptions_voucher_idx
  ON public.voucher_redemptions (voucher_id, created_at DESC);
CREATE INDEX IF NOT EXISTS voucher_redemptions_supplier_idx
  ON public.voucher_redemptions (supplier_id, created_at DESC);
CREATE INDEX IF NOT EXISTS voucher_redemptions_scanner_idx
  ON public.voucher_redemptions (scanned_by, created_at DESC);

-- ---------------------------------------------------------------------------
-- 5. redeem_voucher(): the ONLY redemption path.
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

-- Success payload builder, shared by the live path and the idempotent replay.
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
  v_customer_name  text;
  v_product_name   text;
  v_supplier_name  text;
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
-- 6. log_voucher_scan(): audit for attempts rejected before the DB is reached
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
-- 7. Lifecycle sweeps. Service role only: none of these is a customer or
--    supplier action.
-- ---------------------------------------------------------------------------

-- issued -> expired. Display hygiene only; redeem_voucher() already refuses an
-- expired voucher whether or not this has run.
CREATE OR REPLACE FUNCTION public.expire_vouchers()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.vouchers
  SET status = 'expired'::public.voucher_status,
      status_reason = coalesce(status_reason, 'auto-expired')
  WHERE status = 'issued'::public.voucher_status
    AND expires_at <= now();
  GET DIAGNOSTICS v_count = ROW_COUNT;
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
  v_count integer;
BEGIN
  UPDATE public.vouchers
  SET status        = 'cancelled'::public.voucher_status,
      cancelled_at  = now(),
      status_reason = p_reason
  WHERE order_id = p_order_id
    AND status = 'issued'::public.voucher_status;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
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
  v_count integer;
BEGIN
  UPDATE public.vouchers
  SET status        = 'refunded'::public.voucher_status,
      refunded_at   = now(),
      status_reason = p_reason
  WHERE order_id = p_order_id
    AND status = 'issued'::public.voucher_status;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_vouchers() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cancel_vouchers_for_order(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refund_vouchers_for_order(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_vouchers() TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_vouchers_for_order(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.refund_vouchers_for_order(uuid, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 8. RLS. auth.uid() is the only tenancy signal; there is no tenant_id.
--
--    Read-only for everybody. Issuing runs in the service role path and
--    redemption runs inside redeem_voucher() (SECURITY DEFINER), so no INSERT,
--    UPDATE or DELETE policy is granted on purpose: a compromised supplier
--    session has no statement that can flip a status.
-- ---------------------------------------------------------------------------

ALTER TABLE public.vouchers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.voucher_redemptions ENABLE ROW LEVEL SECURITY;

-- Customer: only their own vouchers.
DROP POLICY IF EXISTS vouchers_owner_read ON public.vouchers;
CREATE POLICY vouchers_owner_read ON public.vouchers
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Supplier: only what was actually redeemed at their business. Deliberately
-- keyed on redeemed_by_supplier_id, not supplier_id: an outstanding voucher is
-- the customer's business until it is presented at the counter, and it reaches
-- the supplier one at a time through redeem_voucher().
DROP POLICY IF EXISTS vouchers_supplier_read_redeemed ON public.vouchers;
CREATE POLICY vouchers_supplier_read_redeemed ON public.vouchers
  FOR SELECT TO authenticated
  USING (
    redeemed_by_supplier_id IS NOT NULL
    AND public.is_supplier_member(redeemed_by_supplier_id)
  );

DROP POLICY IF EXISTS vouchers_admin_read ON public.vouchers;
CREATE POLICY vouchers_admin_read ON public.vouchers
  FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS voucher_redemptions_owner_read ON public.voucher_redemptions;
CREATE POLICY voucher_redemptions_owner_read ON public.voucher_redemptions
  FOR SELECT TO authenticated
  USING (
    voucher_id IN (SELECT id FROM public.vouchers WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS voucher_redemptions_supplier_read ON public.voucher_redemptions;
CREATE POLICY voucher_redemptions_supplier_read ON public.voucher_redemptions
  FOR SELECT TO authenticated
  USING (supplier_id IS NOT NULL AND public.is_supplier_member(supplier_id));

DROP POLICY IF EXISTS voucher_redemptions_admin_read ON public.voucher_redemptions;
CREATE POLICY voucher_redemptions_admin_read ON public.voucher_redemptions
  FOR SELECT TO authenticated
  USING (public.is_admin());
