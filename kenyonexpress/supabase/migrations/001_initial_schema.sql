-- KenyonExpress initial schema
-- Run via Supabase CLI or SQL Editor (Dashboard → SQL)

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  phone text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid (),
  name text not null,
  description text,
  price_ils numeric(12, 2) not null check (price_ils >= 0),
  image_url text,
  stock_quantity integer not null default 0 check (stock_quantity >= 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.coupons (
  id uuid primary key default gen_random_uuid (),
  code text not null unique,
  discount_type text not null check (discount_type in ('percent', 'fixed')),
  discount_value numeric(12, 2) not null check (discount_value >= 0),
  min_order_amount_ils numeric(12, 2) check (min_order_amount_ils is null or min_order_amount_ils >= 0),
  max_redemptions integer check (max_redemptions is null or max_redemptions >= 0),
  redemptions_count integer not null default 0 check (redemptions_count >= 0),
  starts_at timestamptz,
  ends_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint coupons_percent_cap check (
    discount_type <> 'percent'
    or (discount_value <= 100)
  )
);

create table public.orders (
  id uuid primary key default gen_random_uuid (),
  user_id uuid not null references public.profiles (id) on delete restrict,
  status text not null default 'pending' check (
    status in (
      'pending',
      'paid',
      'processing',
      'shipped',
      'delivered',
      'cancelled',
      'refunded'
    )
  ),
  subtotal_ils numeric(12, 2) not null default 0 check (subtotal_ils >= 0),
  discount_ils numeric(12, 2) not null default 0 check (discount_ils >= 0),
  shipping_ils numeric(12, 2) not null default 0 check (shipping_ils >= 0),
  total_ils numeric(12, 2) not null default 0 check (total_ils >= 0),
  coupon_id uuid references public.coupons (id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.order_items (
  id uuid primary key default gen_random_uuid (),
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id uuid references public.products (id) on delete set null,
  product_name_snapshot text not null,
  quantity integer not null check (quantity > 0),
  unit_price_ils numeric(12, 2) not null check (unit_price_ils >= 0),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create index orders_user_id_created_at_idx on public.orders (user_id, created_at desc);

create index order_items_order_id_idx on public.order_items (order_id);

create index order_items_product_id_idx on public.order_items (product_id);

create index coupons_code_idx on public.coupons (code);

create index products_is_active_idx on public.products (is_active) where is_active = true;

-- ---------------------------------------------------------------------------
-- updated_at trigger (reusable)
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at ()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row
execute procedure public.set_updated_at ();

create trigger products_set_updated_at
before update on public.products
for each row
execute procedure public.set_updated_at ();

create trigger orders_set_updated_at
before update on public.orders
for each row
execute procedure public.set_updated_at ();

-- ---------------------------------------------------------------------------
-- Profile row on signup (auth.users)
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user ()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row
execute procedure public.handle_new_user ();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;

alter table public.products enable row level security;

alter table public.coupons enable row level security;

alter table public.orders enable row level security;

alter table public.order_items enable row level security;

-- profiles
create policy "Profiles are selectable by owner"
on public.profiles
for select
to authenticated
using (id = auth.uid ());

create policy "Profiles are insertable by owner"
on public.profiles
for insert
to authenticated
with check (id = auth.uid ());

create policy "Profiles are updatable by owner"
on public.profiles
for update
to authenticated
using (id = auth.uid ())
with check (id = auth.uid ());

-- products: public catalog (anon + authenticated)
create policy "Active products are readable"
on public.products
for select
using (is_active = true);

-- coupons: readable when active and in valid window (for checkout / browsing)
create policy "Active coupons in window are readable"
on public.coupons
for select
using (
  is_active = true
  and (starts_at is null or starts_at <= now())
  and (ends_at is null or ends_at > now())
);

-- orders: owner only; insert/update scoped to owner
create policy "Orders are selectable by owner"
on public.orders
for select
to authenticated
using (user_id = auth.uid ());

create policy "Orders are insertable by owner"
on public.orders
for insert
to authenticated
with check (user_id = auth.uid ());

create policy "Orders are updatable by owner"
on public.orders
for update
to authenticated
using (user_id = auth.uid ())
with check (user_id = auth.uid ());

-- order_items: same owner as parent order
create policy "Order items are selectable with order"
on public.order_items
for select
to authenticated
using (
  exists (
    select 1
    from public.orders o
    where
      o.id = order_items.order_id
      and o.user_id = auth.uid ()
  )
);

create policy "Order items are insertable with order"
on public.order_items
for insert
to authenticated
with check (
  exists (
    select 1
    from public.orders o
    where
      o.id = order_items.order_id
      and o.user_id = auth.uid ()
  )
);

create policy "Order items are updatable with order"
on public.order_items
for update
to authenticated
using (
  exists (
    select 1
    from public.orders o
    where
      o.id = order_items.order_id
      and o.user_id = auth.uid ()
  )
)
with check (
  exists (
    select 1
    from public.orders o
    where
      o.id = order_items.order_id
      and o.user_id = auth.uid ()
  )
);

create policy "Order items are deletable with order"
on public.order_items
for delete
to authenticated
using (
  exists (
    select 1
    from public.orders o
    where
      o.id = order_items.order_id
      and o.user_id = auth.uid ()
  )
);
