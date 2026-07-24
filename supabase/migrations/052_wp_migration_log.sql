-- Migration 052: WordPress import run log, validation reports, rollback (DRAFT, DO NOT APPLY)
-- Companion doc: docs/ARCHITECTURE-WP-DATA-MIGRATION.md section 7
-- Depends on: 032_wp_import_staging.sql (wp_import schema, import_batches, id_map)
--
-- 032 gave us WHAT was staged (wp_import.*) and WHAT is wrong (wp_import.issues).
-- It does not record WHAT HAPPENED: which row was inserted vs updated vs skipped,
-- by which run, in dry-run or for real, and how to undo it. That is this file.
--
-- Three additions:
--   1. wp_import.migration_log  - append-only, one row per (run, entity, wp_id)
--                                 operation. The audit trail and the rollback input.
--   2. wp_import.validation_reports - one row per validation pass, with the gate
--                                 results as structured jsonb (doc 5.3).
--   3. wp_import.fn_rollback_batch - undo one batch's public.* inserts. Dry-run by
--                                 default; returns the plan without touching data.
--
-- Apply only via Supabase MCP apply_migration (never `db push`).
-- Idempotent: safe to run multiple times.

-- Defensive: 001 may have stopped early on a live DB before defining this.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 1. migration_log: append-only operation log
-- ---------------------------------------------------------------------------
-- No updated_at / no set_updated_at trigger on purpose: this table is
-- append-only. A row describes an operation that already happened; amending it
-- would destroy the audit trail. Corrections are new rows.

