-- 242_job_dlq.sql
--
-- The dead-letter table for the general job queue.
--
-- `search_index_dlq` (069) parks one kind of job and nothing drains it: the
-- worker accepts a bearer replay, and no cron ever sends one. The job queue
-- in src/lib/jobs generalises that pipeline (one envelope, one worker route
-- at /api/jobs/run, one failure callback at /api/jobs/dlq) and this table is
-- where its dead letters land. /api/cron/job-dlq re-queues `dead` rows
-- oldest first and stamps them `replayed`; a row whose envelope has already
-- been replayed three times is stamped `exhausted` rather than looped
-- forever, and `discarded` marks an envelope that no longer parses.
--
-- Same shape as 069, plus `job_type` lifted out of the envelope for the
-- operator and `replayed_at` so a replay is visible separately from
-- resolution. `callback` is never null: even an unparseable failure is
-- stored as {"raw": "..."}.
--
-- SERVER-ONLY. RLS is enabled with no policy for any client role, the shape
-- 122 gave search_index_dlq: the service role writes (the callback route and
-- the cron), nobody else reads. The closing block raises if anon or
-- authenticated ends up holding any privilege on it.
--
-- Preconditions asserted: none beyond gen_random_uuid (pgcrypto, present
-- since 001).
--
-- The application degrades without this file: /api/jobs/dlq answers 500 to
-- the failure callback (QStash keeps the message in its own DLQ and retries
-- the callback), and /api/cron/job-dlq logs jobs.dlq_read_failed and
-- replays nothing.
--
-- Idempotent: safe to re-run.
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS public.job_dlq;

CREATE TABLE IF NOT EXISTS public.job_dlq (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The envelope type, for the operator's eyes; null when it did not decode.
  job_type    text,
  -- The decoded envelope ({v, id, type, payload, enqueuedAt, replayCount,
  -- replayOf}), when decodable.
  job         jsonb,
  -- The full QStash failure callback, verbatim.
  callback    jsonb       NOT NULL,
  last_error  text,
  status      text        NOT NULL DEFAULT 'dead'
    CONSTRAINT job_dlq_status_check
    CHECK (status IN ('dead', 'replayed', 'exhausted', 'discarded')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  replayed_at timestamptz,
  resolved_at timestamptz
);

-- The replay query: dead rows, oldest first.
CREATE INDEX IF NOT EXISTS job_dlq_status_created_idx
  ON public.job_dlq (status, created_at);

ALTER TABLE public.job_dlq ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.job_dlq FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.job_dlq TO service_role;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name = 'job_dlq'
      AND grantee IN ('anon', 'authenticated')
  ) THEN
    RAISE EXCEPTION '242: a client role holds a grant on job_dlq';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'job_dlq'
  ) THEN
    RAISE EXCEPTION '242: job_dlq must carry no policy; it is server-only';
  END IF;
END $$;
