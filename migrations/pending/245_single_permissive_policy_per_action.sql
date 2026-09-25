-- 245_single_permissive_policy_per_action.sql
--
-- One permissive policy per (table, role, action). Closes the 14
-- `multiple_permissive_policies` WARNs the advisor reports today, without
-- changing who can read or write a single row.
--
-- =============================================================================
-- WHAT THE ADVISORS SAY, MEASURED 2026-09-25 (management API, read-only)
-- =============================================================================
--
--   SECURITY  (28)
--     WARN  authenticated_security_definer_function_executable  21  by design *
--     WARN  anon_security_definer_function_executable            2  by design *
--     WARN  function_search_path_mutable                         1  -> 220
--     INFO  rls_enabled_no_policy                                4  deny-all
--
--   PERFORMANCE  (206)
--     WARN  multiple_permissive_policies                        14  -> THIS FILE
--     WARN  auth_rls_initplan                                    6  -> 209 §2
--     INFO  unused_index                                       176
--     INFO  unindexed_foreign_keys                               9
--     INFO  auth_db_connections_absolute                         1
--
--   * Every one of the 23 has a caller that needs the grant, re-measured today:
--     8 are policy predicates (`is_admin`, `is_supplier_member`, `has_role`,
--     `is_support`, `current_user_role`, `is_supplier_order`, `is_supplier_owner`,
--     `is_supplier_shipping_order`) evaluated as the calling role; 13 are RPCs
--     called on the user's session client (`redeem_voucher` x2 routes,
--     `verify_supplier_staff_pin`, `supplier_app_context` from apps/mobile,
--     `generate/approve/cancel/mark_paid_payout_statement` and
--     `fn_cashback_admin_adjust` from server actions on `createClient()`, and
--     the four `admin_report_*` plus `admin_refresh_reports` from
--     `queries/admin-reports.ts` and `actions/admin/reports.ts`). Each of the
--     13 checks `public.is_admin()` or the caller's own membership inside its
--     body; a service-role caller has no `auth.uid()` and would be refused. A
--     REVOKE is therefore a functional outage, not a hardening (165 was
--     cancelled on 2026-09-04 for exactly this; see `migrations/cancelled/`).
--
-- The 19 of 2026-09-09 became 14 because five pairs disappeared with
-- migrations applied since; the ones that remain are listed below, verbatim
-- from `pg_policies` today.
--
-- =============================================================================
-- WHY IT IS SAFE TO DO NOW WHAT 209 DEFERRED
-- =============================================================================
--
-- 209 left these alone because "a money-adjacent policy rewritten by somebody
-- who cannot exercise it" is a bad trade. This file was rehearsed against
-- production inside BEGIN/ROLLBACK (management API) with the advisor's own
-- lint query (`supabase/splinter` 0006) run inside the same transaction,
-- and with row-visibility probes as `anon` and as three real `authenticated`
-- identities (an admin, a customer with ledger rows, a supplier member),
-- before and after, on every table below. The numbers are in STATE.md under
-- M05-c1. Nothing about the rehearsal survived the ROLLBACK.
--
-- THE RULE OF THE REWRITE. Two permissive policies P1, P2 on the same
-- (role, action) let a row through iff P1 OR P2. So each merged policy is
-- exactly `(P1) OR (P2)`, with three mechanical adjustments only:
--
--   1. A `FOR ALL` policy is split into SELECT / INSERT / UPDATE / DELETE so
--      its SELECT half can be OR-ed into the table's read policy while the
--      write halves stay alone. USING and WITH CHECK carry over unchanged.
--
--   2. Where a read policy is granted to `{anon, authenticated}` and the
--      policy it merges with calls a helper `anon` cannot EXECUTE
--      (`has_role`, `current_user_role`), the read is split BY ROLE:
--      `<table>_select_anon` keeps the public predicate alone, and
--      `<table>_select_authenticated` carries the OR. This is the catalogue
--      convention already in force (`products`, `categories`,
--      `popular_searches`, `product_variants`; DB-SECURITY-MODEL §2), and it
--      is what keeps an anonymous SELECT from tripping 42501 on a helper it
--      may not call, which is how 165 would have failed.
--
--   3. Calls that do not depend on the row (`is_admin()`, `is_support()`,
--      `has_role('admin')`, `current_user_role()`, `auth.uid()`) are wrapped
--      as `(select ...)` so the planner evaluates them once per statement
--      (an InitPlan) instead of once per row. Same value, same rows; this is
--      the fix 209 §2 applies to `auth.uid()` and to `current_user_role()`
--      in `profiles_super_admin_mfa`. `is_supplier_member(<row column>)`
--      depends on the row and is left as a plain call.
--
-- Naming follows DB-SECURITY-MODEL §2: `<table>_<cmd>_unified`, and
-- `<table>_select_anon` / `<table>_select_authenticated` for the split reads.
--
-- =============================================================================
-- ORDER AGAINST OTHER PENDING FILES
-- =============================================================================
--
--   AFTER 209.  209 §2 runs `ALTER POLICY cashback_ledger_owner_select`. This
--               file drops that policy. Applied in the other order, 209's
--               transaction aborts on the missing policy. (If 209 is ever
--               applied after this file, delete that one ALTER from it; the
--               unified policy created here already carries the InitPlan.)
--
--   AFTER 203.  203 recreates `support_ticket_messages_own_read` and
--               `_staff_read` with DROP IF EXISTS + CREATE. Applied after
--               this file, it re-adds two SELECT policies beside the unified
--               one: no leak (all three filter `internal`), but the WARN
--               returns on that table. The `direction <> 'internal'` term is
--               carried here already; it is a no-op until 203 widens the CHECK
--               (today `direction` admits only inbound/outbound), and the leak
--               fix the moment it does.
--
--   Independent of 220, 230 and 240..244: none of them names a policy below.
--
-- DROP + CREATE inside one transaction: no statement between them is visible
-- to any other session, so there is no instant at which a table is readable
-- without its policy. Grants are not touched (policies carry none).

