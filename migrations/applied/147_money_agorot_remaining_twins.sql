-- 147: the last four money columns that still convert in JavaScript.
--
-- WHAT THIS FINISHES. `src/lib/commerce/order-money-columns.ts` reads
-- `subtotal_ils_agorot` and `total_ils_agorot` and does the multiply in
-- Postgres. It cannot do that for four columns, because they are the four that
-- never got a generated twin:
--
--   orders.discount_ils              orders.cashback_applied_ils
--   order_items.supplier_payout_ils  order_items.cashback_earned_ils
--
-- Verified against production on 2026-09-01 by querying information_schema, not
-- inferred from the migration record: of the 26 `_agorot` columns live today,
-- every one reports `is_generated = ALWAYS`, and none of these four exists.
--
-- Two of them (`orders.discount_ils_agorot`,
-- `order_items.supplier_payout_ils_agorot`) have correct `do $$ ... $$` blocks
-- in 138 that were dropped from the collapsed version actually applied. 138's
-- own header says the reason was never recorded and declines to guess at one.
-- This file does not guess either. It simply creates all four, because the
-- application-side reason to want them is on the record and is the same for all
-- four: the conversion happens once in Postgres against the numeric source
-- instead of in JavaScript against a value that has already crossed a JSON
-- boundary as a string.
--
-- WHY GENERATED, AND WHY THAT IS NOT A HALF MEASURE. `generated always as
-- (round(<col> * 100)::bigint) stored` cannot drift: Postgres recomputes it on
-- every insert and update of the base column, and REFUSES any write that names
-- it (SQLSTATE 428C9). So reads are safe the moment this applies and no writer
-- changes. The numeric column stays the source of truth.
--
-- WHAT THIS DOES NOT DO, AND MUST NOT. It does not change any reader. A select
-- that names a column which does not exist fails with 42703 and takes the whole
-- row with it -- that is exactly how the confirmation page once 404'd someone
-- who had just paid. The reader in `order-money-columns.ts` changes only after
-- this file is applied and verified, in a separate commit, and its comment
-- naming these four columns has to be changed in the same edit.
--
-- The nonneg checks are safe against current data, measured rather than assumed:
--
--   orders.discount_ils              min 0.00    negatives 0
--   orders.cashback_applied_ils      min 0.00    negatives 0
--   order_items.supplier_payout_ils  min 17.10   negatives 0
--   order_items.cashback_earned_ils  min 0.00    negatives 0
--
-- ROLLBACK
--
--   alter table public.orders      drop column if exists discount_ils_agorot;
--   alter table public.orders      drop column if exists cashback_applied_ils_agorot;
--   alter table public.order_items drop column if exists supplier_payout_ils_agorot;
--   alter table public.order_items drop column if exists cashback_earned_ils_agorot;
--
-- DRY RUN, 2026-09-01, against production inside a transaction that was rolled
-- back. Every statement below ran, the four columns were created, and the
-- verification block then raised to abort the whole thing:
--
--   MIGRATION147_DRYRUN missing=[none]
--     values=[payout=1710 cashback=0; payout=1710 cashback=0; payout=75905 cashback=0]
--
-- All four reported `is_generated = ALWAYS`, and the arithmetic is right on real
-- rows: 17.10 -> 1710 and 759.05 -> 75905. Confirmed afterwards that the
-- rollback left nothing behind: zero columns of these four names exist in
-- production. So this file is known to apply cleanly, and it is still unapplied.
--
-- NOT APPLIED. `migrations/pending/` is unapplied by definition. The route to
-- production is MCP `apply_migration` after a human approves this file.


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


-- public.orders.cashback_applied_ils
do $$
begin
  if to_regclass('public.orders') is null then
    raise notice 'skipping orders, table not present'; return;
  end if;

  if exists (select 1
               from information_schema.columns
              where table_schema = 'public'
                and table_name   = 'orders'
                and column_name  = 'cashback_applied_ils_agorot') then
    raise notice 'skipping orders.cashback_applied_ils_agorot, column already present'; return;
  end if;

  alter table public.orders
    add column cashback_applied_ils_agorot bigint
      generated always as (round(cashback_applied_ils * 100)::bigint) stored;

  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.orders'::regclass
                   and conname = 'orders_cashback_applied_ils_agorot_nonneg') then
    alter table public.orders
      add constraint orders_cashback_applied_ils_agorot_nonneg check (cashback_applied_ils_agorot is null or cashback_applied_ils_agorot >= 0);
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


-- public.order_items.cashback_earned_ils
do $$
begin
  if to_regclass('public.order_items') is null then
    raise notice 'skipping order_items, table not present'; return;
  end if;

  if exists (select 1
               from information_schema.columns
              where table_schema = 'public'
                and table_name   = 'order_items'
                and column_name  = 'cashback_earned_ils_agorot') then
    raise notice 'skipping order_items.cashback_earned_ils_agorot, column already present'; return;
  end if;

  alter table public.order_items
    add column cashback_earned_ils_agorot bigint
      generated always as (round(cashback_earned_ils * 100)::bigint) stored;

  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.order_items'::regclass
                   and conname = 'order_items_cashback_earned_ils_agorot_nonneg') then
    alter table public.order_items
      add constraint order_items_cashback_earned_ils_agorot_nonneg check (cashback_earned_ils_agorot is null or cashback_earned_ils_agorot >= 0);
  end if;
end
$$;
