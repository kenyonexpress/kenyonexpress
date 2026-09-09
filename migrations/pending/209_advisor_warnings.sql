-- 209_advisor_warnings.sql
--
-- The advisor warnings that can be fixed without changing who can read what.
--
-- =============================================================================
-- WHAT THE ADVISORS SAY, MEASURED 2026-09-09
-- =============================================================================
--
--   SECURITY
--     WARN  function_search_path_mutable                    3
--     WARN  anon_security_definer_function_executable       2
--     WARN  authenticated_security_definer_function_executable  21
--     INFO  rls_enabled_no_policy                           1
--
--   PERFORMANCE
--     WARN  auth_rls_initplan                               6
--     WARN  multiple_permissive_policies                   19
--     INFO  unindexed_foreign_keys                          8
--     INFO  unused_index                                  197
--
-- [63] asks for zero WARN. THIS FILE DOES NOT GET THERE, and the two categories
-- it leaves are left deliberately rather than missed.
--
-- =============================================================================
-- WHY THE 23 DEFINER WARNINGS CANNOT GO TO ZERO
-- =============================================================================
--
-- The advisor's remediation is "revoke EXECUTE or switch to SECURITY INVOKER".
-- Measured against the live policies:
--
--   is_admin()                    called by  93 policies
--   has_role(text)                           19
--   is_support()                             13
--   current_user_role()                      11
--   is_supplier_member(uuid)                 10
--   is_supplier_owner(uuid)                   4
--
-- An RLS policy expression is evaluated AS THE CALLING ROLE, so `authenticated`
-- must hold EXECUTE on every one of those or 93 policies start throwing
-- permission errors - which is to say the entire admin panel, the supplier
-- console and the account area stop working. `SECURITY INVOKER` is worse: these
-- functions read `profiles.role`, and `profiles` is itself behind RLS, so an
-- invoker-rights `is_admin()` would consult a policy that calls `is_admin()`.
--
-- The `anon` half is the same story through one policy:
-- `seo_redirects_select_unified` is `(is_admin() OR is_active)` for
-- `{anon, authenticated}`. Revoking `is_admin` from anon breaks it.
--
-- What IS true and is worth stating plainly: an anonymous caller can POST to
-- `/rest/v1/rpc/is_admin` and get `false`, and to `/rest/v1/rpc/is_supplier_member`
-- with any uuid and get `false`. Neither leaks anything - the second returns
-- false for a supplier that exists and for one that does not, because it tests
-- membership of the CALLER, and an anonymous caller is a member of nothing.
--
-- =============================================================================
-- WHY THE 19 MULTIPLE-PERMISSIVE WARNINGS ARE NOT TOUCHED HERE
-- =============================================================================
--
-- Merging two permissive policies into one `OR` is a rewrite of an access
-- control rule on 19 tables, including `cashback_ledger`, `payment_events` and
-- `payout_statement_lines` - money. The advisor's complaint is that Postgres
-- evaluates both and ORs them, which costs planning time on a database whose
-- largest table is 44 rows.
--
-- That is a real cost at scale and it is not worth paying for it with a blind
-- rewrite of nineteen money-adjacent policies in a session that cannot exercise
-- them. It is in `docs/POST-LAUNCH-BACKLOG.md` with this reasoning.
--
-- =============================================================================
-- WHY THE 8 UNINDEXED FOREIGN KEYS ARE NOT INDEXED
-- =============================================================================
--
-- 208, written the same day, drops 14 redundant indexes and argues that this
-- database is 60% index by size with 253 indexes never scanned. Adding eight
-- more, for foreign keys on tables holding no rows, to satisfy an INFO-level
-- advisory would contradict it in the same directory. They are worth adding
-- when a cascade delete becomes slow, which is a thing that can be observed.

BEGIN;

-- =============================================================================
-- 1. function_search_path_mutable  (3 WARN -> 0)
-- =============================================================================
--
-- All three are SECURITY INVOKER, so this is defence in depth rather than a
-- live hole: without a pinned path, a caller who can create objects could
-- shadow a function these call. All three call only `pg_catalog` builtins
-- (`now`, `regexp_replace`, `left`, `substr`, `length`), and `pg_catalog` is
-- searched implicitly even with an empty path, so `''` changes no resolution.
--
-- ALTER and not CREATE OR REPLACE: replacing a function resets its grants, and
-- `set_updated_at` is attached to triggers on dozens of tables.

ALTER FUNCTION public.set_updated_at() SET search_path = '';
ALTER FUNCTION public.fn_cashback_ledger_block_mutation() SET search_path = '';
ALTER FUNCTION public.fn_il_phone_digits(text) SET search_path = '';

-- =============================================================================
-- 2. auth_rls_initplan  (6 WARN -> 0)
-- =============================================================================
--
-- `auth.uid() = user_id` is re-evaluated PER ROW, because the planner treats
-- the function call as part of the row filter. `(select auth.uid()) = user_id`
-- is an InitPlan: evaluated once for the whole statement and then compared as a
-- constant. Same result, same rows, one call instead of N.
--
-- ALTER POLICY and not DROP + CREATE, so there is no instant at which the table
-- is readable without the policy. A DROP + CREATE inside a transaction is safe
-- too, but only because of the transaction, and this does not depend on it.

ALTER POLICY push_subscriptions_select_own ON public.push_subscriptions
  USING ((select auth.uid()) = user_id);

ALTER POLICY push_subscriptions_delete_own ON public.push_subscriptions
  USING ((select auth.uid()) = user_id);

ALTER POLICY webauthn_credentials_select_own ON public.webauthn_credentials
  USING ((select auth.uid()) = user_id);

ALTER POLICY webauthn_credentials_delete_own ON public.webauthn_credentials
  USING ((select auth.uid()) = user_id);

ALTER POLICY cashback_ledger_owner_select ON public.cashback_ledger
  USING (user_id = (select auth.uid()));

-- The RESTRICTIVE one. `auth.jwt()` was already wrapped; `current_user_role()`
-- was not, and it is the one that reads `profiles` - so per-row evaluation here
-- costs a lookup per row rather than a function call per row.
--
-- THE SHAPE IS PRESERVED EXACTLY, including the `COALESCE(..., 'aal1')`: a JWT
-- with no `aal` claim must read as `aal1` and be REFUSED for a super_admin, and
-- turning that coalesce into a null comparison would make it read as unknown
-- and let the update through.
ALTER POLICY profiles_super_admin_mfa ON public.profiles
  USING (
    ((select current_user_role())::text <> 'super_admin'::text)
    OR (COALESCE((SELECT auth.jwt() ->> 'aal'), 'aal1'::text) = 'aal2'::text)
  );

COMMIT;
