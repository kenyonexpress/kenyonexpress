-- 243_product_full_address.sql
--
-- Add `full_address` column to products table for storing complete street address
-- (e.g., "רוטשילד 15 תל אביב").
--
-- IDEMPOTENT: every statement is IF NOT EXISTS so a second apply is a no-op.
--
-- ROLLBACK:
--   ALTER TABLE public.products DROP COLUMN IF EXISTS full_address;

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'full_address'
  ) THEN
    ALTER TABLE public.products
      ADD COLUMN full_address text DEFAULT NULL;

    COMMENT ON COLUMN public.products.full_address IS
      'Full street address for physical delivery (e.g., רוטשילד 15 תל אביב). Shown on product page detail view only.';
  END IF;
END $$;

-- Post-conditions
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'products' AND column_name = 'full_address'
  ) THEN
    RAISE EXCEPTION 'full_address column was not created on products table';
  END IF;
END $$;

COMMIT;
