-- ============================================================================
-- PENDING: RPC lockdown -- take anon off every function that never needed it
-- ============================================================================
--
-- STATUS: NOT APPLIED. Files only. Applied through MCP apply_migration by
-- Claude Web, never db push, never from this session.
--
-- Audited against the live catalog on 2026-08-11: 59 SECURITY DEFINER functions
-- in `public`, of which 14 are reachable by `anon` today.
--
-- ----------------------------------------------------------------------------
-- THE THING THAT MAKES A NAIVE VERSION OF THIS FILE A NO-OP
-- ----------------------------------------------------------------------------
--
-- Postgres grants EXECUTE to PUBLIC automatically on CREATE FUNCTION. Twelve of
-- the fourteen functions below carry that default grant, which is why the audit
-- shows `PUBLIC,anon,authenticated,service_role` rather than a list somebody
-- chose. PUBLIC means *every* role, including anon.
--
--   REVOKE EXECUTE ON FUNCTION f FROM anon;   -- anon can still call f
--
-- because the PUBLIC grant is still there and is checked independently. Every
-- revoke below therefore names PUBLIC first and anon second, and every function
-- that still needs a caller is re-granted explicitly afterwards. A file that
-- revoked only from anon would apply cleanly, change nothing, and read in the
-- git log as though the hole had been closed.
--
-- ----------------------------------------------------------------------------
-- TWO REVOKES FROM THE BRIEF THAT ARE NOT PERFORMED, AND WHY
-- ----------------------------------------------------------------------------
--
-- 1. check_rate_limit. The brief lists it for revocation. It is called from
--    src/lib/utils/rate-limit.ts through `createClient()`, the cookie-scoped
--    server client, which executes as the CALLER -- and its callers are
--    src/server/actions/auth.ts (login, signup, magic link, phone OTP, password
--    reset), newsletter.ts, supplier-lead.ts and guest cart writes. Every one of
--    those runs for a visitor with no session. Revoking anon here does not
--    harden login; it breaks login, signup and password reset outright.
--
-- 2. fn_record_recent_search. Also listed. src/app/(store)/search/page.tsx
--    calls `recordRecentSearch(await createClient(), q)` and passes the
--    cookie-scoped client deliberately, so the row is written as the visitor.
--    /search is a public page. anon is required.
--
--    Its sibling fn_record_search IS revoked: recordSearchTerm uses
--    createAdminClient() and runs as service_role. Same file, two functions,
--    two different identities -- which is exactly why each one was traced to its
--    call site rather than classified by name.
--
-- ----------------------------------------------------------------------------
-- CLASSIFICATION (Phase 1 result, every row traced to a call site)
-- ----------------------------------------------------------------------------
--
--   function                      class          anon after this file
--   ---------------------------------------------------------------------
--   check_rate_limit              CLIENT(anon)   KEEP  (auth.ts, unauthenticated)
--   fn_record_recent_search       CLIENT(anon)   KEEP  (search page, scoped client)
--   is_admin                      RLS-HELPER     KEEP  (13 anon-reachable policies)
--   is_supplier_member            RLS-HELPER     KEEP  (2 anon-reachable policies)
--   available_stock               SERVER-ONLY    revoke (createAdminClient)
--   fn_enqueue_notification       SERVER-ONLY    revoke (cron, finalize, invoices)
--   fn_record_search              SERVER-ONLY    revoke (createAdminClient)
--   log_voucher_scan              SERVER/AUTHED  revoke anon, keep authenticated
--   product_platform_percent      UNUSED         revoke both (no call site at all)
--   current_supplier_id           RLS-HELPER     revoke anon, keep authenticated
--   current_user_role             RLS-HELPER     revoke anon, keep authenticated
--   has_role                      RLS-HELPER     revoke anon, keep authenticated
--   is_support                    RLS-HELPER     revoke anon, keep authenticated
--   is_supplier_owner             RLS-HELPER     revoke anon, keep authenticated
--
-- Already anon-free, nothing to do, listed so the next audit does not re-open
-- the question: redeem_voucher, verify_supplier_staff_pin,
-- voucher_success_payload, fn_ensure_referral_code, fn_wallet_cashback_amount,
-- fn_wallet_cashback_percent (authenticated + service_role), and
-- fn_wallet_transfer, is_supplier_order, is_supplier_shipping_order
-- (service_role / authenticated only).
--
-- ----------------------------------------------------------------------------
-- WHY is_admin KEEPS anon, AGAINST THE OBVIOUS INSTINCT
-- ----------------------------------------------------------------------------
--
-- A policy expression is evaluated with the privileges of the querying role, so
-- the querying role needs EXECUTE on any function the expression calls.
-- Measured on 2026-08-11, is_admin() appears in 42 policies, 13 of which are
-- reachable by anon, on these tables:
--
--   carts, categories, coupon_codes, escrow_holds, notification_outbox,
--   payments, product_images, product_variants, products, split_executions,
--   suppliers, wallet_accounts, wallet_entries
--
-- `products` and `categories` are the storefront. Revoking anon EXECUTE on
-- is_admin() makes every anonymous SELECT against the catalogue fail, which is
-- the entire public site. is_supplier_member() is the same story on two tables.
--
-- Both stay reachable BY DESIGN, and they are safe to leave: each is a boolean
-- predicate over the caller's own auth.uid(), returns false for anon, takes no
-- attacker-supplied argument that widens what it reads, and leaks nothing an
-- anonymous caller could not already infer from being denied.

