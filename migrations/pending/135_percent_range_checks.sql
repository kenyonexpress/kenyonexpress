-- 135: bound every unconstrained percent column to 0..100.
--
-- These twelve stay `numeric`. A percent is a ratio, not money, so the agorot
-- rule does not apply to it and converting one with `round(x * 100)` would
-- corrupt it. What they lack is a range: nothing today stops a 4000% commission
-- or a negative split from being written, and both would flow straight into a
-- payout calculation.
--
-- Every other percent column in the schema already carries a check. These are
-- the twelve that do not, found by counting pg_constraint entries per column.
--
-- `legacy_percent_archive_112` is an archive nothing in src/ reads. Its three
-- columns are included anyway: the constraint costs nothing and the table is
-- the reference for what the pre-112 commissions were.
--
-- ROLLBACK
--
--   alter table public.coupon_codes drop constraint if exists coupon_codes_platform_percent_range;
--   alter table public.coupon_deals drop constraint if exists coupon_deals_discount_percentage_range;
--   alter table public.legacy_percent_archive_112 drop constraint if exists legacy_percent_archive_112_commission_percent_range;
--   alter table public.legacy_percent_archive_112 drop constraint if exists legacy_percent_archive_112_commission_rate_range;
--   alter table public.legacy_percent_archive_112 drop constraint if exists legacy_percent_archive_112_default_split_percent_range;
--   alter table public.order_items drop constraint if exists order_items_cashback_percent_range;
--   alter table public.order_items drop constraint if exists order_items_commission_percent_range;
--   alter table public.order_items drop constraint if exists order_items_commission_percent_snapshot_range;
--   alter table public.order_items drop constraint if exists order_items_upfront_percent_range;
--   alter table public.products drop constraint if exists products_profit_share_cap_percent_range;
--   alter table public.wallet_transactions drop constraint if exists wallet_transactions_cashback_percent_range;
--   alter table public.wallet_transactions drop constraint if exists wallet_transactions_profit_share_cap_percent_range;
--
-- NOT APPLIED.


do $$
begin
  if to_regclass('public.coupon_codes') is null then
    raise notice 'skipping coupon_codes'; return;
  end if;
  if exists (select 1 from public.coupon_codes where platform_percent is not null and (platform_percent < 0 or platform_percent > 100)) then
    raise exception 'public.coupon_codes.platform_percent holds values outside 0..100; fix the data before constraining it';
  end if;
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.coupon_codes'::regclass and conname = 'coupon_codes_platform_percent_range') then
    alter table public.coupon_codes
      add constraint coupon_codes_platform_percent_range check (platform_percent is null or (platform_percent >= 0 and platform_percent <= 100));
  end if;
end
$$;


do $$
begin
  if to_regclass('public.coupon_deals') is null then
    raise notice 'skipping coupon_deals'; return;
  end if;
  if exists (select 1 from public.coupon_deals where discount_percentage is not null and (discount_percentage < 0 or discount_percentage > 100)) then
    raise exception 'public.coupon_deals.discount_percentage holds values outside 0..100; fix the data before constraining it';
  end if;
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.coupon_deals'::regclass and conname = 'coupon_deals_discount_percentage_range') then
    alter table public.coupon_deals
      add constraint coupon_deals_discount_percentage_range check (discount_percentage is null or (discount_percentage >= 0 and discount_percentage <= 100));
  end if;
end
$$;


do $$
begin
  if to_regclass('public.legacy_percent_archive_112') is null then
    raise notice 'skipping legacy_percent_archive_112'; return;
  end if;
  if exists (select 1 from public.legacy_percent_archive_112 where commission_percent is not null and (commission_percent < 0 or commission_percent > 100)) then
    raise exception 'public.legacy_percent_archive_112.commission_percent holds values outside 0..100; fix the data before constraining it';
  end if;
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.legacy_percent_archive_112'::regclass and conname = 'legacy_percent_archive_112_commission_percent_range') then
    alter table public.legacy_percent_archive_112
      add constraint legacy_percent_archive_112_commission_percent_range check (commission_percent is null or (commission_percent >= 0 and commission_percent <= 100));
  end if;
end
$$;


do $$
begin
  if to_regclass('public.legacy_percent_archive_112') is null then
    raise notice 'skipping legacy_percent_archive_112'; return;
  end if;
  if exists (select 1 from public.legacy_percent_archive_112 where commission_rate is not null and (commission_rate < 0 or commission_rate > 100)) then
    raise exception 'public.legacy_percent_archive_112.commission_rate holds values outside 0..100; fix the data before constraining it';
  end if;
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.legacy_percent_archive_112'::regclass and conname = 'legacy_percent_archive_112_commission_rate_range') then
    alter table public.legacy_percent_archive_112
      add constraint legacy_percent_archive_112_commission_rate_range check (commission_rate is null or (commission_rate >= 0 and commission_rate <= 100));
  end if;
end
$$;


