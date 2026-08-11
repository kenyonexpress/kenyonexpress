-- ============================================================================
-- PENDING: explicit policies for the eight RLS-enabled, zero-policy tables
-- ============================================================================
--
-- STATUS: NOT APPLIED. Files only. Applied through MCP apply_migration by
-- Claude Web, never db push, never from this session.
--
-- Measured on 2026-08-11. All eight have `relrowsecurity = true` and exactly
-- zero policies:
--
--   invoices, payment_webhook_events, rate_limits, referral_signals,
--   search_index_dlq, settlement_events, stock_reservations, user_rate_limits
--
-- ----------------------------------------------------------------------------
-- WHAT THIS FILE DOES AND DOES NOT CHANGE -- READ BEFORE CALLING IT A FIX
-- ----------------------------------------------------------------------------
--
-- RLS enabled with no policy is DENY ALL for every role that is not the table
-- owner and does not hold BYPASSRLS. These eight tables are therefore already
-- unreadable by anon and by authenticated. They are not a hole today.
--
-- So this migration does not close a leak; it does two narrower things:
--
--   1. It OPENS a deliberate, admin-only read path where there is none, so that
--      support can see an invoice or a webhook event without service_role.
--      Adding a SELECT policy is a widening, not a hardening, and it is worth
--      being plain about that.
--
--   2. It removes the table-level GRANTs to anon and authenticated, which do
--      still exist on all eight and are currently neutralised only by RLS.
--      That pairing is one `ALTER TABLE ... DISABLE ROW LEVEL SECURITY` away
--      from being a real leak, and the grant is what makes that one statement
--      catastrophic instead of merely wrong. Defence in depth: the grant should
--      not have been there either.
--
-- Writes are not granted to anybody. service_role bypasses RLS and keeps
-- writing exactly as it does now; every one of these tables is written by cron,
-- webhooks or server actions, never by a browser.
--
-- ----------------------------------------------------------------------------
-- WHY (select public.is_admin()) AND NOT public.is_admin()
-- ----------------------------------------------------------------------------
--
-- Wrapping the call in a scalar subquery makes Postgres evaluate it ONCE per
-- statement instead of once per row (initplan rather than per-tuple filter).
-- On settlement_events and payment_webhook_events, which grow without bound,
-- the per-row form turns an admin list view into one SECURITY DEFINER call per
-- row. This is the form the rest of this database already uses.
--
-- is_admin() covers admin AND super_admin, is SECURITY DEFINER with search_path
-- pinned to public, and stays anon-executable after 110_rpc_lockdown.sql. The
-- ordering between the two files does not matter: neither depends on the other.

-- ---------------------------------------------------------------------------
-- 1. Admin-only SELECT. No INSERT, UPDATE or DELETE policy anywhere in here.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "invoices: admin read" ON public.invoices;
CREATE POLICY "invoices: admin read" ON public.invoices
  FOR SELECT TO authenticated USING ((select public.is_admin()));

DROP POLICY IF EXISTS "payment_webhook_events: admin read" ON public.payment_webhook_events;
CREATE POLICY "payment_webhook_events: admin read" ON public.payment_webhook_events
  FOR SELECT TO authenticated USING ((select public.is_admin()));

DROP POLICY IF EXISTS "rate_limits: admin read" ON public.rate_limits;
CREATE POLICY "rate_limits: admin read" ON public.rate_limits
  FOR SELECT TO authenticated USING ((select public.is_admin()));

DROP POLICY IF EXISTS "referral_signals: admin read" ON public.referral_signals;
CREATE POLICY "referral_signals: admin read" ON public.referral_signals
  FOR SELECT TO authenticated USING ((select public.is_admin()));

DROP POLICY IF EXISTS "search_index_dlq: admin read" ON public.search_index_dlq;
CREATE POLICY "search_index_dlq: admin read" ON public.search_index_dlq
  FOR SELECT TO authenticated USING ((select public.is_admin()));

DROP POLICY IF EXISTS "settlement_events: admin read" ON public.settlement_events;
CREATE POLICY "settlement_events: admin read" ON public.settlement_events
  FOR SELECT TO authenticated USING ((select public.is_admin()));

DROP POLICY IF EXISTS "stock_reservations: admin read" ON public.stock_reservations;
CREATE POLICY "stock_reservations: admin read" ON public.stock_reservations
  FOR SELECT TO authenticated USING ((select public.is_admin()));

DROP POLICY IF EXISTS "user_rate_limits: admin read" ON public.user_rate_limits;
CREATE POLICY "user_rate_limits: admin read" ON public.user_rate_limits
  FOR SELECT TO authenticated USING ((select public.is_admin()));

-- ---------------------------------------------------------------------------
-- 2. Take the table grants off anon and authenticated
-- ---------------------------------------------------------------------------
--
-- The SELECT policies above are what admins read through, and a policy grants
-- row visibility only to a role that already holds the table privilege. So
-- authenticated keeps SELECT; it is the write privileges that go, on both roles,
-- along with anon's read.
--
-- settlement_events additionally carries settlement_events_no_rewrite, a
-- SECURITY DEFINER trigger that refuses UPDATE and DELETE outright. Revoking
-- the grant means the trigger stops being the only thing standing between a
-- misconfigured client and the money ledger.

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.invoices, public.payment_webhook_events, public.rate_limits,
     public.referral_signals, public.search_index_dlq, public.settlement_events,
     public.stock_reservations, public.user_rate_limits
  FROM anon, authenticated;

REVOKE SELECT
  ON public.invoices, public.payment_webhook_events, public.rate_limits,
     public.referral_signals, public.search_index_dlq, public.settlement_events,
     public.stock_reservations, public.user_rate_limits
  FROM anon;

-- ============================================================================
-- VERIFICATION (run after applying; expected results inline)
-- ============================================================================
--
-- 1. Every one of the eight now has exactly one policy (expect 8 rows, all 1):
--
--      SELECT tablename, count(*) FROM pg_policies
--       WHERE schemaname='public' AND tablename IN
--         ('invoices','payment_webhook_events','rate_limits','referral_signals',
--          'search_index_dlq','settlement_events','stock_reservations',
--          'user_rate_limits')
--       GROUP BY 1 ORDER BY 1;
--
-- 2. anon holds nothing at all on them (expect 0):
--
--      SELECT count(*) FROM information_schema.role_table_grants
--       WHERE table_schema='public' AND grantee='anon' AND table_name IN
--         ('invoices','payment_webhook_events','rate_limits','referral_signals',
--          'search_index_dlq','settlement_events','stock_reservations',
--          'user_rate_limits');
--
-- 3. authenticated holds SELECT and nothing else (expect only SELECT):
--
--      SELECT DISTINCT privilege_type FROM information_schema.role_table_grants
--       WHERE table_schema='public' AND grantee='authenticated' AND table_name IN
--         ('invoices','settlement_events') ORDER BY 1;
--
-- 4. A non-admin authenticated user still sees nothing (expect 0 rows, NOT an
--    error -- the policy returns false rather than denying the table):
--
--      SET LOCAL ROLE authenticated;
--      SELECT count(*) FROM public.settlement_events;
--      RESET ROLE;
--
-- 5. The writers are untouched. service_role bypasses RLS, so the cron and
--    webhook paths must still insert (expect the row count to keep moving):
--
--      SELECT count(*) FROM public.payment_webhook_events;
--
-- ============================================================================
