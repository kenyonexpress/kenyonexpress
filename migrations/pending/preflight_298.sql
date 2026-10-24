-- Preflight for 298_admin_users_rls.sql
-- Read-only. Stops if RLS is already enabled or policies exist.

DO $$
BEGIN
  -- Check if RLS is already enabled
  IF (SELECT relrowsecurity FROM pg_class WHERE relname = 'admin_users' AND relnamespace = 'public'::regnamespace) THEN
    RAISE EXCEPTION 'RLS already enabled on admin_users (migration 298 may already be applied)';
  END IF;

  -- Check if any of the policies exist
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'admin_users'
      AND policyname IN (
        'admin_users_admin_select',
        'admin_users_admin_insert',
        'admin_users_admin_update',
        'admin_users_admin_delete'
      )
  ) THEN
    RAISE EXCEPTION 'admin_users policies from migration 298 already exist';
  END IF;
END $$;

-- Informational: current state of admin_users
SELECT 
  c.relrowsecurity AS rls_enabled,
  (SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'admin_users') AS policy_count
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'admin_users';

-- Show existing policies (should be empty before applying)
SELECT policyname, cmd, roles, qual
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'admin_users';