CREATE TABLE IF NOT EXISTS wp_import.migration_log (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id      uuid        NOT NULL REFERENCES wp_import.import_batches(id) ON DELETE CASCADE,
  stage         text        NOT NULL CHECK (stage IN
                  ('extract', 'transform', 'load_staging', 'project_public',
                   'media_sync', 'validate', 'rollback')),
  entity        text        NOT NULL CHECK (entity IN
                  ('product', 'variant', 'category', 'customer', 'address',
                   'order', 'order_item', 'coupon_code', 'redirect', 'media',
                   'supplier')),
  wp_id         text        NOT NULL,   -- text: fits bigint ids AND voucher codes
  -- the idempotency key the loader actually upserted on, verbatim.
  -- Shape: 'wp:<entity>:<wp_id>'. Stored so a re-run can prove it used the
  -- same key, and so a human can grep one product across every stage.
  external_id   text        NOT NULL,
  target_table  text,                   -- 'wp_import.products' | 'public.products' | ...
  target_id     uuid,                   -- the public/staging row this touched
  action        text        NOT NULL CHECK (action IN
                  ('insert', 'update', 'noop', 'skip', 'fail', 'delete')),
  -- dry_run rows are the plan, not the deed. Rollback ignores them; the
  -- validation report counts them separately from applied rows.
  dry_run       boolean     NOT NULL DEFAULT true,
  before_data   jsonb,                  -- pre-image (update/delete only)
  after_data    jsonb,                  -- post-image (insert/update only)
  error_code    text,                   -- machine code, e.g. 'missing_price'
  error_detail  text,
  duration_ms   int,
  created_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE wp_import.migration_log IS
  'Append-only operation log for the WP import. One row per (batch, stage, entity, wp_id). Input to fn_rollback_batch.';
COMMENT ON COLUMN wp_import.migration_log.external_id IS
  'Idempotency key used by the loader upsert: wp:<entity>:<wp_id>.';
COMMENT ON COLUMN wp_import.migration_log.dry_run IS
  'true = planned only, nothing was written. Rollback skips these rows.';

CREATE INDEX IF NOT EXISTS wp_migration_log_batch_idx
  ON wp_import.migration_log (batch_id, stage);
CREATE INDEX IF NOT EXISTS wp_migration_log_entity_idx
  ON wp_import.migration_log (entity, wp_id);
CREATE INDEX IF NOT EXISTS wp_migration_log_external_idx
  ON wp_import.migration_log (external_id);
-- the two hot queries: "what failed" and "what can I roll back"
CREATE INDEX IF NOT EXISTS wp_migration_log_failed_idx
  ON wp_import.migration_log (batch_id, entity)
  WHERE action = 'fail';
CREATE INDEX IF NOT EXISTS wp_migration_log_applied_insert_idx
  ON wp_import.migration_log (batch_id, target_table, target_id)
  WHERE action = 'insert' AND dry_run = false;

-- ---------------------------------------------------------------------------
-- 2. validation_reports: one row per validation pass (doc 5.3 gates)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS wp_import.validation_reports (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id       uuid        REFERENCES wp_import.import_batches(id) ON DELETE SET NULL,
  kind           text        NOT NULL CHECK (kind IN
                   ('pre_load', 'post_load', 'post_projection', 'cutover_gate')),
  passed         boolean     NOT NULL,
  -- [{ gate, severity, expected, actual, passed, detail }]
  gates          jsonb       NOT NULL DEFAULT '[]'::jsonb,
  -- { products: n, categories: n, media: n, customers: n, orders: n }
  counts_before  jsonb       NOT NULL DEFAULT '{}'::jsonb,
  counts_after   jsonb       NOT NULL DEFAULT '{}'::jsonb,
  -- sampled wp_ids that failed a gate, so the report is actionable not just red
  offenders      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  report_path    text,                  -- artifact written next to the run (md/json)
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE wp_import.validation_reports IS
  'Structured result of one validation pass. passed = false blocks cutover (doc 5.3).';

CREATE INDEX IF NOT EXISTS wp_validation_reports_batch_idx
  ON wp_import.validation_reports (batch_id, kind);
CREATE INDEX IF NOT EXISTS wp_validation_reports_failed_idx
  ON wp_import.validation_reports (created_at DESC)
  WHERE passed = false;

DROP TRIGGER IF EXISTS set_updated_at ON wp_import.validation_reports;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON wp_import.validation_reports
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2b. Fix: media storage paths are content-addressed, therefore SHARED
-- ---------------------------------------------------------------------------
-- 032 created wp_media_storage_path_uniq as UNIQUE (bucket, storage_path),
-- which assumed one object per attachment. The media pipeline keys objects on
-- sha256 alone (wp/<ab>/<hash>.webp) precisely so that an image used by forty
-- products is stored and uploaded once. Under that scheme forty attachment
-- rows legitimately share one storage_path and the unique index rejects the
-- upsert.
--
-- The index becomes a plain lookup index. Uniqueness of the OBJECT is already
-- guaranteed by the hash; uniqueness of the ROW is wp_attachment_id, the pk.

DROP INDEX IF EXISTS wp_import.wp_media_storage_path_uniq;

CREATE INDEX IF NOT EXISTS wp_media_storage_path_idx
  ON wp_import.media (bucket, storage_path)
  WHERE storage_path IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 3. Summary views
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW wp_import.v_migration_log_summary AS
SELECT batch_id,
       stage,
       entity,
       dry_run,
       count(*)                                          AS operations,
       count(*) FILTER (WHERE action = 'insert')         AS inserted,
       count(*) FILTER (WHERE action = 'update')         AS updated,
       count(*) FILTER (WHERE action = 'noop')           AS unchanged,
       count(*) FILTER (WHERE action = 'skip')           AS skipped,
       count(*) FILTER (WHERE action = 'fail')           AS failed,
       sum(duration_ms)                                  AS total_ms,
       max(created_at)                                   AS last_at
FROM wp_import.migration_log
GROUP BY batch_id, stage, entity, dry_run;

-- Every failure of a batch, newest first: the "what went wrong" query.
CREATE OR REPLACE VIEW wp_import.v_migration_failures AS
SELECT batch_id, stage, entity, wp_id, external_id,
       error_code, error_detail, created_at
FROM wp_import.migration_log
WHERE action = 'fail'
ORDER BY created_at DESC;

-- What fn_rollback_batch would delete, without calling it.
-- Only rows this batch INSERTED for real are reversible: an 'update' overwrote
-- a pre-existing row and undoing it means restoring before_data, which is a
-- manual decision, not an automatic delete.
CREATE OR REPLACE VIEW wp_import.v_batch_rollback_plan AS
SELECT batch_id,
       target_table,
       entity,
       count(*)                    AS deletable_rows,
       count(*) FILTER (WHERE action = 'update') AS manual_review_rows
FROM wp_import.migration_log
WHERE dry_run = false
  AND action IN ('insert', 'update')
  AND target_id IS NOT NULL
GROUP BY batch_id, target_table, entity;

-- ---------------------------------------------------------------------------
-- 4. fn_rollback_batch: undo one batch's public.* inserts
-- ---------------------------------------------------------------------------
-- Contract:
--   * p_dry_run = true (DEFAULT) returns the plan and writes nothing.
--   * Only action='insert' AND dry_run=false rows are deleted. Rows this batch
--     merely UPDATED are reported as manual_review and never touched: their
--     pre-image is in migration_log.before_data for a human to restore.
--   * Deletion order is child-before-parent so FKs never block the undo.
--   * id_map rows for the deleted targets are removed too, so a re-run mints
--     the row again cleanly instead of pointing at a dead uuid.
--   * Storage objects are NOT deleted here (SQL cannot reach the bucket). They
--     are content-addressed and shared between products, so deleting a
--     product must never delete its objects. Leaving them is harmless; a
--     separate GC sweep removes hashes no live row references.
--   * Every deletion is itself logged with stage='rollback'.
--
-- The delete is driven by target_table from the log, so a table added to the
-- projection later is covered as soon as the loader logs it.

CREATE OR REPLACE FUNCTION wp_import.fn_rollback_batch(
  p_batch_id uuid,
  p_dry_run  boolean DEFAULT true
)
RETURNS TABLE (
  -- Deliberately NOT named target_table / entity. Those are column names in
  -- wp_import.migration_log, and a RETURNS TABLE parameter is a PL/pgSQL
  -- variable: reusing them makes every unqualified reference in the body
  -- ambiguous, which fails at runtime rather than at CREATE time.
  table_name    text,
  entity_name   text,
  rows_planned  bigint,
  rows_deleted  bigint,
  executed      boolean,
  note          text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = wp_import, public, pg_temp
AS $$
DECLARE
  v_rec       record;
  v_deleted   bigint;
  v_allowed   text[] := ARRAY[
    -- child-before-parent; anything not in this list is refused, so a typo'd
    -- or attacker-supplied target_table can never reach the dynamic DELETE.
    'public.order_items',
    'public.orders',
    'public.product_images',
    'public.products',
    'public.categories',
    'public.seo_redirects',
    'public.suppliers'
  ];
  v_table     text;
BEGIN
  IF p_batch_id IS NULL THEN
    RAISE EXCEPTION 'fn_rollback_batch: p_batch_id is required';
  END IF;

  -- iterate the allow-list in order, not the log, so FK order is guaranteed
  FOREACH v_table IN ARRAY v_allowed LOOP
    FOR v_rec IN
      SELECT ml.entity                                   AS ent,
             count(*) FILTER (WHERE ml.action = 'insert') AS insert_rows,
             count(*) FILTER (WHERE ml.action = 'update') AS update_rows,
             array_agg(ml.target_id) FILTER (WHERE ml.action = 'insert') AS ids
      FROM wp_import.migration_log ml
      WHERE ml.batch_id     = p_batch_id
        AND ml.dry_run      = false
        AND ml.target_table = v_table
        AND ml.target_id IS NOT NULL
        AND ml.action IN ('insert', 'update')
      GROUP BY ml.entity
    LOOP
      v_deleted := 0;

      IF NOT p_dry_run AND v_rec.insert_rows > 0 THEN
        EXECUTE format('DELETE FROM %s WHERE id = ANY($1)', v_table)
          USING v_rec.ids;
        GET DIAGNOSTICS v_deleted = ROW_COUNT;

        DELETE FROM wp_import.id_map im
        WHERE im.entity = v_rec.ent
          AND im.new_id = ANY(v_rec.ids);

        INSERT INTO wp_import.migration_log
          (batch_id, stage, entity, wp_id, external_id, target_table,
           action, dry_run, error_detail)
        VALUES
          (p_batch_id, 'rollback', v_rec.ent, 'batch', 'rollback:' || p_batch_id::text,
           v_table, 'delete', false,
           format('rolled back %s rows', v_deleted));
      END IF;

      table_name   := v_table;
      entity_name  := v_rec.ent;
      rows_planned := v_rec.insert_rows;
      rows_deleted := v_deleted;
      executed     := NOT p_dry_run;
      note         := CASE
                        WHEN v_rec.update_rows > 0
                          THEN format('%s updated rows left untouched; restore from migration_log.before_data manually',
                                      v_rec.update_rows)
                        ELSE NULL
                      END;
      RETURN NEXT;
    END LOOP;
  END LOOP;

  RETURN;
END;
$$;

COMMENT ON FUNCTION wp_import.fn_rollback_batch(uuid, boolean) IS
  'Undo one import batch''s public.* INSERTs. Dry-run by default: pass p_dry_run => false to execute. Updates are reported, never auto-reverted.';

REVOKE ALL ON FUNCTION wp_import.fn_rollback_batch(uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION wp_import.fn_rollback_batch(uuid, boolean) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. RLS: same model as 032 (admin SELECT only; service_role bypasses)
-- ---------------------------------------------------------------------------

ALTER TABLE wp_import.migration_log       ENABLE ROW LEVEL SECURITY;
ALTER TABLE wp_import.validation_reports  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wp_import: admin read" ON wp_import.migration_log;
CREATE POLICY "wp_import: admin read" ON wp_import.migration_log
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "wp_import: admin read" ON wp_import.validation_reports;
CREATE POLICY "wp_import: admin read" ON wp_import.validation_reports
  FOR SELECT TO authenticated USING (public.is_admin());

-- 032 granted ALL on existing tables; these two are new, so grant explicitly.
GRANT ALL ON wp_import.migration_log      TO service_role;
GRANT ALL ON wp_import.validation_reports TO service_role;
