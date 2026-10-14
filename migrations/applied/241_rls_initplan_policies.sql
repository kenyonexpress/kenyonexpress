-- 241_rls_initplan_policies.sql (idempotent)
--
-- Six RLS policies that call auth.uid() / current_user_role() ONCE PER ROW,
-- rewritten so the call runs once per query. Supabase's performance advisor
-- lint 0003_auth_rls_initplan, measured on production 2026-09-17.
--
-- The mechanics: `user_id = auth.uid()` in a policy qual is a function call
-- the planner evaluates for every row it considers, because it cannot prove
-- the call is stable across the scan. `user_id = (select auth.uid())` is an
-- InitPlan: evaluated once, then compared as a constant, and the planner can
-- use the index on user_id. On a table with a handful of rows the difference
-- is nothing; on push_subscriptions and cashback_ledger, which grow with the
-- customer base, it is the difference between an index lookup and a scan
-- that calls a function per row.
--
-- EVERY POLICY BELOW WAS READ OFF PRODUCTION (pg_policies) ON 2026-09-17 AND
-- IS RESTATED WITH THE SAME NAME, TABLE, PERMISSIVE/RESTRICTIVE MODE, ROLE,
-- COMMAND AND QUAL, changed only by wrapping the call in a scalar subquery.
-- 185 and 183 are the record of why this matters: a policy restated from an
-- older text than the live one silently drops whatever landed in between.
-- The dry run in APPLY-ORDER.md re-reads the six after the rewrite and
-- compares the deparsed quals to the expected forms.
--
-- DROP + CREATE inside one transaction: there is no ALTER POLICY ... USING
-- form that changes the mode, and the two statements commit together, so
-- there is no window in which the table has no policy. Policies carry no
-- grants, so unlike 143's function recreation there is nothing to re-revoke.
--
-- Not included: `profiles_super_admin_mfa`'s `auth.jwt()` term was already a
-- subquery in production; only its `current_user_role()` term is wrapped.

-- profiles: RESTRICTIVE, UPDATE, authenticated ---------------------------------
drop policy if exists profiles_super_admin_mfa on public.profiles;
create policy profiles_super_admin_mfa on public.profiles
  as restrictive
  for update
  to authenticated
  using (
    ((select public.current_user_role())::text <> 'super_admin'::text)
    or (coalesce((select (auth.jwt() ->> 'aal'::text)), 'aal1'::text) = 'aal2'::text)
  );

-- webauthn_credentials: PERMISSIVE, SELECT + DELETE, authenticated -------------
drop policy if exists webauthn_credentials_select_own on public.webauthn_credentials;
create policy webauthn_credentials_select_own on public.webauthn_credentials
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists webauthn_credentials_delete_own on public.webauthn_credentials;
create policy webauthn_credentials_delete_own on public.webauthn_credentials
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- push_subscriptions: PERMISSIVE, SELECT + DELETE, authenticated ---------------
drop policy if exists push_subscriptions_select_own on public.push_subscriptions;
create policy push_subscriptions_select_own on public.push_subscriptions
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists push_subscriptions_delete_own on public.push_subscriptions;
create policy push_subscriptions_delete_own on public.push_subscriptions
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- cashback_ledger: PERMISSIVE, SELECT, authenticated ---------------------------
drop policy if exists cashback_ledger_owner_select on public.cashback_ledger;
create policy cashback_ledger_owner_select on public.cashback_ledger
  for select
  to authenticated
  using (user_id = (select auth.uid()));

-- Verification ---------------------------------------------------------------
-- All six exist, with the mode and command they had, and none of the six
-- quals still contains a bare per-row auth.uid() call.
do $$
declare
  bad text[];
begin
  select array_agg(policyname) into bad
  from pg_policies
  where schemaname = 'public'
    and policyname in (
      'profiles_super_admin_mfa',
      'webauthn_credentials_select_own',
      'webauthn_credentials_delete_own',
      'push_subscriptions_select_own',
      'push_subscriptions_delete_own',
      'cashback_ledger_owner_select'
    )
    -- pg_policies deparses the InitPlan form as `( SELECT auth.uid() AS uid)`,
    -- so a qual that mentions the function without that SELECT in front of
    -- it is still the per-row form. Postgres regexes have no lookbehind,
    -- hence "contains the call" AND NOT "contains the wrapped call".
    and (
      (qual ~ 'auth\.uid\(\)' and qual !~* 'select auth\.uid\(\)')
      or (qual ~ 'current_user_role\(\)' and qual !~* 'select current_user_role\(\)')
    );
  if bad is not null then
    raise exception '241: policies still evaluate per row: %', bad;
  end if;

  if (select count(*) from pg_policies where schemaname = 'public' and policyname in (
      'profiles_super_admin_mfa',
      'webauthn_credentials_select_own',
      'webauthn_credentials_delete_own',
      'push_subscriptions_select_own',
      'push_subscriptions_delete_own',
      'cashback_ledger_owner_select')) <> 6 then
    raise exception '241: expected six policies after apply';
  end if;

  if (select permissive from pg_policies where schemaname = 'public'
        and policyname = 'profiles_super_admin_mfa') <> 'RESTRICTIVE' then
    raise exception '241: profiles_super_admin_mfa must stay RESTRICTIVE';
  end if;
end $$;
