-- 140: products, variants and the coupon catalogue — money to integer agorot, additive and reversible.
--
-- WHY ADDITIVE RATHER THAN `ALTER TYPE`
--
-- Every column below has live readers. Converting in place changes the value a
-- reader gets from 18.00 to 1800 in the same query, with no code change, which
-- turns every price on the site into a hundred times itself the moment this is
-- applied. So this migration only ADDS a `<col>_agorot bigint` alongside the
-- original. The old column keeps working and nothing breaks at apply time.
--
-- WHY GENERATED AND NOT BACKFILLED
--
-- The first draft of this file added a plain `bigint` and filled it once with
-- `update ... set <col>_agorot = round(<col> * 100)`. Nothing kept it in step
-- afterwards: no trigger, no default, no NOT NULL. The running application
-- writes the numeric column and does not know the new one exists, so **every
-- row inserted after this migration would have carried a NULL agorot column**,
-- and step 2 below — the whole reason this file exists — would then have read
-- NULL for every order placed since the apply. A customer who had just paid
-- would have been shown a total of 0.00, and the split would have settled a
-- commission of zero against it.
--
-- `generated always as (round(<col> * 100)::bigint) stored` cannot drift. It is
-- recomputed by Postgres on every insert and every update of the base column,
-- and Postgres refuses a write that names it (SQLSTATE 428C9), so no writer can
-- put the two out of step even by accident. Measured on the hosted project,
-- PostgreSQL 17.6: insert, update and NULL all track, and a write to the
-- generated column is refused with 428C9.
--
-- ONE CONSEQUENCE, STATED RATHER THAN HIDDEN: the non-negative CHECKs below are
-- no longer decorative. On a plain backfilled column nothing ever re-evaluated
-- them; on a generated column they are validated on every write, so they now
-- constrain the *numeric* column's sign at runtime. Measured before writing
-- this: no row in any checked column is negative today, so the apply validates.
-- The signed columns in the wallet are deliberately left without a check.
--
-- The cutover is three steps and only the first is here:
--   1. this file: add the generated agorot columns             <- you are here
--   2. rewrite the readers to use them
--   3. a later migration drops the numeric columns, at which point the agorot
--      columns must stop being generated and become plain written columns
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

  if exists (select 1
               from information_schema.columns
              where table_schema = 'public'
                and table_name   = 'products'
                and column_name  = 'price_ils_agorot') then
    raise notice 'skipping products.price_ils_agorot, column already present'; return;
  end if;

  alter table public.products
    add column price_ils_agorot bigint
      generated always as (round(price_ils * 100)::bigint) stored;

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

  if exists (select 1
               from information_schema.columns
              where table_schema = 'public'
                and table_name   = 'products'
                and column_name  = 'coupon_price_ils_agorot') then
    raise notice 'skipping products.coupon_price_ils_agorot, column already present'; return;
  end if;

  alter table public.products
    add column coupon_price_ils_agorot bigint
      generated always as (round(coupon_price_ils * 100)::bigint) stored;

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

  if exists (select 1
               from information_schema.columns
              where table_schema = 'public'
                and table_name   = 'products'
                and column_name  = 'cost_ils_agorot') then
    raise notice 'skipping products.cost_ils_agorot, column already present'; return;
  end if;

  alter table public.products
    add column cost_ils_agorot bigint
      generated always as (round(cost_ils * 100)::bigint) stored;

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

  if exists (select 1
               from information_schema.columns
              where table_schema = 'public'
                and table_name   = 'products'
                and column_name  = 'full_price_agorot') then
    raise notice 'skipping products.full_price_agorot, column already present'; return;
  end if;

  alter table public.products
    add column full_price_agorot bigint
      generated always as (round(full_price * 100)::bigint) stored;

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

  if exists (select 1
               from information_schema.columns
              where table_schema = 'public'
                and table_name   = 'products'
                and column_name  = 'kenyon_price_agorot') then
    raise notice 'skipping products.kenyon_price_agorot, column already present'; return;
  end if;

  alter table public.products
    add column kenyon_price_agorot bigint
      generated always as (round(kenyon_price * 100)::bigint) stored;

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

  if exists (select 1
               from information_schema.columns
              where table_schema = 'public'
                and table_name   = 'products'
                and column_name  = 'compare_at_price_agorot') then
    raise notice 'skipping products.compare_at_price_agorot, column already present'; return;
  end if;

  alter table public.products
    add column compare_at_price_agorot bigint
      generated always as (round(compare_at_price * 100)::bigint) stored;

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

  if exists (select 1
               from information_schema.columns
              where table_schema = 'public'
                and table_name   = 'products'
                and column_name  = 'compare_at_price_ils_agorot') then
    raise notice 'skipping products.compare_at_price_ils_agorot, column already present'; return;
  end if;

  alter table public.products
    add column compare_at_price_ils_agorot bigint
      generated always as (round(compare_at_price_ils * 100)::bigint) stored;

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

  if exists (select 1
               from information_schema.columns
              where table_schema = 'public'
                and table_name   = 'product_variants'
                and column_name  = 'price_agorot') then
    raise notice 'skipping product_variants.price_agorot, column already present'; return;
  end if;

  alter table public.product_variants
    add column price_agorot bigint
      generated always as (round(price * 100)::bigint) stored;

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

  if exists (select 1
               from information_schema.columns
              where table_schema = 'public'
                and table_name   = 'product_variants'
                and column_name  = 'price_ils_agorot') then
    raise notice 'skipping product_variants.price_ils_agorot, column already present'; return;
  end if;

  alter table public.product_variants
    add column price_ils_agorot bigint
      generated always as (round(price_ils * 100)::bigint) stored;

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

  if exists (select 1
               from information_schema.columns
              where table_schema = 'public'
                and table_name   = 'product_variants'
                and column_name  = 'price_modifier_agorot') then
    raise notice 'skipping product_variants.price_modifier_agorot, column already present'; return;
  end if;

  alter table public.product_variants
    add column price_modifier_agorot bigint
      generated always as (round(price_modifier * 100)::bigint) stored;

