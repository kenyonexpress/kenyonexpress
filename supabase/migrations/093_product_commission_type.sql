-- 093_product_commission_type.sql
--
-- Stores the commission shape per product, as products.commission_type.
--
-- WHY THIS NEEDS A CONSTRAINT AND NOT JUST A COLUMN
--
-- docs/CONTRADICTIONS.md C1 and C2 were written after this codebase shipped a
-- 5% default in 047, a 10% default in 026, and a 10% default in the payments
-- skill, all disagreeing. C2's ruling was "two percent columns -> one column:
-- platform_percent". A free-floating commission_type would be the third place
-- to state how a product's commission works, and by the usual arithmetic the
-- first to disagree with the other two: ADMIN-ARCHITECTURE section 0.3 already
-- ties the shape to products.type, where a coupon bills an absolute
-- coupon_price_ils and a physical bills price_ils reduced by discount_percent.
--
-- So the column is stored, which is what an admin screen can read and write
-- against, but a CHECK makes the two spellings the same fact. A row where
-- commission_type disagrees with type cannot be written at all, which is the
-- property C2 was protecting and the one a plain column would have lost.
--
-- Backfilled from type, so no row is invented: every product already carries
-- the answer, it just had no name.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, and the constraint is dropped before it
-- is added. Re-running is a no-op.
-- Rollback: ALTER TABLE public.products DROP COLUMN IF EXISTS commission_type.
--
-- NOT APPLIED to the hosted project. Draft only.

DO $$
BEGIN
  CREATE TYPE public.commission_type AS ENUM ('coupon_absolute', 'physical_percent');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END
$$;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS commission_type public.commission_type;

-- Backfill from the column that already decided this.
UPDATE public.products
SET commission_type = CASE
      WHEN type = 'coupon'::public.product_type THEN 'coupon_absolute'::public.commission_type
      ELSE 'physical_percent'::public.commission_type
    END
WHERE commission_type IS NULL;

ALTER TABLE public.products
  ALTER COLUMN commission_type SET NOT NULL;

-- The whole point. Without this the column is a second opinion.
ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_commission_type_matches_type;
ALTER TABLE public.products
  ADD CONSTRAINT products_commission_type_matches_type CHECK (
    (type = 'coupon'::public.product_type
      AND commission_type = 'coupon_absolute'::public.commission_type)
    OR
    (type <> 'coupon'::public.product_type
      AND commission_type = 'physical_percent'::public.commission_type)
  );

COMMENT ON COLUMN public.products.commission_type IS
  'How this product''s commission is expressed: coupon_absolute bills products.coupon_price_ils and splits it, physical_percent bills price_ils less discount_percent and splits that. Held equal to products.type by products_commission_type_matches_type, so it is a readable name for an existing fact rather than a second place to decide it (docs/CONTRADICTIONS.md C2).';