BEGIN;

-- =============================================================================
-- 1. banners  (authenticated SELECT: "banners: public read" + "banners: staff write")
-- =============================================================================
--
-- live: "banners: public read"  {anon,authenticated} SELECT  USING (is_active)
--       "banners: staff write"  {authenticated}      ALL     USING/CHECK (has_role('admin'))

DROP POLICY IF EXISTS "banners: public read" ON public.banners;
DROP POLICY IF EXISTS "banners: staff write" ON public.banners;

CREATE POLICY banners_select_anon ON public.banners
  FOR SELECT TO anon
  USING (is_active);

CREATE POLICY banners_select_authenticated ON public.banners
  FOR SELECT TO authenticated
  USING (is_active OR (select public.has_role('admin')));

CREATE POLICY banners_insert_unified ON public.banners
  FOR INSERT TO authenticated
  WITH CHECK ((select public.has_role('admin')));

CREATE POLICY banners_update_unified ON public.banners
  FOR UPDATE TO authenticated
  USING ((select public.has_role('admin')))
  WITH CHECK ((select public.has_role('admin')));

CREATE POLICY banners_delete_unified ON public.banners
  FOR DELETE TO authenticated
  USING ((select public.has_role('admin')));

-- =============================================================================
-- 2. homepage_sections  (same shape as banners, 127_homepage_cms)
-- =============================================================================

DROP POLICY IF EXISTS "homepage_sections: public read" ON public.homepage_sections;
DROP POLICY IF EXISTS "homepage_sections: staff write" ON public.homepage_sections;

CREATE POLICY homepage_sections_select_anon ON public.homepage_sections
  FOR SELECT TO anon
  USING (is_active);

CREATE POLICY homepage_sections_select_authenticated ON public.homepage_sections
  FOR SELECT TO authenticated
  USING (is_active OR (select public.has_role('admin')));

CREATE POLICY homepage_sections_insert_unified ON public.homepage_sections
  FOR INSERT TO authenticated
  WITH CHECK ((select public.has_role('admin')));

CREATE POLICY homepage_sections_update_unified ON public.homepage_sections
  FOR UPDATE TO authenticated
  USING ((select public.has_role('admin')))
  WITH CHECK ((select public.has_role('admin')));

CREATE POLICY homepage_sections_delete_unified ON public.homepage_sections
  FOR DELETE TO authenticated
  USING ((select public.has_role('admin')));

-- =============================================================================
-- 3. cashback_ledger  (SELECT: cashback_ledger_admin_select + cashback_ledger_owner_select)
-- =============================================================================
--
-- live: admin_select USING (is_admin());  owner_select USING (user_id = auth.uid())
-- 230 already revokes INSERT/UPDATE/DELETE from both client roles; no write
-- policy exists and none is added.

