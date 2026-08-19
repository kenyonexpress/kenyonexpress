-- ============================================================================
-- 121: multiple_permissive_policies, part 2 of 2 - FOR ALL and cross-role
-- ============================================================================
--
-- STATUS: APPLIED to production via MCP apply_migration on 2026-08-19
-- (name: merge_permissive_policies_cross_cmd). Wave DB HARDENING step 11.
--
-- WHAT 120 LEFT. 120 merged only groups where table, command and role set were
-- all identical. Two overlap shapes survived it:
--
--   1. an admin policy declared FOR ALL sitting on top of the per-command
--      policies, e.g. products_admin_write [ALL] over products: public read
--      [SELECT]. Same table, same role, overlapping commands.
--   2. two policies for one command whose role sets differ, e.g.
--      products: public read [SELECT TO public] over products_select_unified
--      [SELECT TO authenticated]. public contains authenticated, so a signed-in
--      user evaluates both.
--
-- HOW. This rebuilds the policy set of each affected table from a view in which
-- every FOR ALL policy is expanded into the four commands it actually covers,
-- then emits one policy per (command, role set). Untouched tables keep their
-- policies verbatim; carts is the one FOR ALL policy with no peer, so it is not
-- rebuilt.
--
-- THE ROLE RULE, AND WHY IT IS NOT UNCONDITIONAL. Merging shape 2 means the
-- surviving policy must be TO public, and anon then evaluates predicates that
-- were written for signed-in users. That is safe only when every function in
-- them is executable by anon. Measured on live:
--
--   anon MAY execute:     is_admin, is_supplier_member
--   anon MAY NOT execute: current_user_role, has_role, is_support,
--                         is_supplier_owner, is_supplier_order,
--                         is_supplier_shipping_order, current_supplier_id
--
-- A policy is not a permission check that quietly returns false when the caller
-- cannot run it: an anon SELECT against a policy calling has_role() fails with
-- "permission denied for function has_role". Folding products_select_unified,
-- which calls current_user_role(), into the TO public read policy would turn
-- every anonymous product page into an error. So the merge across role sets is
-- guarded: the predicate text is matched against the live list of functions
-- anon cannot execute, built from has_function_privilege at run time rather
-- than hardcoded, and a group that matches is merged within each role set only
-- and deliberately left overlapping. Those residuals are listed in STATE.md
-- with this reason; they are correctness, not omission.
--
-- Widening never invents reach: TO public is used only when some member policy
-- was already TO public, otherwise the union of the member role names is used.
-- Every merged clause is identity-derived (auth.uid(), is_admin(),
-- is_supplier_member()) and returns false for anon, verified by running them
-- under SET LOCAL ROLE anon: is_admin() = false, is_supplier_member() = false.
--
-- CLAUSES PER COMMAND: SELECT and DELETE take USING only, INSERT takes WITH
-- CHECK only, UPDATE takes both. A NULL with_check on a FOR ALL policy means
-- Postgres checks new rows against USING, so the expansion reads
-- coalesce(with_check, qual) and does not drop the check.
--
-- NAMES: <table>_<cmd>_unified when the command ends with one policy, and
-- <table>_<cmd>_<roles> when the guard above forced one policy per role set.
-- This supersedes some names 120 created on the same tables.
--
-- ATOMIC: drop and create for a table happen in one transaction.
-- IDEMPOTENT: the driving query selects tables that still have an overlapping
-- (command, role) group, so a second run matches nothing.

DO $migration$
DECLARE
  t           record;
  g           record;
  unsafe_re   text;
  creates     text[];
  dropnames   text[];
  ddl         text;
  nm          text;
  clauses     text;
  newname     text;
  rolelist    text;
  n_tables    int := 0;
  n_created   int := 0;
