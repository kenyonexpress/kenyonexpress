-- Migration 027: Supplier Portal + Coupon Redemption + Payout Engine
-- ============================================================================
-- DRAFT: do NOT apply yet. Reviewed design lives in
-- docs/ARCHITECTURE-SUPPLIER-REDEMPTION.md
-- Fully idempotent. Requires 016 applied (products.name_he) and 019
-- (public.check_user_rate_limit) on the target DB.
-- Canonical business entity: public.suppliers (from 005).
-- public.vendors stays legacy (coupon_deals only) until a future merge.
-- ============================================================================

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
-- 1. ENUM types (new types: creating + using in one transaction is safe;
--    only ALTER TYPE ... ADD VALUE would not be)
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE public.supplier_status AS ENUM ('active', 'suspended', 'closed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.supplier_application_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.supplier_member_role AS ENUM ('owner', 'manager', 'scanner');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.payout_status AS ENUM
    ('draft', 'pending_approval', 'approved', 'paid', 'cancelled');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.payout_line_type AS ENUM
    ('physical_delivery', 'coupon_redemption', 'adjustment');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.dispute_status AS ENUM
    ('open', 'in_review', 'resolved_accepted', 'resolved_rejected');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.scan_result AS ENUM
    ('success', 'not_found', 'already_used', 'expired', 'refunded',
     'wrong_supplier', 'unauthorized', 'rate_limited');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.settlement_match_status AS ENUM
    ('unmatched', 'matched', 'amount_mismatch');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ---------------------------------------------------------------------------
-- 2. suppliers: onboarding + status fields
--    commission_percent (from 005) is reused as the supplier-level DEFAULT
--    platform_percent; products.platform_percent (section 6) overrides it.
-- ---------------------------------------------------------------------------

ALTER TABLE public.suppliers
  ADD COLUMN IF NOT EXISTS legal_name        text,
  ADD COLUMN IF NOT EXISTS business_id       text,
  ADD COLUMN IF NOT EXISTS address           text,
  ADD COLUMN IF NOT EXISTS city              text,
  ADD COLUMN IF NOT EXISTS logo_url          text,
  ADD COLUMN IF NOT EXISTS status            public.supplier_status NOT NULL DEFAULT 'active'::public.supplier_status,
  ADD COLUMN IF NOT EXISTS payout_terms_days int  NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS application_id    uuid,
  ADD COLUMN IF NOT EXISTS approved_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approved_at       timestamptz,
  ADD COLUMN IF NOT EXISTS deleted_at        timestamptz;

COMMENT ON COLUMN public.suppliers.commission_percent IS
  'Default platform_percent for this supplier. Overridden per product by products.platform_percent.';

CREATE INDEX IF NOT EXISTS suppliers_status_idx ON public.suppliers (status);
CREATE INDEX IF NOT EXISTS suppliers_deleted_at_idx ON public.suppliers (deleted_at) WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 3. supplier_applications: self-service registration, admin approval
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.supplier_applications (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_name    text        NOT NULL,
  legal_name       text,
  business_id      text        NOT NULL, -- Israeli company number / osek murshe
  contact_name     text        NOT NULL,
  contact_email    text        NOT NULL,
  contact_phone    text        NOT NULL,
  address          text,
  city             text,
  business_summary text,       -- free text: what they sell / redeem
  status           public.supplier_application_status NOT NULL DEFAULT 'pending'::public.supplier_application_status,
  reviewed_by      uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at      timestamptz,
  rejection_reason text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- one pending application per user
CREATE UNIQUE INDEX IF NOT EXISTS supplier_applications_pending_uq
  ON public.supplier_applications (user_id)
  WHERE status = 'pending'::public.supplier_application_status;

CREATE INDEX IF NOT EXISTS supplier_applications_status_idx
  ON public.supplier_applications (status, created_at DESC);

DROP TRIGGER IF EXISTS set_updated_at ON public.supplier_applications;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.supplier_applications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- FK from suppliers.application_id (added after table exists; guarded)
DO $$ BEGIN
  ALTER TABLE public.suppliers
    ADD CONSTRAINT suppliers_application_id_fkey
    FOREIGN KEY (application_id) REFERENCES public.supplier_applications(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ---------------------------------------------------------------------------
-- 4. supplier_members: membership is the authorization source of truth.
--    profiles.role stays a coarse gate (routing); profiles.supplier_id (008)
--    is kept in sync for backward compat but is no longer authoritative.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.supplier_members (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid        NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_role public.supplier_member_role NOT NULL DEFAULT 'scanner'::public.supplier_member_role,
  is_active   boolean     NOT NULL DEFAULT true,
  invited_by  uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (supplier_id, user_id)
);

CREATE INDEX IF NOT EXISTS supplier_members_user_idx
  ON public.supplier_members (user_id) WHERE is_active;

DROP TRIGGER IF EXISTS set_updated_at ON public.supplier_members;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.supplier_members
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Backfill from profiles.supplier_id (008-era association)
INSERT INTO public.supplier_members (supplier_id, user_id, member_role)
SELECT p.supplier_id, p.id, 'owner'::public.supplier_member_role
FROM public.profiles p
WHERE p.supplier_id IS NOT NULL
ON CONFLICT (supplier_id, user_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 5. Membership helper functions (SECURITY DEFINER: bypass RLS on
--    supplier_members, preventing policy recursion; same pattern as
--    current_user_role from 003)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_supplier_member(p_supplier_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.supplier_members
    WHERE supplier_id = p_supplier_id
      AND user_id = auth.uid()
      AND is_active
  )
$$;

-- owner only: bank details, member management, disputes
CREATE OR REPLACE FUNCTION public.is_supplier_owner(p_supplier_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.supplier_members
    WHERE supplier_id = p_supplier_id
      AND user_id = auth.uid()
      AND is_active
      AND member_role = 'owner'::public.supplier_member_role
  )
$$;

-- the caller's (first active) supplier, for dashboard queries
CREATE OR REPLACE FUNCTION public.current_supplier_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT supplier_id FROM public.supplier_members
  WHERE user_id = auth.uid() AND is_active
  ORDER BY created_at
  LIMIT 1
$$;

-- effective platform percent for a product (product override -> supplier default -> 10)
CREATE OR REPLACE FUNCTION public.product_platform_percent(p_product_id uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT COALESCE(pr.platform_percent, s.commission_percent, 10)
  FROM public.products pr
  LEFT JOIN public.suppliers s ON s.id = pr.supplier_id
  WHERE pr.id = p_product_id
$$;

-- ---------------------------------------------------------------------------
-- 6. products.platform_percent: admin-defined per-product override
-- ---------------------------------------------------------------------------

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS platform_percent numeric(5,2)
    CHECK (platform_percent IS NULL OR (platform_percent >= 0 AND platform_percent <= 100));

COMMENT ON COLUMN public.products.platform_percent IS
  'Admin-defined platform share (%). NULL falls back to suppliers.commission_percent. Snapshotted at order time into order_items.commission_percent and coupon_codes.platform_percent.';

-- Replace the broken 014 policy that joined products.supplier_id to vendors.id
-- (products.supplier_id references suppliers, not vendors)
DROP POLICY IF EXISTS "products: vendor read own" ON public.products;
DROP POLICY IF EXISTS "products: supplier member read own" ON public.products;
CREATE POLICY "products: supplier member read own"
  ON public.products FOR SELECT TO authenticated
  USING (supplier_id IS NOT NULL AND public.is_supplier_member(supplier_id));

-- ---------------------------------------------------------------------------
-- 7. supplier_bank_accounts: Israeli bank details, owner + admin only.
--    Separate table so scanner/manager members never see bank data via the
--    suppliers row. One active account per supplier.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.supplier_bank_accounts (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id         uuid        NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  account_holder_name text        NOT NULL,
  holder_id_number    text,       -- beneficiary ID (t.z. / company number)
  bank_code           text        NOT NULL CHECK (bank_code   ~ '^[0-9]{2}$'),
  branch_code         text        NOT NULL CHECK (branch_code ~ '^[0-9]{3}$'),
  account_number      text        NOT NULL CHECK (account_number ~ '^[0-9]{4,9}$'),
  is_active           boolean     NOT NULL DEFAULT true,
  verified_by         uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_at         timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS supplier_bank_accounts_active_uq
  ON public.supplier_bank_accounts (supplier_id) WHERE is_active;

DROP TRIGGER IF EXISTS set_updated_at ON public.supplier_bank_accounts;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.supplier_bank_accounts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 8. coupon_codes: financial snapshots + signed QR token
-- ---------------------------------------------------------------------------

ALTER TABLE public.coupon_codes
  ADD COLUMN IF NOT EXISTS platform_percent   numeric(5,2),
  ADD COLUMN IF NOT EXISTS face_value_ils     numeric(12,2),
  ADD COLUMN IF NOT EXISTS platform_paid_ils  numeric(12,2),
  ADD COLUMN IF NOT EXISTS collect_amount_ils numeric(12,2),
  ADD COLUMN IF NOT EXISTS qr_token           text,
  ADD COLUMN IF NOT EXISTS qr_key_id          text;

COMMENT ON COLUMN public.coupon_codes.collect_amount_ils IS
  'Snapshot at issue time: face_value_ils - platform_paid_ils. What the business collects from the customer at redemption.';
COMMENT ON COLUMN public.coupon_codes.qr_token IS
  'Signed offline-verifiable token (KE1.<payload>.<sig>, Ed25519). Authenticity only; single-use is enforced by redeem_coupon().';

-- ---------------------------------------------------------------------------
-- 9. coupon_scan_events: append-only log of EVERY scan attempt (incl. failures)
--    Written only by redeem_coupon() (SECURITY DEFINER); direct writes blocked.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.coupon_scan_events (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_code_id uuid        REFERENCES public.coupon_codes(id) ON DELETE SET NULL,
  code_entered   text        NOT NULL,
  supplier_id    uuid        REFERENCES public.suppliers(id) ON DELETE SET NULL,
  scanned_by     uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  scan_method    text        CHECK (scan_method IN ('camera', 'manual')),
  result         public.scan_result NOT NULL,
  metadata       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS coupon_scan_events_supplier_idx
  ON public.coupon_scan_events (supplier_id, created_at DESC);
CREATE INDEX IF NOT EXISTS coupon_scan_events_coupon_idx
  ON public.coupon_scan_events (coupon_code_id);
CREATE INDEX IF NOT EXISTS coupon_scan_events_scanner_idx
  ON public.coupon_scan_events (scanned_by, created_at DESC);

-- ---------------------------------------------------------------------------
-- 10. redeem_coupon(): the ONLY redemption path.
--     Atomic race guard: a single conditional UPDATE. The row is locked by the
--     first transaction; a concurrent scan re-evaluates the predicate after
--     commit, finds status <> 'issued', updates 0 rows.
--     wrong_supplier / not_found both return 'not_found' to the caller
--     (anti-enumeration); the precise result is logged in coupon_scan_events.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.redeem_coupon(
  p_code        text,
  p_scan_method text DEFAULT 'camera'
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_supplier_id   uuid;
  v_coupon        public.coupon_codes%ROWTYPE;
  v_result        public.scan_result;
  v_customer_name text;
  v_product_name  text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('result', 'unauthorized');
  END IF;

  IF p_scan_method NOT IN ('camera', 'manual') THEN
    p_scan_method := 'manual';
  END IF;

  SELECT supplier_id INTO v_supplier_id
  FROM public.supplier_members
  WHERE user_id = auth.uid() AND is_active
  ORDER BY created_at
  LIMIT 1;

  IF v_supplier_id IS NULL THEN
    INSERT INTO public.coupon_scan_events (code_entered, scanned_by, scan_method, result)
    VALUES (left(p_code, 32), auth.uid(), p_scan_method, 'unauthorized'::public.scan_result);
    RETURN jsonb_build_object('result', 'unauthorized');
  END IF;

  -- brute-force guard over the 8-digit code space: 30 attempts/minute/user
  IF NOT public.check_user_rate_limit(auth.uid(), 'coupon_scan', 30, 60) THEN
    INSERT INTO public.coupon_scan_events (code_entered, supplier_id, scanned_by, scan_method, result)
    VALUES (left(p_code, 32), v_supplier_id, auth.uid(), p_scan_method, 'rate_limited'::public.scan_result);
    RETURN jsonb_build_object('result', 'rate_limited');
  END IF;

  -- the atomic single-use guard
  UPDATE public.coupon_codes c
  SET status                   = 'used'::public.coupon_status,
      used_at                  = now(),
      used_by_supplier_user_id = auth.uid(),
      used_scan_method         = p_scan_method
  WHERE c.code = p_code
    AND c.supplier_id = v_supplier_id
    AND c.status = 'issued'::public.coupon_status
    AND c.expires_at > now()
    AND c.deleted_at IS NULL
  RETURNING c.* INTO v_coupon;

  IF FOUND THEN
    v_result := 'success'::public.scan_result;
  ELSE
    SELECT * INTO v_coupon
    FROM public.coupon_codes
    WHERE code = p_code AND deleted_at IS NULL;

    IF NOT FOUND THEN
      v_result := 'not_found'::public.scan_result;
    ELSIF v_coupon.supplier_id <> v_supplier_id THEN
      v_result := 'wrong_supplier'::public.scan_result;
    ELSIF v_coupon.status = 'used'::public.coupon_status THEN
      v_result := 'already_used'::public.scan_result;
    ELSIF v_coupon.status = 'refunded'::public.coupon_status THEN
      v_result := 'refunded'::public.scan_result;
    ELSIF v_coupon.status = 'expired'::public.coupon_status
          OR v_coupon.expires_at <= now() THEN
      v_result := 'expired'::public.scan_result;
    ELSE
      v_result := 'not_found'::public.scan_result;
    END IF;
  END IF;

  INSERT INTO public.coupon_scan_events
    (coupon_code_id, code_entered, supplier_id, scanned_by, scan_method, result)
  VALUES
    (v_coupon.id, left(p_code, 32), v_supplier_id, auth.uid(), p_scan_method, v_result);

  IF v_result = 'success'::public.scan_result THEN
    SELECT full_name INTO v_customer_name FROM public.profiles WHERE id = v_coupon.user_id;
    SELECT name_he   INTO v_product_name  FROM public.products WHERE id = v_coupon.product_id;

    RETURN jsonb_build_object(
      'result',             'success',
      'coupon_id',          v_coupon.id,
      'customer_name',      v_customer_name,
      'product_name',       v_product_name,
      'face_value_ils',     v_coupon.face_value_ils,
      'platform_paid_ils',  v_coupon.platform_paid_ils,
      'collect_amount_ils', v_coupon.collect_amount_ils,
      'used_at',            v_coupon.used_at
    );
  ELSIF v_result = 'already_used'::public.scan_result THEN
    -- honest answer only for the coupon's own supplier
    RETURN jsonb_build_object('result', 'already_used', 'used_at', v_coupon.used_at);
  ELSIF v_result = 'expired'::public.scan_result THEN
    RETURN jsonb_build_object('result', 'expired', 'expires_at', v_coupon.expires_at);
  ELSIF v_result = 'refunded'::public.scan_result THEN
    RETURN jsonb_build_object('result', 'refunded');
  ELSE
    -- not_found + wrong_supplier collapse to a generic answer (anti-enumeration)
    RETURN jsonb_build_object('result', 'not_found');
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.redeem_coupon(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.redeem_coupon(text, text) TO authenticated;

-- Batch expiry sweep (scheduled: pg_cron / edge function with service key)
CREATE OR REPLACE FUNCTION public.expire_coupons()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE public.coupon_codes
  SET status = 'expired'::public.coupon_status
  WHERE status = 'issued'::public.coupon_status
    AND expires_at <= now()
    AND deleted_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.expire_coupons() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_coupons() TO service_role;

-- Membership-based supplier read replaces the 008 profiles.supplier_id policy
DROP POLICY IF EXISTS coupons_supplier_read_assigned ON public.coupon_codes;
CREATE POLICY coupons_supplier_read_assigned ON public.coupon_codes
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND public.is_supplier_member(supplier_id));

-- Direct supplier UPDATE is removed: redemption goes ONLY through redeem_coupon()
-- (a direct UPDATE would bypass rate limiting, scan logging and the state machine)
DROP POLICY IF EXISTS coupons_supplier_mark_used ON public.coupon_codes;

-- ---------------------------------------------------------------------------
-- 11. order_items: shipping fields + supplier visibility
-- ---------------------------------------------------------------------------

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS shipping_carrier text,
  ADD COLUMN IF NOT EXISTS tracking_number  text,
  ADD COLUMN IF NOT EXISTS shipped_at       timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_at     timestamptz;

DROP POLICY IF EXISTS order_items_supplier_read ON public.order_items;
CREATE POLICY order_items_supplier_read
  ON public.order_items FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND supplier_id IS NOT NULL
    AND public.is_supplier_member(supplier_id)
  );

-- Suppliers see only PAID orders that contain their items (shipping needs
-- the order row for address_id; pending carts stay hidden)
DROP POLICY IF EXISTS orders_supplier_read ON public.orders;
CREATE POLICY orders_supplier_read
  ON public.orders FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND status IN ('paid'::public.order_status,
                   'partially_fulfilled'::public.order_status,
                   'fulfilled'::public.order_status)
    AND EXISTS (
      SELECT 1 FROM public.order_items oi
      WHERE oi.order_id = orders.id
        AND oi.supplier_id IS NOT NULL
        AND public.is_supplier_member(oi.supplier_id)
    )
  );

-- Shipping address for the supplier's paid items only
DROP POLICY IF EXISTS user_addresses_supplier_read ON public.user_addresses;
CREATE POLICY user_addresses_supplier_read
  ON public.user_addresses FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.orders o
      JOIN public.order_items oi ON oi.order_id = o.id
      WHERE o.address_id = user_addresses.id
        AND o.deleted_at IS NULL
        AND o.status IN ('paid'::public.order_status,
                         'partially_fulfilled'::public.order_status,
                         'fulfilled'::public.order_status)
        AND oi.supplier_id IS NOT NULL
        AND public.is_supplier_member(oi.supplier_id)
    )
  );

-- ---------------------------------------------------------------------------
-- 12. update_shipping_status(): the only supplier write path on order_items.
--     Enforces the transition state machine and recomputes orders.status.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.update_shipping_status(
  p_order_item_id uuid,
  p_new_status    text,               -- 'shipped' | 'delivered'
  p_carrier       text DEFAULT NULL,
  p_tracking      text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_item  public.order_items%ROWTYPE;
  v_order public.orders%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  SELECT * INTO v_item FROM public.order_items
  WHERE id = p_order_item_id AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'order item not found';
  END IF;

  IF v_item.supplier_id IS NULL
     OR NOT public.is_supplier_member(v_item.supplier_id) THEN
    RAISE EXCEPTION 'not a member of this supplier';
  END IF;

  SELECT * INTO v_order FROM public.orders
  WHERE id = v_item.order_id
  FOR UPDATE;

  IF v_order.status NOT IN ('paid'::public.order_status,
                            'partially_fulfilled'::public.order_status,
                            'fulfilled'::public.order_status) THEN
    RAISE EXCEPTION 'order is not paid';
  END IF;

  IF p_new_status = 'shipped' THEN
    IF v_item.item_status NOT IN ('pending'::public.order_item_status,
                                  'issued'::public.order_item_status) THEN
      RAISE EXCEPTION 'invalid transition: % -> shipped', v_item.item_status;
    END IF;
    UPDATE public.order_items
    SET item_status      = 'shipped'::public.order_item_status,
        shipping_carrier = COALESCE(p_carrier, shipping_carrier),
        tracking_number  = COALESCE(p_tracking, tracking_number),
        shipped_at       = now()
    WHERE id = p_order_item_id;

  ELSIF p_new_status = 'delivered' THEN
    IF v_item.item_status <> 'shipped'::public.order_item_status THEN
      RAISE EXCEPTION 'invalid transition: % -> delivered', v_item.item_status;
    END IF;
    UPDATE public.order_items
    SET item_status  = 'delivered'::public.order_item_status,
        delivered_at = now(),
        fulfilled_at = now()
    WHERE id = p_order_item_id;

  ELSE
    RAISE EXCEPTION 'unsupported status: %', p_new_status;
  END IF;

  -- recompute order status
  UPDATE public.orders o
  SET status = CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM public.order_items oi
      WHERE oi.order_id = o.id
        AND oi.deleted_at IS NULL
        AND oi.item_status NOT IN ('delivered'::public.order_item_status,
                                   'cancelled'::public.order_item_status,
                                   'refunded'::public.order_item_status)
    ) THEN 'fulfilled'::public.order_status
    ELSE 'partially_fulfilled'::public.order_status
  END
  WHERE o.id = v_item.order_id
    AND o.status IN ('paid'::public.order_status,
                     'partially_fulfilled'::public.order_status);

  RETURN jsonb_build_object('ok', true, 'order_item_id', p_order_item_id,
                            'new_status', p_new_status);
END;
$$;

REVOKE ALL ON FUNCTION public.update_shipping_status(uuid, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_shipping_status(uuid, text, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 13. Onboarding approval functions (admin only)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.approve_supplier_application(p_application_id uuid)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_app         public.supplier_applications%ROWTYPE;
  v_supplier_id uuid;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  SELECT * INTO v_app FROM public.supplier_applications
  WHERE id = p_application_id
  FOR UPDATE;

  IF NOT FOUND OR v_app.status <> 'pending'::public.supplier_application_status THEN
    RAISE EXCEPTION 'application not found or not pending';
  END IF;

  INSERT INTO public.suppliers
    (name, legal_name, business_id, contact_email, contact_phone,
     address, city, status, commission_percent, application_id,
     approved_by, approved_at)
  VALUES
    (v_app.business_name, v_app.legal_name, v_app.business_id,
     v_app.contact_email, v_app.contact_phone, v_app.address, v_app.city,
     'active'::public.supplier_status, 10, v_app.id, auth.uid(), now())
  RETURNING id INTO v_supplier_id;

  INSERT INTO public.supplier_members (supplier_id, user_id, member_role, invited_by)
  VALUES (v_supplier_id, v_app.user_id, 'owner'::public.supplier_member_role, auth.uid())
  ON CONFLICT (supplier_id, user_id) DO NOTHING;

  -- coarse role for routing; never demote staff roles
  UPDATE public.profiles
  SET supplier_id = v_supplier_id,
      role = CASE WHEN role = 'customer'::public.user_role
                  THEN 'vendor'::public.user_role
                  ELSE role END
  WHERE id = v_app.user_id;

  UPDATE public.supplier_applications
  SET status = 'approved'::public.supplier_application_status,
      reviewed_by = auth.uid(),
      reviewed_at = now()
  WHERE id = p_application_id;

  RETURN v_supplier_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_supplier_application(
  p_application_id uuid,
  p_reason         text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  UPDATE public.supplier_applications
  SET status = 'rejected'::public.supplier_application_status,
      rejection_reason = p_reason,
      reviewed_by = auth.uid(),
      reviewed_at = now()
  WHERE id = p_application_id
    AND status = 'pending'::public.supplier_application_status;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'application not found or not pending';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.approve_supplier_application(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_supplier_application(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.reject_supplier_application(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_supplier_application(uuid, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 14. Payout engine
-- ---------------------------------------------------------------------------

CREATE SEQUENCE IF NOT EXISTS public.payout_statement_number_seq;

CREATE TABLE IF NOT EXISTS public.payout_statements (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_number       text        UNIQUE NOT NULL
    DEFAULT ('PS-' || lpad(nextval('public.payout_statement_number_seq')::text, 6, '0')),
  supplier_id            uuid        NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  period_start           date        NOT NULL,
  period_end             date        NOT NULL,
  status                 public.payout_status NOT NULL DEFAULT 'draft'::public.payout_status,
  total_gross_ils        numeric(12,2) NOT NULL DEFAULT 0,
  total_platform_fee_ils numeric(12,2) NOT NULL DEFAULT 0,
  total_payout_ils       numeric(12,2) NOT NULL DEFAULT 0,
  approved_by            uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at            timestamptz,
  paid_at                timestamptz,
  payment_reference      text,
  bank_snapshot          jsonb,      -- bank details frozen at payment time
  notes                  text,
  deleted_at             timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  CHECK (period_end > period_start)
);

-- one live statement per supplier per period (cancelled ones do not block)
CREATE UNIQUE INDEX IF NOT EXISTS payout_statements_period_uq
  ON public.payout_statements (supplier_id, period_start, period_end)
  WHERE status <> 'cancelled'::public.payout_status;

CREATE INDEX IF NOT EXISTS payout_statements_supplier_idx
  ON public.payout_statements (supplier_id, period_start DESC);
CREATE INDEX IF NOT EXISTS payout_statements_status_idx
  ON public.payout_statements (status);

DROP TRIGGER IF EXISTS set_updated_at ON public.payout_statements;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.payout_statements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.payout_statement_lines (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  statement_id     uuid        NOT NULL REFERENCES public.payout_statements(id) ON DELETE CASCADE,
  line_type        public.payout_line_type NOT NULL,
  order_item_id    uuid        REFERENCES public.order_items(id) ON DELETE RESTRICT,
  coupon_code_id   uuid        REFERENCES public.coupon_codes(id) ON DELETE RESTRICT,
  description      text,
  quantity         int         NOT NULL DEFAULT 1,
  gross_ils        numeric(12,2) NOT NULL DEFAULT 0,
  platform_percent numeric(5,2),
  platform_fee_ils numeric(12,2) NOT NULL DEFAULT 0,
  payout_ils       numeric(12,2) NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CHECK (
    order_item_id IS NOT NULL
    OR coupon_code_id IS NOT NULL
    OR line_type = 'adjustment'::public.payout_line_type
  )
);

CREATE INDEX IF NOT EXISTS payout_statement_lines_statement_idx
  ON public.payout_statement_lines (statement_id);
CREATE INDEX IF NOT EXISTS payout_statement_lines_order_item_idx
  ON public.payout_statement_lines (order_item_id) WHERE order_item_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS payout_statement_lines_coupon_idx
  ON public.payout_statement_lines (coupon_code_id) WHERE coupon_code_id IS NOT NULL;

-- Generate (or fail loudly if a live statement exists) a statement for one
-- supplier and period. Uses ONLY snapshotted amounts from order time.
CREATE OR REPLACE FUNCTION public.generate_payout_statement(
  p_supplier_id  uuid,
  p_period_start date,
  p_period_end   date
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_statement_id uuid;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.payout_statements
    WHERE supplier_id = p_supplier_id
      AND period_start = p_period_start
      AND period_end   = p_period_end
      AND status <> 'cancelled'::public.payout_status
  ) THEN
    RAISE EXCEPTION 'live statement already exists for this supplier and period';
  END IF;

  INSERT INTO public.payout_statements (supplier_id, period_start, period_end)
  VALUES (p_supplier_id, p_period_start, p_period_end)
  RETURNING id INTO v_statement_id;

  -- physical items delivered in the period; payout from the order-time snapshot
  INSERT INTO public.payout_statement_lines
    (statement_id, line_type, order_item_id, description, quantity,
     gross_ils, platform_percent, platform_fee_ils, payout_ils)
  SELECT
    v_statement_id,
    'physical_delivery'::public.payout_line_type,
    oi.id,
    COALESCE(p.name_he, 'order item'),
    oi.quantity,
    oi.total_price_ils,
    oi.commission_percent,
    oi.total_price_ils - oi.supplier_payout_ils,
    oi.supplier_payout_ils
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  LEFT JOIN public.products p ON p.id = oi.product_id
  WHERE oi.supplier_id = p_supplier_id
    AND oi.product_type = 'physical'::public.product_type
    AND oi.item_status = 'delivered'::public.order_item_status
    AND COALESCE(oi.delivered_at, oi.fulfilled_at) >= p_period_start
    AND COALESCE(oi.delivered_at, oi.fulfilled_at) <  p_period_end + 1
    AND oi.deleted_at IS NULL
    AND o.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.payout_statement_lines l
      JOIN public.payout_statements s ON s.id = l.statement_id
      WHERE l.order_item_id = oi.id
        AND s.status <> 'cancelled'::public.payout_status
        AND s.id <> v_statement_id
    );

  -- coupons redeemed in the period: informational lines, payout 0
  -- (customer paid the remainder at the business; platform_paid is our revenue)
  INSERT INTO public.payout_statement_lines
    (statement_id, line_type, coupon_code_id, description, quantity,
     gross_ils, platform_percent, platform_fee_ils, payout_ils)
  SELECT
    v_statement_id,
    'coupon_redemption'::public.payout_line_type,
    cc.id,
    COALESCE(p.name_he, 'coupon'),
    1,
    COALESCE(cc.face_value_ils, 0),
    cc.platform_percent,
    COALESCE(cc.platform_paid_ils, 0),
    0
  FROM public.coupon_codes cc
  LEFT JOIN public.products p ON p.id = cc.product_id
  WHERE cc.supplier_id = p_supplier_id
    AND cc.status = 'used'::public.coupon_status
    AND cc.used_at >= p_period_start
    AND cc.used_at <  p_period_end + 1
    AND cc.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.payout_statement_lines l
      JOIN public.payout_statements s ON s.id = l.statement_id
      WHERE l.coupon_code_id = cc.id
        AND s.status <> 'cancelled'::public.payout_status
        AND s.id <> v_statement_id
    );

  UPDATE public.payout_statements ps
  SET total_gross_ils        = t.gross,
      total_platform_fee_ils = t.fee,
      total_payout_ils       = t.payout,
      status                 = 'pending_approval'::public.payout_status
  FROM (
    SELECT COALESCE(sum(gross_ils), 0)        AS gross,
           COALESCE(sum(platform_fee_ils), 0) AS fee,
           COALESCE(sum(payout_ils), 0)       AS payout
    FROM public.payout_statement_lines
    WHERE statement_id = v_statement_id
  ) t
  WHERE ps.id = v_statement_id;

  RETURN v_statement_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_payout_statement(p_statement_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  UPDATE public.payout_statements
  SET status = 'approved'::public.payout_status,
      approved_by = auth.uid(),
      approved_at = now()
  WHERE id = p_statement_id
    AND status = 'pending_approval'::public.payout_status;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'statement not found or not pending approval';
  END IF;
END;
$$;

-- Marks paid + freezes the bank details used. Blocked while disputes are open.
CREATE OR REPLACE FUNCTION public.mark_payout_statement_paid(
  p_statement_id      uuid,
  p_payment_reference text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_statement public.payout_statements%ROWTYPE;
  v_bank      jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  SELECT * INTO v_statement FROM public.payout_statements
  WHERE id = p_statement_id FOR UPDATE;

  IF NOT FOUND OR v_statement.status <> 'approved'::public.payout_status THEN
    RAISE EXCEPTION 'statement not found or not approved';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.supplier_disputes
    WHERE statement_id = p_statement_id
      AND status IN ('open'::public.dispute_status, 'in_review'::public.dispute_status)
  ) THEN
    RAISE EXCEPTION 'statement has open disputes';
  END IF;

  SELECT jsonb_build_object(
           'account_holder_name', account_holder_name,
           'bank_code', bank_code,
           'branch_code', branch_code,
           'account_number', account_number)
  INTO v_bank
  FROM public.supplier_bank_accounts
  WHERE supplier_id = v_statement.supplier_id AND is_active;

  IF v_bank IS NULL THEN
    RAISE EXCEPTION 'supplier has no active bank account';
  END IF;

  UPDATE public.payout_statements
  SET status = 'paid'::public.payout_status,
      paid_at = now(),
      payment_reference = p_payment_reference,
      bank_snapshot = v_bank
  WHERE id = p_statement_id;
END;
$$;

-- Cancel deletes the lines so the underlying items become settleable again.
CREATE OR REPLACE FUNCTION public.cancel_payout_statement(p_statement_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  UPDATE public.payout_statements
  SET status = 'cancelled'::public.payout_status
  WHERE id = p_statement_id
    AND status IN ('draft'::public.payout_status,
                   'pending_approval'::public.payout_status,
                   'approved'::public.payout_status);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'statement not found or already paid/cancelled';
  END IF;

  DELETE FROM public.payout_statement_lines WHERE statement_id = p_statement_id;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_payout_statement(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_payout_statement(uuid, date, date) TO authenticated;
REVOKE ALL ON FUNCTION public.approve_payout_statement(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.approve_payout_statement(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.mark_payout_statement_paid(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_payout_statement_paid(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.cancel_payout_statement(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_payout_statement(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 15. Cardcom settlement reconciliation (admin only)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.cardcom_settlements (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_date    date        NOT NULL,
  deposit_amount_ils numeric(12,2) NOT NULL,
  source_file        text,
  raw                jsonb       NOT NULL DEFAULT '{}'::jsonb,
  notes              text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS set_updated_at ON public.cardcom_settlements;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.cardcom_settlements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE IF NOT EXISTS public.cardcom_settlement_txns (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  settlement_id      uuid        NOT NULL REFERENCES public.cardcom_settlements(id) ON DELETE CASCADE,
  cardcom_payment_id text        NOT NULL,
  amount_ils         numeric(12,2) NOT NULL,
  order_id           uuid        REFERENCES public.orders(id) ON DELETE SET NULL,
  match_status       public.settlement_match_status NOT NULL DEFAULT 'unmatched'::public.settlement_match_status,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cardcom_settlement_txns_settlement_idx
  ON public.cardcom_settlement_txns (settlement_id);
CREATE INDEX IF NOT EXISTS cardcom_settlement_txns_payment_idx
  ON public.cardcom_settlement_txns (cardcom_payment_id);
CREATE INDEX IF NOT EXISTS cardcom_settlement_txns_match_idx
  ON public.cardcom_settlement_txns (match_status);

DROP TRIGGER IF EXISTS set_updated_at ON public.cardcom_settlement_txns;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.cardcom_settlement_txns
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.reconcile_cardcom_settlement(p_settlement_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_matched   integer;
  v_mismatch  integer;
  v_unmatched integer;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'admin only';
  END IF;

  UPDATE public.cardcom_settlement_txns t
  SET order_id = o.id,
      match_status = CASE
        WHEN o.total_ils = t.amount_ils THEN 'matched'::public.settlement_match_status
        ELSE 'amount_mismatch'::public.settlement_match_status
      END
  FROM public.orders o
  WHERE t.settlement_id = p_settlement_id
    AND o.cardcom_payment_id = t.cardcom_payment_id
    AND o.deleted_at IS NULL;

  SELECT count(*) FILTER (WHERE match_status = 'matched'::public.settlement_match_status),
         count(*) FILTER (WHERE match_status = 'amount_mismatch'::public.settlement_match_status),
         count(*) FILTER (WHERE match_status = 'unmatched'::public.settlement_match_status)
  INTO v_matched, v_mismatch, v_unmatched
  FROM public.cardcom_settlement_txns
  WHERE settlement_id = p_settlement_id;

  RETURN jsonb_build_object(
    'matched', v_matched,
    'amount_mismatch', v_mismatch,
    'unmatched', v_unmatched
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reconcile_cardcom_settlement(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reconcile_cardcom_settlement(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 16. supplier_disputes
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.supplier_disputes (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id       uuid        NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  opened_by         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  statement_id      uuid        REFERENCES public.payout_statements(id) ON DELETE SET NULL,
  statement_line_id uuid        REFERENCES public.payout_statement_lines(id) ON DELETE SET NULL,
  order_item_id     uuid        REFERENCES public.order_items(id) ON DELETE SET NULL,
  coupon_code_id    uuid        REFERENCES public.coupon_codes(id) ON DELETE SET NULL,
  reason            text        NOT NULL,
  status            public.dispute_status NOT NULL DEFAULT 'open'::public.dispute_status,
  resolution_notes  text,
  resolved_by       uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS supplier_disputes_supplier_idx
  ON public.supplier_disputes (supplier_id, status);
CREATE INDEX IF NOT EXISTS supplier_disputes_statement_idx
  ON public.supplier_disputes (statement_id) WHERE statement_id IS NOT NULL;

DROP TRIGGER IF EXISTS set_updated_at ON public.supplier_disputes;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.supplier_disputes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 17. RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.supplier_applications  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_members       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_bank_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_scan_events     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payout_statements      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payout_statement_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cardcom_settlements    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cardcom_settlement_txns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_disputes      ENABLE ROW LEVEL SECURITY;

-- ---- suppliers: members read their own supplier row (writes stay admin-only per 005)
DROP POLICY IF EXISTS suppliers_member_read ON public.suppliers;
CREATE POLICY suppliers_member_read
  ON public.suppliers FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND public.is_supplier_member(id));

-- ---- supplier_applications
DROP POLICY IF EXISTS "supplier_applications: owner insert" ON public.supplier_applications;
CREATE POLICY "supplier_applications: owner insert"
  ON public.supplier_applications FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND status = 'pending'::public.supplier_application_status
  );

DROP POLICY IF EXISTS "supplier_applications: owner select" ON public.supplier_applications;
CREATE POLICY "supplier_applications: owner select"
  ON public.supplier_applications FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "supplier_applications: admin all" ON public.supplier_applications;
CREATE POLICY "supplier_applications: admin all"
  ON public.supplier_applications FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ---- supplier_members: members read; owner manages; admin all
DROP POLICY IF EXISTS "supplier_members: member select" ON public.supplier_members;
CREATE POLICY "supplier_members: member select"
  ON public.supplier_members FOR SELECT TO authenticated
  USING (public.is_supplier_member(supplier_id));

DROP POLICY IF EXISTS "supplier_members: owner insert" ON public.supplier_members;
CREATE POLICY "supplier_members: owner insert"
  ON public.supplier_members FOR INSERT TO authenticated
  WITH CHECK (public.is_supplier_owner(supplier_id));

DROP POLICY IF EXISTS "supplier_members: owner update" ON public.supplier_members;
CREATE POLICY "supplier_members: owner update"
  ON public.supplier_members FOR UPDATE TO authenticated
  USING (public.is_supplier_owner(supplier_id))
  WITH CHECK (public.is_supplier_owner(supplier_id));

DROP POLICY IF EXISTS "supplier_members: owner delete" ON public.supplier_members;
CREATE POLICY "supplier_members: owner delete"
  ON public.supplier_members FOR DELETE TO authenticated
  USING (public.is_supplier_owner(supplier_id));

DROP POLICY IF EXISTS "supplier_members: admin all" ON public.supplier_members;
CREATE POLICY "supplier_members: admin all"
  ON public.supplier_members FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ---- supplier_bank_accounts: owner-only within the supplier + admin.
--      No DELETE policy: deactivate via is_active so payment history keeps its reference.
DROP POLICY IF EXISTS "bank_accounts: owner select" ON public.supplier_bank_accounts;
CREATE POLICY "bank_accounts: owner select"
  ON public.supplier_bank_accounts FOR SELECT TO authenticated
  USING (public.is_supplier_owner(supplier_id));

DROP POLICY IF EXISTS "bank_accounts: owner insert" ON public.supplier_bank_accounts;
CREATE POLICY "bank_accounts: owner insert"
  ON public.supplier_bank_accounts FOR INSERT TO authenticated
  WITH CHECK (public.is_supplier_owner(supplier_id));

DROP POLICY IF EXISTS "bank_accounts: owner update" ON public.supplier_bank_accounts;
CREATE POLICY "bank_accounts: owner update"
  ON public.supplier_bank_accounts FOR UPDATE TO authenticated
  USING (public.is_supplier_owner(supplier_id))
  WITH CHECK (public.is_supplier_owner(supplier_id));

DROP POLICY IF EXISTS "bank_accounts: admin all" ON public.supplier_bank_accounts;
CREATE POLICY "bank_accounts: admin all"
  ON public.supplier_bank_accounts FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ---- coupon_scan_events: read own supplier / admin; ALL direct writes blocked
--      (rows are inserted by redeem_coupon which is SECURITY DEFINER)
DROP POLICY IF EXISTS "scan_events: member select" ON public.coupon_scan_events;
CREATE POLICY "scan_events: member select"
  ON public.coupon_scan_events FOR SELECT TO authenticated
  USING (supplier_id IS NOT NULL AND public.is_supplier_member(supplier_id));

DROP POLICY IF EXISTS "scan_events: admin select" ON public.coupon_scan_events;
CREATE POLICY "scan_events: admin select"
  ON public.coupon_scan_events FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "scan_events: no insert" ON public.coupon_scan_events;
CREATE POLICY "scan_events: no insert"
  ON public.coupon_scan_events FOR INSERT TO authenticated
  WITH CHECK (false);

DROP POLICY IF EXISTS "scan_events: no update" ON public.coupon_scan_events;
CREATE POLICY "scan_events: no update"
  ON public.coupon_scan_events FOR UPDATE TO authenticated
  USING (false);

DROP POLICY IF EXISTS "scan_events: no delete" ON public.coupon_scan_events;
CREATE POLICY "scan_events: no delete"
  ON public.coupon_scan_events FOR DELETE TO authenticated
  USING (false);

-- ---- payout_statements: members see non-draft statements of their supplier
DROP POLICY IF EXISTS "payout_statements: member select" ON public.payout_statements;
CREATE POLICY "payout_statements: member select"
  ON public.payout_statements FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND status <> 'draft'::public.payout_status
    AND public.is_supplier_member(supplier_id)
  );

DROP POLICY IF EXISTS "payout_statements: admin all" ON public.payout_statements;
CREATE POLICY "payout_statements: admin all"
  ON public.payout_statements FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ---- payout_statement_lines
DROP POLICY IF EXISTS "payout_lines: member select" ON public.payout_statement_lines;
CREATE POLICY "payout_lines: member select"
  ON public.payout_statement_lines FOR SELECT TO authenticated
  USING (
    statement_id IN (
      SELECT id FROM public.payout_statements
      WHERE deleted_at IS NULL
        AND status <> 'draft'::public.payout_status
        AND public.is_supplier_member(supplier_id)
    )
  );

DROP POLICY IF EXISTS "payout_lines: admin all" ON public.payout_statement_lines;
CREATE POLICY "payout_lines: admin all"
  ON public.payout_statement_lines FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ---- cardcom_*: admin only
DROP POLICY IF EXISTS "cardcom_settlements: admin all" ON public.cardcom_settlements;
CREATE POLICY "cardcom_settlements: admin all"
  ON public.cardcom_settlements FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "cardcom_txns: admin all" ON public.cardcom_settlement_txns;
CREATE POLICY "cardcom_txns: admin all"
  ON public.cardcom_settlement_txns FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ---- supplier_disputes: owner opens + reads; admin resolves
DROP POLICY IF EXISTS "disputes: owner insert" ON public.supplier_disputes;
CREATE POLICY "disputes: owner insert"
  ON public.supplier_disputes FOR INSERT TO authenticated
  WITH CHECK (
    opened_by = auth.uid()
    AND status = 'open'::public.dispute_status
    AND public.is_supplier_owner(supplier_id)
  );

DROP POLICY IF EXISTS "disputes: member select" ON public.supplier_disputes;
CREATE POLICY "disputes: member select"
  ON public.supplier_disputes FOR SELECT TO authenticated
  USING (public.is_supplier_member(supplier_id));

DROP POLICY IF EXISTS "disputes: admin all" ON public.supplier_disputes;
CREATE POLICY "disputes: admin all"
  ON public.supplier_disputes FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ---------------------------------------------------------------------------
-- 18. Audit triggers (audit_log_trigger_fn from 025 writes to audit_log).
--     Note: bank rows land in audit_log.changes; audit_log is admin-SELECT only.
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS audit_suppliers ON public.suppliers;
CREATE TRIGGER audit_suppliers
  AFTER INSERT OR UPDATE OR DELETE ON public.suppliers
  FOR EACH ROW EXECUTE PROCEDURE public.audit_log_trigger_fn();

DROP TRIGGER IF EXISTS audit_supplier_applications ON public.supplier_applications;
CREATE TRIGGER audit_supplier_applications
  AFTER INSERT OR UPDATE OR DELETE ON public.supplier_applications
  FOR EACH ROW EXECUTE PROCEDURE public.audit_log_trigger_fn();

DROP TRIGGER IF EXISTS audit_supplier_members ON public.supplier_members;
CREATE TRIGGER audit_supplier_members
  AFTER INSERT OR UPDATE OR DELETE ON public.supplier_members
  FOR EACH ROW EXECUTE PROCEDURE public.audit_log_trigger_fn();

DROP TRIGGER IF EXISTS audit_supplier_bank_accounts ON public.supplier_bank_accounts;
CREATE TRIGGER audit_supplier_bank_accounts
  AFTER INSERT OR UPDATE OR DELETE ON public.supplier_bank_accounts
  FOR EACH ROW EXECUTE PROCEDURE public.audit_log_trigger_fn();

DROP TRIGGER IF EXISTS audit_payout_statements ON public.payout_statements;
CREATE TRIGGER audit_payout_statements
  AFTER INSERT OR UPDATE OR DELETE ON public.payout_statements
  FOR EACH ROW EXECUTE PROCEDURE public.audit_log_trigger_fn();

DROP TRIGGER IF EXISTS audit_supplier_disputes ON public.supplier_disputes;
CREATE TRIGGER audit_supplier_disputes
  AFTER INSERT OR UPDATE OR DELETE ON public.supplier_disputes
  FOR EACH ROW EXECUTE PROCEDURE public.audit_log_trigger_fn();

-- ---------------------------------------------------------------------------
-- 19. supplier-docs private bucket (statements PDFs, agreements).
--     Path convention: <supplier_id>/<file>. Writes are server-side only.
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public)
VALUES ('supplier-docs', 'supplier-docs', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "supplier-docs: member read own" ON storage.objects;
CREATE POLICY "supplier-docs: member read own"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'supplier-docs'
    AND public.is_supplier_member(((storage.foldername(name))[1])::uuid)
  );

DROP POLICY IF EXISTS "supplier-docs: admin all" ON storage.objects;
CREATE POLICY "supplier-docs: admin all"
  ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'supplier-docs' AND public.is_admin())
  WITH CHECK (bucket_id = 'supplier-docs' AND public.is_admin());
