-- 103_lock_definer_views_and_rpcs.sql
--
-- Goal 9 (security sweep). Three findings, all measured against production
-- through MCP on 2026-08-03, not read off a document.
--
-- FINDING 1 (the real one): seven views run as their owner `postgres`, which
-- bypasses RLS, and carry a full CRUD grant to `anon` and `authenticated`.
-- They are therefore readable over the public REST endpoint with nothing but
-- the publishable key. Measured, not assumed:
--
--   GET /rest/v1/v_newsletter_stats   -> 200  [{"total":0,...}]
--   GET /rest/v1/v_referral_stats     -> 200  [{"total":0,...}]
--   GET /rest/v1/v_wallet_balance_drift    -> 200 []
--   GET /rest/v1/v_referral_review_queue   -> 200 []
--   GET /rest/v1/v_abandoned_cart_recovery -> 200 []
--   GET /rest/v1/v_discount_campaign_performance -> 200 []
--
-- The four that returned `[]` did so only because those tables are empty in
-- production right now. The exposure is latent, not absent:
-- `v_referral_review_queue` selects `referrer_email` and `referred_email`, and
-- `v_wallet_balance_drift` selects `user_id` with the cached and ledger
-- balances. One referral or one wallet row makes real customer email addresses
-- and real balances world-readable.
--
-- Safe to lock because every reader in the app is service_role, which bypasses
-- RLS regardless of `security_invoker` (verified by grep, all four call sites
-- use `createAdminClient()`): admin/growth, admin/referrals,
-- api/cron/abandoned-cart, api/cron/reap-carts, lib/growth/client.ts.
-- `v_cart_reaper_backlog` has no reader in the app at all.
--
-- FINDING 2: eight trigger functions and two cron-only cleanup functions are
-- SECURITY DEFINER and EXECUTE-able over `/rest/v1/rpc/...`. Firing a trigger
-- does not check EXECUTE on the trigger function (that is checked once, at
-- CREATE TRIGGER), so revoking here cannot break a trigger.
-- `check_user_rate_limit` is revoked outright: it trusts a caller-supplied
-- `p_user_id`, so any anonymous caller could burn a named victim's quota and
-- lock them out, and it has **zero callers in the app** (grep) since
-- `checkUserRateLimit` in src/lib/utils/rate-limit.ts is dead code.
-- `check_rate_limit` KEEPS its grant: guest server actions call it under the
-- anon key, and revoking it makes the limiter fail open (it returns true on
-- error, by design, in rate-limit.ts:24).
--
-- THE TRAP: every one of these ACLs begins with `=X/postgres`, which is a
-- grant to PUBLIC. `REVOKE ... FROM anon, authenticated` alone changes
-- nothing, because both roles still inherit EXECUTE through PUBLIC. Every
-- revoke below names PUBLIC first for that reason.
--
-- FINDING 3: four SECURITY DEFINER functions have a mutable search_path.
-- `handle_new_user` is the one that matters: it is the SECURITY DEFINER
-- trigger on auth.users that writes public.profiles.
--
-- Idempotent: ALTER/REVOKE/GRANT are all safe to re-run.

begin;

-- ---------------------------------------------------------------------------
-- 1. Views: evaluate RLS as the caller, and stop handing them to the public.
-- ---------------------------------------------------------------------------
-- NOTE for whoever applies PENDING-money-integer-fix.sql: that migration drops
-- and recreates `v_wallet_balance_drift` in agorot. A recreated view does NOT
-- inherit these settings -- it must re-apply both the `security_invoker` and
-- the REVOKE, or this hole reopens silently.

alter view public.v_abandoned_cart_recovery       set (security_invoker = on);
alter view public.v_cart_reaper_backlog           set (security_invoker = on);
alter view public.v_discount_campaign_performance set (security_invoker = on);
alter view public.v_newsletter_stats              set (security_invoker = on);
alter view public.v_referral_review_queue         set (security_invoker = on);
alter view public.v_referral_stats                set (security_invoker = on);
alter view public.v_wallet_balance_drift          set (security_invoker = on);

