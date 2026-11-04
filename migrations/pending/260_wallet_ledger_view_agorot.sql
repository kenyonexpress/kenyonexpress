-- 260_wallet_ledger_view_agorot.sql
--
-- S23 (2026-11-04): the customer's wallet ledger in integer agorot.
--
-- MEASURED ON PRODUCTION BEFORE A LINE WAS WRITTEN (ixvwfbuvfxxsjiywhbbb):
--
--   wallet_entries.amount_ils          numeric, the value fn_wallet_transfer writes
--   wallet_entries.amount_ils_agorot   bigint GENERATED ALWAYS AS
--                                      round(amount_ils * 100)::bigint
--   1352 entries; 0 with a fractional agorah; 0 where the two disagree.
--
--   v_wallet_ledger (security_invoker=true) exposes amount_ils and
--   signed_amount_ils ONLY. The account page parses those shekel strings back
--   into agorot (server/queries/account.ts). Exact today, but it is the one
--   ledger read left that hands the application a decimal.
--
-- WHAT THIS FILE DOES, and only this:
--
--   1. Appends two integer columns to v_wallet_ledger, read from the generated
--      column, so the ledger answers in agorot end to end:
--        amount_agorot          bigint, always >= 0
--        signed_amount_agorot   bigint, + for a credit to the user, - for a debit
--      CREATE OR REPLACE VIEW may only APPEND columns; the eight existing ones
--      keep their names, types and order, so every current reader is untouched.
--      `WITH (security_invoker = true)` is restated: the view must keep reading
--      wallet_entries/wallet_accounts as the caller, under their RLS.
--
--   2. Grants. Measured: anon held SELECT on the view and authenticated held
--      INSERT/UPDATE/DELETE/TRUNCATE/REFERENCES/TRIGGER (the Supabase default
--      grant on every new relation). security_invoker plus the base-table RLS
--      already made those inert, and a join view is not auto-updatable, but a
--      ledger needs neither: revoked, leaving authenticated SELECT and
--      service_role. CREATE OR REPLACE keeps existing grants (only DROP+CREATE
--      resets them), so the REVOKE is the only grant change.
--
-- NO TABLE IS ALTERED. No data moves. fn_wallet_transfer keeps taking
-- p_amount_ils; the shekel conversion stays at that one boundary
-- (agorotToIls in src/lib/money.ts).
--
-- THE CODE RUNS WITHOUT THIS FILE. getWalletLedger selects the agorot columns
-- first and on 42703 falls back to the shekel columns it read before.
--
-- ROLLBACK (column removal needs DROP; re-grant afterwards):
--   DROP VIEW public.v_wallet_ledger;
--   CREATE VIEW public.v_wallet_ledger WITH (security_invoker = true) AS
--     <the eight-column body below, without the last two columns>;
--   GRANT SELECT ON public.v_wallet_ledger TO authenticated;

BEGIN;

CREATE OR REPLACE VIEW public.v_wallet_ledger
WITH (security_invoker = true) AS
SELECT
  e.id,
  a.user_id,
  CASE WHEN e.credit_account = a.id THEN 'credit'::text ELSE 'debit'::text END AS direction,
  CASE WHEN e.credit_account = a.id THEN e.amount_ils ELSE -e.amount_ils END AS signed_amount_ils,
  e.amount_ils,
  e.reason,
  e.order_id,
  e.created_at,
  e.amount_ils_agorot AS amount_agorot,
  CASE WHEN e.credit_account = a.id THEN e.amount_ils_agorot ELSE -e.amount_ils_agorot END AS signed_amount_agorot
FROM public.wallet_entries e
JOIN public.wallet_accounts a ON a.id = e.debit_account OR a.id = e.credit_account
WHERE a.user_id IS NOT NULL;

COMMENT ON VIEW public.v_wallet_ledger IS
  'Per-user wallet movements. *_agorot are integer agorot from wallet_entries.amount_ils_agorot (generated). See 260.';

REVOKE ALL ON public.v_wallet_ledger FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON public.v_wallet_ledger FROM authenticated;
GRANT SELECT ON public.v_wallet_ledger TO authenticated;

COMMIT;

-- What to check after applying:
--   SELECT column_name, data_type FROM information_schema.columns
--    WHERE table_name = 'v_wallet_ledger' ORDER BY ordinal_position;
--   -- expect ten columns, the last two bigint
--   SELECT grantee, privilege_type FROM information_schema.role_table_grants
--    WHERE table_name = 'v_wallet_ledger' AND grantee IN ('anon', 'authenticated');
--   -- expect exactly (authenticated, SELECT)
--   SELECT count(*) FROM public.v_wallet_ledger
--    WHERE signed_amount_agorot <> round(signed_amount_ils * 100);
--   -- expect 0
