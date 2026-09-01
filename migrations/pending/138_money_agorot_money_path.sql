-- ============================================================================
-- APPLIED IN PRODUCTION, BUT NOT ALL OF IT. READ THIS BEFORE TRUSTING THE FILE.
-- ============================================================================
--
-- What ran in production was a collapsed, table-driven version of 138-141, not
-- this file. It created SIX of the eight columns below. Verified by querying
-- information_schema on 2026-09-01, not inferred from the migration record:
--
--   orders        subtotal_ils_agorot, total_ils_agorot
--   order_items   unit_price_ils_agorot, total_price_ils_agorot,
--                 coupon_price_ils_agorot
--   payments      amount_ils_agorot
--
-- TWO COLUMNS IN THIS FILE DO NOT EXIST IN PRODUCTION:
--
--   orders.discount_ils_agorot
--   order_items.supplier_payout_ils_agorot
--
-- The `do $$ ... $$` blocks for both are still below and are still correct, so
-- running this file would create them. Whether that is wanted is an open
-- question and is NOT answered here: the reason they were dropped from the
-- collapsed version was not recorded, and guessing at one in a migration header
-- is how a wrong reason becomes a fact.
--
-- WHY IT MATTERS TO A READER OF THE APPLICATION CODE. Four money columns still
-- have no generated twin, so they are the four that still convert in
-- JavaScript rather than in Postgres:
--
--   orders.discount_ils              orders.cashback_applied_ils
--   order_items.supplier_payout_ils  order_items.cashback_earned_ils
--
-- `src/lib/commerce/order-money-columns.ts` says the same thing at the call
-- site. The two lists have to be changed together.
-- ============================================================================

-- 138: orders, order_items and payments — money to integer agorot, additive and reversible.
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
-- The money path proper. `order_items` already carries nine `_agorot` integer
columns beside these four numeric ones, which is the dual representation this
whole set exists to end.
--
-- ROLLBACK
--
--   alter table public.orders drop column if exists subtotal_ils_agorot;
--   alter table public.orders drop column if exists total_ils_agorot;
--   alter table public.orders drop column if exists discount_ils_agorot;
--   alter table public.order_items drop column if exists unit_price_ils_agorot;
--   alter table public.order_items drop column if exists total_price_ils_agorot;
--   alter table public.order_items drop column if exists supplier_payout_ils_agorot;
--   alter table public.order_items drop column if exists coupon_price_ils_agorot;
--   alter table public.payments drop column if exists amount_ils_agorot;
--
-- NOT APPLIED. `migrations/pending/` is unapplied by definition. The route to
-- production is MCP `apply_migration` after a human approves this file.


-- public.orders.subtotal_ils
do $$
begin
  if to_regclass('public.orders') is null then
    raise notice 'skipping orders, table not present'; return;
  end if;

  if exists (select 1
               from information_schema.columns
              where table_schema = 'public'
                and table_name   = 'orders'
                and column_name  = 'subtotal_ils_agorot') then
    raise notice 'skipping orders.subtotal_ils_agorot, column already present'; return;
  end if;

  alter table public.orders
    add column subtotal_ils_agorot bigint
      generated always as (round(subtotal_ils * 100)::bigint) stored;

  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.orders'::regclass
                   and conname = 'orders_subtotal_ils_agorot_nonneg') then
    alter table public.orders
      add constraint orders_subtotal_ils_agorot_nonneg check (subtotal_ils_agorot is null or subtotal_ils_agorot >= 0);
  end if;
end
$$;


-- public.orders.total_ils
do $$
begin
  if to_regclass('public.orders') is null then
    raise notice 'skipping orders, table not present'; return;
  end if;

  if exists (select 1
               from information_schema.columns
              where table_schema = 'public'
                and table_name   = 'orders'
                and column_name  = 'total_ils_agorot') then
    raise notice 'skipping orders.total_ils_agorot, column already present'; return;
  end if;

  alter table public.orders
    add column total_ils_agorot bigint
      generated always as (round(total_ils * 100)::bigint) stored;

  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.orders'::regclass
                   and conname = 'orders_total_ils_agorot_nonneg') then
    alter table public.orders
      add constraint orders_total_ils_agorot_nonneg check (total_ils_agorot is null or total_ils_agorot >= 0);
  end if;
end
$$;


-- public.orders.discount_ils
do $$
begin
  if to_regclass('public.orders') is null then
    raise notice 'skipping orders, table not present'; return;
  end if;

  if exists (select 1
               from information_schema.columns
              where table_schema = 'public'
                and table_name   = 'orders'
                and column_name  = 'discount_ils_agorot') then
    raise notice 'skipping orders.discount_ils_agorot, column already present'; return;
  end if;

  alter table public.orders
    add column discount_ils_agorot bigint
      generated always as (round(discount_ils * 100)::bigint) stored;

  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.orders'::regclass
                   and conname = 'orders_discount_ils_agorot_nonneg') then
    alter table public.orders
      add constraint orders_discount_ils_agorot_nonneg check (discount_ils_agorot is null or discount_ils_agorot >= 0);
  end if;
