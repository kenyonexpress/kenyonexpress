-- Preflight for 308_order_lifecycle_transition_guards.sql. Read-only.
-- Expect: orders and payments exist with the columns the guards read, and
-- neither guard trigger exists yet.
select
  to_regclass('public.orders') is not null as orders_exists,
  to_regclass('public.payments') is not null as payments_exists,
  exists (select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'orders' and column_name = 'paid_at') as orders_paid_at_exists,
  exists (select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'payments' and column_name = 'cardcom_low_profile_id') as payments_low_profile_exists,
  exists (select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'payments' and column_name = 'succeeded_at') as payments_succeeded_at_exists,
  exists (select 1 from information_schema.columns
          where table_schema = 'public' and table_name = 'payments' and column_name = 'refunded_at') as payments_refunded_at_exists,
  not exists (select 1 from pg_trigger where tgname in ('enforce_order_status_transitions', 'enforce_payment_status_transitions')) as guards_absent;
