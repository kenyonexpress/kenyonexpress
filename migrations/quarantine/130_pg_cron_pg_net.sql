-- ===========================================================================
-- 130_pg_cron_pg_net.sql
--
-- Enable pg_cron and pg_net extensions for in-database scheduled jobs and
-- HTTP calls. Replaces Vercel cron for queue/outbox/reminder processing.
--
-- WHAT THIS MIGRATION DOES:
-- 1. Enables pg_cron and pg_net extensions
-- 2. Creates backup_log table for RPO tracking (the "backup pointer")
-- 3. Creates wrapper functions that use pg_net to call internal cron endpoints
-- 4. Grants necessary permissions
--
-- WHAT IT DOES NOT DO:
-- Schedule jobs - that lives in supabase/schedules/cron_jobs.sql (apply-time)
--
-- Prerequisites: 095 (notification_outbox), 132 (search_index_outbox)
-- Fully idempotent. Apply only via MCP apply_migration.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Enable extensions
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

COMMENT ON EXTENSION pg_cron IS 'Job scheduler for PostgreSQL';
COMMENT ON EXTENSION pg_net IS 'Async HTTP client for PostgreSQL';

-- ---------------------------------------------------------------------------
-- 2. Backup log table (backup pointer)
-- ---------------------------------------------------------------------------

/**
 * Records backup metadata for RPO tracking. Written by external backup scripts
 * via service role, read by admin/observability dashboards.
 *
 * The "backup pointer" is the most recent completed backup: subtracting its
 * created_at from now() gives the current RPO (worst-case data loss).
 */
CREATE TABLE IF NOT EXISTS public.backup_log (
  id            bigserial   PRIMARY KEY,
  backup_type   text        NOT NULL CHECK (backup_type IN ('pg_dump', 'supabase_daily', 'manual')),
  location      text        NOT NULL,  -- file path, S3 URI, or Supabase project snapshot ID
  size_bytes    bigint,
  status        text        NOT NULL DEFAULT 'in_progress'
                            CHECK (status IN ('in_progress', 'completed', 'failed')),
  error_message text,
  metadata      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  completed_at  timestamptz,
  created_by    text                   -- service role or admin email
);

CREATE INDEX IF NOT EXISTS backup_log_created_at_idx
  ON public.backup_log (created_at DESC);

CREATE INDEX IF NOT EXISTS backup_log_status_idx
  ON public.backup_log (status, backup_type);

COMMENT ON TABLE public.backup_log IS
  'Backup metadata for RPO tracking. Most recent completed row is the recovery point.';

ALTER TABLE public.backup_log ENABLE ROW LEVEL SECURITY;

-- Admin read-only
DROP POLICY IF EXISTS backup_log_admin_read ON public.backup_log;
CREATE POLICY backup_log_admin_read ON public.backup_log
  FOR SELECT USING (public.is_admin());

REVOKE ALL ON public.backup_log FROM anon, authenticated;

-- Service role can write (bypasses RLS)
GRANT SELECT, INSERT, UPDATE ON public.backup_log TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.backup_log_id_seq TO service_role;

-- ---------------------------------------------------------------------------
-- 3. HTTP wrapper functions for pg_net
-- ---------------------------------------------------------------------------

/**
 * Calls /api/cron/notifications to drain notification_outbox.
 * Returns immediately; the HTTP call is async via pg_net.
 */
CREATE OR REPLACE FUNCTION public.fn_drain_notification_outbox()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_url text;
  v_secret text;
  v_request_id bigint;
BEGIN
  v_url := current_setting('app.settings.app_url', true);
  v_secret := current_setting('app.settings.cron_secret', true);

  IF v_url IS NULL OR v_secret IS NULL THEN
    RAISE WARNING 'fn_drain_notification_outbox: app_url or cron_secret not configured';
    RETURN;
  END IF;

  -- pg_net.http_post is async: returns request_id, does not wait for response
  SELECT extensions.http_post(
    url := v_url || '/api/cron/notifications',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_secret,
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  ) INTO v_request_id;

  -- Response will be in net._http_response once complete (async)
  -- Errors are logged there, not raised here
END;
$$;