DROP POLICY IF EXISTS cashback_ledger_admin_select ON public.cashback_ledger;
DROP POLICY IF EXISTS cashback_ledger_owner_select ON public.cashback_ledger;

CREATE POLICY cashback_ledger_select_unified ON public.cashback_ledger
  FOR SELECT TO authenticated
  USING ((select public.is_admin()) OR user_id = (select auth.uid()));

-- =============================================================================
-- 4. payment_events  (SELECT: payment_events_admin_read + payment_events_owner_read)
-- =============================================================================

DROP POLICY IF EXISTS payment_events_admin_read ON public.payment_events;
DROP POLICY IF EXISTS payment_events_owner_read ON public.payment_events;

CREATE POLICY payment_events_select_unified ON public.payment_events
  FOR SELECT TO authenticated
  USING (
    ((select public.current_user_role()) = ANY (ARRAY['admin'::public.user_role, 'super_admin'::public.user_role, 'support'::public.user_role]))
    OR (
      order_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.orders o
        WHERE o.id = payment_events.order_id
          AND o.user_id = (select auth.uid())
      )
    )
  );

-- =============================================================================
-- 5. payout_statements  (SELECT: "payout_statements: admin all" + "payout_statements: member select")
-- =============================================================================
--
-- live: "admin all"     ALL    USING/CHECK (is_admin())
--       "member select" SELECT USING (deleted_at IS NULL AND status <> 'draft' AND is_supplier_member(supplier_id))

DROP POLICY IF EXISTS "payout_statements: admin all" ON public.payout_statements;
DROP POLICY IF EXISTS "payout_statements: member select" ON public.payout_statements;

CREATE POLICY payout_statements_select_unified ON public.payout_statements
  FOR SELECT TO authenticated
  USING (
    (select public.is_admin())
    OR (
      deleted_at IS NULL
      AND status <> 'draft'::public.payout_status
      AND public.is_supplier_member(supplier_id)
    )
  );

CREATE POLICY payout_statements_insert_unified ON public.payout_statements
  FOR INSERT TO authenticated
  WITH CHECK ((select public.is_admin()));

CREATE POLICY payout_statements_update_unified ON public.payout_statements
  FOR UPDATE TO authenticated
  USING ((select public.is_admin()))
  WITH CHECK ((select public.is_admin()));

CREATE POLICY payout_statements_delete_unified ON public.payout_statements
  FOR DELETE TO authenticated
  USING ((select public.is_admin()));

-- =============================================================================
-- 6. payout_statement_lines  (SELECT: "payout_lines: admin all" + "payout_lines: member select")
-- =============================================================================

DROP POLICY IF EXISTS "payout_lines: admin all" ON public.payout_statement_lines;
DROP POLICY IF EXISTS "payout_lines: member select" ON public.payout_statement_lines;

CREATE POLICY payout_statement_lines_select_unified ON public.payout_statement_lines
  FOR SELECT TO authenticated
  USING (
    (select public.is_admin())
    OR statement_id IN (
      SELECT s.id FROM public.payout_statements s
      WHERE s.deleted_at IS NULL
        AND s.status <> 'draft'::public.payout_status
        AND public.is_supplier_member(s.supplier_id)
    )
  );

CREATE POLICY payout_statement_lines_insert_unified ON public.payout_statement_lines
  FOR INSERT TO authenticated
  WITH CHECK ((select public.is_admin()));

CREATE POLICY payout_statement_lines_update_unified ON public.payout_statement_lines
  FOR UPDATE TO authenticated
  USING ((select public.is_admin()))
  WITH CHECK ((select public.is_admin()));

CREATE POLICY payout_statement_lines_delete_unified ON public.payout_statement_lines
  FOR DELETE TO authenticated
  USING ((select public.is_admin()));

-- =============================================================================
-- 7. refunds  (SELECT: refunds_owner_read + refunds_staff_read)
-- =============================================================================

DROP POLICY IF EXISTS refunds_owner_read ON public.refunds;
DROP POLICY IF EXISTS refunds_staff_read ON public.refunds;

