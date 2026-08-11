-- 112: drop the last three supplier-level percentage columns.
--
--     public.suppliers.commission_percent      numeric NOT NULL DEFAULT 0
--     public.suppliers.default_split_percent   numeric NOT NULL DEFAULT 70
--     public.vendors.commission_rate           numeric NULL     DEFAULT 10.00
--
-- WHY. AGENTS.md: "There is NO fixed commission or split percentage in this
-- project. Every percentage is per product, set by the admin on the product
-- page." A percentage that lives on a supplier is, by construction, a default
-- shared by every product that supplier sells. These three columns are the last
-- place in the schema where such a default can be stored, and each still ships
-- a literal (0, 70, 10.00) as its column DEFAULT. After this file, `suppliers`
-- and `vendors` carry identity and payout details only.
--
-- SUPERSEDES 007, 008 and 009. Those three files were written for the same
-- columns and never ran; 007 only dropped the DEFAULTs, 008 dropped
-- vendors.commission_rate, 009 dropped the two supplier columns. This file does
-- all of it in one transaction with one archive table, so the three-file
-- sequence no longer has to be applied in order. Leave 007/008/009 on disk as
-- the written record; do not apply them after this one (they are idempotent and
-- would be no-ops, but the archive tables would differ).
--
-- MEASURED against production (ixvwfbuvfxxsjiywhbbb) on 2026-08-12, immediately
-- before this file was written:
--
--   suppliers                             11 rows
--     commission_percent    distinct:      0.00, 10.00
--     default_split_percent distinct:      70.00, 75.00, 78.00, 80.00, 85.00
--   vendors                                6 rows
--     commission_rate       distinct:      10.00          (ONE value, 6 of 6)
--
--   Objects in the database that depend on any of the three columns:  NONE.
--   (checked via pg_depend over pg_rewrite for views, and pg_get_functiondef
--   over every function in `public` for function bodies. Both empty. The DROPs
--   below therefore need no CASCADE and cannot silently take a view with them.)
--
-- The values are archived, not copied into products. Copying
-- default_split_percent onto the 19 products that have no split yet would be
-- exactly the global default the rule forbids, and it would be a guess: a
-- supplier's old 80/20 says nothing about what the admin wants for any one
-- product. Those 19 rows are surfaced by 113 instead.

BEGIN;

-- 1. Archive. One table, one row per source row, so the values survive the drop
--    and a mistake here is recoverable without a PITR restore.
CREATE TABLE IF NOT EXISTS public.legacy_percent_archive_112 (
  source_table          text        NOT NULL,
  source_id             uuid        NOT NULL,
  commission_percent    numeric,
  default_split_percent numeric,
  commission_rate       numeric,
  archived_at           timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (source_table, source_id)
);

COMMENT ON TABLE public.legacy_percent_archive_112 IS
  'Values of suppliers.commission_percent, suppliers.default_split_percent and '
  'vendors.commission_rate as they stood when 112 dropped those columns. '
  'Read-only history. Nothing on the money path may read this table: every '
  'percentage is per product (AGENTS.md).';

-- No policies are created, so with RLS on, this table is unreadable through
-- PostgREST by anon and authenticated alike. Only the service role, which
-- bypasses RLS, can read it. That is the intent: it is an admin artefact.
ALTER TABLE public.legacy_percent_archive_112 ENABLE ROW LEVEL SECURITY;

-- Guarded by to_regclass so a re-run after the DROPs below does not fail on a
-- column that is already gone. The INSERTs are ON CONFLICT DO NOTHING so a
-- partial first run cannot double-archive.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'suppliers'
       AND column_name = 'commission_percent'
  ) THEN
    EXECUTE $sql$
      INSERT INTO public.legacy_percent_archive_112
        (source_table, source_id, commission_percent, default_split_percent)
      SELECT 'suppliers', id, commission_percent, default_split_percent
        FROM public.suppliers
      ON CONFLICT (source_table, source_id) DO NOTHING
    $sql$;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'vendors'
       AND column_name = 'commission_rate'
  ) THEN
    EXECUTE $sql$
      INSERT INTO public.legacy_percent_archive_112
        (source_table, source_id, commission_rate)
      SELECT 'vendors', id, commission_rate
        FROM public.vendors
      ON CONFLICT (source_table, source_id) DO NOTHING
    $sql$;
  END IF;
END $$;

-- 2. Drop. IF EXISTS on each, so the file is idempotent.
--
--    NOT dropped, and not related despite the shared word: products.commission_percent
--    and order_items.commission_percent / commission_percent_snapshot. Those are
--    per-product and per-order-line, they are written by
--    src/lib/commerce/order-money-columns.ts on every order, and they are the
--    snapshot the settlement reads. Touching them would break checkout.
ALTER TABLE public.suppliers DROP COLUMN IF EXISTS commission_percent;
ALTER TABLE public.suppliers DROP COLUMN IF EXISTS default_split_percent;
ALTER TABLE public.vendors   DROP COLUMN IF EXISTS commission_rate;

COMMIT;

-- VERIFY (expect 0 rows, then 17 = 11 suppliers + 6 vendors):
--
--   SELECT table_name, column_name FROM information_schema.columns
--    WHERE table_schema = 'public'
--      AND (table_name = 'suppliers' AND column_name IN ('commission_percent','default_split_percent')
--        OR table_name = 'vendors'   AND column_name = 'commission_rate');
--
--   SELECT source_table, count(*) FROM public.legacy_percent_archive_112
--   GROUP BY source_table ORDER BY source_table;
--
-- ROLLBACK (restores the columns and the values, but NOT the DEFAULTs, which
-- are the thing this file exists to remove -- put them back only if you are
-- deliberately reversing the rule):
--
--   ALTER TABLE public.suppliers ADD COLUMN commission_percent    numeric;
--   ALTER TABLE public.suppliers ADD COLUMN default_split_percent numeric;
--   ALTER TABLE public.vendors   ADD COLUMN commission_rate       numeric;
--   UPDATE public.suppliers s SET commission_percent = a.commission_percent,
--          default_split_percent = a.default_split_percent
--     FROM public.legacy_percent_archive_112 a
--    WHERE a.source_table = 'suppliers' AND a.source_id = s.id;
--   UPDATE public.vendors v SET commission_rate = a.commission_rate
--     FROM public.legacy_percent_archive_112 a
--    WHERE a.source_table = 'vendors' AND a.source_id = v.id;
