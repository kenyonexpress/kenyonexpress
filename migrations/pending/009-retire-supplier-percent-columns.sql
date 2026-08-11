-- ============================================================================
-- PENDING: retire the two supplier-level percentages, and lock active products
-- ============================================================================
--
-- STATUS: NOT APPLIED. Apply only through MCP apply_migration, never db push.
-- APPLY AFTER: 007 (drops the defaults). Independent of 008.
--
-- ----------------------------------------------------------------------------
-- WHY THIS IS A SEPARATE FILE AND NOT AN EDIT TO 007
-- ----------------------------------------------------------------------------
--
-- The instruction was to fold the column drops into 007. 007 was already
-- approved for application by then, and it is the reversible file: everything
-- in it is a DROP DEFAULT, undone exactly by the SET DEFAULT block at its
-- bottom. A DROP COLUMN is not undone by rerunning anything, so mixing the two
-- would mean one file that is half reversible and half not, with a single
-- approval covering both. 008 had already made the same split for
-- `vendors.commission_rate`. This file follows 008's shape.
--
-- ----------------------------------------------------------------------------
-- ZERO CODE REFERENCES, CONFIRMED BEFORE WRITING THIS
-- ----------------------------------------------------------------------------
--
--   grep -rn 'default_split_percent\|commission_percent' src/ --include='*.ts' --include='*.tsx'
--
-- returns, for these two columns, only comments and tests that assert their
-- ABSENCE (`src/lib/admin/supplier-form.test.ts` checks that a submitted
-- `commission_percent: 42` and `default_split_percent: 55` are both dropped by
-- the parser). `parseSupplierForm` never emits them, so no INSERT or UPDATE in
-- the application names either column.
--
-- `products.commission_percent` and `order_items.commission_percent` are
-- DIFFERENT columns and are NOT touched here. They are on the money path, they
-- are NOT NULL, and they are written as a mirror of `platform_percent`
-- (src/lib/commerce/order-money-columns.ts:266). Dropping them would break
-- checkout. Only the two `suppliers` columns go.
--
-- ----------------------------------------------------------------------------
-- THE CHECK, AND WHY IT CANNOT FAIL TODAY
-- ----------------------------------------------------------------------------
--
-- Measured on the live catalog, 2026-08-11, all 80 products:
--
--   status   total  null percent  null supplier  split <> 100
--   draft       19            19             19            19
--   active      61             0              0             0
--
-- Every active product already satisfies the constraint and every violator is
-- already a draft, so this adds NO backfill and unpublishes nothing. The 19
-- drafts stay drafts and stay editable; the constraint only stops them from
-- reaching `active` while still empty. The application refuses the same move
-- first, in Hebrew, in `assertPublishable` and now also in the bulk path
-- (`src/lib/admin/bulk-publish.ts`), so the constraint is the backstop and not
-- the error message an admin is meant to read.
--
-- NOT VALID is deliberately NOT used: the table validates clean right now, and
-- a validated constraint is what makes the guarantee real for existing rows.
--
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. Archive the two supplier percentages, then drop them.
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.suppliers_percent_archive (
  supplier_id           uuid PRIMARY KEY,
  commission_percent    numeric,
  default_split_percent numeric,
  archived_at           timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.suppliers_percent_archive IS
  'Retired 2026-08-11: the last supplier-level percentages, kept only as '
  'history. Never read by the application. Percentages live on products.';

INSERT INTO public.suppliers_percent_archive
  (supplier_id, commission_percent, default_split_percent)
SELECT id, commission_percent, default_split_percent FROM public.suppliers
ON CONFLICT (supplier_id) DO NOTHING;

ALTER TABLE public.suppliers_percent_archive ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.suppliers DROP COLUMN IF EXISTS commission_percent;
ALTER TABLE public.suppliers DROP COLUMN IF EXISTS default_split_percent;

-- ----------------------------------------------------------------------------
-- 2. An active product must carry a supplier and a split that sums to 100.
-- ----------------------------------------------------------------------------
--
-- Drafts, paused and archived rows are unconstrained on purpose: a product
-- being filled in is allowed to be incomplete. Only `active` is a promise to a
-- customer, and only `active` is checked.

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_active_requires_supplier_and_split;

ALTER TABLE public.products
  ADD CONSTRAINT products_active_requires_supplier_and_split CHECK (
    status <> 'active'
    OR (
      supplier_id IS NOT NULL
      AND platform_percent IS NOT NULL
      AND supplier_split_percent IS NOT NULL
      AND supplier_split_percent + platform_percent = 100
    )
  );

COMMENT ON CONSTRAINT products_active_requires_supplier_and_split ON public.products IS
  'AGENTS.md: percentages are per product, with no global default and no '
  'fallback. A product may not go on sale without a supplier and a split that '
  'sums to 100. Drafts are exempt so an unfinished product can still be saved.';

COMMIT;

-- ----------------------------------------------------------------------------
-- VERIFY (run after applying)
-- ----------------------------------------------------------------------------
--
-- -- both columns gone, archive holds all 11 suppliers:
-- SELECT count(*) FROM public.suppliers_percent_archive;
-- SELECT column_name FROM information_schema.columns
-- WHERE table_schema='public' AND table_name='suppliers'
--   AND column_name IN ('commission_percent','default_split_percent');
--
-- -- constraint present and validated:
-- SELECT conname, convalidated FROM pg_constraint
-- WHERE conrelid = 'public.products'::regclass
--   AND conname = 'products_active_requires_supplier_and_split';
--
-- -- must raise 23514, proving the gate bites:
-- -- UPDATE public.products SET status='active' WHERE status='draft';
--
-- ROLLBACK:
--
-- ALTER TABLE public.products
--   DROP CONSTRAINT IF EXISTS products_active_requires_supplier_and_split;
-- ALTER TABLE public.suppliers ADD COLUMN commission_percent numeric;
-- ALTER TABLE public.suppliers ADD COLUMN default_split_percent numeric;
-- UPDATE public.suppliers s SET commission_percent = a.commission_percent,
--        default_split_percent = a.default_split_percent
-- FROM public.suppliers_percent_archive a WHERE a.supplier_id = s.id;
