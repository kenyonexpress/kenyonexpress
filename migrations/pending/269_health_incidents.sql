-- 269_health_incidents.sql
--
-- Incident log for /admin/health (STEP 67): one row per stretch of time a
-- dependency was down, as seen by the five-minute health cron. One table,
-- no function.
--
-- WHAT A ROW IS
--
-- `dependency` is the stable name `src/lib/health/checks.ts` gives each
-- check (`database`, `search`, `email`, `twilio`, `cardcom`, `storage`,
-- `rate_limiter`, `read_replica`, `async_offload`, `scheduler`). `detail` is
-- the one-line Hebrew detail the check returned when the row opened;
-- `resolved_detail` the line it returned when the row closed. `started_at`
-- is the first cron run that saw the dependency down; `resolved_at` the first
-- run that saw it anything else, and NULL while it is still down. Durations
-- are therefore quantised to the cron schedule, which the page says.
--
-- ONE OPEN INCIDENT PER DEPENDENCY. The partial unique index below is the
-- rule that keeps a retried cron (Vercel re-runs a timed-out invocation)
-- from opening two rows for one outage: the second insert is a
-- unique_violation, which the writer logs and ignores.
--
-- WHO MAY READ AND WRITE
--
--   * The cron writes on the service role (`src/lib/health/incidents.ts`
--     through `createAdminClient`), which bypasses RLS and needs no grant.
--   * The admin page reads on the service role too, behind
--     `requireSection('dashboard')`. The `has_role('admin')` SELECT policy is
--     the belt 262, 265, 266, 267 and 268 wear for a direct admin session,
--     and there is NO client write: a browser session never opens or closes
--     an incident, the cron does.
--   * anon reads nothing. Which service is down is an inventory an attacker
--     would pay for, which is why `/api/health` is coarse and this table is
--     not public.
--
-- PRECONDITIONS: `public.has_role(text)` (live, measured by 262 on
-- 2026-10-08 and again by 268 on 2026-10-09). No dependency on any other
-- pending file.
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS public.health_incidents;
--   -- No pre-existing object is touched.

BEGIN;

CREATE TABLE IF NOT EXISTS public.health_incidents (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  dependency      text        NOT NULL,
  detail          text,
  started_at      timestamptz NOT NULL DEFAULT now(),
  resolved_at     timestamptz,
  resolved_detail text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'health_incidents_dependency_check') THEN
    ALTER TABLE public.health_incidents
      ADD CONSTRAINT health_incidents_dependency_check
      CHECK (dependency ~ '^[a-z][a-z0-9_]{1,39}$');
  END IF;
  -- An incident cannot close before it opened.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'health_incidents_resolved_after_start') THEN
    ALTER TABLE public.health_incidents
      ADD CONSTRAINT health_incidents_resolved_after_start
      CHECK (resolved_at IS NULL OR resolved_at >= started_at);
  END IF;
END $$;

-- One open incident per dependency (see the header).
CREATE UNIQUE INDEX IF NOT EXISTS health_incidents_one_open_per_dependency
  ON public.health_incidents (dependency)
  WHERE resolved_at IS NULL;

-- The page reads the newest fifty.
CREATE INDEX IF NOT EXISTS health_incidents_started_at_idx
  ON public.health_incidents (started_at DESC);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.health_incidents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "health_incidents: admin read" ON public.health_incidents;
CREATE POLICY "health_incidents: admin read" ON public.health_incidents
  FOR SELECT TO authenticated USING (public.has_role('admin'));

-- 144's rule, tightened: no client role gets anything beyond what the policy
-- above can grant. anon has no policy and no grant; authenticated has SELECT
-- behind has_role('admin'); nobody but the service role writes.
REVOKE ALL ON public.health_incidents FROM anon, authenticated;
GRANT SELECT ON public.health_incidents TO authenticated;

COMMENT ON TABLE public.health_incidents IS
  'Dependency outages as seen by /api/cron/health, one row per stretch of down (STEP 67). Read by /admin/health. Absent table = the page says migration 269 is pending.';

-- ---------------------------------------------------------------------------
-- Self-check, rolled back
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.health_incidents (dependency, detail)
  VALUES ('search', 'Meilisearch מוגדר אך אינו עונה')
  RETURNING id INTO v_id;

  -- One open incident per dependency: a second open row for `search` is refused.
  BEGIN
    INSERT INTO public.health_incidents (dependency, detail) VALUES ('search', 'שני');
    RAISE EXCEPTION 'health_incidents: self-check failed, a second open incident for one dependency was accepted';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  -- A dependency name outside the check pattern is refused.
  BEGIN
    INSERT INTO public.health_incidents (dependency) VALUES ('Not A Name');
    RAISE EXCEPTION 'health_incidents: self-check failed, a malformed dependency name was accepted';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  -- Closing before opening is refused.
  BEGIN
    UPDATE public.health_incidents SET resolved_at = started_at - interval '1 minute' WHERE id = v_id;
    RAISE EXCEPTION 'health_incidents: self-check failed, resolved_at before started_at was accepted';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  -- Once closed, a new open row for the same dependency is allowed again.
  UPDATE public.health_incidents SET resolved_at = now(), resolved_detail = 'Meilisearch' WHERE id = v_id;
  INSERT INTO public.health_incidents (dependency, detail) VALUES ('search', 'שוב');

  RAISE EXCEPTION 'health_incidents: self-check passed, rolling the rehearsal back';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM LIKE 'health_incidents: self-check passed%' THEN
      RAISE NOTICE '%', SQLERRM;
    ELSE
      RAISE;
    END IF;
END $$;

COMMIT;

-- NOT APPLIED. Written 2026-10-09 (STEP 67). Apply through the dashboard
-- after review; until then the cron skips the write (one warn line) and the
-- admin page shows an empty log that says the migration is pending. No
-- pre-existing object is touched.
