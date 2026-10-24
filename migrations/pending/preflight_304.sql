-- Preflight for 304_soft_delete_consolidation.sql. Read-only.
-- Expect: vouchers, profiles, suppliers, voucher_redemptions exist (all true) and
-- deleted_at is absent on vouchers and profiles (both true) before applying.
select
  to_regclass('public.vouchers') is not null as vouchers_exists,
  to_regclass('public.profiles') is not null as profiles_exists,
  to_regclass('public.suppliers') is not null as suppliers_exists,
  to_regclass('public.voucher_redemptions') is not null as voucher_redemptions_exists,
  not exists (select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'vouchers' and column_name = 'deleted_at') as vouchers_no_deleted_at,
  not exists (select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'deleted_at') as profiles_no_deleted_at;