/**
 * Calls /api/cron/health which drains search_index_outbox.
 */
CREATE OR REPLACE FUNCTION public.fn_drain_search_outbox()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_url text;
  v_secret text;
  v_request_id bigint;
BEGIN
  v_url := current_setting('app.settings.app_url', true);
  v_secret := current_setting('app.settings.cron_secret', true);

  IF v_url IS NULL OR v_secret IS NULL THEN
    RAISE WARNING 'fn_drain_search_outbox: app_url or cron_secret not configured';
    RETURN;
  END IF;

  SELECT extensions.http_post(
    url := v_url || '/api/cron/health',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_secret,
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  ) INTO v_request_id;
END;
$$;

/**
 * Calls /api/cron/expire-vouchers for voucher expiry reminders.
 */
CREATE OR REPLACE FUNCTION public.fn_process_voucher_reminders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_url text;
  v_secret text;
  v_request_id bigint;
BEGIN
  v_url := current_setting('app.settings.app_url', true);
  v_secret := current_setting('app.settings.cron_secret', true);

  IF v_url IS NULL OR v_secret IS NULL THEN
    RAISE WARNING 'fn_process_voucher_reminders: app_url or cron_secret not configured';
    RETURN;
  END IF;

  SELECT extensions.http_post(
    url := v_url || '/api/cron/expire-vouchers',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_secret,
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  ) INTO v_request_id;
END;
$$;

/**
 * Records backup metadata. Called by external backup scripts via service role.
 *
 * Example:
 *   SELECT public.fn_record_backup(
 *     'pg_dump',
 *     '/Users/ofir/Desktop/kenyonexpress-backup-2026-10-24-0454.tar.gz',
 *     890000000,
 *     'ofir@kenyonexpress.co.il'
 *   );
 */
CREATE OR REPLACE FUNCTION public.fn_record_backup(
  p_backup_type text,
  p_location text,
  p_size_bytes bigint DEFAULT NULL,
  p_created_by text DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_backup_id bigint;
BEGIN
  INSERT INTO public.backup_log (
    backup_type,
    location,
    size_bytes,
    status,
    created_by,
    completed_at
  ) VALUES (
    p_backup_type,
    p_location,
    p_size_bytes,
    'completed',
    p_created_by,
    now()
  ) RETURNING id INTO v_backup_id;

  RETURN v_backup_id;
END;
$$;

-- Grant execute to service_role for backup recording
GRANT EXECUTE ON FUNCTION public.fn_record_backup TO service_role;

-- ---------------------------------------------------------------------------
-- 4. View for current RPO
-- ---------------------------------------------------------------------------

/**
 * Admin-readable view showing the most recent backup and current RPO.
 */
CREATE OR REPLACE VIEW public.backup_status AS
SELECT
  bl.id,
  bl.backup_type,
  bl.location,
  bl.size_bytes,
  bl.completed_at AS last_backup_time,
  EXTRACT(EPOCH FROM (now() - bl.completed_at))/3600 AS rpo_hours,
  bl.created_by
FROM public.backup_log bl
WHERE bl.status = 'completed'
ORDER BY bl.completed_at DESC
LIMIT 1;

COMMENT ON VIEW public.backup_status IS
  'Current backup status and RPO in hours. Used by monitoring dashboards.';

-- Admin can read the view
DROP POLICY IF EXISTS backup_status_admin_read ON public.backup_status;
CREATE POLICY backup_status_admin_read ON public.backup_status
  FOR SELECT USING (public.is_admin());

-- ---------------------------------------------------------------------------
-- Verification queries (commented out for production)
-- ---------------------------------------------------------------------------

-- Check extensions are installed:
-- SELECT * FROM pg_extension WHERE extname IN ('pg_cron', 'pg_net');

-- Check functions exist:
-- SELECT proname, prosrc FROM pg_proc
-- WHERE proname LIKE 'fn_drain%' OR proname LIKE 'fn_process%' OR proname LIKE 'fn_record%';

-- Check backup_log table:
-- SELECT * FROM public.backup_log ORDER BY created_at DESC LIMIT 5;

-- Check current RPO:
-- SELECT * FROM public.backup_status;