-- ---------------------------------------------------------------------------
-- 1. SERVER-ONLY: no browser, no anon, no authenticated
-- ---------------------------------------------------------------------------
--
-- Each is called exclusively through createAdminClient() (service_role), which
-- bypasses these grants entirely, so removing them costs nothing at runtime.

-- Signatures are the live ones, read off pg_get_function_identity_arguments on
-- 2026-08-11. Guessing them is not an option: REVOKE names one overload, and a
-- signature that matches nothing raises 42883 and fails the whole migration.
REVOKE EXECUTE ON FUNCTION public.available_stock(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_record_search(text, integer) FROM PUBLIC, anon, authenticated;

-- fn_enqueue_notification is called from four server paths (cron/reconcile,
-- cron/stock, payments/finalize, payments/invoices), all service_role.
--
-- IT IS OVERLOADED. Two functions share the name, differing only in a trailing
-- p_user_id, and a grant on one says nothing about the other. Revoking the
-- four-argument form alone would leave the five-argument form open to anon and
-- look, in the catalogue, as though the name had been locked down.
REVOKE EXECUTE ON FUNCTION public.fn_enqueue_notification(text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.fn_enqueue_notification(text, text, text, jsonb, uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. UNUSED: reachable by anon and called by nothing
-- ---------------------------------------------------------------------------
--
-- product_platform_percent appears exactly once in the repository, in the
-- generated file src/types/database.ts, which mirrors the schema rather than
-- calling it. There is no application caller in any client, server action,
-- route handler or script. It returns a product's commission rate to anyone who
-- asks, which is a business term, so it loses service_role's callers too:
-- nothing is left to break.

REVOKE EXECUTE ON FUNCTION public.product_platform_percent(uuid) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. AUTHENTICATED ONLY: revoke anon, re-grant the caller that exists
-- ---------------------------------------------------------------------------
--
-- log_voucher_scan is called two ways: with createAdminClient() from the public
-- /redeem/[token] page (service_role, unaffected), and with the
-- identity-scoped client from the supplier lookup and redeem routes. Those
-- routes refuse without a session, so the scoped identity is always
-- authenticated and never anon.

-- p_ip is text, not inet: scan-context.ts passes an unparseable header through
-- as NULL rather than failing a scan, and the column takes the string.
REVOKE EXECUTE ON FUNCTION public.log_voucher_scan(text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.log_voucher_scan(text, text, text, text, text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 4. RLS HELPERS with no anon-reachable policy
-- ---------------------------------------------------------------------------
--
-- Each of these was checked against pg_policies for a policy whose roles
-- include anon or public. All five returned zero. They remain available to
-- authenticated, which is where their policies live.

REVOKE EXECUTE ON FUNCTION public.current_supplier_id() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.current_supplier_id() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.current_user_role() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.current_user_role() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.has_role(text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.has_role(text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_support() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_support() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.is_supplier_owner(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.is_supplier_owner(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. The two that KEEP anon, made explicit rather than left to the default
-- ---------------------------------------------------------------------------
--
-- The PUBLIC grant is dropped even here. PUBLIC also covers roles that do not
-- exist yet; naming anon and authenticated states the intent and survives the
-- next role somebody adds.

REVOKE EXECUTE ON FUNCTION public.is_admin() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.is_supplier_member(uuid) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.is_supplier_member(uuid) TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.check_rate_limit(text, integer, integer) TO anon, authenticated;

REVOKE EXECUTE ON FUNCTION public.fn_record_recent_search(text) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.fn_record_recent_search(text) TO anon, authenticated;

-- ============================================================================
-- VERIFICATION (run after applying; expected results inline)
-- ============================================================================
--
-- 1. Exactly four functions remain anon-executable (expect check_rate_limit,
--    fn_record_recent_search, is_admin, is_supplier_member):
--
--      SELECT DISTINCT routine_name FROM information_schema.role_routine_grants
--       WHERE specific_schema='public' AND grantee='anon' ORDER BY 1;
--
-- 2. No PUBLIC grant survives on any function this file touched (expect 0):
--
--      SELECT count(*) FROM information_schema.role_routine_grants
--       WHERE specific_schema='public' AND grantee='PUBLIC'
--         AND routine_name IN ('available_stock','fn_record_search',
--           'fn_enqueue_notification','product_platform_percent',
--           'log_voucher_scan','current_supplier_id','current_user_role',
--           'has_role','is_support','is_supplier_owner','is_admin',
--           'is_supplier_member','check_rate_limit','fn_record_recent_search');
--
-- 3. THE STOREFRONT STILL LOADS FOR A LOGGED-OUT VISITOR. This is the check
--    that catches the is_admin mistake, and it must be run (expect > 0 rows,
--    NOT a permission error):
--
--      SET LOCAL ROLE anon;
--      SELECT count(*) FROM public.products WHERE status='active';
--      RESET ROLE;
--
-- 4. Login still works for a visitor with no session (expect true/false, not
--    "permission denied for function check_rate_limit"):
--
--      SET LOCAL ROLE anon;
--      SELECT public.check_rate_limit('audit-probe', 100, 60);
--      RESET ROLE;
--
-- ============================================================================
