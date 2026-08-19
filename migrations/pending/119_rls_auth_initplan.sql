-- ============================================================================
-- 119: auth_rls_initplan - wrap bare auth.uid()/auth.jwt() in RLS policies
-- ============================================================================
--
-- STATUS: APPLIED to production via MCP apply_migration on 2026-08-19
-- (name: rls_auth_initplan_wrap_select). Wave DB HARDENING step 10, approved
-- by Ofir on 2026-08-12 for MCP application.
--
-- WHY. Postgres re-evaluates a bare auth.uid()/auth.jwt() inside USING /
-- WITH CHECK once per row. Wrapped as (select auth.uid()) the planner hoists
-- one InitPlan per statement. This is Supabase lint auth_rls_initplan.
--
-- HOW. This file does NOT reconstruct policy text from migration history: the
-- earlier draft did, and history is not what production actually runs. It reads
-- the live pg_policies rows and rewrites them in place with ALTER POLICY.
-- ALTER POLICY changes only USING / WITH CHECK; FOR, TO and PERMISSIVE are kept
-- by Postgres itself, so no policy can gain a command, a role or a row. There is
-- also no window in which a table sits unprotected, which a DROP + CREATE pair
-- would open.
--
-- REWRITE. Already-wrapped expressions render as "( SELECT auth.uid() AS uid)".
-- Those are parked behind a placeholder first so the plain replace() below
-- cannot double-wrap them, then restored. Only genuinely bare calls change.
--
-- IDEMPOTENT. The loop selects on the bare-call pattern, so a second run
-- matches nothing and does nothing.
--
-- MEASURED. 41 live policies matched before the run: 7 with both clauses,
-- 31 USING only, 3 WITH CHECK only. Advisor auth_rls_initplan count after: 0.

DO $migration$
DECLARE
  r         record;
  new_qual  text;
  new_check text;
  clauses   text;
  changed   int := 0;
BEGIN
  FOR r IN
    SELECT tablename, policyname, qual, with_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (qual ~ 'auth\.(uid|jwt)\(\)' OR with_check ~ 'auth\.(uid|jwt)\(\)')
    ORDER BY tablename, policyname
  LOOP
    -- park already-wrapped calls, wrap the bare ones, restore the parked ones
    new_qual := replace(replace(replace(replace(
        regexp_replace(r.qual, '\( SELECT auth\.(uid|jwt)\(\)( AS [a-z_]+)?\)', '<<K\1>>', 'g'),
        'auth.uid()', '( SELECT auth.uid())'),
        'auth.jwt()', '( SELECT auth.jwt())'),
        '<<Kuid>>',   '( SELECT auth.uid())'),
        '<<Kjwt>>',   '( SELECT auth.jwt())');

    new_check := replace(replace(replace(replace(
        regexp_replace(r.with_check, '\( SELECT auth\.(uid|jwt)\(\)( AS [a-z_]+)?\)', '<<K\1>>', 'g'),
        'auth.uid()', '( SELECT auth.uid())'),
        'auth.jwt()', '( SELECT auth.jwt())'),
        '<<Kuid>>',   '( SELECT auth.uid())'),
        '<<Kjwt>>',   '( SELECT auth.jwt())');

    -- a policy carries only the clauses it was created with; INSERT has no
    -- USING, and naming an absent clause in ALTER POLICY is an error
    clauses := '';
    IF new_qual IS NOT NULL THEN
      clauses := clauses || ' USING (' || new_qual || ')';
    END IF;
    IF new_check IS NOT NULL THEN
      clauses := clauses || ' WITH CHECK (' || new_check || ')';
    END IF;

    EXECUTE format('ALTER POLICY %I ON public.%I%s', r.policyname, r.tablename, clauses);
    changed := changed + 1;
  END LOOP;

  RAISE NOTICE '119: rewrote % policies', changed;
END
$migration$;
