-- ============================================================================
-- PENDING: drop vendors.commission_rate -- the last supplier-level percentage
-- ============================================================================
--
-- STATUS: NOT APPLIED. Apply only through MCP apply_migration, never db push.
--
-- ----------------------------------------------------------------------------
-- WHY THIS COLUMN GOES
-- ----------------------------------------------------------------------------
--
-- AGENTS.md: every percentage is per product, set by the admin on the product
-- page. A rate stored on the supplier can only ever be a global default in
-- disguise, because one supplier is expected to have ten products at ten
-- different percentages.
--
-- As of 2026-08-11 nothing in the application writes this column. Its only
-- writer, runUpdateVendorCommission, and the form field that fed it were
-- removed the same day. This file removes the column itself.
--
-- ----------------------------------------------------------------------------
-- WHAT WAS NOT DONE, AND WHY -- READ THIS BEFORE "RESTORING" ANYTHING
-- ----------------------------------------------------------------------------
--
-- The instruction was: "copy each vendor rate onto its products, then drop
-- commission_rate from vendors". The copy is deliberately NOT performed, and
-- is not merely skipped as unnecessary: running it would have destroyed live
-- money settings. Measured against the catalog on 2026-08-11:
--
--   products.platform_percent, 61 active rows:  30.00 -> 31 rows
--                                               25.00 -> 15 rows
--                                               15.00 -> 15 rows
--   vendors.commission_rate,    6 rows:         10.00 -> 6 rows  (ONE value)
--
-- Copying the vendor rate onto its products would have rewritten 31 products
-- from 30% to 10%, a 20 point cut across ILS 27,157 of catalog, and would have
-- found NO vendor at all for the other 30 products: there is no
-- products.vendor_id column, products link to suppliers, and the vendors ->
-- suppliers mirror from migration 044 covers 6 of 11 suppliers.
--
-- The per-product variation the rule exists to protect was ALREADY in the data.
-- The supplier-level number was the flat one. That single 10.00 is the same
-- "10% nobody chose" removed from the wp-import projector in commit 8819c5d and
-- from scripts/apply-044-link-vendors.mjs in commit 04c846e.
--
-- ----------------------------------------------------------------------------
-- WHY THERE IS NO NOT NULL HERE EITHER
-- ----------------------------------------------------------------------------
--
-- The same instruction asked for NOT NULL on both percent columns. It cannot be
-- applied today: 19 active-catalog products (status='draft', from the WordPress
-- import) carry platform_percent IS NULL and supplier_id IS NULL. Filling them
-- requires inventing a percentage, which is precisely what the rule forbids.
--
-- The order is therefore: an admin sets a rate on each of those 19 products,
-- and only then does NOT NULL become a migration somebody can write. Until
-- then the pair CHECK below is the enforcement, and it already exists.
--
-- ----------------------------------------------------------------------------
-- THE CHECK THE BRIEF ASKED FOR ALREADY EXISTS
-- ----------------------------------------------------------------------------
--
-- Read off pg_constraint on 2026-08-11, on BOTH tables, NULL-tolerant:
--
--   products_split_pair_sums_to_100
--     CHECK (platform_percent IS NULL OR supplier_split_percent IS NULL
--            OR (platform_percent + supplier_split_percent) = 100)
--   order_items_split_pair_sums_to_100
--     (identical, on the purchase-time snapshot)
--
-- Nothing here re-creates them. 0 of 80 products violate the invariant.

-- ---------------------------------------------------------------------------
-- 1. Preserve the retired values before the column disappears
-- ---------------------------------------------------------------------------
--
-- Six numbers are small, but they are the only record of what each supplier was
-- nominally on before percentages moved to the product. Kept as a comment-bearing
-- table rather than in a migration comment, so a later question has an answer.

CREATE TABLE IF NOT EXISTS public.vendors_commission_rate_archive (
  vendor_id       uuid PRIMARY KEY,
  commission_rate numeric(5,2),
  archived_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.vendors_commission_rate_archive IS
  'Retired 2026-08-11: the last supplier-level commission percentages, kept only '
  'as history. Never read by the application. Percentages live on products.';

INSERT INTO public.vendors_commission_rate_archive (vendor_id, commission_rate)
SELECT id, commission_rate FROM public.vendors
ON CONFLICT (vendor_id) DO NOTHING;

ALTER TABLE public.vendors_commission_rate_archive ENABLE ROW LEVEL SECURITY;
-- No policy: service_role only. This is history, not application data.

-- ---------------------------------------------------------------------------
-- 2. Drop the column
-- ---------------------------------------------------------------------------
--
-- NOT NULL with no default today, so no dependent default to drop first.
-- Checked for dependent views/constraints on 2026-08-11: none reference it.

ALTER TABLE public.vendors DROP COLUMN IF EXISTS commission_rate;

-- ============================================================================
-- VERIFICATION (run after applying; expected results inline)
-- ============================================================================
--
-- 1. The column is gone (expect 0 rows):
--
--      SELECT column_name FROM information_schema.columns
--       WHERE table_schema='public' AND table_name='vendors'
--         AND column_name='commission_rate';
--
-- 2. The history survived (expect 6):
--
--      SELECT count(*) FROM public.vendors_commission_rate_archive;
--
-- 3. NOT ONE product percentage moved (expect 30.00->31, 25.00->15, 15.00->15):
--
--      SELECT platform_percent, count(*) FROM public.products
--       WHERE deleted_at IS NULL AND status='active'
--       GROUP BY 1 ORDER BY 1 DESC;
--
-- 4. The pair invariant still holds (expect 0):
--
--      SELECT count(*) FROM public.products
--       WHERE platform_percent IS NOT NULL AND supplier_split_percent IS NOT NULL
--         AND platform_percent + supplier_split_percent <> 100;
--
-- ============================================================================
