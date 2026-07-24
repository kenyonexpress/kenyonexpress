-- ============================================================================
-- 060_money_rls.sql  (spec number 039; renumbered 033->050 ... 039->056
-- because 033-035 already exist in this tree and 049 was the last used
-- number; see LEDGER-DESIGN.md section 0)
--
-- RLS for every table introduced in 050-055.
-- Policy model:
--   - All WRITES are server-only: no INSERT/UPDATE/DELETE policy exists for
--     any client role on any of these tables; only service_role (which
--     bypasses RLS) writes. Ledger immutability is additionally enforced by
--     the 050 triggers, which bind service_role too.
--   - Admin READ via public.is_admin() on ledger, settlement and
--     reconciliation tables.
--   - Customer read-own for wallet: a customer sees their own customer_wallet
--     ledger account and its journal lines.
--   - Customer read-own for redemptions: a customer sees redemptions of their
--     own coupon codes. (026, where applied, already grants owner/supplier
--     reads under differently named policies; permissive policies OR
--     together, so re-stating the canonical set here is safe.)
--   - idempotency_keys: pure server infrastructure, no client policy at all
--     (default deny for every client role).
--
-- ROLLBACK NOTE: policies only. To roll back, run the DROP POLICY IF EXISTS
-- statements below without the matching CREATE POLICY statements. Leave
-- ENABLE ROW LEVEL SECURITY in place: disabling RLS on money tables is never
-- a valid rollback.
-- ============================================================================

-- 1. Defensive enable (idempotent even where 050-055 already enabled) --------

ALTER TABLE public.ledger_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_journals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ledger_journal_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.idempotency_keys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settlement_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.settlement_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reconciliation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reconciliation_discrepancies ENABLE ROW LEVEL SECURITY;

-- 2. Ledger ------------------------------------------------------------------

-- Accounts: admin reads all; a customer reads their own wallet account.
DROP POLICY IF EXISTS ledger_accounts_admin_read ON public.ledger_accounts;
CREATE POLICY ledger_accounts_admin_read ON public.ledger_accounts
  FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS ledger_accounts_owner_read ON public.ledger_accounts;
CREATE POLICY ledger_accounts_owner_read ON public.ledger_accounts
  FOR SELECT TO authenticated
  USING (
    kind = 'customer_wallet'::public.ledger_account_kind
    AND user_id = auth.uid()
  );

-- Journals: admin read only. Customers see their wallet activity through the
-- lines policy below; journal headers may reference other parties' data.
DROP POLICY IF EXISTS ledger_journals_admin_read ON public.ledger_journals;
CREATE POLICY ledger_journals_admin_read ON public.ledger_journals
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- Lines: admin reads all; a customer reads lines posted to their own wallet
-- account (read-own wallet history straight from the source of truth).
DROP POLICY IF EXISTS ledger_journal_lines_admin_read ON public.ledger_journal_lines;
CREATE POLICY ledger_journal_lines_admin_read ON public.ledger_journal_lines
  FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS ledger_journal_lines_wallet_owner_read ON public.ledger_journal_lines;
CREATE POLICY ledger_journal_lines_wallet_owner_read ON public.ledger_journal_lines
  FOR SELECT TO authenticated
  USING (
    account_id IN (
      SELECT a.id FROM public.ledger_accounts a
      WHERE a.kind = 'customer_wallet'::public.ledger_account_kind
        AND a.user_id = auth.uid()
    )
  );

-- 3. idempotency_keys: server-only, no client policies at all ----------------

DROP POLICY IF EXISTS idempotency_keys_admin_read ON public.idempotency_keys;
-- (intentionally no CREATE POLICY: default deny for anon and authenticated)

-- 4. coupon_redemptions: customer read-own + admin read ----------------------

DROP POLICY IF EXISTS coupon_redemptions_owner_read ON public.coupon_redemptions;
CREATE POLICY coupon_redemptions_owner_read ON public.coupon_redemptions
  FOR SELECT TO authenticated
  USING (
    coupon_code_id IN (
      SELECT cc.id FROM public.coupon_codes cc WHERE cc.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS coupon_redemptions_admin_read ON public.coupon_redemptions;
CREATE POLICY coupon_redemptions_admin_read ON public.coupon_redemptions
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- 5. Settlement: server-only writes, admin read ------------------------------
-- Supplier-member read is intentionally NOT granted here; it lands with the
-- supplier portal phase once is_supplier_member is real (046 ships a stub).

DROP POLICY IF EXISTS settlement_batches_admin_read ON public.settlement_batches;
CREATE POLICY settlement_batches_admin_read ON public.settlement_batches
  FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS settlement_items_admin_read ON public.settlement_items;
CREATE POLICY settlement_items_admin_read ON public.settlement_items
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- 6. Reconciliation: server-only writes, admin read --------------------------

DROP POLICY IF EXISTS reconciliation_runs_admin_read ON public.reconciliation_runs;
CREATE POLICY reconciliation_runs_admin_read ON public.reconciliation_runs
  FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS reconciliation_discrepancies_admin_read ON public.reconciliation_discrepancies;
CREATE POLICY reconciliation_discrepancies_admin_read ON public.reconciliation_discrepancies
  FOR SELECT TO authenticated
  USING (public.is_admin());
