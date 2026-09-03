-- 160_orders_indexes: orders + order_items base tables, plus indexes on
-- orders(user_id), orders(created_at) and order_items(created_at).
--
-- RENAMED FROM 005_orders.sql on 2026-09-03. `supabase/migrations/` already
-- holds a 005 (005_products_schema.sql), so the old name meant two different
-- things in the two directories -- which pending-migrations-inventory.test.ts
-- refuses. 005 also sorted ahead of the entire 122-158 applied series, every
-- member of which already assumes these two tables exist.
--
-- CONTEXT. Both tables already exist on the hosted DB (the applied 1xx series
-- assumes them throughout), so every statement here is guarded: on production
-- the CREATEs no-op and the net effect is the three indexes. Column lists
-- mirror the Drizzle projections in src/db/schema/orders.ts and
-- src/db/schema/order-items.ts; the live tables carry more columns than this,
-- which IF NOT EXISTS leaves untouched.
--
-- ROLLBACK (indexes only; never drop the tables, they hold production data):
--
--   drop index if exists public.orders_user_id_idx;
--   drop index if exists public.orders_created_at_idx;
--   drop index if exists public.order_items_created_at_idx;

do $$ begin
  create type public.order_status as enum
    ('pending', 'paid', 'partially_fulfilled', 'fulfilled', 'cancelled', 'refunded');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.order_item_status as enum
    ('pending', 'issued', 'shipped', 'delivered', 'cancelled', 'refunded');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.product_type as enum ('coupon', 'physical', 'service');
exception when duplicate_object then null;
end $$;

create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete restrict,
  status public.order_status not null default 'pending',
  subtotal_agorot integer not null,
  discount_agorot integer not null default 0,
  wallet_applied_agorot integer not null default 0,
  customer_pays_now_agorot integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  supplier_id uuid not null references public.suppliers (id) on delete restrict,
  product_type public.product_type not null,
  quantity integer not null,
  unit_price_agorot integer not null,
  face_value_agorot integer not null,
  customer_pays_now_agorot integer not null,
  platform_percent numeric(5, 2) not null,
  platform_fee_agorot integer not null,
  supplier_due_agorot integer not null,
  cashback_percent numeric(5, 2) not null,
  cashback_amount_agorot integer not null,
  item_status public.order_item_status not null default 'pending',
  fulfilled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint order_items_quantity_positive check (quantity > 0),
  constraint order_items_unit_price_nonnegative check (unit_price_agorot >= 0),
  constraint order_items_face_value_nonnegative check (face_value_agorot >= 0),
  constraint order_items_customer_pays_now_nonnegative check (customer_pays_now_agorot >= 0),
  constraint order_items_platform_fee_nonnegative check (platform_fee_agorot >= 0),
  constraint order_items_supplier_due_nonnegative check (supplier_due_agorot >= 0),
  constraint order_items_cashback_amount_nonnegative check (cashback_amount_agorot >= 0)
);

create index if not exists orders_user_id_idx
  on public.orders (user_id);

create index if not exists orders_created_at_idx
  on public.orders (created_at);

create index if not exists order_items_created_at_idx
  on public.order_items (created_at);
