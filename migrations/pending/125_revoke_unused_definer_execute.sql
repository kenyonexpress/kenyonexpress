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
--
-- ----------------------------------------------------------------------------
-- PRIORITY CORRECTION, added 2026-08-20 by a verification cycle
-- ----------------------------------------------------------------------------
--
-- Everything above frames these six as least-privilege hygiene: unused, so
-- revoke. That is true of five of them. It UNDERSTATES the third one, and the
-- difference decides whether this file waits or goes in.
--
--   fn_ensure_referral_code(p_user_id uuid) never looks at auth.uid().
--
-- Re-read the body against production on 2026-08-20. It takes the target's id
-- entirely from its caller, and the first thing it does is
--
--     SELECT referral_code INTO v_existing FROM public.profiles WHERE id = p_user_id;
--     IF v_existing IS NOT NULL THEN RETURN v_existing; END IF;
--
-- It is SECURITY DEFINER, so it does not read profiles as the caller and RLS on
-- profiles never applies. While the grant stands, ANY signed-in user who knows
-- another user's profile uuid can call /rest/v1/rpc/fn_ensure_referral_code and
-- (a) read that user's referral code, and (b) if they have none yet, MINT one
-- into their profiles row. That is an unauthorised read plus an unauthorised
-- write on another user's row, not merely a dead grant.
--
-- Bounding it honestly: the caller must already know the victim's profile uuid,
-- which is not enumerable through this function, and a referral code is not
-- money. So this is not an emergency. But "unused" is the wrong reason to
-- prioritise the revoke, and a future reader deciding whether this file is
-- urgent should see the real one.
--
-- The same missing check applies to fn_wallet_cashback_percent and
-- fn_wallet_cashback_amount, which also take p_user_id and never compare it to
-- auth.uid(). Those are STABLE and write nothing, so the exposure is limited to
-- disclosing another user's cashback tier, which reveals a bucket of their paid
-- order count.
--
-- The contrast that proves this is an oversight and not a convention:
-- fn_record_recent_search, in the same schema and also SECURITY DEFINER, takes
-- no user id at all and derives it with `v_user uuid := auth.uid()`. That is
-- the correct shape.
--
-- If these three are ever re-granted, the GRANT must be paired with an
-- `IF p_user_id <> auth.uid() THEN RAISE` guard inside each body, or the same
-- hole returns with the grant.
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
