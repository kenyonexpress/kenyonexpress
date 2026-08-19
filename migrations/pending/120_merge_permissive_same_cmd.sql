-- ============================================================================
-- 120: multiple_permissive_policies, part 1 of 2 - merge same (table, cmd, role)
-- ============================================================================
--
-- STATUS: APPLIED to production via MCP apply_migration on 2026-08-19
-- (name: merge_permissive_policies_same_cmd). Wave DB HARDENING step 11.
--
-- WHY. Every permissive policy on a table is evaluated for a statement and the
-- results ORed, so two permissive policies on the same table for the same
-- command and the same role cost two predicate evaluations to reach an answer
-- Postgres could have got from one. Supabase lint 0006.
--
-- SCOPE, part 1. Only groups where table, cmd AND roles are all identical.
-- Merging those is a pure rewrite: the effective permission of "A OR B" over
-- one role set is by definition what the two policies already granted together.
-- Nothing here changes which roles or which commands are reachable.
--
-- The cross-role overlaps (an admin FOR ALL policy sitting on top of the
-- per-command policies) are deliberately NOT in this file. They need a role
-- widening argument to be safe, so they are part 2, in 121.
--
-- MEASURED on live before this ran: 19 such groups holding 45 policies, which
-- this collapses to 19.
--
-- CLAUSES PER COMMAND. A policy only carries the clauses its command allows,
-- and naming an absent one is an error: SELECT and DELETE take USING only,
-- INSERT takes WITH CHECK only, UPDATE and ALL take both. For UPDATE and ALL a
-- NULL with_check means Postgres checks new rows against USING, so the merge
-- reads coalesce(with_check, qual) rather than dropping the row's check.
--
-- NAMES. The merged policy is named <table>_<cmd>_unified. The old names are
-- listed per group in the RAISE NOTICE so the mapping stays greppable. Two code
-- comments cite old names (src/server/queries/vouchers.ts); they are updated in
-- the same commit.
--
-- ATOMIC. CREATE then DROP inside one transaction, so no statement ever sees
-- the table unprotected.
--
-- IDEMPOTENT: the group query requires count(*) > 1, so a second run matches
-- nothing.

DO $migration$
DECLARE
  g        record;
  nm       text;
  clauses  text;
  newname  text;
  groups   int := 0;
  dropped  int := 0;
BEGIN
  FOR g IN
    SELECT tablename,
           cmd,
           roles,
           count(*)                                     AS n,
           array_agg(policyname ORDER BY policyname)    AS names,
           string_agg('(' || qual || ')', ' OR ' ORDER BY policyname)
             FILTER (WHERE qual IS NOT NULL)            AS or_using,
           string_agg('(' || coalesce(with_check, qual) || ')', ' OR ' ORDER BY policyname)
             FILTER (WHERE coalesce(with_check, qual) IS NOT NULL) AS or_check
    FROM pg_policies
    WHERE schemaname = 'public'
      AND permissive = 'PERMISSIVE'
    GROUP BY tablename, cmd, roles
    HAVING count(*) > 1
    ORDER BY tablename, cmd
  LOOP
    clauses := '';
    IF g.cmd IN ('SELECT', 'DELETE') THEN
      clauses := ' USING (' || g.or_using || ')';
    ELSIF g.cmd = 'INSERT' THEN
      clauses := ' WITH CHECK (' || g.or_check || ')';
    ELSE  -- UPDATE, ALL
      IF g.or_using IS NOT NULL THEN
        clauses := clauses || ' USING (' || g.or_using || ')';
      END IF;
      IF g.or_check IS NOT NULL THEN
        clauses := clauses || ' WITH CHECK (' || g.or_check || ')';
      END IF;
    END IF;

    newname := g.tablename || '_' || lower(g.cmd) || '_unified';

    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR %s TO %s%s',
      newname, g.tablename, g.cmd, array_to_string(g.roles, ', '), clauses
    );

    FOREACH nm IN ARRAY g.names LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', nm, g.tablename);
      dropped := dropped + 1;
    END LOOP;

    groups := groups + 1;
    RAISE NOTICE '120: %.% -> % (replaced: %)', g.tablename, g.cmd, newname, g.names;
  END LOOP;

  RAISE NOTICE '120: % groups merged, % policies replaced', groups, dropped;
END
$migration$;
