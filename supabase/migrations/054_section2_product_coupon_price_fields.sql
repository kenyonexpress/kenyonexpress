-- 054_section2_product_coupon_price_fields.sql
--
-- WHY THIS FILE EXISTS SEPARATELY FROM 054_voucher_redemption.sql
--
-- This is section 2 of 054, and nothing else, extracted verbatim. It was
-- applied to the hosted project on 2026-07-27 under exactly this migration
-- name, but no file existed for it until now, so the repository could not
-- reproduce the schema that production is actually running. Full record of
-- that change, including rollback, is in docs/PRODUCTION-CHANGES-2026-07-27.md
--
-- Only section 2 was applied because the rest of 054 builds the voucher
-- subsystem on public.supplier_members from migration 027, which the hosted
-- project does not have. Creating half of that subsystem against a missing
-- dependency would have added a fourth schema variant to the three that
-- already disagree. These two columns have no dependencies at all, and they
-- are what unblocked the storefront: every query on the purchase path names
-- products.coupon_price_ils, and Postgres 42703 fails the whole select, not
-- just the missing field.
--
-- Depends on: 005 (products.price_ils, products.deleted_at). Nothing else.
--
-- Safe to run alongside 054_voucher_redemption.sql on a fresh database: every
-- statement here is idempotent and 054 repeats the same guarded forms, so
-- whichever runs second is a no-op.

-- ---------------------------------------------------------------------------
-- Product fields the absolute-price coupon model needs
--   coupon_price_ils is the absolute amount charged online. It is NOT a
--   percent and has no default: a coupon product without one cannot issue.
-- ---------------------------------------------------------------------------

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS coupon_price_ils  numeric(12,2),
  ADD COLUMN IF NOT EXISTS offer_valid_until timestamptz;

COMMENT ON COLUMN public.products.coupon_price_ils IS
  'Absolute shekel amount the customer pays online for the coupon, set per product by the admin. Not a percent, no default. The balance (price_ils - coupon_price_ils) is collected by the business at redemption.';
COMMENT ON COLUMN public.products.offer_valid_until IS
  'Calendar deadline of the offer. Vouchers expire automatically at this instant and the date is displayed to the customer (consumer protection).';

-- Added NOT VALID on purpose: rows that predate the column are not checked, so
-- applying this to a live table cannot fail. New and updated rows are checked.
-- A row that violates it therefore still exists in principle, which is why
-- src/lib/commerce/coupon-offer.ts treats a coupon price above the sticker
-- price as unsellable rather than trusting the constraint to have caught it.
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.products'::regclass
      AND conname = 'products_coupon_price_within_price'
  ) THEN
    ALTER TABLE public.products
      ADD CONSTRAINT products_coupon_price_within_price
      CHECK (
        coupon_price_ils IS NULL
        OR (coupon_price_ils > 0 AND coupon_price_ils <= price_ils)
      ) NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS products_offer_valid_until_idx
  ON public.products (offer_valid_until)
  WHERE offer_valid_until IS NOT NULL AND deleted_at IS NULL;
