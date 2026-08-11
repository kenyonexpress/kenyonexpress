-- ============================================================================
-- PENDING: drop the fixed commission defaults the database still hands out
-- ============================================================================
--
-- STATUS: NOT APPLIED. Apply only through MCP apply_migration, never db push.
--
-- ----------------------------------------------------------------------------
-- WHAT WAS MEASURED, ON THE LIVE PROJECT, 2026-08-11
-- ----------------------------------------------------------------------------
--
-- The CI gate scripts/no-hardcoded-fees.mjs passes, and no money calculation in
-- src/ reads vendors.commission_rate. The rule is nevertheless still broken,
-- because the fixed percentages moved out of the code and stayed in the schema:
--
--   information_schema.columns, public schema
--     vendors.commission_rate           numeric  NULL      DEFAULT 10.00
--     suppliers.default_split_percent   numeric  NOT NULL  DEFAULT 70
--     suppliers.commission_percent      numeric  NOT NULL  DEFAULT 0
--
-- A column default is exactly the "global default or fallback" AGENTS.md bans.
-- It is worse than a constant in code: no gate greps it, and it writes itself
-- into every INSERT that omits the field. The row counts show it already did.
--
--     vendors with commission_rate = 10.00 ........ 6 of 6
--     suppliers with default_split_percent = 70 ... 7 of 11
--
-- Six of six is not a coincidence and not an admin decision. It is the default
-- landing on every vendor ever created. This is the same shape as the 90% in
-- commit 4197de4, one layer further down.
--
-- The money path itself is clean and this file does not touch it:
--     order_items.platform_percent      no default, 0 of 3 rows NULL
--     products.platform_percent         no default
--     vouchers.platform_percent         no default
--
-- ----------------------------------------------------------------------------
-- WHAT THIS FILE DOES NOT DO
-- ----------------------------------------------------------------------------
--
-- It does not drop vendors.commission_rate. The column is dead on the money
-- path but still rendered and edited by the admin vendor page, and dropping a
-- column read by shipped code is a separate, larger change. Removing the
-- default is what stops new fiction from being written; step 4 below is what
-- would finish the job, and is deliberately left commented out.
--
-- It does not backfill the 19 products with platform_percent IS NULL (19 of
-- 80, the same 19 whose platform_percent + supplier_split_percent <> 100).
-- Inventing a number for them here would be the very fallback this file
-- deletes. They belong in the admin UI, product by product.
--
-- ============================================================================

BEGIN;

-- 1. vendors.commission_rate: stop handing out 10%.
ALTER TABLE public.vendors
  ALTER COLUMN commission_rate DROP DEFAULT;

-- 2. suppliers.default_split_percent: stop handing out 70%.
--    Dropping a NOT NULL column's default makes an omitting INSERT fail loudly
--    instead of inventing a split. That is the intended behaviour: empty field
--    = validation error.
ALTER TABLE public.suppliers
  ALTER COLUMN default_split_percent DROP DEFAULT;

-- 3. suppliers.commission_percent: stop handing out 0%.
--    0 is not a neutral default. It silently means "the platform takes
--    nothing", which is a commission decision nobody made.
ALTER TABLE public.suppliers
  ALTER COLUMN commission_percent DROP DEFAULT;

-- 4. NOT ENABLED. The finishing move, once the admin vendor page stops
--    reading the column. Left here so the intent is not lost.
--
-- ALTER TABLE public.vendors DROP COLUMN commission_rate;

COMMIT;

-- ----------------------------------------------------------------------------
-- VERIFY (run after applying; all three column_default values must be NULL)
-- ----------------------------------------------------------------------------
--
-- SELECT table_name, column_name, column_default
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
--   AND (table_name, column_name) IN (
--     ('vendors',   'commission_rate'),
--     ('suppliers', 'default_split_percent'),
--     ('suppliers', 'commission_percent')
--   )
-- ORDER BY table_name, column_name;
--
-- ROLLBACK, if the defaults must come back:
--
-- ALTER TABLE public.vendors   ALTER COLUMN commission_rate       SET DEFAULT 10.00;
-- ALTER TABLE public.suppliers ALTER COLUMN default_split_percent SET DEFAULT 70;
-- ALTER TABLE public.suppliers ALTER COLUMN commission_percent    SET DEFAULT 0;
