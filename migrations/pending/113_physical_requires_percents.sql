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
-- BOTH CONSTRAINTS ARE ADDED **NOT VALID**. READ THIS BEFORE VALIDATING.
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

-- coupon_absolute: neither half may be set. The price paid on site is
-- coupon_price_ils, an absolute amount, not a share of anything.
ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_coupon_forbids_percents;

ALTER TABLE public.products
  ADD CONSTRAINT products_coupon_forbids_percents
  CHECK (
    commission_type <> 'coupon_absolute'::public.commission_type
    OR (platform_percent IS NULL AND supplier_split_percent IS NULL)
  ) NOT VALID;

COMMENT ON CONSTRAINT products_coupon_forbids_percents ON public.products IS
  'A coupon_absolute product has no split. Added NOT VALID by 113: all 15 '
  'pre-existing coupon rows carried an inert 25.00/75.00 pair, and deleting '
  'live values is not a migration''s call. Enforced on all writes since.';

COMMIT;

-- VERIFY the constraints exist and are not yet validated (expect convalidated = f
-- for both):
--
--   SELECT conname, convalidated FROM pg_constraint
--    WHERE conrelid = 'public.products'::regclass
--      AND conname IN ('products_physical_requires_percents',
--                      'products_coupon_forbids_percents');
--
-- VERIFY enforcement is live on new writes (both must raise 23514; run inside a
-- transaction you roll back):
--
--   BEGIN;
--     UPDATE public.products SET platform_percent = NULL, supplier_split_percent = NULL
--      WHERE commission_type = 'physical_percent' AND platform_percent IS NOT NULL;
--   ROLLBACK;
--
-- THE 34 ROWS TO REPAIR. This is the admin's work list, not a migration's:
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
-- ONCE THAT QUERY RETURNS 0 ROWS, and only then:
--
--   ALTER TABLE public.products VALIDATE CONSTRAINT products_physical_requires_percents;
--   ALTER TABLE public.products VALIDATE CONSTRAINT products_coupon_forbids_percents;
--
-- VALIDATE takes only a SHARE UPDATE EXCLUSIVE lock, so it does not block reads
-- or writes; it is safe to run against a live production table.
