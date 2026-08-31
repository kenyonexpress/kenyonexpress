-- 133: products, variants and the coupon catalogue — money to integer agorot, additive and reversible.
--
-- WHY ADDITIVE RATHER THAN `ALTER TYPE`
--
-- Every column below has live readers. Converting in place changes the value a
-- reader gets from 18.00 to 1800 in the same query, with no code change, which
-- turns every price on the site into a hundred times itself the moment this is
-- applied. So this migration only ADDS: a new `<col>_agorot bigint`, backfilled
-- with `round(<col> * 100)`, constrained, and left alongside the original. The
-- old column keeps working and nothing breaks at apply time.
--
-- The cutover is three steps and only the first is here:
--   1. this file: add and backfill the agorot columns          <- you are here
--   2. rewrite the readers and writers to use them
--   3. a later migration drops the numeric columns
--
-- Applying this file alone is safe and is a no-op for the running application.
--
-- `product_variants.price_modifier` is signed: a variant may be cheaper than the
base product, so a negative modifier is legitimate.
--
-- ROLLBACK
--
--   alter table public.products drop column if exists price_ils_agorot;
--   alter table public.products drop column if exists coupon_price_ils_agorot;
--   alter table public.products drop column if exists cost_ils_agorot;
--   alter table public.products drop column if exists full_price_agorot;
--   alter table public.products drop column if exists kenyon_price_agorot;
--   alter table public.products drop column if exists compare_at_price_agorot;
--   alter table public.products drop column if exists compare_at_price_ils_agorot;
--   alter table public.product_variants drop column if exists price_agorot;
--   alter table public.product_variants drop column if exists price_ils_agorot;
--   alter table public.product_variants drop column if exists price_modifier_agorot;
--   alter table public.coupon_deals drop column if exists original_price_agorot;
--   alter table public.coupon_deals drop column if exists platform_price_agorot;
--   alter table public.coupons drop column if exists discount_value_agorot;
--   alter table public.coupons drop column if exists original_price_agorot;
--   alter table public.coupon_codes drop column if exists collect_amount_ils_agorot;
--   alter table public.coupon_codes drop column if exists face_value_ils_agorot;
--
-- NOT APPLIED. `migrations/pending/` is unapplied by definition. The route to
-- production is MCP `apply_migration` after a human approves this file.


-- public.products.price_ils
do $$
begin
  if to_regclass('public.products') is null then
    raise notice 'skipping products, table not present'; return;
  end if;

  alter table public.products add column if not exists price_ils_agorot bigint;

  update public.products
     set price_ils_agorot = round(price_ils * 100)
   where price_ils is not null and price_ils_agorot is distinct from round(price_ils * 100);

  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.products'::regclass
                   and conname = 'products_price_ils_agorot_nonneg') then
    alter table public.products
      add constraint products_price_ils_agorot_nonneg check (price_ils_agorot is null or price_ils_agorot >= 0);
  end if;
end
$$;


-- public.products.coupon_price_ils
do $$
begin
  if to_regclass('public.products') is null then
    raise notice 'skipping products, table not present'; return;
  end if;

  alter table public.products add column if not exists coupon_price_ils_agorot bigint;

  update public.products
     set coupon_price_ils_agorot = round(coupon_price_ils * 100)
   where coupon_price_ils is not null and coupon_price_ils_agorot is distinct from round(coupon_price_ils * 100);

  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.products'::regclass
                   and conname = 'products_coupon_price_ils_agorot_nonneg') then
    alter table public.products
      add constraint products_coupon_price_ils_agorot_nonneg check (coupon_price_ils_agorot is null or coupon_price_ils_agorot >= 0);
  end if;
end
$$;


-- public.products.cost_ils
do $$
begin
  if to_regclass('public.products') is null then
    raise notice 'skipping products, table not present'; return;
  end if;

  alter table public.products add column if not exists cost_ils_agorot bigint;

  update public.products
     set cost_ils_agorot = round(cost_ils * 100)
   where cost_ils is not null and cost_ils_agorot is distinct from round(cost_ils * 100);

  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.products'::regclass
                   and conname = 'products_cost_ils_agorot_nonneg') then
    alter table public.products
      add constraint products_cost_ils_agorot_nonneg check (cost_ils_agorot is null or cost_ils_agorot >= 0);
  end if;
end
$$;


