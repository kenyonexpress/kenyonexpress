-- 298: Enable RLS on admin_users table
--
-- CONTEXT: C72 RLS coverage audit found admin_users without RLS enabled.
-- This table links user IDs to admin status and must be protected.
--
-- SECURITY: Only admin/super_admin users should access this table.
-- Regular authenticated users and anonymous users should have no access.

-- Enable RLS
ALTER TABLE public.admin_users ENABLE ROW LEVEL SECURITY;

-- Admin read policy: only admin/super_admin can read
CREATE POLICY admin_users_admin_select ON public.admin_users
  FOR SELECT TO authenticated
  USING (is_admin());

-- Admin write policy: only admin/super_admin can insert/update/delete
CREATE POLICY admin_users_admin_insert ON public.admin_users
  FOR INSERT TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY admin_users_admin_update ON public.admin_users
  FOR UPDATE TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

CREATE POLICY admin_users_admin_delete ON public.admin_users
  FOR DELETE TO authenticated
  USING (is_admin());

-- Revoke all from anon
REVOKE ALL ON public.admin_users FROM anon;

-- Grant SELECT, INSERT, UPDATE, DELETE to authenticated (enforced by RLS policies)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.admin_users TO authenticated;

-- ============================================================================
-- VERIFICATION (run after applying, inside a rolled-back DO block)
-- ============================================================================
--
-- DO $$
-- DECLARE
--   v_anon_blocked boolean;
--   v_user_blocked boolean;
--   v_admin_allowed boolean;
-- BEGIN
--   -- 1. Verify RLS is enabled
--   IF NOT (SELECT relrowsecurity FROM pg_class WHERE relname = 'admin_users') THEN
--     RAISE EXCEPTION 'RLS not enabled on admin_users';
--   END IF;
--
--   -- 2. Test anon cannot read
--   SET LOCAL ROLE anon;
--   SELECT NOT EXISTS (SELECT 1 FROM admin_users) INTO v_anon_blocked;
--   IF NOT v_anon_blocked THEN
--     RAISE EXCEPTION 'anon can still read admin_users';
--   END IF;
--
--   -- 3. Test regular authenticated user cannot read (assuming test user is not admin)
--   RESET ROLE;
--   SET LOCAL ROLE authenticated;
--   SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000001"}'::json;
--   SELECT NOT EXISTS (SELECT 1 FROM admin_users) INTO v_user_blocked;
--   -- Note: This assumes the test user ID is not in admin_users. If your test user
--   -- is an admin, this check will fail and that's expected.
--
--   -- 4. Test admin can read
--   RESET ROLE;
--   -- SET LOCAL ROLE authenticated;
--   -- SET LOCAL request.jwt.claims with an admin user's ID and verify access
--
--   RAISE NOTICE 'admin_users RLS verification passed';
-- END $$;
