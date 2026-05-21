-- Migration 008: Coupons schema for KenyonExpress

-- ---------------------------------------------------------------------------
-- 1. Drop 001 coupons table + enum (different values/schema)
-- ---------------------------------------------------------------------------

DROP TABLE IF EXISTS public.coupons CASCADE;
DROP TYPE IF EXISTS public.coupon_status;

-- ---------------------------------------------------------------------------
-- 2. Add supplier_id to profiles so vendor users can be associated with a
--    supplier (required by the supplier RLS policies below)
-- ---------------------------------------------------------------------------

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_supplier_id ON public.profiles(supplier_id);

-- ---------------------------------------------------------------------------
-- 3. ENUM type for coupon status
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE public.coupon_status AS ENUM ('issued', 'used', 'expired', 'refunded');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Table: coupon_codes
CREATE TABLE IF NOT EXISTS public.coupon_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  qr_code_url text,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  order_item_id uuid NOT NULL REFERENCES public.order_items(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  status public.coupon_status NOT NULL DEFAULT 'issued',
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  used_by_supplier_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  used_scan_method text CHECK (used_scan_method IN ('camera', 'manual')),
  refunded_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT coupon_code_8_digits CHECK (code ~ '^[0-9]{8}$')
);

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS idx_coupon_codes_code ON public.coupon_codes(code);
CREATE INDEX IF NOT EXISTS idx_coupon_codes_user_status ON public.coupon_codes(user_id, status);
CREATE INDEX IF NOT EXISTS idx_coupon_codes_order_item ON public.coupon_codes(order_item_id);
CREATE INDEX IF NOT EXISTS idx_coupon_codes_supplier_status ON public.coupon_codes(supplier_id, status);
CREATE INDEX IF NOT EXISTS idx_coupon_codes_expires_active ON public.coupon_codes(expires_at) WHERE status = 'issued';

-- updated_at trigger
DROP TRIGGER IF EXISTS set_updated_at ON public.coupon_codes;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.coupon_codes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.coupon_codes ENABLE ROW LEVEL SECURITY;

-- Users can SELECT their own coupons
DROP POLICY IF EXISTS coupons_user_read_own ON public.coupon_codes;
CREATE POLICY coupons_user_read_own ON public.coupon_codes
  FOR SELECT
  USING (user_id = auth.uid() AND deleted_at IS NULL);

-- Suppliers can SELECT coupons assigned to them (via their supplier_id mapping in profiles)
DROP POLICY IF EXISTS coupons_supplier_read_assigned ON public.coupon_codes;
CREATE POLICY coupons_supplier_read_assigned ON public.coupon_codes
  FOR SELECT
  USING (
    deleted_at IS NULL
    AND supplier_id IN (
      SELECT supplier_id FROM public.profiles
      WHERE id = auth.uid() AND role IN ('vendor', 'content_uploader')
    )
  );

-- Suppliers can UPDATE only the used_at/used_by/scan_method/status fields on their own coupons
DROP POLICY IF EXISTS coupons_supplier_mark_used ON public.coupon_codes;
CREATE POLICY coupons_supplier_mark_used ON public.coupon_codes
  FOR UPDATE
  USING (
    deleted_at IS NULL
    AND supplier_id IN (
      SELECT supplier_id FROM public.profiles
      WHERE id = auth.uid() AND role IN ('vendor', 'content_uploader')
    )
  )
  WITH CHECK (
    supplier_id IN (
      SELECT supplier_id FROM public.profiles
      WHERE id = auth.uid() AND role IN ('vendor', 'content_uploader')
    )
  );

-- Admins: full access
DROP POLICY IF EXISTS coupons_admin_all ON public.coupon_codes;
CREATE POLICY coupons_admin_all ON public.coupon_codes
  FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
