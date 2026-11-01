-- 315: per-product supplier_transfer_days (C97). Days from sale until the supplier is paid.
-- Additive and nullable: NULL = the supplier/platform default. Integer days, no money.
-- Rollback: alter table public.products drop column if exists supplier_transfer_days;

alter table public.products
  add column if not exists supplier_transfer_days integer
    check (supplier_transfer_days is null or supplier_transfer_days between 0 and 90);

comment on column public.products.supplier_transfer_days is
  'Days after purchase until the supplier payout is transferred. NULL = the supplier default.';
