-- Migration 011: System-wide audit log (INSERT-only, no UPDATE, no DELETE)
-- Written exclusively via SECURITY DEFINER functions, never via the Data API.
--
-- CANONICAL AUDIT TABLE. public.audit_log defined here is the single source of truth
-- for auditing. It subsumes public.admin_audit_log (the transitional table created in
-- 003): 025 copies every admin_audit_log row into this table, repoints
-- audit_log_trigger_fn() at this table, then DROPs admin_audit_log. This table is a
-- strict superset of admin_audit_log columns (actor_id, actor_role, action as the
-- audit_action enum, entity_type, entity_id, changes, metadata, ip_address, user_agent,
-- created_at). New audit writes must target public.audit_log, never admin_audit_log.

-- ---------------------------------------------------------------------------
-- 1. ENUM
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE public.audit_action AS ENUM (
    'created',
    'updated',
    'deleted',
    'restored',
    'login',
    'logout',
    'permission_change',
    'status_change',
    'manual_override'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ---------------------------------------------------------------------------
-- 2. audit_log
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.audit_log (
  id          uuid                  PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    uuid                  REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_role  text,
  action      public.audit_action   NOT NULL,
  entity_type text                  NOT NULL,
  entity_id   uuid                  NOT NULL,
  changes     jsonb                 NOT NULL DEFAULT '{}'::jsonb,
  metadata    jsonb                 NOT NULL DEFAULT '{}'::jsonb,
  ip_address  inet,
  user_agent  text,
  created_at  timestamptz           NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 3. Indexes
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_audit_log_actor
  ON public.audit_log (actor_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_entity
  ON public.audit_log (entity_type, entity_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_action
  ON public.audit_log (action, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_log_created_at
  ON public.audit_log (created_at DESC);

-- ---------------------------------------------------------------------------
-- 4. RLS: admins SELECT only; all direct writes blocked via the Data API
-- ---------------------------------------------------------------------------

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Admins can read all rows
DROP POLICY IF EXISTS audit_log_admin_select ON public.audit_log;
CREATE POLICY audit_log_admin_select
  ON public.audit_log FOR SELECT TO authenticated
  USING (public.is_admin());

-- Block direct INSERT through the Data API (writes go via SECURITY DEFINER only)
DROP POLICY IF EXISTS audit_log_no_insert ON public.audit_log;
CREATE POLICY audit_log_no_insert
  ON public.audit_log FOR INSERT TO authenticated
  WITH CHECK (false);

-- Block UPDATE
DROP POLICY IF EXISTS audit_log_no_update ON public.audit_log;
CREATE POLICY audit_log_no_update
  ON public.audit_log FOR UPDATE TO authenticated
  USING (false);

-- Block DELETE
DROP POLICY IF EXISTS audit_log_no_delete ON public.audit_log;
CREATE POLICY audit_log_no_delete
  ON public.audit_log FOR DELETE TO authenticated
  USING (false);
