-- pgTAP: row level security is switched on for the tables that hold money,
-- vouchers and identity. Run: supabase test db
-- Read-only; the transaction is rolled back.
begin;
select plan(10);

select ok(
  (select relrowsecurity from pg_class where oid = 'public.vouchers'::regclass),
  'RLS is on for vouchers'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.orders'::regclass),
  'RLS is on for orders'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.order_items'::regclass),
  'RLS is on for order_items'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.payments'::regclass),
  'RLS is on for payments'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.wallet_entries'::regclass),
  'RLS is on for wallet_entries'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.wallet_transactions'::regclass),
  'RLS is on for wallet_transactions'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass),
  'RLS is on for profiles'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.invoices'::regclass),
  'RLS is on for invoices'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.audit_log'::regclass),
  'RLS is on for audit_log'
);
select ok(
  (select relrowsecurity from pg_class where oid = 'public.supplier_leads'::regclass),
  'RLS is on for supplier_leads'
);

select * from finish();
rollback;
