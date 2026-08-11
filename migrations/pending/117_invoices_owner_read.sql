-- 117: invoices gets the owner-read policy it never had.
--
-- STATUS: APPLIED to production on 2026-08-12 through MCP apply_migration
-- (migration name `invoices_owner_read_policy`). Never db push.
--
-- WHY. `public.invoices` had RLS enabled and zero policies. That is not a hole,
-- it is the opposite: with RLS on and no policy, every non-service_role read
-- returns nothing, so a customer could not see their own invoice either. The
-- security advisor reported it as `rls_enabled_no_policy` (INFO).
--
-- THE COLUMN THE BRIEF ASKED FOR DOES NOT EXIST. The instruction was
-- `user_id = auth.uid()`. `invoices` has no `user_id`. Its columns are:
--
--   id, order_id, payment_id, document_type, status, idempotency_key,
--   total_agorot, net_agorot, vat_agorot, vat_percent, document_number,
--   document_url, issued_at, provider, provider_response, attempts,
--   next_attempt_at, last_error, created_at, updated_at
--
-- Ownership is reachable only through order_id -> orders.user_id, so the policy
-- joins. A file written against the brief verbatim would have failed with
-- 42703 (undefined column) rather than applying something wrong, but it would
-- have failed silently in the sense that nobody would have learned WHY.
--
-- auth.uid() is wrapped in a scalar subquery so the planner hoists it into an
-- InitPlan and evaluates it once per statement instead of once per row.

DROP POLICY IF EXISTS "invoices: owner read" ON public.invoices;
CREATE POLICY "invoices: owner read" ON public.invoices
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = public.invoices.order_id
        AND o.user_id = (SELECT auth.uid())
    )
  );

-- ============================================================================
-- VERIFICATION (run after applying)
-- ============================================================================
--
-- The advisor stops reporting invoices under rls_enabled_no_policy. Confirmed
-- on 2026-08-12: the INFO list dropped from 9 tables to 8, and `invoices` is
-- the one that left. The remaining 8 are deliberate: legacy_percent_archive_112,
-- payment_webhook_events, rate_limits, referral_signals, search_index_dlq,
-- settlement_events, stock_reservations, user_rate_limits -- all service_role
-- only, none of them customer-facing.
--
--   SELECT policyname, roles, qual FROM pg_policies
--    WHERE schemaname='public' AND tablename='invoices';
