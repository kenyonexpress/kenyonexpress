-- 113: the split pair is required for physical_percent and forbidden for
-- coupon_absolute.
--
-- WHY. `products.commission_type` already decides which money model a product
-- uses, and `products_commission_type_matches_type` already ties it to
-- `products.type`. What nothing enforces is that the columns each model needs
-- are actually filled:
--
--   physical_percent  the platform's share and the supplier's share are the
--                     whole model. Both must be present. AGENTS.md: "Empty
--                     field = validation error." Today that rule lives only in
--                     the admin form; a row inserted by a script, a seed, or a
--                     future action bypasses it entirely.
--
--   coupon_absolute   the customer pays `coupon_price_ils` on the site and the
--                     rest at the business. There is no split to apply. A
--                     percentage stored on such a row is not used by checkout,
--                     which makes it a number that looks authoritative and is
--                     not. Both columns must be NULL.
--
-- `products_split_pair_sums_to_100` already constrains the pair when both are
-- present. It says nothing about presence, which is the hole this file closes.
--
-- ============================================================================
-- WHAT THIS FILE ACTUALLY DOES: the physical half only, and **NOT VALID**.
-- The coupon half is written out at the bottom and NOT executed -- it would
-- break every coupon save today. Read that section before adding it.
-- ============================================================================
--
-- MEASURED against production (ixvwfbuvfxxsjiywhbbb) on 2026-08-12, immediately
-- before this file was written. 80 products:
--
--   type      commission_type    rows   platform_percent   supplier_split_percent
--   --------  -----------------  -----  -----------------  ----------------------
--   physical  physical_percent      65   19 NULL            19 NULL
--   coupon    coupon_absolute       15    0 NULL (all 25.00) 0 NULL (all 75.00)
--
-- So **34 of 80 live rows violate the intended rule today**: 19 physical rows
-- are missing the pair, and all 15 coupon rows carry a 25/75 pair they must not
-- have. NOT VALID is the only honest option here, and it is not a compromise on
-- enforcement -- a NOT VALID CHECK is enforced in full on every INSERT and on
-- every UPDATE from the moment it is added. It only skips the retroactive scan
-- of rows that already exist.
--
-- The two obvious ways to make the constraints validate immediately were both
-- rejected, deliberately:
--
--   Backfilling the 19 physical rows.  There is no correct value to write. Any
--   number picked here -- the supplier's old default_split_percent, 70/30, the
--   median of the other rows -- is precisely the global default AGENTS.md
--   forbids ("Never create a global default or a fallback"). The admin has to
--   choose per product. A migration cannot.
--
--   NULLing the 15 coupon rows.  That is a destructive UPDATE of live data that
--   no test covers, to remove numbers that are currently inert. It is also the
--   kind of DB write this project requires explicit sign-off for. If checkout
--   is ever changed to read those columns for coupons, the deletion becomes
--   silent data loss instead of a cleanup.
--
-- The 34 rows are therefore left in place and made visible. Repair query at the
-- bottom of this file. Validate only after the admin has fixed all 34.

BEGIN;

-- physical_percent: both halves of the split must be present.
-- Written as NOT (bad shape) so that rows of any other commission_type pass
-- unconditionally, and so a NULL commission_type -- impossible today, the
-- column is NOT NULL -- would not silently pass either way.
ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_physical_requires_percents;

ALTER TABLE public.products
  ADD CONSTRAINT products_physical_requires_percents
  CHECK (
    commission_type <> 'physical_percent'::public.commission_type
    OR (platform_percent IS NOT NULL AND supplier_split_percent IS NOT NULL)
  ) NOT VALID;

COMMENT ON CONSTRAINT products_physical_requires_percents ON public.products IS
  'A physical_percent product carries both halves of the split. Added NOT VALID '
  'by 113: 19 pre-existing rows had neither, and no value may be invented for '
  'them (AGENTS.md forbids a default). Enforced on all writes since.';

COMMIT;

