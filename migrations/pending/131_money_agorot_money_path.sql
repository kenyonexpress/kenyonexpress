-- 131: orders, order_items and payments — money to integer agorot, additive and reversible.
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

  alter table public.orders add column if not exists subtotal_ils_agorot bigint;

  update public.orders
     set subtotal_ils_agorot = round(subtotal_ils * 100)
   where subtotal_ils is not null and subtotal_ils_agorot is distinct from round(subtotal_ils * 100);

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

  alter table public.orders add column if not exists total_ils_agorot bigint;

  update public.orders
     set total_ils_agorot = round(total_ils * 100)
   where total_ils is not null and total_ils_agorot is distinct from round(total_ils * 100);

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

  alter table public.orders add column if not exists discount_ils_agorot bigint;

  update public.orders
     set discount_ils_agorot = round(discount_ils * 100)
   where discount_ils is not null and discount_ils_agorot is distinct from round(discount_ils * 100);

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

  alter table public.order_items add column if not exists unit_price_ils_agorot bigint;

  update public.order_items
     set unit_price_ils_agorot = round(unit_price_ils * 100)
   where unit_price_ils is not null and unit_price_ils_agorot is distinct from round(unit_price_ils * 100);

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

  alter table public.order_items add column if not exists total_price_ils_agorot bigint;

  update public.order_items
     set total_price_ils_agorot = round(total_price_ils * 100)
   where total_price_ils is not null and total_price_ils_agorot is distinct from round(total_price_ils * 100);

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

  alter table public.order_items add column if not exists supplier_payout_ils_agorot bigint;

  update public.order_items
     set supplier_payout_ils_agorot = round(supplier_payout_ils * 100)
   where supplier_payout_ils is not null and supplier_payout_ils_agorot is distinct from round(supplier_payout_ils * 100);

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

  alter table public.order_items add column if not exists coupon_price_ils_agorot bigint;

  update public.order_items
     set coupon_price_ils_agorot = round(coupon_price_ils * 100)
   where coupon_price_ils is not null and coupon_price_ils_agorot is distinct from round(coupon_price_ils * 100);

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

  alter table public.payments add column if not exists amount_ils_agorot bigint;

  update public.payments
     set amount_ils_agorot = round(amount_ils * 100)
   where amount_ils is not null and amount_ils_agorot is distinct from round(amount_ils * 100);

  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.payments'::regclass
                   and conname = 'payments_amount_ils_agorot_nonneg') then
    alter table public.payments
      add constraint payments_amount_ils_agorot_nonneg check (amount_ils_agorot is null or amount_ils_agorot >= 0);
  end if;
end
$$;