CREATE POLICY refunds_select_unified ON public.refunds
  FOR SELECT TO authenticated
  USING (
    ((select public.current_user_role()) = ANY (ARRAY['admin'::public.user_role, 'super_admin'::public.user_role, 'support'::public.user_role]))
    OR EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = refunds.order_id
        AND o.user_id = (select auth.uid())
    )
  );

-- =============================================================================
-- 8. supplier_branches  (SELECT x3, INSERT x2, UPDATE x2, DELETE x2)
-- =============================================================================
--
-- live: supplier_branches_admin_all    {authenticated}      ALL    admin/super_admin
--       supplier_branches_member_write {authenticated}      ALL    active owner/manager of the branch's supplier
--       supplier_branches_public_read  {anon,authenticated} SELECT is_active AND supplier not deleted

DROP POLICY IF EXISTS supplier_branches_admin_all ON public.supplier_branches;
DROP POLICY IF EXISTS supplier_branches_member_write ON public.supplier_branches;
DROP POLICY IF EXISTS supplier_branches_public_read ON public.supplier_branches;

CREATE POLICY supplier_branches_select_anon ON public.supplier_branches
  FOR SELECT TO anon
  USING (
    is_active
    AND EXISTS (
      SELECT 1 FROM public.suppliers s
      WHERE s.id = supplier_branches.supplier_id AND s.deleted_at IS NULL
    )
  );

CREATE POLICY supplier_branches_select_authenticated ON public.supplier_branches
  FOR SELECT TO authenticated
  USING (
    (
      is_active
      AND EXISTS (
        SELECT 1 FROM public.suppliers s
        WHERE s.id = supplier_branches.supplier_id AND s.deleted_at IS NULL
      )
    )
    OR ((select public.current_user_role()) = ANY (ARRAY['admin'::public.user_role, 'super_admin'::public.user_role]))
    OR EXISTS (
      SELECT 1 FROM public.supplier_members m
      WHERE m.supplier_id = supplier_branches.supplier_id
        AND m.user_id = (select auth.uid())
        AND m.is_active
        AND m.member_role = ANY (ARRAY['owner'::public.supplier_member_role, 'manager'::public.supplier_member_role])
    )
  );

CREATE POLICY supplier_branches_insert_unified ON public.supplier_branches
  FOR INSERT TO authenticated
  WITH CHECK (
    ((select public.current_user_role()) = ANY (ARRAY['admin'::public.user_role, 'super_admin'::public.user_role]))
    OR EXISTS (
      SELECT 1 FROM public.supplier_members m
      WHERE m.supplier_id = supplier_branches.supplier_id
        AND m.user_id = (select auth.uid())
        AND m.is_active
        AND m.member_role = ANY (ARRAY['owner'::public.supplier_member_role, 'manager'::public.supplier_member_role])
    )
  );

CREATE POLICY supplier_branches_update_unified ON public.supplier_branches
  FOR UPDATE TO authenticated
  USING (
    ((select public.current_user_role()) = ANY (ARRAY['admin'::public.user_role, 'super_admin'::public.user_role]))
    OR EXISTS (
      SELECT 1 FROM public.supplier_members m
      WHERE m.supplier_id = supplier_branches.supplier_id
        AND m.user_id = (select auth.uid())
        AND m.is_active
        AND m.member_role = ANY (ARRAY['owner'::public.supplier_member_role, 'manager'::public.supplier_member_role])
    )
  )
  WITH CHECK (
    ((select public.current_user_role()) = ANY (ARRAY['admin'::public.user_role, 'super_admin'::public.user_role]))
    OR EXISTS (
      SELECT 1 FROM public.supplier_members m
      WHERE m.supplier_id = supplier_branches.supplier_id
        AND m.user_id = (select auth.uid())
        AND m.is_active
        AND m.member_role = ANY (ARRAY['owner'::public.supplier_member_role, 'manager'::public.supplier_member_role])
    )
  );

CREATE POLICY supplier_branches_delete_unified ON public.supplier_branches
  FOR DELETE TO authenticated
  USING (
    ((select public.current_user_role()) = ANY (ARRAY['admin'::public.user_role, 'super_admin'::public.user_role]))
    OR EXISTS (
      SELECT 1 FROM public.supplier_members m
      WHERE m.supplier_id = supplier_branches.supplier_id
        AND m.user_id = (select auth.uid())
        AND m.is_active
        AND m.member_role = ANY (ARRAY['owner'::public.supplier_member_role, 'manager'::public.supplier_member_role])
    )
  );

