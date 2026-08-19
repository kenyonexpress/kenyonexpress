-- ============================================================================
-- 119b: auth_rls_initplan, the current_setting() half
-- ============================================================================
--
-- STATUS: APPLIED to production via MCP apply_migration on 2026-08-19
-- (name: rls_current_setting_initplan). Wave DB HARDENING step 10.
--
-- WHY. Lint 0003 covers current_setting() as well as auth.<function>(), and
-- 119 rewrote only the auth.* calls. That left exactly one policy behind:
-- "carts: owner all" reads the session cookie through current_setting(), so
-- the advisor still counted 1 of the original 40 after 119 ran.
--
-- Measured on live before this migration, one policy in public matched a bare
-- current_setting( outside a ( SELECT ... ) wrapper; the query used to find it
-- strips wrapped calls first, since the wrapped text still contains the call.
--
-- Only USING is named. ALTER POLICY leaves an omitted clause untouched, and
-- this policy's WITH CHECK has no current_setting() in it.
--
-- IDEMPOTENT: guarded on the bare pattern, so a second run does nothing.

DO $migration$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'carts'
      AND policyname = 'carts: owner all'
      AND regexp_replace(qual, '\( SELECT current_setting\([^)]*\)( AS [a-z_]+)?\)', '', 'g')
          ~ 'current_setting\('
  ) THEN
    ALTER POLICY "carts: owner all" ON public.carts
      USING (
        (profile_id = ( SELECT auth.uid()))
        OR (session_id = ((( SELECT current_setting('request.cookies'::text, true)))::json ->> 'session_id'::text))
        OR is_admin()
      );
    RAISE NOTICE '119b: wrapped current_setting() in carts: owner all';
  END IF;
END
$migration$;
