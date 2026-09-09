-- 228_job_runs.sql
--
-- A row per scheduled-job execution: when it started, how long it took, and
-- whether it worked.
--
-- WHY THIS TABLE EXISTS AND WHAT IT REPLACES.
--
-- Today the only record that a cron job ran is the GitHub Actions run that
-- called it. That record has three holes, and all three were measured on
-- 2026-09-10 rather than imagined:
--
--   1. It records the CALL, not the WORK. `scripts/run-cron-jobs.sh` treats any
--      2xx as success. A job that returns 200 having processed nothing because
--      a dependency was unconfigured is indistinguishable from one that drained
--      a backlog.
--   2. It disappears. Actions logs expire, and a scheduled workflow is paused
--      after 60 days without commits. The history of "did the settlement
--      reconciler run last quarter" is not something to keep in a CI log.
--   3. It cannot see a job that was killed. A function that exceeds its time
--      limit returns no status at all; curl reports a failure, and nothing says
--      which of the seventeen jobs died or how far it got.
--
-- The `running` row is the answer to (3) and is the reason this is an INSERT
-- followed by an UPDATE rather than one INSERT at the end. A row still marked
-- `running` an hour after it started is the only trace a killed invocation
-- leaves anywhere. `job_runs_health()` counts those as failures on purpose.
--
-- NOT APPLIED. migrations/pending/, per CLAUDE.md. Every consumer degrades to a
-- no-op while the table is absent (src/lib/observability/job-run.ts), so this
-- file being unapplied costs observability and breaks nothing.

-- ---------------------------------------------------------------------------
-- the table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.job_runs (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name     text        NOT NULL,
  started_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz,
  duration_ms  integer,
  -- running: started and not yet reported. ok / failed: reported.
  status       text        NOT NULL DEFAULT 'running',
  http_status  integer,
  -- Whatever the job counted. Free-form on purpose: seventeen jobs count
  -- seventeen different things and a column per job would be a schema change
  -- per job.
  detail       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT job_runs_status_check CHECK (status IN ('running', 'ok', 'failed')),
  CONSTRAINT job_runs_duration_nonneg CHECK (duration_ms IS NULL OR duration_ms >= 0)
);

-- 005+ convention: defensive, because 001 is not idempotent and can stop early
-- on a live database, leaving the trigger function undefined.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_updated_at ON public.job_runs;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.job_runs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- The dashboard asks one question: the newest runs of one job, newest first.
CREATE INDEX IF NOT EXISTS job_runs_name_started_idx
  ON public.job_runs (job_name, started_at DESC);

-- The pruner asks the other: everything older than a cutoff.
CREATE INDEX IF NOT EXISTS job_runs_started_idx
  ON public.job_runs (started_at);

-- ---------------------------------------------------------------------------
-- RLS: locked. Nothing but the service key touches this.
-- ---------------------------------------------------------------------------
--
-- This is operational telemetry, and it names what is broken and when nobody is
-- watching, which is an inventory an attacker would enjoy. Follows the shape
-- migration 172 installed on the eight locked tables: a RESTRICTIVE deny that
-- cannot be outvoted by a permissive policy somebody adds later, PLUS the grant
-- revoke, because a later permissive SELECT policy would otherwise hand the
-- same role INSERT, UPDATE and DELETE.

ALTER TABLE public.job_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "deny_all_client_roles" ON public.job_runs;
CREATE POLICY "deny_all_client_roles"
  ON public.job_runs
  AS RESTRICTIVE
  FOR ALL
  TO anon, authenticated
  USING (false)
  WITH CHECK (false);

REVOKE ALL ON public.job_runs FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- job_runs_health(): the consecutive-failure count the alert is built on
-- ---------------------------------------------------------------------------
--
-- WHY A FUNCTION AND NOT A QUERY IN THE ROUTE. "Two consecutive failures" is
-- the alert threshold, and getting it wrong in the quiet direction is silent.
-- Two things make it easy to get wrong and both are handled here:
--
--   * A `running` row older than `stale_after` is a FAILURE, not a gap. A job
--     killed mid-run leaves exactly that and nothing else; counting it as
--     neither ok nor failed is how two dead runs in a row raise nothing.
--   * The count is over the newest runs in order and stops at the first `ok`.
--     A naive "failures in the last N runs" crosses a recovery and keeps
--     alerting after the job is fine again.

CREATE OR REPLACE FUNCTION public.job_runs_health(
  stale_after interval DEFAULT interval '1 hour'
)
RETURNS TABLE (
  job_name              text,
  last_started_at       timestamptz,
  last_status           text,
  last_duration_ms      integer,
  consecutive_failures  integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH resolved AS (
    SELECT
      r.job_name                                                              AS name,
      r.started_at                                                            AS started_at,
      r.duration_ms                                                           AS duration_ms,
      CASE
        WHEN r.status = 'running' AND r.started_at < now() - stale_after THEN 'failed'
        ELSE r.status
      END                                                                     AS state,
      row_number() OVER (PARTITION BY r.job_name ORDER BY r.started_at DESC)   AS rn
    FROM public.job_runs r
  ),
  -- The newest run of each job that succeeded, and how many runs are newer.
  -- No success at all means every run this job has ever had is a failure.
  last_ok AS (
    SELECT resolved.name AS name, min(resolved.rn) AS rn
    FROM resolved
    WHERE resolved.state = 'ok'
    GROUP BY resolved.name
  ),
  totals AS (
    SELECT resolved.name AS name, count(*) AS runs
    FROM resolved
    GROUP BY resolved.name
  )
  SELECT
    n.name                                                   AS job_name,
    n.started_at                                             AS last_started_at,
    n.state                                                  AS last_status,
    n.duration_ms                                            AS last_duration_ms,
    (COALESCE(o.rn, t.runs + 1) - 1)::integer                AS consecutive_failures
  FROM resolved n
  JOIN totals t ON t.name = n.name
  LEFT JOIN last_ok o ON o.name = n.name
  WHERE n.rn = 1;
$$;

REVOKE ALL ON FUNCTION public.job_runs_health(interval) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- prune_job_runs(): retention, called from /api/cron/retention
-- ---------------------------------------------------------------------------
--
-- Seventeen jobs, three of them every five minutes, is roughly five thousand
-- rows a day. Unbounded telemetry becomes the outage it was meant to report.
-- 30 days is the same window the dump retention uses.
--
-- It never deletes a `running` row, however old. That row is evidence of a
-- killed invocation, and evidence that expires on a timer is how the cause of
-- an incident disappears exactly when someone finally looks.

CREATE OR REPLACE FUNCTION public.prune_job_runs(keep_days integer DEFAULT 30)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_deleted integer;
BEGIN
  IF keep_days IS NULL OR keep_days < 1 THEN
    RAISE EXCEPTION 'prune_job_runs: keep_days must be >= 1, got %', keep_days;
  END IF;

  DELETE FROM public.job_runs
  WHERE started_at < now() - make_interval(days => keep_days)
    AND status <> 'running';

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.prune_job_runs(integer) FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.job_runs IS
  'One row per scheduled-job execution. Written by src/lib/observability/job-run.ts; read by the admin cron dashboard. Locked to the service key.';
