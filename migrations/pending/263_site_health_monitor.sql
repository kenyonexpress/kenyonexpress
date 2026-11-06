-- 263_site_health_monitor.sql (idempotent)
--
-- S38, 2026-11-06. An uptime monitor that lives in the database, so it keeps
-- watching when the app, Vercel or the autopilot loop is the thing that died.
--
-- Every five minutes pg_cron asks pg_net for GET APP_BASE_URL/api/ready and
-- writes one row to public.site_health. A probe is a failure when the answer
-- is anything but 200: a 503 from a required dependency, a timeout, a DNS or
-- TLS error, or no answer at all. On the third consecutive failure one
-- message, "hey SITE down", goes to the ntfy topic kenyon-ofir-limit. One per
-- outage: the streak is "every failure since the last 200", and it alerts only
-- while no row in it carries alerted_at. On recovery nothing is sent; the next
-- 200 simply ends the streak, and the next outage alerts again.
--
-- MEASURED ON PRODUCTION BEFORE WRITING THIS (2026-11-06):
--
--   * pg_cron 1.6.4, pg_net 0.20.0, supabase_vault 0.3.1. The vault holds
--     APP_BASE_URL = https://www.kenyonexpress.co.il (re-seeded by 258) and
--     CRON_SECRET. No public.site_health.
--   * GET https://www.kenyonexpress.co.il/api/ready answers 200 in about 3 s,
--     under MAINTENANCE_MODE too (the route is exempt). It needs no bearer.
--   * pg_net is asynchronous. net.http_get only queues the request and returns
--     its id; the answer lands in net._http_response after the transaction
--     commits, and is kept for 6 hours (pg_net.ttl). cron.job_run_details says
--     "succeeded" either way. So a probe cannot be judged by the call that
--     sent it, and this file uses two jobs:
--
--       ke-site-health-probe    */5      judge what is pending, then send a probe
--       ke-site-health-resolve  1-59/5   one minute later: judge it, maybe alert
--
--     The probe times out at 20 s, so one minute is enough. Three failures
--     from the first bad probe at T: T, T+5, T+10, alert at T+11 minutes.
--   * net.http_post takes a jsonb body, so the alert uses ntfy's JSON publish
--     (POST https://ntfy.sh/ with {"topic","message"}), not the plain-text
--     POST to /<topic>.
--
-- A probe pg_net never answered within 120 s is recorded as a failure with its
-- own error text. If pg_net itself is down the alert cannot leave either; this
-- monitor does not watch its own transport.
--
-- ACCESS. RLS on, no policy, nothing granted to anon or authenticated: the
-- table is read by postgres and service_role only. Both functions are
-- SECURITY INVOKER with EXECUTE revoked from PUBLIC, anon and authenticated;
-- pg_cron runs them as postgres, which already reads the vault and
-- net._http_response.
--
-- RETENTION. Rows older than 30 days are deleted by the probe (288 a day).
--
-- No secret is inlined: the URL is read from the vault at run time.
-- `cron.schedule(name, ...)` upserts by name, so re-running this file is a
-- no-op.
--
-- ROLLBACK:
--   select cron.unschedule(jobname) from cron.job
--    where jobname in ('ke-site-health-probe', 'ke-site-health-resolve');
--   drop function if exists public.site_health_probe();
--   drop function if exists public.site_health_resolve();
--   drop table if exists public.site_health;

BEGIN;

DO $$
DECLARE
  v_base text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    RAISE EXCEPTION '263: pg_cron is not installed';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_net') THEN
    RAISE EXCEPTION '263: pg_net is not installed';
  END IF;

  SELECT decrypted_secret INTO v_base FROM vault.decrypted_secrets WHERE name = 'APP_BASE_URL';
  IF v_base IS NULL THEN
    RAISE EXCEPTION '263: vault secret APP_BASE_URL is missing';
  ELSIF v_base NOT LIKE 'https://%' THEN
    RAISE EXCEPTION '263: APP_BASE_URL is not an https URL';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.site_health (
  id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  checked_at       timestamptz NOT NULL DEFAULT now(),
  url              text        NOT NULL,
  request_id       bigint      NOT NULL,
  -- NULL while pg_net has not answered yet; true only for a 200.
  ok               boolean,
  status_code      integer,
  error            text,
  resolved_at      timestamptz,
  -- Set on the one row whose failure made the streak reach three.
  alerted_at       timestamptz,
  alert_request_id bigint,
  CONSTRAINT site_health_resolved_consistent
    CHECK ((ok IS NULL) = (resolved_at IS NULL))
);

CREATE INDEX IF NOT EXISTS site_health_checked_at_idx
  ON public.site_health (checked_at DESC);
CREATE INDEX IF NOT EXISTS site_health_pending_idx
  ON public.site_health (id) WHERE ok IS NULL;

COMMENT ON TABLE public.site_health IS
  'One row per uptime probe of APP_BASE_URL/api/ready, written every 5 minutes by pg_cron (ke-site-health-probe). ok is NULL until pg_net answers, true only for a 200. Three consecutive failures send "hey SITE down" to ntfy once per outage (migration 263).';

ALTER TABLE public.site_health ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.site_health FROM PUBLIC, anon, authenticated;

-- Judge every pending probe, then alert if the failure streak has reached
-- three and this outage has not alerted yet. Returns the current streak.
CREATE OR REPLACE FUNCTION public.site_health_resolve()
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $fn$
DECLARE
  v_last_ok_id bigint;
  v_streak     integer;
  v_alerted    boolean;
  v_newest_id  bigint;
  v_request_id bigint;
BEGIN
  -- The two jobs never overlap by schedule; this keeps a manual call honest.
  PERFORM pg_advisory_xact_lock(hashtext('public.site_health'));

  UPDATE public.site_health h
     SET ok          = COALESCE(r.status_code = 200, false),
         status_code = r.status_code,
         error       = CASE
                         WHEN r.status_code = 200 THEN NULL
                         WHEN r.timed_out THEN COALESCE(r.error_msg, 'timed out')
                         ELSE r.error_msg
                       END,
         resolved_at = now()
    FROM net._http_response r
   WHERE h.ok IS NULL
     AND r.id = h.request_id;

  UPDATE public.site_health
     SET ok          = false,
         error       = 'pg_net returned no response within 120 s',
         resolved_at = now()
   WHERE ok IS NULL
     AND checked_at < now() - interval '120 seconds';

  SELECT max(id) INTO v_last_ok_id FROM public.site_health WHERE ok;

  SELECT count(*)::integer, COALESCE(bool_or(alerted_at IS NOT NULL), false), max(id)
    INTO v_streak, v_alerted, v_newest_id
    FROM public.site_health
   WHERE ok = false
     AND (v_last_ok_id IS NULL OR id > v_last_ok_id);

  IF v_streak >= 3 AND NOT v_alerted THEN
    v_request_id := net.http_post(
      url     := 'https://ntfy.sh/',
      body    := jsonb_build_object('topic', 'kenyon-ofir-limit', 'message', 'hey SITE down'),
      headers := jsonb_build_object('Content-Type', 'application/json'),
      timeout_milliseconds := 10000
    );
    UPDATE public.site_health
       SET alerted_at = now(), alert_request_id = v_request_id
     WHERE id = v_newest_id;
  END IF;

  RETURN v_streak;
END
$fn$;

-- Judge what is pending, send one probe, prune. Returns the pg_net request id.
CREATE OR REPLACE FUNCTION public.site_health_probe()
RETURNS bigint
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $fn$
DECLARE
  v_url        text;
  v_request_id bigint;
BEGIN
  PERFORM public.site_health_resolve();

  SELECT rtrim(decrypted_secret, '/') || '/api/ready'
    INTO v_url
    FROM vault.decrypted_secrets
   WHERE name = 'APP_BASE_URL';
  IF v_url IS NULL THEN
    RAISE EXCEPTION 'site_health_probe: vault secret APP_BASE_URL is missing';
  END IF;

  v_request_id := net.http_get(url := v_url, timeout_milliseconds := 20000);

  INSERT INTO public.site_health (url, request_id) VALUES (v_url, v_request_id);

  DELETE FROM public.site_health WHERE checked_at < now() - interval '30 days';

  RETURN v_request_id;
END
$fn$;

REVOKE ALL ON FUNCTION public.site_health_resolve() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.site_health_probe()   FROM PUBLIC, anon, authenticated;

SELECT cron.schedule(
  'ke-site-health-probe',
  '*/5 * * * *',
  $cmd$select public.site_health_probe();$cmd$
);

SELECT cron.schedule(
  'ke-site-health-resolve',
  '1-59/5 * * * *',
  $cmd$select public.site_health_resolve();$cmd$
);

COMMIT;

-- VERIFY:
--   select jobname, schedule, active from cron.job where jobname like 'ke-site-health-%';
--   select id, checked_at, ok, status_code, error, alerted_at
--     from public.site_health order by id desc limit 12;