do $$
begin
  if to_regclass('public.legacy_percent_archive_112') is null then
    raise notice 'skipping legacy_percent_archive_112'; return;
  end if;
  if exists (select 1 from public.legacy_percent_archive_112 where default_split_percent is not null and (default_split_percent < 0 or default_split_percent > 100)) then
    raise exception 'public.legacy_percent_archive_112.default_split_percent holds values outside 0..100; fix the data before constraining it';
  end if;
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.legacy_percent_archive_112'::regclass and conname = 'legacy_percent_archive_112_default_split_percent_range') then
    alter table public.legacy_percent_archive_112
      add constraint legacy_percent_archive_112_default_split_percent_range check (default_split_percent is null or (default_split_percent >= 0 and default_split_percent <= 100));
  end if;
end
$$;


do $$
begin
  if to_regclass('public.order_items') is null then
    raise notice 'skipping order_items'; return;
  end if;
  if exists (select 1 from public.order_items where cashback_percent is not null and (cashback_percent < 0 or cashback_percent > 100)) then
    raise exception 'public.order_items.cashback_percent holds values outside 0..100; fix the data before constraining it';
  end if;
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.order_items'::regclass and conname = 'order_items_cashback_percent_range') then
    alter table public.order_items
      add constraint order_items_cashback_percent_range check (cashback_percent is null or (cashback_percent >= 0 and cashback_percent <= 100));
  end if;
end
$$;


do $$
begin
  if to_regclass('public.order_items') is null then
    raise notice 'skipping order_items'; return;
  end if;
  if exists (select 1 from public.order_items where commission_percent is not null and (commission_percent < 0 or commission_percent > 100)) then
    raise exception 'public.order_items.commission_percent holds values outside 0..100; fix the data before constraining it';
  end if;
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.order_items'::regclass and conname = 'order_items_commission_percent_range') then
    alter table public.order_items
      add constraint order_items_commission_percent_range check (commission_percent is null or (commission_percent >= 0 and commission_percent <= 100));
  end if;
end
$$;


do $$
begin
  if to_regclass('public.order_items') is null then
    raise notice 'skipping order_items'; return;
  end if;
  if exists (select 1 from public.order_items where commission_percent_snapshot is not null and (commission_percent_snapshot < 0 or commission_percent_snapshot > 100)) then
    raise exception 'public.order_items.commission_percent_snapshot holds values outside 0..100; fix the data before constraining it';
  end if;
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.order_items'::regclass and conname = 'order_items_commission_percent_snapshot_range') then
    alter table public.order_items
      add constraint order_items_commission_percent_snapshot_range check (commission_percent_snapshot is null or (commission_percent_snapshot >= 0 and commission_percent_snapshot <= 100));
  end if;
end
$$;


do $$
begin
  if to_regclass('public.order_items') is null then
    raise notice 'skipping order_items'; return;
  end if;
  if exists (select 1 from public.order_items where upfront_percent is not null and (upfront_percent < 0 or upfront_percent > 100)) then
    raise exception 'public.order_items.upfront_percent holds values outside 0..100; fix the data before constraining it';
  end if;
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.order_items'::regclass and conname = 'order_items_upfront_percent_range') then
    alter table public.order_items
      add constraint order_items_upfront_percent_range check (upfront_percent is null or (upfront_percent >= 0 and upfront_percent <= 100));
  end if;
end
$$;


do $$
begin
  if to_regclass('public.products') is null then
    raise notice 'skipping products'; return;
  end if;
  if exists (select 1 from public.products where profit_share_cap_percent is not null and (profit_share_cap_percent < 0 or profit_share_cap_percent > 100)) then
    raise exception 'public.products.profit_share_cap_percent holds values outside 0..100; fix the data before constraining it';
  end if;
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.products'::regclass and conname = 'products_profit_share_cap_percent_range') then
    alter table public.products
      add constraint products_profit_share_cap_percent_range check (profit_share_cap_percent is null or (profit_share_cap_percent >= 0 and profit_share_cap_percent <= 100));
  end if;
end
$$;


do $$
begin
  if to_regclass('public.wallet_transactions') is null then
    raise notice 'skipping wallet_transactions'; return;
  end if;
  if exists (select 1 from public.wallet_transactions where cashback_percent is not null and (cashback_percent < 0 or cashback_percent > 100)) then
    raise exception 'public.wallet_transactions.cashback_percent holds values outside 0..100; fix the data before constraining it';
  end if;
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.wallet_transactions'::regclass and conname = 'wallet_transactions_cashback_percent_range') then
    alter table public.wallet_transactions
      add constraint wallet_transactions_cashback_percent_range check (cashback_percent is null or (cashback_percent >= 0 and cashback_percent <= 100));
  end if;
end
$$;


do $$
begin
  if to_regclass('public.wallet_transactions') is null then
    raise notice 'skipping wallet_transactions'; return;
  end if;
  if exists (select 1 from public.wallet_transactions where profit_share_cap_percent is not null and (profit_share_cap_percent < 0 or profit_share_cap_percent > 100)) then
    raise exception 'public.wallet_transactions.profit_share_cap_percent holds values outside 0..100; fix the data before constraining it';
  end if;
  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.wallet_transactions'::regclass and conname = 'wallet_transactions_profit_share_cap_percent_range') then
    alter table public.wallet_transactions
      add constraint wallet_transactions_profit_share_cap_percent_range check (profit_share_cap_percent is null or (profit_share_cap_percent >= 0 and profit_share_cap_percent <= 100));
  end if;
end
$$;
