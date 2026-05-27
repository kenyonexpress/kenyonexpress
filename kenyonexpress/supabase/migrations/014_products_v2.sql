-- Phase 4: Products v2 — add fields, fix variants schema, soft delete, RLS
-- Idempotent: safe to run multiple times.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS name_en          text,
  ADD COLUMN IF NOT EXISTS compare_at_price numeric(10,2),
  ADD COLUMN IF NOT EXISTS sku              text,
  ADD COLUMN IF NOT EXISTS is_featured      boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS deleted_at       timestamptz;

CREATE INDEX IF NOT EXISTS products_deleted_at_idx  ON public.products (deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS products_status_idx       ON public.products (status);
CREATE INDEX IF NOT EXISTS products_vendor_id_idx    ON public.products (vendor_id);
CREATE INDEX IF NOT EXISTS products_category_id_idx  ON public.products (category_id);
CREATE INDEX IF NOT EXISTS products_is_featured_idx  ON public.products (is_featured) WHERE is_featured = true;

-- Add direct price + sku columns to variants
ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS price     numeric(10,2),
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

-- RLS on products
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "products: public read" ON public.products;
CREATE POLICY "products: public read"
  ON public.products FOR SELECT
  USING (status = 'active' AND deleted_at IS NULL);

DROP POLICY IF EXISTS "products: vendor read own" ON public.products;
CREATE POLICY "products: vendor read own"
  ON public.products FOR SELECT TO authenticated
  USING (
    vendor_id IN (
      SELECT id FROM public.vendors WHERE profile_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "products: admin read" ON public.products;
CREATE POLICY "products: admin read"
  ON public.products FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "products: admin insert" ON public.products;
CREATE POLICY "products: admin insert"
  ON public.products FOR INSERT TO authenticated
  WITH CHECK (public.has_role('content_uploader'));

DROP POLICY IF EXISTS "products: admin update" ON public.products;
CREATE POLICY "products: admin update"
  ON public.products FOR UPDATE TO authenticated
  USING (public.has_role('content_uploader'))
  WITH CHECK (public.has_role('content_uploader'));

DROP POLICY IF EXISTS "products: admin delete" ON public.products;
CREATE POLICY "products: admin delete"
  ON public.products FOR DELETE TO authenticated
  USING (public.is_admin());

-- RLS on product_variants
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "variants: public read" ON public.product_variants;
CREATE POLICY "variants: public read"
  ON public.product_variants FOR SELECT
  USING (is_active = true AND deleted_at IS NULL);

DROP POLICY IF EXISTS "variants: admin all" ON public.product_variants;
CREATE POLICY "variants: admin all"
  ON public.product_variants FOR ALL TO authenticated
  USING (public.has_role('content_uploader'))
  WITH CHECK (public.has_role('content_uploader'));
