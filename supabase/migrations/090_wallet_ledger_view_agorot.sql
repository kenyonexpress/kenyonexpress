-- 090_wallet_ledger_view_agorot.sql
--
-- LOCAL ONLY. NOT APPLIED TO PRODUCTION. Assumes 059 and 089.
--
-- v_wallet_ledger is what a customer sees under "the wallet" in their account.
-- It reads wallet_entries.amount_ils_legacy:
--
--     CASE WHEN e.credit_account = a.id THEN e.amount_ils_legacy
--          ELSE - e.amount_ils_legacy END AS signed_amount_ils
--
-- That column was frozen by 059 and nothing has written it since. 089 made
-- fn_wallet_transfer write amount_agorot, so every entry created from now on
-- has amount_agorot set and amount_ils_legacy NULL.
--
-- The view therefore shows a customer their pre-059 history and then stops:
-- cashback they earn today, a voucher expiry credit they are owed under C6, a
-- wallet payment they made at checkout - all of it lands in the table, none of
-- it appears. Worse than an error, because the page renders happily; the row is
-- simply absent, or present with a blank amount.
--
-- This was not visible until 089, because before it no wallet entry could be
-- written at all.
--
-- BOTH UNITS ARE EXPOSED. amount_agorot is the truth and new readers should
-- take it. amount_ils and signed_amount_ils stay, derived, because
-- src/server/queries/account.ts selects them by name and a view that drops a
-- column its caller names fails the whole select with 42703 - which is the
-- exact class of bug this migration exists to clean up.
--
-- Idempotent, forward-only. CREATE OR REPLACE VIEW cannot drop or reorder
-- existing columns, and this adds one at the end, so the replace is legal.

CREATE OR REPLACE VIEW public.v_wallet_ledger AS
  SELECT e.id,
         a.user_id,
         CASE
           WHEN e.credit_account = a.id THEN 'credit'::text
           ELSE 'debit'::text
         END AS direction,
         CASE
           WHEN e.credit_account = a.id
             THEN round(coalesce(e.amount_agorot, 0)::numeric / 100, 2)::numeric(12,2)
           ELSE - round(coalesce(e.amount_agorot, 0)::numeric / 100, 2)::numeric(12,2)
         END AS signed_amount_ils,
         round(coalesce(e.amount_agorot, 0)::numeric / 100, 2)::numeric(12,2) AS amount_ils,
         e.reason,
         e.order_id,
         e.created_at,
         -- The canonical value. Everything above is derived from it.
         coalesce(e.amount_agorot, 0) AS amount_agorot
    FROM public.wallet_entries e
    JOIN public.wallet_accounts a
      ON a.id = e.debit_account OR a.id = e.credit_account
   WHERE a.user_id IS NOT NULL;

COMMENT ON VIEW public.v_wallet_ledger IS
  'Customer-facing wallet history. amount_agorot is canonical; amount_ils and signed_amount_ils are derived from it and kept because existing callers select them by name. Read amount_agorot in new code (090).';
