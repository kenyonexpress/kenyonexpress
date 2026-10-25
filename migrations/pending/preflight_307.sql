-- Preflight checks for migration 307: wallet_cashback_withdrawals
--
-- Run this BEFORE applying 307_wallet_cashback_withdrawals.sql
-- All checks must return TRUE or zero rows

-- 1. Required tables exist
select
  case
    when exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'profiles')
      and exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'orders')
      and exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'order_items')
      and exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'products')
      and exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'wallet_accounts')
      and exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'wallet_entries')
    then true
    else false
  end as required_tables_exist;

-- 2. Required columns exist on products
select
  case
    when exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'products'
        and column_name = 'cashback_enabled'
    )
    and exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'products'
        and column_name = 'cashback_percent'
    )
    then true
    else false
  end as products_cashback_fields_exist;

-- 3. Required columns exist on orders
select
  case
    when exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'orders'
        and column_name = 'cashback_applied_ils_agorot'
    )
    and exists (
      select 1 from information_schema.columns
      where table_schema = 'public'
        and table_name = 'orders'
        and column_name = 'paid_at'
    )
    then true
    else false
  end as orders_cashback_fields_exist;

-- 4. fn_wallet_transfer function exists
select
  case
    when exists (
      select 1 from pg_proc p
      join pg_namespace n on p.pronamespace = n.oid
      where n.nspname = 'public'
        and p.proname = 'fn_wallet_transfer'
    )
    then true
    else false
  end as fn_wallet_transfer_exists;

-- 5. Platform wallet account exists
select
  case
    when exists (
      select 1 from public.wallet_accounts
      where owner_type = 'platform'
    )
    then true
    else false
  end as platform_wallet_exists;

-- 6. Table to be created does not already exist
select
  case
    when not exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'customer_wallet_payouts')
    then true
    else false
  end as customer_wallet_payouts_does_not_exist;

-- 7. Check user_role enum includes admin, super_admin
select
  case
    when 'admin' = any(enum_range(null::public.user_role)::text[])
      and 'super_admin' = any(enum_range(null::public.user_role)::text[])
    then true
    else false
  end as user_role_enum_has_admin;

-- 8. current_user_role function exists
select
  case
    when exists (
      select 1 from pg_proc p
      join pg_namespace n on p.pronamespace = n.oid
      where n.nspname = 'public'
        and p.proname = 'current_user_role'
    )
    then true
    else false
  end as current_user_role_function_exists;

-- 9. saved_payment_methods table exists (for cardcom_refund option)
select
  case
    when exists (select 1 from pg_tables where schemaname = 'public' and tablename = 'saved_payment_methods')
    then true
    else false
  end as saved_payment_methods_table_exists;