-- ============================================================================
-- THE COUPON HALF IS NOT APPLIED. IT WOULD BREAK EVERY COUPON SAVE TODAY.
-- ============================================================================
--
-- The other half of the rule this file was asked for is:
--
--   coupon_absolute  =>  platform_percent IS NULL AND supplier_split_percent IS NULL
--
-- It is correct as a model. A coupon's price on this site is coupon_price_ils,
-- an absolute amount; there is no share of anything to store. It is written out
-- below and deliberately left unexecuted, because the application contradicts
-- it and the constraint would lose that argument at runtime.
--
-- src/lib/commerce/product-money.ts, interface ProductMoneyWrite:
--
--     platform_percent: number
--     supplier_split_percent: number
--
-- Neither is optional and neither is nullable, and buildProductMoneyWrite ends
-- by emitting both unconditionally for every product type:
--
--     platform_percent:       split.pair.platformPercent,
--     supplier_split_percent: split.pair.supplierSplitPercent,
--     commission_percent:     split.pair.platformPercent,
--
-- That single function is the write path behind the admin product form, for
-- create and for edit alike. So a coupon product cannot currently be saved with
-- NULLs in those columns -- which is exactly why all 15 live coupon rows carry
-- an identical 25.00/75.00 pair. Adding the constraint would not clean that up;
-- it would make every create and every edit of a coupon product fail with
-- 23514, including edits to fields that have nothing to do with money. NOT
-- VALID does not soften this: it skips the scan of existing rows, but it
-- enforces on every INSERT and UPDATE from the moment it lands.
--
-- The ordering is therefore fixed, and it is application-first:
--
--   1. Change ProductMoneyWrite so platform_percent and supplier_split_percent
--      are `number | null`, and have buildProductMoneyWrite emit NULL for both
--      on the coupon_absolute branch. Note that `commission_percent` is NOT
--      NULL in the live schema and is snapshotted onto the order line by
--      src/lib/commerce/order-money-columns.ts, so it cannot simply follow them
--      to NULL; decide what a coupon line's commission_percent means first.
--   2. Cover it: a coupon write asserts NULL/NULL, a physical write still
--      asserts the pair, and the settlement snapshot is unchanged.
--   3. Repair the 15 live rows (query at the bottom of this file).
--   4. Only then run the block below.
--
-- ALTER TABLE public.products
--   DROP CONSTRAINT IF EXISTS products_coupon_forbids_percents;
--
-- ALTER TABLE public.products
--   ADD CONSTRAINT products_coupon_forbids_percents
--   CHECK (
--     commission_type <> 'coupon_absolute'::public.commission_type
--     OR (platform_percent IS NULL AND supplier_split_percent IS NULL)
--   ) NOT VALID;
--
-- COMMENT ON CONSTRAINT products_coupon_forbids_percents ON public.products IS
--   'A coupon_absolute product has no split; the site price is coupon_price_ils.';

-- VERIFY the constraint exists and is not yet validated (expect exactly one row,
-- convalidated = f. Two rows here means the coupon block above was run anyway):
--
--   SELECT conname, convalidated FROM pg_constraint
--    WHERE conrelid = 'public.products'::regclass
--      AND conname IN ('products_physical_requires_percents',
--                      'products_coupon_forbids_percents');
--
-- VERIFY enforcement is live on new writes (must raise 23514; run inside a
-- transaction you roll back):
--
--   BEGIN;
--     UPDATE public.products SET platform_percent = NULL, supplier_split_percent = NULL
--      WHERE commission_type = 'physical_percent' AND platform_percent IS NOT NULL;
--   ROLLBACK;
--
-- THE 34 ROWS TO REPAIR. This is the admin's work list, not a migration's.
-- The 19 physical rows can be fixed today, in the product editor. The 15 coupon
-- rows cannot be fixed at all until step 1 above lands, because the form has no
-- way to write a NULL into those columns:
--
--   SELECT id, slug, name_he, type, commission_type,
--          platform_percent, supplier_split_percent,
--          CASE WHEN commission_type = 'physical_percent'
--               THEN 'set both percents (must sum to 100)'
--               ELSE 'clear both percents' END AS action
--     FROM public.products
--    WHERE (commission_type = 'physical_percent'
--             AND (platform_percent IS NULL OR supplier_split_percent IS NULL))
--       OR (commission_type = 'coupon_absolute'
--             AND (platform_percent IS NOT NULL OR supplier_split_percent IS NOT NULL))
--    ORDER BY commission_type, slug;
--
-- ONCE THE 19 PHYSICAL ROWS ARE FIXED, and only then:
--
--   ALTER TABLE public.products VALIDATE CONSTRAINT products_physical_requires_percents;
--
-- And only after the coupon block above has been added, and its 15 rows cleared:
--
--   ALTER TABLE public.products VALIDATE CONSTRAINT products_coupon_forbids_percents;
--
-- VALIDATE takes only a SHARE UPDATE EXCLUSIVE lock, so it does not block reads
-- or writes; it is safe to run against a live production table.
