-- 168: the wallet ledger becomes read-only for client roles.
--
-- WHY. DB-SECURITY-MODEL §4.3 draws the money block: payments, escrow_holds,
-- split_executions, wallet_accounts, wallet_entries are all SELECT-only for
-- clients, every write arriving through the server (service_role bypasses
-- RLS) or an audited SECURITY DEFINER function. wallet_balances and
-- wallet_transactions are the two tables that stick out (marathon step 6):
-- they carry authenticated INSERT/UPDATE/DELETE policies gated on is_admin().
--
-- That gate is real, but it is the WRONG DOOR: it lets an admin's browser
-- session write ledger rows directly, off the audited server path -- a money
-- movement with no audit_log row, no actor, no before/after. The ledger's
-- integrity rule ("append-only, every movement named") lives in the server
-- actions; a client-side write bypasses all of it. Measured 2026-09-04:
-- every code path that touches these tables (src/app/(admin)/admin/users,
-- apps/mobile/app/wallet.tsx) is SELECT-only, so no running feature loses
-- anything.
--
-- WHAT CHANGES. The six write policies are dropped. The two SELECT policies
-- (admin OR support OR owner, deleted_at-aware) are untouched. With RLS
-- enabled and no permissive policy for a command, that command is denied for
-- client roles; service_role is unaffected.
--
-- ROLLBACK (recreates the six policies exactly as measured on 2026-09-04):
--   CREATE POLICY wallet_balances_insert_unified ON public.wallet_balances
--     FOR INSERT TO authenticated WITH CHECK (is_admin());
--   CREATE POLICY wallet_balances_update_unified ON public.wallet_balances
--     FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
--   CREATE POLICY wallet_balances_delete_unified ON public.wallet_balances
--     FOR DELETE TO authenticated USING (is_admin());
--   CREATE POLICY wallet_transactions_insert_unified ON public.wallet_transactions
--     FOR INSERT TO authenticated WITH CHECK (is_admin());
--   CREATE POLICY wallet_transactions_update_unified ON public.wallet_transactions
--     FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
--   CREATE POLICY wallet_transactions_delete_unified ON public.wallet_transactions
--     FOR DELETE TO authenticated USING (is_admin());
--
-- NOT APPLIED. `migrations/pending/` is unapplied by definition.

DROP POLICY IF EXISTS wallet_balances_insert_unified ON public.wallet_balances;
DROP POLICY IF EXISTS wallet_balances_update_unified ON public.wallet_balances;
DROP POLICY IF EXISTS wallet_balances_delete_unified ON public.wallet_balances;

DROP POLICY IF EXISTS wallet_transactions_insert_unified ON public.wallet_transactions;
DROP POLICY IF EXISTS wallet_transactions_update_unified ON public.wallet_transactions;
DROP POLICY IF EXISTS wallet_transactions_delete_unified ON public.wallet_transactions;
