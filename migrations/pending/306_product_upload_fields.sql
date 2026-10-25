-- Migration 306: Add fields for F56 admin product upload completion
-- Adds: original_price, source_url, valid_from for products
-- Adds: product_categories junction table for multi-category support

-- Add new columns to products table
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS original_price numeric(10,2),
  ADD COLUMN IF NOT EXISTS source_url text,
  ADD COLUMN IF NOT EXISTS valid_from timestamptz;

COMMENT ON COLUMN public.products.original_price IS
  'Original price from the source supplier (for comparison and tracking)';

COMMENT ON COLUMN public.products.source_url IS
  'URL to the original product page at the source supplier';

COMMENT ON COLUMN public.products.valid_from IS
  'Start date for offer/deal validity period (paired with offer_valid_until)';

-- Create junction table for multi-category support
CREATE TABLE IF NOT EXISTS public.product_categories (
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  category_id uuid NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (product_id, category_id)
);

COMMENT ON TABLE public.product_categories IS
  'Junction table for many-to-many product-category relationships. The first category (sort_order=0) is the primary category.';

CREATE INDEX IF NOT EXISTS product_categories_product_idx
  ON public.product_categories (product_id);

CREATE INDEX IF NOT EXISTS product_categories_category_idx
  ON public.product_categories (category_id);

-- RLS for product_categories (matches products table policies)
ALTER TABLE public.product_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS product_categories_public_read ON public.product_categories;
CREATE POLICY product_categories_public_read ON public.product_categories
  FOR SELECT USING (
    product_id IN (
      SELECT id FROM public.products
      WHERE status = 'active'::public.product_status
        AND deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS product_categories_admin_write ON public.product_categories;
CREATE POLICY product_categories_admin_write ON public.product_categories
  FOR ALL USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "product_categories: content_uploader select own" ON public.product_categories;
CREATE POLICY "product_categories: content_uploader select own"
  ON public.product_categories FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'content_uploader'::public.user_role
    AND product_id IN (
      SELECT id FROM public.products WHERE created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS "product_categories: content_uploader insert" ON public.product_categories;
CREATE POLICY "product_categories: content_uploader insert"
  ON public.product_categories FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role() = 'content_uploader'::public.user_role
    AND product_id IN (
      SELECT id FROM public.products WHERE created_by = auth.uid()
    )
  );

DROP POLICY IF EXISTS "product_categories: content_uploader delete" ON public.product_categories;
CREATE POLICY "product_categories: content_uploader delete"
  ON public.product_categories FOR DELETE TO authenticated
  USING (
    public.current_user_role() = 'content_uploader'::public.user_role
    AND product_id IN (
      SELECT id FROM public.products WHERE created_by = auth.uid()
    )
  );
