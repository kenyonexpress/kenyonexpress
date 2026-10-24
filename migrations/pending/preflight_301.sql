-- Preflight for 301_push_subscriptions.sql. Read-only.
-- Expect: auth.users exists and push_subscriptions does not yet exist.
select
  to_regclass('auth.users') is not null as auth_users_exists,
  to_regclass('public.push_subscriptions') is null as push_subscriptions_absent;
