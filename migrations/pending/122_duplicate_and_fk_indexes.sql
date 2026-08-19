-- ============================================================================
-- 122: drop duplicate indexes, index every unindexed foreign key
-- ============================================================================
--
-- STATUS: APPLIED to production via MCP apply_migration on 2026-08-19
-- (name: duplicate_and_fk_indexes). Wave DB HARDENING step 12.
--
-- PART 1, THE 4 DUPLICATES the advisor reports. Each pair is the same table,
-- same columns, same method, so one of the two is dead weight on every write
-- and in the planner's list. Which one to keep was decided by the migration
-- that declares it most recently, so the surviving name is the one the repo
-- currently believes in:
--
--   carts    idx_carts_expires_at       (101_cart_reaper)  kept
--            carts_expires_at_idx       (001, 045)         dropped
--   products products_category_id_idx   (014_products_v2)  kept
--            idx_products_category      (005)              dropped
--   products products_supplier_id_idx   (014_products_v2)  kept
--            idx_products_supplier      (005)              dropped
--   vouchers vouchers_code_key          UNIQUE CONSTRAINT  kept
--            vouchers_code_idx          (073, 0545)        dropped
--
-- vouchers is the one that is not symmetric. Both are unique, but
-- vouchers_code_key backs a UNIQUE constraint (pg_constraint.contype = 'u')
-- and vouchers_code_idx is a standalone index. Dropping the constraint side
-- would mean dropping the constraint, which is a guarantee, not a duplicate,
-- so the plain index goes and voucher code uniqueness is still enforced.
--
-- NOT DROPPED, ON PURPOSE. Five more pairs are redundant in the same way but
-- pair a UNIQUE constraint index with a plain index on the same column, which
-- is why the advisor does not count them: affiliates(affiliate_code),
-- affiliates(user_id), orders(invoice_number), rate_limits(key),
-- wallet_balances(user_id). The plain index in each pair is fully served by the
-- unique one. They are outside the 4 this step was scoped to and are written up
-- in refs/unused-indexes-report.md instead of being dropped here unasked.
--
-- PART 2, FOREIGN KEYS WITH NO INDEX. An unindexed FK means every DELETE or key
-- UPDATE on the parent has to sequentially scan the child to prove no row
-- references it, and it leaves ordinary joins along the key unsupported. This
-- creates the missing index for every FK whose leading columns are not already
-- covered, measured from pg_constraint against pg_index rather than from a
-- list: 44 of them, 33 in public and 11 in wp_import. The advisor counts 35;
-- it does not flag every one this catalog query finds, and the extra ones are
-- unindexed by the same definition, so they are included.
--
-- Partial indexes are not counted as covering, since a predicate index cannot
-- serve the FK check for every row.
--
-- Plain CREATE INDEX, not CONCURRENTLY: CONCURRENTLY cannot run inside a
-- transaction, and apply_migration is one. The tables are small (products is
-- 61 rows) so the ShareLock is momentary.
--
-- IDEMPOTENT: drops use IF EXISTS, and the FK loop only creates what is still
-- missing.
--
-- The loop record is named fk, not f: plpgsql resolves an unqualified f.cols in
-- the query against the record variable before the CTE alias, which fails with
-- "record f is not assigned yet" on the first iteration.

-- part 1
DROP INDEX IF EXISTS public.carts_expires_at_idx;
DROP INDEX IF EXISTS public.idx_products_category;
DROP INDEX IF EXISTS public.idx_products_supplier;
DROP INDEX IF EXISTS public.vouchers_code_idx;

-- part 2
DO $migration$
DECLARE
  fk      record;
  idxname text;
  n_made  int := 0;
BEGIN
  FOR fk IN
    WITH fks AS (
      SELECT n.nspname AS sch, c.relname AS tbl, con.conname,
             (SELECT array_agg(a.attname ORDER BY k.ord)
              FROM unnest(con.conkey) WITH ORDINALITY k(attnum, ord)
              JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum) AS cols
      FROM pg_constraint con
      JOIN pg_class c ON c.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE con.contype = 'f' AND n.nspname IN ('public', 'wp_import')
    )
    SELECT f.sch, f.tbl, f.cols
    FROM fks f
    WHERE NOT EXISTS (
      SELECT 1
      FROM pg_index x
      JOIN pg_class i ON i.oid = x.indexrelid
      JOIN pg_class ct ON ct.oid = x.indrelid
      JOIN pg_namespace nn ON nn.oid = ct.relnamespace
      WHERE nn.nspname = f.sch AND ct.relname = f.tbl
        AND x.indpred IS NULL
        AND (SELECT array_agg(a.attname ORDER BY k.ord)
             FROM unnest(x.indkey::int[]) WITH ORDINALITY k(attnum, ord)
             JOIN pg_attribute a ON a.attrelid = x.indrelid AND a.attnum = k.attnum
             WHERE k.ord <= array_length(f.cols, 1)) = f.cols
    )
    ORDER BY f.sch, f.tbl
  LOOP
    idxname := left('idx_' || fk.tbl || '_' || array_to_string(fk.cols, '_'), 63);

    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON %I.%I (%s)',
                   idxname, fk.sch, fk.tbl,
                   (SELECT string_agg(quote_ident(c), ', ') FROM unnest(fk.cols) c));
    n_made := n_made + 1;
  END LOOP;

  RAISE NOTICE '122: created % foreign key indexes', n_made;
END
$migration$;
