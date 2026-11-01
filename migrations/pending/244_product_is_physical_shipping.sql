-- 244_product_is_physical_shipping.sql
--
-- Add `is_physical_shipping` boolean column to products table to indicate
-- if a product ships to the entire country (true) or only to specific city (false).
--
-- When true, the city field is disabled in the admin form and displays "כל הארץ" (entire country)
-- in the UI. When false, city becomes required.
--
-- IDEMPOTENT: every statement is IF NOT EXISTS so a second apply is a no-op.
--
-- ROLLBACK:
--   ALTER TABLE public.products DROP COLUMN IF EXISTS is_physical_shipping;

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'is_physical_shipping'
  ) THEN
    ALTER TABLE public.products
      ADD COLUMN is_physical_shipping boolean DEFAULT false;

    COMMENT ON COLUMN public.products.is_physical_shipping IS
      'Indicates if product ships to entire country (true) or specific city (false). When true, city is ignored and display shows כל הארץ.';
  END IF;
END $$;

-- Post-conditions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'is_physical_shipping'
  ) THEN
    RAISE EXCEPTION 'is_physical_shipping column was not created on products table';
  END IF;
END $$;

COMMIT;