revoke all on public.v_abandoned_cart_recovery       from public, anon, authenticated;
revoke all on public.v_cart_reaper_backlog           from public, anon, authenticated;
revoke all on public.v_discount_campaign_performance from public, anon, authenticated;
revoke all on public.v_newsletter_stats              from public, anon, authenticated;
revoke all on public.v_referral_review_queue         from public, anon, authenticated;
revoke all on public.v_referral_stats                from public, anon, authenticated;
revoke all on public.v_wallet_balance_drift          from public, anon, authenticated;

grant select on public.v_abandoned_cart_recovery       to service_role;
grant select on public.v_cart_reaper_backlog           to service_role;
grant select on public.v_discount_campaign_performance to service_role;
grant select on public.v_newsletter_stats              to service_role;
grant select on public.v_referral_review_queue         to service_role;
grant select on public.v_referral_stats                to service_role;
grant select on public.v_wallet_balance_drift          to service_role;

-- ---------------------------------------------------------------------------
-- 2. Trigger functions: never a legitimate RPC target.
-- ---------------------------------------------------------------------------
revoke all on function public.audit_log_trigger_fn()              from public, anon, authenticated;
revoke all on function public.enforce_product_approval()          from public, anon, authenticated;
revoke all on function public.enforce_profile_privilege_columns() from public, anon, authenticated;
revoke all on function public.fn_ensure_wallet_account()          from public, anon, authenticated;
revoke all on function public.handle_new_user()                   from public, anon, authenticated;
revoke all on function public.settlement_events_no_rewrite()      from public, anon, authenticated;
revoke all on function public.tg_orders_notify_paid()             from public, anon, authenticated;
revoke all on function public.tg_vouchers_notify_redeemed()       from public, anon, authenticated;

-- `handle_new_user` fires on auth.users, owned by the auth stack. The EXECUTE
-- check does not run at fire time, but granting the owner roles back costs
-- nothing and removes the only way this migration could break signup.
grant execute on function public.handle_new_user() to postgres, supabase_auth_admin;

-- ---------------------------------------------------------------------------
-- 3. Maintenance and dead RPCs: service_role only.
-- ---------------------------------------------------------------------------
revoke all on function public.cleanup_rate_limits()      from public, anon, authenticated;
revoke all on function public.cleanup_user_rate_limits() from public, anon, authenticated;
grant execute on function public.cleanup_rate_limits()      to service_role;
grant execute on function public.cleanup_user_rate_limits() to service_role;

revoke all on function public.check_user_rate_limit(uuid, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.check_user_rate_limit(uuid, text, integer, integer)
  to service_role;

-- Cashback math keyed by a caller-supplied user id. An authenticated user is
-- an acceptable caller; an anonymous one has no business here.
revoke all on function public.fn_wallet_cashback_amount(uuid, numeric, uuid[])  from public, anon;
revoke all on function public.fn_wallet_cashback_percent(uuid, numeric, uuid[]) from public, anon;
grant execute on function public.fn_wallet_cashback_amount(uuid, numeric, uuid[])  to authenticated, service_role;
grant execute on function public.fn_wallet_cashback_percent(uuid, numeric, uuid[]) to authenticated, service_role;

-- Deliberately NOT revoked, with reasons:
--   check_rate_limit(text,int,int) -- guest server actions call it under anon;
--                                     revoking makes the limiter fail open.
--   log_voucher_scan(...)          -- the anonymous redeem page calls it, and
--                                     it carries its own 20/minute per-IP guard.
--   product_platform_percent(uuid) -- public catalogue data.
--   is_admin/has_role/current_user_role/is_support/current_supplier_id/
--   is_supplier_member/is_supplier_owner/is_supplier_order/
--   is_supplier_shipping_order    -- RLS policy predicates. A policy expression
--                                     is evaluated as the querying role, so the
--                                     role needs EXECUTE. Revoking these breaks
--                                     RLS instead of tightening it.

-- ---------------------------------------------------------------------------
-- 4. Pin the mutable search_paths.
-- ---------------------------------------------------------------------------
alter function public.handle_new_user()              set search_path = public, pg_temp;
alter function public.set_updated_at()               set search_path = public, pg_temp;
alter function public.set_vendors_updated_at()       set search_path = public, pg_temp;
alter function public.set_coupon_deals_updated_at()  set search_path = public, pg_temp;

commit;
