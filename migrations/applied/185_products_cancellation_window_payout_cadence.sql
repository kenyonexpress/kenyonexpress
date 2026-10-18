-- 185: per-product cancellation window and supplier payout cadence.
-- Additive and nullable: NULL means "use the platform default" (14 days,
-- the supplier's own cadence). Nothing reads these until the admin form is
-- wired, so applying this changes no behaviour by itself.
-- Rollback: alter table public.products drop column if exists cancellation_window_days, drop column if exists payout_cadence;

alter table public.products
  add column if not exists cancellation_window_days integer
    check (cancellation_window_days is null or cancellation_window_days between 0 and 365),
  add column if not exists payout_cadence text
    check (payout_cadence is null or payout_cadence in ('weekly', 'biweekly', 'monthly'));

comment on column public.products.cancellation_window_days is
  'Days after purchase a customer may cancel an unredeemed coupon. NULL = platform default 14.';
comment on column public.products.payout_cadence is
  'Supplier payout cadence for this product. NULL = the supplier default.';
