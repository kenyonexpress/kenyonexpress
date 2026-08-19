-- ============================================================================
-- PENDING 125: revoke EXECUTE on the six SECURITY DEFINER functions that
--              nothing reachable calls
-- ============================================================================
-- STATUS: DRAFT, NOT APPLIED. Requires Ofir's explicit approval, then MCP
-- apply_migration. Never `db push`.
--
-- Produced by AUTOPILOT step (10). Full reasoning and every measurement:
-- docs/DB-HARDENING-AUDIT.md.
--
-- ----------------------------------------------------------------------------
-- WHAT THIS IS NOT
-- ----------------------------------------------------------------------------
--
-- It is NOT an attempt to reach the step's stated "0 WARN advisors". That
-- target is unreachable without taking the site down, and the number that
-- settles it is this one:
--
--     is_admin() is referenced by 79 RLS policies.
--
-- A policy expression is evaluated with the privileges of the querying role, so
-- revoking EXECUTE on is_admin from `authenticated` -- the advisor's own first
-- suggested remediation -- makes 79 policies raise
-- `permission denied for function is_admin` for every signed-in user. The same
-- holds for has_role (17 policies), is_support (8), current_user_role (7),
-- is_supplier_member (6) and is_supplier_owner (4).
--
-- Five more are called over REST with a USER-SESSION client, so `authenticated`
-- (and for one of them `anon`) genuinely needs EXECUTE:
--   redeem_voucher, log_voucher_scan, verify_supplier_staff_pin,
--   check_rate_limit (anon too: guest rate limiting runs on the guest client),
--   fn_record_recent_search.
--
-- 20 of the 26 definer warnings are therefore the advisor describing this
-- architecture correctly and disapproving of it. Clearing them means moving the
-- helpers into a `private` schema and rewriting 123 policy references. That is
-- a project with a staging rehearsal, not a warning sweep, and it is item 3 of
-- the audit's recommendation list.
--
-- ----------------------------------------------------------------------------
-- WHAT THIS IS
-- ----------------------------------------------------------------------------
--
-- The six functions measured to have NO reachable caller at all. For each:
-- zero RLS policy references, zero view references, zero calls from any other
-- function, and zero rpc() callsites in src/.
--
--   MEASURED 2026-08-19, project ixvwfbuvfxxsjiywhbbb:
--
--   fn                          other_fns  policies  views  rest
--   current_supplier_id()            0         0       0      0
--   fn_ensure_referral_code(uuid)    0         0       0      0
--   fn_wallet_cashback_amount(...)   0         0       0      0
--   fn_wallet_cashback_percent(...)  0         0       0      0
--   supplier_app_context()           0         0       0      0
--   voucher_success_payload(v)       1         0       0      0
--
-- voucher_success_payload's single caller is itself SECURITY DEFINER, so the
-- inner call executes as the definer and the outer role's grant does not apply.
-- It is the one row above that is not a clean zero, so it is named rather than
-- averaged away. If that assumption is wrong, this file's rollback is one
-- statement and the failure is a 42501 on a path nothing currently takes.
--
-- Effect: 6 of 39 WARN advisors clear. No reachable code path changes.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. The revokes
-- ---------------------------------------------------------------------------
-- service_role is untouched throughout: every one of these, if it is ever
-- called again, is called from the server with the service key.
--
-- PUBLIC is revoked as well as the two named roles. A grant to PUBLIC is what
-- put most of these in the advisor in the first place, and revoking only anon
-- and authenticated would leave the PUBLIC grant behind them, which is the
-- shape of fix that looks applied and is not.

REVOKE EXECUTE ON FUNCTION public.current_supplier_id()
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_ensure_referral_code(uuid)
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_wallet_cashback_amount(uuid, numeric, uuid[])
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_wallet_cashback_percent(uuid, numeric, uuid[])
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.supplier_app_context()
  FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.voucher_success_payload(public.vouchers)
  FROM PUBLIC, anon, authenticated;

-- ============================================================================
-- VERIFICATION (after applying)
-- ============================================================================
--
-- 1. The grants are gone. Expect six rows, all with an empty acl for anon and
--    authenticated:
--
--      SELECT p.proname,
--             pg_catalog.array_to_string(p.proacl, E'\n') AS acl
--        FROM pg_proc p
--        JOIN pg_namespace n ON n.oid = p.pronamespace
--       WHERE n.nspname = 'public'
--         AND p.proname IN ('current_supplier_id','fn_ensure_referral_code',
--                           'fn_wallet_cashback_amount','fn_wallet_cashback_percent',
--                           'supplier_app_context','voucher_success_payload');
--
-- 2. The advisor count drops by exactly six, and NOT more. Re-run
--    get_advisors(type='security') and confirm:
--      anon_security_definer_function_executable          4  -> 4   (unchanged)
--      authenticated_security_definer_function_executable 22 -> 16
--
--    If `anon` moved at all, something in this file hit a function the audit
--    said was anon-callable, and it should be rolled back and re-measured.
--
-- 3. The app is unaffected. The specific things to exercise, because they are
--    the ones a mistake here would break:
--      - supplier PIN entry            /api/supplier/app/pin
--      - a voucher scan                /api/supplier/vouchers/redeem
--      - a guest search (anon rate limiting)
--      - the checkout success page (voucher payload rendering)
--
-- ROLLBACK
--
--   GRANT EXECUTE ON FUNCTION public.current_supplier_id()                           TO anon, authenticated;
--   GRANT EXECUTE ON FUNCTION public.fn_ensure_referral_code(uuid)                   TO anon, authenticated;
--   GRANT EXECUTE ON FUNCTION public.fn_wallet_cashback_amount(uuid, numeric, uuid[]) TO anon, authenticated;
--   GRANT EXECUTE ON FUNCTION public.fn_wallet_cashback_percent(uuid, numeric, uuid[]) TO anon, authenticated;
--   GRANT EXECUTE ON FUNCTION public.supplier_app_context()                          TO anon, authenticated;
--   GRANT EXECUTE ON FUNCTION public.voucher_success_payload(public.vouchers)         TO anon, authenticated;
-- ============================================================================
