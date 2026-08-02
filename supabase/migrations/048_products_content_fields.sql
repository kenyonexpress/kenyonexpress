-- Migration 048: product content/marketing/logistics/SEO fields.
-- Ported (trimmed) from the overnight rebuild's 022_products_full_fields.sql.
-- Deliberately EXCLUDED from the source migration:
--   * supplier_split_percent / default_split_percent (contradicts the settled
--     commission engine: commission_percent + platform_percent + settlement)
--   * cashback_enabled / profit_share_cap_percent (cashback_percent already
--     owns this domain)
--   * suppliers contact columns + "public read" RLS (suppliers RLS is
--     admin-only by security decision; SupplierInfo exposes name via service
--     client only)
-- Idempotent: safe to run multiple times.

ALTER TABLE public.products
  -- marketing
  ADD COLUMN IF NOT EXISTS short_description_he text,
  ADD COLUMN IF NOT EXISTS brand                text,
  ADD COLUMN IF NOT EXISTS highlights           jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS video_url            text,
  ADD COLUMN IF NOT EXISTS barcode              text,
  -- inventory
  ADD COLUMN IF NOT EXISTS low_stock_threshold  integer NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS max_per_order        integer,
  -- physical logistics
  ADD COLUMN IF NOT EXISTS requires_shipping    boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS weight_grams         integer,
  ADD COLUMN IF NOT EXISTS length_cm            numeric(8,2),
  ADD COLUMN IF NOT EXISTS width_cm             numeric(8,2),
  ADD COLUMN IF NOT EXISTS height_cm            numeric(8,2),
  ADD COLUMN IF NOT EXISTS warranty_months      integer,
  ADD COLUMN IF NOT EXISTS condition            text,
  -- coupon specifics (coupon_expiry_days already exists)
  ADD COLUMN IF NOT EXISTS coupon_terms_he              text,
  ADD COLUMN IF NOT EXISTS redemption_instructions_he   text,
  ADD COLUMN IF NOT EXISTS min_purchase_ils             numeric(10,2),
  -- SEO
  ADD COLUMN IF NOT EXISTS seo_title       text,
  ADD COLUMN IF NOT EXISTS seo_description text,
  ADD COLUMN IF NOT EXISTS seo_keywords    text;

CREATE INDEX IF NOT EXISTS products_brand_idx
  ON public.products (brand) WHERE brand IS NOT NULL;