-- public.products.full_price
do $$
begin
  if to_regclass('public.products') is null then
    raise notice 'skipping products, table not present'; return;
  end if;

  alter table public.products add column if not exists full_price_agorot bigint;

  update public.products
     set full_price_agorot = round(full_price * 100)
   where full_price is not null and full_price_agorot is distinct from round(full_price * 100);

  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.products'::regclass
                   and conname = 'products_full_price_agorot_nonneg') then
    alter table public.products
      add constraint products_full_price_agorot_nonneg check (full_price_agorot is null or full_price_agorot >= 0);
  end if;
end
$$;


-- public.products.kenyon_price
do $$
begin
  if to_regclass('public.products') is null then
    raise notice 'skipping products, table not present'; return;
  end if;

  alter table public.products add column if not exists kenyon_price_agorot bigint;

  update public.products
     set kenyon_price_agorot = round(kenyon_price * 100)
   where kenyon_price is not null and kenyon_price_agorot is distinct from round(kenyon_price * 100);

  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.products'::regclass
                   and conname = 'products_kenyon_price_agorot_nonneg') then
    alter table public.products
      add constraint products_kenyon_price_agorot_nonneg check (kenyon_price_agorot is null or kenyon_price_agorot >= 0);
  end if;
end
$$;


-- public.products.compare_at_price
do $$
begin
  if to_regclass('public.products') is null then
    raise notice 'skipping products, table not present'; return;
  end if;

  alter table public.products add column if not exists compare_at_price_agorot bigint;

  update public.products
     set compare_at_price_agorot = round(compare_at_price * 100)
   where compare_at_price is not null and compare_at_price_agorot is distinct from round(compare_at_price * 100);

  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.products'::regclass
                   and conname = 'products_compare_at_price_agorot_nonneg') then
    alter table public.products
      add constraint products_compare_at_price_agorot_nonneg check (compare_at_price_agorot is null or compare_at_price_agorot >= 0);
  end if;
end
$$;


-- public.products.compare_at_price_ils
do $$
begin
  if to_regclass('public.products') is null then
    raise notice 'skipping products, table not present'; return;
  end if;

  alter table public.products add column if not exists compare_at_price_ils_agorot bigint;

  update public.products
     set compare_at_price_ils_agorot = round(compare_at_price_ils * 100)
   where compare_at_price_ils is not null and compare_at_price_ils_agorot is distinct from round(compare_at_price_ils * 100);

  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.products'::regclass
                   and conname = 'products_compare_at_price_ils_agorot_nonneg') then
    alter table public.products
      add constraint products_compare_at_price_ils_agorot_nonneg check (compare_at_price_ils_agorot is null or compare_at_price_ils_agorot >= 0);
  end if;
end
$$;


-- public.product_variants.price
do $$
begin
  if to_regclass('public.product_variants') is null then
    raise notice 'skipping product_variants, table not present'; return;
  end if;

  alter table public.product_variants add column if not exists price_agorot bigint;

  update public.product_variants
     set price_agorot = round(price * 100)
   where price is not null and price_agorot is distinct from round(price * 100);

  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.product_variants'::regclass
                   and conname = 'product_variants_price_agorot_nonneg') then
    alter table public.product_variants
      add constraint product_variants_price_agorot_nonneg check (price_agorot is null or price_agorot >= 0);
  end if;
end
$$;


-- public.product_variants.price_ils
do $$
begin
  if to_regclass('public.product_variants') is null then
    raise notice 'skipping product_variants, table not present'; return;
  end if;

  alter table public.product_variants add column if not exists price_ils_agorot bigint;

  update public.product_variants
     set price_ils_agorot = round(price_ils * 100)
   where price_ils is not null and price_ils_agorot is distinct from round(price_ils * 100);

  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.product_variants'::regclass
                   and conname = 'product_variants_price_ils_agorot_nonneg') then
    alter table public.product_variants
      add constraint product_variants_price_ils_agorot_nonneg check (price_ils_agorot is null or price_ils_agorot >= 0);
  end if;
end
$$;


-- public.product_variants.price_modifier   (SIGNED: no non-negative check)
do $$
begin
  if to_regclass('public.product_variants') is null then
    raise notice 'skipping product_variants, table not present'; return;
  end if;

  alter table public.product_variants add column if not exists price_modifier_agorot bigint;

  update public.product_variants
     set price_modifier_agorot = round(price_modifier * 100)
   where price_modifier is not null and price_modifier_agorot is distinct from round(price_modifier * 100);

end
$$;


