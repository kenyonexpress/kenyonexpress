-- Migration 005: Products schema for KenyonExpress marketplace
--
-- 003 <-> 005 RECONCILIATION (task: keep content_uploader RLS + created_by alive):
-- This file DROPs public.products and public.categories with CASCADE (see below),
-- which would destroy anything 003 attached to those tables. To keep intent intact:
--  1. created_by is re-declared INLINE on the recreated categories and products tables
--     (see the CREATE TABLE statements), and its indexes are recreated further down, so
--     the created_by tracking added in 003 survives the drop/recreate.
--  2. The content_uploader own-row policies (a content_uploader may select/insert/update
--     the catalog rows it created) are defined HERE, after the CREATE TABLE, rather than
--     in 003. If they lived in 003 the CASCADE below would drop them. 025 re-asserts the
--     same policies (plus a categories select-own policy) idempotently.
-- Do not move created_by or the content_uploader policies back into 003.

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Drop tables defined in 001 that this migration redefines with a new schema.
-- CASCADE removes dependent FK constraints (on coupons, order_items) but leaves those tables intact.
DROP TABLE IF EXISTS public.product_variants CASCADE;
DROP TABLE IF EXISTS public.products CASCADE;
DROP TABLE IF EXISTS public.categories CASCADE;

-- ENUM types
DO $$ BEGIN
  CREATE TYPE public.product_type AS ENUM ('coupon', 'physical', 'service');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.product_status AS ENUM ('draft', 'active', 'paused', 'sold_out', 'archived');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- Table: suppliers (private, admin-only)
CREATE TABLE IF NOT EXISTS public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  contact_email text,
  contact_phone text,
  commission_percent numeric(5,2) NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Table: categories (hierarchical)
CREATE TABLE IF NOT EXISTS public.categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid REFERENCES public.categories(id) ON DELETE CASCADE,
  slug text UNIQUE NOT NULL,
  name_he text NOT NULL,
  description_he text,
  image_url text,
  sort_order int NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Table: products (polymorphic by type)
CREATE TABLE IF NOT EXISTS public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  type public.product_type NOT NULL,
  status public.product_status NOT NULL DEFAULT 'draft',
  slug text UNIQUE NOT NULL,
  title_he text NOT NULL,
  description_he text,
  price_ils numeric(10,2) NOT NULL CHECK (price_ils >= 0),
  compare_at_price_ils numeric(10,2),
  cost_ils numeric(10,2),
  stock_quantity int,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  published_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Table: product_variants
CREATE TABLE IF NOT EXISTS public.product_variants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  sku text UNIQUE,
  title_he text NOT NULL,
  price_ils numeric(10,2),
  stock_quantity int,
  attributes jsonb NOT NULL DEFAULT '{}'::jsonb,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Table: product_images
CREATE TABLE IF NOT EXISTS public.product_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variant_id uuid REFERENCES public.product_variants(id) ON DELETE CASCADE,
  url text NOT NULL,
  alt_he text,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_products_status_type ON public.products(status, type);
CREATE INDEX IF NOT EXISTS idx_products_category ON public.products(category_id);
CREATE INDEX IF NOT EXISTS idx_products_supplier ON public.products(supplier_id);
CREATE INDEX IF NOT EXISTS idx_products_published ON public.products(published_at DESC) WHERE status = 'active'::public.product_status;
CREATE INDEX IF NOT EXISTS idx_categories_parent ON public.categories(parent_id);
CREATE INDEX IF NOT EXISTS idx_variants_product ON public.product_variants(product_id);
CREATE INDEX IF NOT EXISTS idx_images_product ON public.product_images(product_id, sort_order);
CREATE INDEX IF NOT EXISTS products_created_by_idx   ON public.products   (created_by);
CREATE INDEX IF NOT EXISTS categories_created_by_idx ON public.categories (created_by);

-- updated_at triggers (using existing trigger function from migration 001)
DROP TRIGGER IF EXISTS set_updated_at ON public.suppliers;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON public.categories;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.categories FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON public.products;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON public.product_variants;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.product_variants FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;

-- suppliers: admin only
DROP POLICY IF EXISTS suppliers_admin_all ON public.suppliers;
CREATE POLICY suppliers_admin_all ON public.suppliers FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- categories: public read active, admin write
DROP POLICY IF EXISTS categories_public_read ON public.categories;
CREATE POLICY categories_public_read ON public.categories FOR SELECT USING (is_active = true);
DROP POLICY IF EXISTS categories_admin_write ON public.categories;
CREATE POLICY categories_admin_write ON public.categories FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- products: public read active, admin write
DROP POLICY IF EXISTS products_public_read ON public.products;
CREATE POLICY products_public_read ON public.products FOR SELECT USING (status = 'active'::public.product_status);
DROP POLICY IF EXISTS products_admin_write ON public.products;
CREATE POLICY products_admin_write ON public.products FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- product_variants: public read if parent active, admin write
DROP POLICY IF EXISTS variants_public_read ON public.product_variants;
CREATE POLICY variants_public_read ON public.product_variants FOR SELECT USING (
  product_id IN (SELECT id FROM public.products WHERE status = 'active'::public.product_status)
);
DROP POLICY IF EXISTS variants_admin_write ON public.product_variants;
CREATE POLICY variants_admin_write ON public.product_variants FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- product_images: public read if parent active, admin write
DROP POLICY IF EXISTS images_public_read ON public.product_images;
CREATE POLICY images_public_read ON public.product_images FOR SELECT USING (
  product_id IN (SELECT id FROM public.products WHERE status = 'active'::public.product_status)
);
DROP POLICY IF EXISTS images_admin_write ON public.product_images;
CREATE POLICY images_admin_write ON public.product_images FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- content_uploader: select/insert/update own products
-- Moved here from 003_rbac.sql because 005 drops and recreates public.products.
DROP POLICY IF EXISTS "products: content_uploader select own" ON public.products;
CREATE POLICY "products: content_uploader select own"
  ON public.products FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'content_uploader'::public.user_role
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS "products: content_uploader insert" ON public.products;
CREATE POLICY "products: content_uploader insert"
  ON public.products FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role() = 'content_uploader'::public.user_role
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS "products: content_uploader update" ON public.products;
CREATE POLICY "products: content_uploader update"
  ON public.products FOR UPDATE TO authenticated
  USING (
    public.current_user_role() = 'content_uploader'::public.user_role
    AND created_by = auth.uid()
  )
  WITH CHECK (
    public.current_user_role() = 'content_uploader'::public.user_role
    AND created_by = auth.uid()
  );
