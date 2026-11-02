-- C140 RLS audit: pgTAP suite.
-- Run: supabase db query --linked -f tests/rls/c140_rls_audit.test.sql
-- Everything, the pgtap extension included, runs inside one transaction that
-- ends in ROLLBACK, so the suite leaves nothing behind on the linked project.
-- `db query` prints only the last result set, so every TAP line is collected
-- into tap_out and printed by the final SELECT.

begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

create temp table tap_out (n serial primary key, line text);
grant all on tap_out to public;
grant all on sequence tap_out_n_seq to public;

insert into tap_out (line) select plan(31);

-- ---------------------------------------------------------------------------
-- Structure (as the migration owner)
-- ---------------------------------------------------------------------------

insert into tap_out (line) select is(
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity),
  0::bigint,
  'every public table has row level security enabled');

insert into tap_out (line) select is(
  (select count(*) from pg_policies
    where schemaname = 'public' and permissive = 'PERMISSIVE'
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
      and roles && array['public', 'anon', 'authenticated']::name[]
      and (coalesce(qual, '') = 'true' or coalesce(with_check, '') = 'true')),
  0::bigint,
  'no client-role write policy is unconditionally true');

insert into tap_out (line) select set_eq(
  $$ select tablename::text from pg_policies
      where schemaname = 'public' and qual = 'true'
        and roles && array['public', 'anon', 'authenticated']::name[] $$,
  array['feature_flags', 'media_assets', 'price_history', 'shipping_zones'],
  'USING (true) reads are limited to the four reviewed public catalogue tables');

insert into tap_out (line) select is(
  (select count(*) from pg_policies
    where schemaname = 'public' and roles && array['anon']::name[]
      and cmd in ('INSERT', 'UPDATE', 'DELETE')
      and tablename not in ('cookie_consent')),
  0::bigint,
  'anon has no write policy outside cookie_consent');

insert into tap_out (line) select is(
  (select permissive from pg_policies
    where schemaname = 'public' and tablename = 'profiles'
      and policyname = 'profiles_super_admin_mfa'),
  'RESTRICTIVE',
  'profiles super_admin MFA policy is restrictive');

insert into tap_out (line) select has_trigger(
  'public', 'profiles', 'enforce_profile_privilege_columns',
  'profiles.role / supplier_id are guarded by trigger');

insert into tap_out (line) select is(
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'v'
      and (has_table_privilege('anon', c.oid, 'SELECT')
           or has_table_privilege('authenticated', c.oid, 'SELECT'))
      and not coalesce(c.reloptions::text[] && array['security_invoker=true', 'security_invoker=on'], false)),
  0::bigint,
  'every client-readable public view is security_invoker');

insert into tap_out (line) select is(
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'm'
      and (has_table_privilege('anon', c.oid, 'SELECT')
           or has_table_privilege('authenticated', c.oid, 'SELECT'))),
  0::bigint,
  'no materialized view in public is client-readable');

-- 322: suppliers column grants
insert into tap_out (line) select ok(
  not has_column_privilege('anon', 'public.suppliers', 'notes', 'SELECT'),
  'anon cannot read suppliers.notes');
insert into tap_out (line) select ok(
  not has_column_privilege('anon', 'public.suppliers', 'contact_email', 'SELECT')
  and not has_column_privilege('anon', 'public.suppliers', 'contact_name', 'SELECT')
  and not has_column_privilege('anon', 'public.suppliers', 'business_id', 'SELECT'),
  'anon cannot read supplier contact identity / business_id');
insert into tap_out (line) select ok(
  not has_column_privilege('authenticated', 'public.suppliers', 'notes', 'SELECT')
  and not has_column_privilege('authenticated', 'public.suppliers', 'verified_by', 'SELECT')
  and not has_column_privilege('authenticated', 'public.suppliers', 'payout_hold_business_days', 'SELECT'),
  'authenticated cannot read supplier internal columns');
insert into tap_out (line) select ok(
  has_column_privilege('anon', 'public.suppliers', 'name', 'SELECT')
  and has_column_privilege('anon', 'public.suppliers', 'logo_url', 'SELECT')
  and has_column_privilege('anon', 'public.suppliers', 'contact_phone', 'SELECT'),
  'anon keeps the storefront supplier columns');

-- ---------------------------------------------------------------------------
-- Behaviour as anon
-- ---------------------------------------------------------------------------

set local role anon;
set local request.jwt.claims = '{"role":"anon"}';

insert into tap_out (line) select is((select count(*) from public.orders), 0::bigint, 'anon sees no orders');
insert into tap_out (line) select is((select count(*) from public.profiles), 0::bigint, 'anon sees no profiles');
insert into tap_out (line) select is((select count(*) from public.payments), 0::bigint, 'anon sees no payments');
insert into tap_out (line) select is((select count(*) from public.payment_tokens), 0::bigint, 'anon sees no payment tokens');
insert into tap_out (line) select is((select count(*) from public.user_addresses), 0::bigint, 'anon sees no addresses');
insert into tap_out (line) select is((select count(*) from public.wallet_accounts), 0::bigint, 'anon sees no wallet accounts');
insert into tap_out (line) select is((select count(*) from public.vouchers), 0::bigint, 'anon sees no vouchers');
insert into tap_out (line) select is((select count(*) from public.audit_log), 0::bigint, 'anon sees no audit log');
insert into tap_out (line) select is(
  (select count(*) from public.products where status <> 'active' or deleted_at is not null),
  0::bigint, 'anon sees only active, non-deleted products');
insert into tap_out (line) select throws_ok(
  'select notes from public.suppliers limit 1', '42501', null,
  'anon select suppliers.notes is denied');
insert into tap_out (line) select lives_ok(
  'select id, name, city, logo_url from public.suppliers limit 1',
  'anon can still read storefront supplier columns');
insert into tap_out (line) select throws_ok(
  $$ insert into public.orders (user_id) values (gen_random_uuid()) $$, '42501', null,
  'anon cannot insert orders');

-- ---------------------------------------------------------------------------
-- Behaviour as an authenticated stranger (uid owns nothing)
-- ---------------------------------------------------------------------------

reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-4000-8000-0000000c1400","role":"authenticated"}';

insert into tap_out (line) select is((select count(*) from public.orders), 0::bigint, 'stranger sees no orders');
insert into tap_out (line) select is((select count(*) from public.profiles), 0::bigint, 'stranger sees no profiles');
insert into tap_out (line) select is((select count(*) from public.payment_tokens), 0::bigint, 'stranger sees no payment tokens');
insert into tap_out (line) select is((select count(*) from public.user_addresses), 0::bigint, 'stranger sees no addresses');
insert into tap_out (line) select is((select count(*) from public.wallet_entries), 0::bigint, 'stranger sees no wallet entries');
insert into tap_out (line) select is((select count(*) from public.admin_users), 0::bigint, 'stranger sees no admin users');
insert into tap_out (line) select throws_ok(
  'select contact_email from public.suppliers limit 1', '42501', null,
  'stranger select suppliers.contact_email is denied');

reset role;
insert into tap_out (line) select * from finish();

select line from tap_out order by n;

rollback;