end
$$;


-- public.order_items.unit_price_ils
do $$
begin
  if to_regclass('public.order_items') is null then
    raise notice 'skipping order_items, table not present'; return;
  end if;

  if exists (select 1
               from information_schema.columns
              where table_schema = 'public'
                and table_name   = 'order_items'
                and column_name  = 'unit_price_ils_agorot') then
    raise notice 'skipping order_items.unit_price_ils_agorot, column already present'; return;
  end if;

  alter table public.order_items
    add column unit_price_ils_agorot bigint
      generated always as (round(unit_price_ils * 100)::bigint) stored;

  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.order_items'::regclass
                   and conname = 'order_items_unit_price_ils_agorot_nonneg') then
    alter table public.order_items
      add constraint order_items_unit_price_ils_agorot_nonneg check (unit_price_ils_agorot is null or unit_price_ils_agorot >= 0);
  end if;
end
$$;


-- public.order_items.total_price_ils
do $$
begin
  if to_regclass('public.order_items') is null then
    raise notice 'skipping order_items, table not present'; return;
  end if;

  if exists (select 1
               from information_schema.columns
              where table_schema = 'public'
                and table_name   = 'order_items'
                and column_name  = 'total_price_ils_agorot') then
    raise notice 'skipping order_items.total_price_ils_agorot, column already present'; return;
  end if;

  alter table public.order_items
    add column total_price_ils_agorot bigint
      generated always as (round(total_price_ils * 100)::bigint) stored;

  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.order_items'::regclass
                   and conname = 'order_items_total_price_ils_agorot_nonneg') then
    alter table public.order_items
      add constraint order_items_total_price_ils_agorot_nonneg check (total_price_ils_agorot is null or total_price_ils_agorot >= 0);
  end if;
end
$$;


-- public.order_items.supplier_payout_ils
do $$
begin
  if to_regclass('public.order_items') is null then
    raise notice 'skipping order_items, table not present'; return;
  end if;

  if exists (select 1
               from information_schema.columns
              where table_schema = 'public'
                and table_name   = 'order_items'
                and column_name  = 'supplier_payout_ils_agorot') then
    raise notice 'skipping order_items.supplier_payout_ils_agorot, column already present'; return;
  end if;

  alter table public.order_items
    add column supplier_payout_ils_agorot bigint
      generated always as (round(supplier_payout_ils * 100)::bigint) stored;

  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.order_items'::regclass
                   and conname = 'order_items_supplier_payout_ils_agorot_nonneg') then
    alter table public.order_items
      add constraint order_items_supplier_payout_ils_agorot_nonneg check (supplier_payout_ils_agorot is null or supplier_payout_ils_agorot >= 0);
  end if;
end
$$;


-- public.order_items.coupon_price_ils
do $$
begin
  if to_regclass('public.order_items') is null then
    raise notice 'skipping order_items, table not present'; return;
  end if;

  if exists (select 1
               from information_schema.columns
              where table_schema = 'public'
                and table_name   = 'order_items'
                and column_name  = 'coupon_price_ils_agorot') then
    raise notice 'skipping order_items.coupon_price_ils_agorot, column already present'; return;
  end if;

  alter table public.order_items
    add column coupon_price_ils_agorot bigint
      generated always as (round(coupon_price_ils * 100)::bigint) stored;

  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.order_items'::regclass
                   and conname = 'order_items_coupon_price_ils_agorot_nonneg') then
    alter table public.order_items
      add constraint order_items_coupon_price_ils_agorot_nonneg check (coupon_price_ils_agorot is null or coupon_price_ils_agorot >= 0);
  end if;
end
$$;


-- public.payments.amount_ils
do $$
begin
  if to_regclass('public.payments') is null then
    raise notice 'skipping payments, table not present'; return;
  end if;

  if exists (select 1
               from information_schema.columns
              where table_schema = 'public'
                and table_name   = 'payments'
                and column_name  = 'amount_ils_agorot') then
    raise notice 'skipping payments.amount_ils_agorot, column already present'; return;
  end if;

  alter table public.payments
    add column amount_ils_agorot bigint
      generated always as (round(amount_ils * 100)::bigint) stored;

  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.payments'::regclass
                   and conname = 'payments_amount_ils_agorot_nonneg') then
    alter table public.payments
      add constraint payments_amount_ils_agorot_nonneg check (amount_ils_agorot is null or amount_ils_agorot >= 0);
  end if;
end
$$;
