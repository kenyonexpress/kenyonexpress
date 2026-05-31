-- Migration 016: Sync the live products + product_variants schema with the app code.
-- The live DB still reflects migration 005 (title_he, price_ils), but the admin form,
-- the storefront and src/types/database.ts all use:
--   name_he, name_en, kenyon_price, full_price, is_coupon_enabled, sku, is_featured, images
-- This migration brings the DB in line with the code without losing existing data.
-- Idempotent: safe to run multiple times.

-- ---------------------------------------------------------------------------
-- 1. products: rename legacy title_he -> name_he (only when needed)
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'title_he'
      )
     AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'name_he'
      )
  THEN
    ALTER TABLE public.products RENAME COLUMN title_he TO name_he;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 2. products: add the columns the code expects
-- ---------------------------------------------------------------------------
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS name_en           text,
  ADD COLUMN IF NOT EXISTS kenyon_price      numeric(10,2),
  ADD COLUMN IF NOT EXISTS full_price        numeric(10,2),
  ADD COLUMN IF NOT EXISTS is_coupon_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS sku               text,
  ADD COLUMN IF NOT EXISTS is_featured       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS images            jsonb   NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS deleted_at        timestamptz;

-- 3. backfill kenyon_price from the legacy price_ils so existing rows keep a price
DO $$
BEGIN
  IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'price_ils'
      )
  THEN
    UPDATE public.products SET kenyon_price = price_ils WHERE kenyon_price IS NULL;
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. product_variants: rename title_he -> name_he + add expected columns
-- ---------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'product_variants' AND column_name = 'title_he'
      )
     AND NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'product_variants' AND column_name = 'name_he'
      )
  THEN
    ALTER TABLE public.product_variants RENAME COLUMN title_he TO name_he;
  END IF;
END $$;

ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS price          numeric(10,2),
  ADD COLUMN IF NOT EXISTS price_modifier numeric(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_active      boolean       NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS deleted_at     timestamptz;

-- 5. backfill variant price from the legacy price_ils
DO $$
BEGIN
  IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = 'product_variants' AND column_name = 'price_ils'
      )
  THEN
    UPDATE public.product_variants SET price = price_ils WHERE price IS NULL;
  END IF;
END $$;