end
$$;


-- public.coupon_deals.original_price
do $$
begin
  if to_regclass('public.coupon_deals') is null then
    raise notice 'skipping coupon_deals, table not present'; return;
  end if;

  if exists (select 1
               from information_schema.columns
              where table_schema = 'public'
                and table_name   = 'coupon_deals'
                and column_name  = 'original_price_agorot') then
    raise notice 'skipping coupon_deals.original_price_agorot, column already present'; return;
  end if;

  alter table public.coupon_deals
    add column original_price_agorot bigint
      generated always as (round(original_price * 100)::bigint) stored;

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

  if exists (select 1
               from information_schema.columns
              where table_schema = 'public'
                and table_name   = 'coupon_deals'
                and column_name  = 'platform_price_agorot') then
    raise notice 'skipping coupon_deals.platform_price_agorot, column already present'; return;
  end if;

  alter table public.coupon_deals
    add column platform_price_agorot bigint
      generated always as (round(platform_price * 100)::bigint) stored;

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

  if exists (select 1
               from information_schema.columns
              where table_schema = 'public'
                and table_name   = 'coupons'
                and column_name  = 'discount_value_agorot') then
    raise notice 'skipping coupons.discount_value_agorot, column already present'; return;
  end if;

  alter table public.coupons
    add column discount_value_agorot bigint
      generated always as (round(discount_value * 100)::bigint) stored;

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

  if exists (select 1
               from information_schema.columns
              where table_schema = 'public'
                and table_name   = 'coupons'
                and column_name  = 'original_price_agorot') then
    raise notice 'skipping coupons.original_price_agorot, column already present'; return;
  end if;

  alter table public.coupons
    add column original_price_agorot bigint
      generated always as (round(original_price * 100)::bigint) stored;

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

  if exists (select 1
               from information_schema.columns
              where table_schema = 'public'
                and table_name   = 'coupon_codes'
                and column_name  = 'collect_amount_ils_agorot') then
    raise notice 'skipping coupon_codes.collect_amount_ils_agorot, column already present'; return;
  end if;

  alter table public.coupon_codes
    add column collect_amount_ils_agorot bigint
      generated always as (round(collect_amount_ils * 100)::bigint) stored;

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

  if exists (select 1
               from information_schema.columns
              where table_schema = 'public'
                and table_name   = 'coupon_codes'
                and column_name  = 'face_value_ils_agorot') then
    raise notice 'skipping coupon_codes.face_value_ils_agorot, column already present'; return;
  end if;

  alter table public.coupon_codes
    add column face_value_ils_agorot bigint
      generated always as (round(face_value_ils * 100)::bigint) stored;

  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.coupon_codes'::regclass
                   and conname = 'coupon_codes_face_value_ils_agorot_nonneg') then
    alter table public.coupon_codes
      add constraint coupon_codes_face_value_ils_agorot_nonneg check (face_value_ils_agorot is null or face_value_ils_agorot >= 0);
  end if;
end
$$;