-- public.coupon_deals.original_price
do $$
begin
  if to_regclass('public.coupon_deals') is null then
    raise notice 'skipping coupon_deals, table not present'; return;
  end if;

  alter table public.coupon_deals add column if not exists original_price_agorot bigint;

  update public.coupon_deals
     set original_price_agorot = round(original_price * 100)
   where original_price is not null and original_price_agorot is distinct from round(original_price * 100);

  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.coupon_deals'::regclass
                   and conname = 'coupon_deals_original_price_agorot_nonneg') then
    alter table public.coupon_deals
      add constraint coupon_deals_original_price_agorot_nonneg check (original_price_agorot is null or original_price_agorot >= 0);
  end if;
end
$$;


-- public.coupon_deals.platform_price
do $$
begin
  if to_regclass('public.coupon_deals') is null then
    raise notice 'skipping coupon_deals, table not present'; return;
  end if;

  alter table public.coupon_deals add column if not exists platform_price_agorot bigint;

  update public.coupon_deals
     set platform_price_agorot = round(platform_price * 100)
   where platform_price is not null and platform_price_agorot is distinct from round(platform_price * 100);

  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.coupon_deals'::regclass
                   and conname = 'coupon_deals_platform_price_agorot_nonneg') then
    alter table public.coupon_deals
      add constraint coupon_deals_platform_price_agorot_nonneg check (platform_price_agorot is null or platform_price_agorot >= 0);
  end if;
end
$$;


-- public.coupons.discount_value
do $$
begin
  if to_regclass('public.coupons') is null then
    raise notice 'skipping coupons, table not present'; return;
  end if;

  alter table public.coupons add column if not exists discount_value_agorot bigint;

  update public.coupons
     set discount_value_agorot = round(discount_value * 100)
   where discount_value is not null and discount_value_agorot is distinct from round(discount_value * 100);

  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.coupons'::regclass
                   and conname = 'coupons_discount_value_agorot_nonneg') then
    alter table public.coupons
      add constraint coupons_discount_value_agorot_nonneg check (discount_value_agorot is null or discount_value_agorot >= 0);
  end if;
end
$$;


-- public.coupons.original_price
do $$
begin
  if to_regclass('public.coupons') is null then
    raise notice 'skipping coupons, table not present'; return;
  end if;

  alter table public.coupons add column if not exists original_price_agorot bigint;

  update public.coupons
     set original_price_agorot = round(original_price * 100)
   where original_price is not null and original_price_agorot is distinct from round(original_price * 100);

  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.coupons'::regclass
                   and conname = 'coupons_original_price_agorot_nonneg') then
    alter table public.coupons
      add constraint coupons_original_price_agorot_nonneg check (original_price_agorot is null or original_price_agorot >= 0);
  end if;
end
$$;


-- public.coupon_codes.collect_amount_ils
do $$
begin
  if to_regclass('public.coupon_codes') is null then
    raise notice 'skipping coupon_codes, table not present'; return;
  end if;

  alter table public.coupon_codes add column if not exists collect_amount_ils_agorot bigint;

  update public.coupon_codes
     set collect_amount_ils_agorot = round(collect_amount_ils * 100)
   where collect_amount_ils is not null and collect_amount_ils_agorot is distinct from round(collect_amount_ils * 100);

  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.coupon_codes'::regclass
                   and conname = 'coupon_codes_collect_amount_ils_agorot_nonneg') then
    alter table public.coupon_codes
      add constraint coupon_codes_collect_amount_ils_agorot_nonneg check (collect_amount_ils_agorot is null or collect_amount_ils_agorot >= 0);
  end if;
end
$$;


-- public.coupon_codes.face_value_ils
do $$
begin
  if to_regclass('public.coupon_codes') is null then
    raise notice 'skipping coupon_codes, table not present'; return;
  end if;

  alter table public.coupon_codes add column if not exists face_value_ils_agorot bigint;

  update public.coupon_codes
     set face_value_ils_agorot = round(face_value_ils * 100)
   where face_value_ils is not null and face_value_ils_agorot is distinct from round(face_value_ils * 100);

  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.coupon_codes'::regclass
                   and conname = 'coupon_codes_face_value_ils_agorot_nonneg') then
    alter table public.coupon_codes
      add constraint coupon_codes_face_value_ils_agorot_nonneg check (face_value_ils_agorot is null or face_value_ils_agorot >= 0);
  end if;
end
$$;