-- =============================================================================
-- 9. support_tickets  (SELECT: support_tickets_own_read + support_tickets_staff_read)
-- =============================================================================
--
-- support_tickets_staff_update is the only UPDATE policy and is left alone.

DROP POLICY IF EXISTS support_tickets_own_read ON public.support_tickets;
DROP POLICY IF EXISTS support_tickets_staff_read ON public.support_tickets;

CREATE POLICY support_tickets_select_unified ON public.support_tickets
  FOR SELECT TO authenticated
  USING (
    (select public.is_admin())
    OR (select public.is_support())
    OR user_id = (select auth.uid())
  );

-- =============================================================================
-- 10. support_ticket_messages  (SELECT: _own_read + _staff_read)
-- =============================================================================
--
-- Carries 203's `direction <> 'internal'` on the owner branch (see ORDER above).

DROP POLICY IF EXISTS support_ticket_messages_own_read ON public.support_ticket_messages;
DROP POLICY IF EXISTS support_ticket_messages_staff_read ON public.support_ticket_messages;

CREATE POLICY support_ticket_messages_select_unified ON public.support_ticket_messages
  FOR SELECT TO authenticated
  USING (
    (select public.is_admin())
    OR (select public.is_support())
    OR (
      direction <> 'internal'
      AND EXISTS (
        SELECT 1 FROM public.support_tickets t
        WHERE t.id = support_ticket_messages.ticket_id
          AND t.user_id = (select auth.uid())
      )
    )
  );

-- =============================================================================
-- 11. whatsapp_contacts  (SELECT: whatsapp_contacts_admin_read + whatsapp_contacts_own_read)
-- =============================================================================

DROP POLICY IF EXISTS whatsapp_contacts_admin_read ON public.whatsapp_contacts;
DROP POLICY IF EXISTS whatsapp_contacts_own_read ON public.whatsapp_contacts;

CREATE POLICY whatsapp_contacts_select_unified ON public.whatsapp_contacts
  FOR SELECT TO authenticated
  USING (
    (select public.is_admin())
    OR (select public.is_support())
    OR user_id = (select auth.uid())
  );

COMMIT;

-- =============================================================================
-- VERIFY
-- =============================================================================
--
-- 1. The advisor's own query (supabase/splinter, lint 0006) must return no row
--    for any of the eleven tables:
--
--   select c.relname, r.rolname, act.cmd, count(*)
--     from pg_policy p
--     join pg_class c on c.oid = p.polrelid
--     join pg_namespace n on n.oid = c.relnamespace
--     join pg_roles r on p.polroles @> array[r.oid] or p.polroles = array[0::oid],
--     lateral unnest(case p.polcmd when 'r' then array['SELECT'] when 'a' then array['INSERT']
--                    when 'w' then array['UPDATE'] when 'd' then array['DELETE']
--                    else array['SELECT','INSERT','UPDATE','DELETE'] end) act(cmd)
--    where n.nspname = 'public' and p.polpermissive and not r.rolbypassrls
--      and r.rolname not like 'pg_%'
--    group by 1, 2, 3 having count(*) > 1;
--   -- expect: 0 rows (project-wide, once 209 and this file are both in)
--
-- 2. Policy count per table, from pg_policies:
--    banners 5, homepage_sections 5, cashback_ledger 1, payment_events 1,
--    payout_statements 4, payout_statement_lines 4, refunds 1,
--    supplier_branches 5, support_tickets 2, support_ticket_messages 1,
--    whatsapp_contacts 1.
--
-- 3. Behaviour: with the anon key, `GET /rest/v1/banners` and
--    `/rest/v1/supplier_branches` still answer 200 (the split read keeps the
--    helper-free predicate on the anon policy); a customer's
--    `/rest/v1/cashback_ledger` still returns only their rows; an admin's
--    `/admin/payouts` still lists draft statements.
--
-- Reversal: re-run the CREATE POLICY statements of 127 (banners,
-- homepage_sections), 177 (cashback_ledger), 130 (payment_events), 152
-- (payout_*), 131 (refunds), 133 (supplier_branches), 173 (whatsapp_contacts)
-- and 181b/203 (support_*) after dropping the policies named here.