BEGIN
  -- functions in public that anon may NOT execute, as a word-boundary regex
  SELECT coalesce('\m(' || string_agg(DISTINCT p.proname, '|') || ')\M', '$^')
    INTO unsafe_re
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND NOT has_function_privilege('anon', p.oid, 'EXECUTE');

  FOR t IN
    WITH exp AS (
      SELECT p.tablename, p.policyname, c.cmd_eff
      FROM pg_policies p
      CROSS JOIN LATERAL (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) c(cmd_eff)
      WHERE p.schemaname = 'public'
        AND p.permissive = 'PERMISSIVE'
        AND (p.cmd = 'ALL' OR p.cmd = c.cmd_eff)
    )
    SELECT DISTINCT x.tablename
    FROM (SELECT tablename, cmd_eff FROM exp GROUP BY tablename, cmd_eff HAVING count(*) > 1) x
    ORDER BY 1
  LOOP
    creates := ARRAY[]::text[];

    FOR g IN
      WITH exp AS (
        SELECT p.policyname, p.roles, p.qual, p.with_check, c.cmd_eff
        FROM pg_policies p
        CROSS JOIN LATERAL (VALUES ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE')) c(cmd_eff)
        WHERE p.schemaname = 'public'
          AND p.permissive = 'PERMISSIVE'
          AND p.tablename = t.tablename
          AND (p.cmd = 'ALL' OR p.cmd = c.cmd_eff)
      ),
      decision AS (
        -- merge across role sets only when there is one role set anyway, or
        -- when no predicate names a function anon cannot execute
        SELECT cmd_eff,
               (count(DISTINCT roles::text) = 1
                OR string_agg(coalesce(qual, '') || ' ' || coalesce(with_check, ''), ' ') !~ unsafe_re
               ) AS merge_roles
        FROM exp
        GROUP BY cmd_eff
      ),
      keyed AS (
        SELECT e.*, CASE WHEN d.merge_roles THEN '*' ELSE e.roles::text END AS gkey
        FROM exp e JOIN decision d USING (cmd_eff)
      ),
      roleunion AS (
        SELECT k.cmd_eff, k.gkey, array_agg(DISTINCT r ORDER BY r) AS role_union
        FROM keyed k, LATERAL unnest(k.roles) r
        GROUP BY k.cmd_eff, k.gkey
      ),
      agg AS (
        SELECT cmd_eff, gkey,
               string_agg('(' || qual || ')', ' OR ' ORDER BY policyname)
                 FILTER (WHERE qual IS NOT NULL)                       AS or_using,
               string_agg('(' || coalesce(with_check, qual) || ')', ' OR ' ORDER BY policyname)
                 FILTER (WHERE coalesce(with_check, qual) IS NOT NULL) AS or_check,
               bool_or('public' = ANY (roles))                         AS has_public
        FROM keyed
        GROUP BY cmd_eff, gkey
      )
      SELECT a.cmd_eff, a.or_using, a.or_check, a.has_public, r.role_union,
             (SELECT count(*) FROM agg a2 WHERE a2.cmd_eff = a.cmd_eff) AS groups_for_cmd
      FROM agg a
      JOIN roleunion r ON r.cmd_eff = a.cmd_eff AND r.gkey = a.gkey
      ORDER BY a.cmd_eff, a.gkey
    LOOP
      clauses := '';
      IF g.cmd_eff IN ('SELECT', 'DELETE') THEN
        clauses := ' USING (' || g.or_using || ')';
      ELSIF g.cmd_eff = 'INSERT' THEN
        clauses := ' WITH CHECK (' || g.or_check || ')';
      ELSE
        IF g.or_using IS NOT NULL THEN
          clauses := clauses || ' USING (' || g.or_using || ')';
        END IF;
        IF g.or_check IS NOT NULL THEN
          clauses := clauses || ' WITH CHECK (' || g.or_check || ')';
        END IF;
      END IF;

      IF g.has_public THEN
        rolelist := 'public';
      ELSE
        rolelist := array_to_string(g.role_union, ', ');
      END IF;

      IF g.groups_for_cmd = 1 THEN
        newname := t.tablename || '_' || lower(g.cmd_eff) || '_unified';
      ELSE
        newname := t.tablename || '_' || lower(g.cmd_eff) || '_' || array_to_string(g.role_union, '_');
      END IF;

      creates := creates || format(
        'CREATE POLICY %I ON public.%I FOR %s TO %s%s',
        newname, t.tablename, g.cmd_eff, rolelist, clauses
      );
    END LOOP;

    -- collect first, then drop: dropping under an open cursor over pg_policies
    -- is not something to rely on
    SELECT array_agg(policyname) INTO dropnames
    FROM pg_policies
    WHERE schemaname = 'public' AND permissive = 'PERMISSIVE' AND tablename = t.tablename;

    FOREACH nm IN ARRAY dropnames LOOP
      EXECUTE format('DROP POLICY %I ON public.%I', nm, t.tablename);
    END LOOP;

    FOREACH ddl IN ARRAY creates LOOP
      EXECUTE ddl;
      n_created := n_created + 1;
    END LOOP;

    n_tables := n_tables + 1;
    RAISE NOTICE '121: % rebuilt, % dropped, % created',
      t.tablename, array_length(dropnames, 1), array_length(creates, 1);
  END LOOP;

  RAISE NOTICE '121: % tables rebuilt, % policies created', n_tables, n_created;
END
$migration$;
