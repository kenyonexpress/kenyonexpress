-- ============================================================================
-- 063_reconciliation.sql  (spec number 038; renumbered 033->050 ... 039->056
-- because 033-035 already exist in this tree and 049 was the last used
-- number; see LEDGER-DESIGN.md section 0)
--
-- Reconciliation infrastructure: every scheduled integrity job records one
-- reconciliation_runs row, and every violating row found by an INVARIANTS.md
-- query (or by the Cardcom deposit-file matcher) becomes one
-- reconciliation_discrepancies row. run_type is free text on purpose (new
-- checks should not require a migration); the starting set:
--   'ledger_balance'     - INV-1 sum-zero per journal
--   'wallet_drift'       - INV-2 wallet cache vs ledger lines (SEV1, R9)
--   'snapshot_drift'     - INV-3 order_items percent snapshots vs settlement
--   'coupon_single_use'  - INV-4 at most one redemption
--   'settlement_totals'  - INV-5 batch totals vs items vs order_items
--   'cardcom_deposits'   - PSP deposit file vs payments (R8)
--
-- ROLLBACK NOTE: additive only, nothing references these tables. To roll back:
--   DROP TABLE IF EXISTS public.reconciliation_discrepancies;
--   DROP TABLE IF EXISTS public.reconciliation_runs;
--   DROP TYPE IF EXISTS public.recon_run_status;
--   DROP TYPE IF EXISTS public.recon_severity;
-- ============================================================================

-- Defensive: 001 may stop early on live DBs.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 1. Enums -------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE public.recon_run_status AS ENUM ('running', 'succeeded', 'failed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.recon_severity AS ENUM ('info', 'warning', 'critical');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 2. reconciliation_runs -----------------------------------------------------

CREATE TABLE IF NOT EXISTS public.reconciliation_runs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_type          text NOT NULL CHECK (length(run_type) BETWEEN 1 AND 80),
  status            public.recon_run_status NOT NULL DEFAULT 'running',
  params            jsonb NOT NULL DEFAULT '{}'::jsonb,
  checked_count     bigint NOT NULL DEFAULT 0 CHECK (checked_count >= 0),
  discrepancy_count bigint NOT NULL DEFAULT 0 CHECK (discrepancy_count >= 0),
  error_message     text,
  started_at        timestamptz NOT NULL DEFAULT now(),
  finished_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT reconciliation_runs_finished CHECK (
    (status = 'running'::public.recon_run_status) = (finished_at IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_reconciliation_runs_type
  ON public.reconciliation_runs (run_type, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_reconciliation_runs_status
  ON public.reconciliation_runs (status)
  WHERE status = 'running'::public.recon_run_status;

DROP TRIGGER IF EXISTS set_updated_at ON public.reconciliation_runs;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.reconciliation_runs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3. reconciliation_discrepancies --------------------------------------------

CREATE TABLE IF NOT EXISTS public.reconciliation_discrepancies (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id          uuid NOT NULL REFERENCES public.reconciliation_runs(id) ON DELETE RESTRICT,
  severity        public.recon_severity NOT NULL DEFAULT 'warning',
  -- What is wrong, machine-readable: e.g. 'journal_unbalanced',
  -- 'wallet_cache_drift', 'deposit_amount_mismatch', 'orphan_used_coupon'.
  discrepancy_type text NOT NULL CHECK (length(discrepancy_type) BETWEEN 1 AND 80),
  -- The violating entity: table name + id (uuid or external ref as text).
  entity_table    text NOT NULL,
  entity_id       text NOT NULL,
  expected_agorot bigint,
  actual_agorot   bigint,
  delta_agorot    bigint GENERATED ALWAYS AS (COALESCE(actual_agorot, 0) - COALESCE(expected_agorot, 0)) STORED,
  details         jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolved_at     timestamptz,
  resolved_by     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolution_note text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recon_discrepancies_run
  ON public.reconciliation_discrepancies (run_id);
CREATE INDEX IF NOT EXISTS idx_recon_discrepancies_open
  ON public.reconciliation_discrepancies (severity, created_at DESC)
  WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_recon_discrepancies_entity
  ON public.reconciliation_discrepancies (entity_table, entity_id);

DROP TRIGGER IF EXISTS set_updated_at ON public.reconciliation_discrepancies;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.reconciliation_discrepancies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4. RLS: enabled now, default deny; policies land in 056 --------------------

ALTER TABLE public.reconciliation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reconciliation_discrepancies ENABLE ROW LEVEL SECURITY;
