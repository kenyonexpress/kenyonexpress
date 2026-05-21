-- KenyonExpress — comprehensive initial schema
-- Applies to: fresh Supabase project (reset DB before running)
-- Run via: supabase db push  OR  Supabase Dashboard → SQL Editor

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------

create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm"; -- full-text search helpers

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

create type public.vendor_status as enum (
  'pending', 'active', 'suspended'
);

create type public.product_type as enum (
  'physical', 'coupon'
);

create type public.product_status as enum (
  'draft', 'active', 'paused', 'archived'
);

create type public.coupon_status as enum (
  'active', 'redeemed', 'expired'
);

create type public.order_status as enum (
  'pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'
);

create type public.wallet_tx_type as enum (
  'cashback_earned', 'order_payment', 'refund', 'adjustment'
);

-- ---------------------------------------------------------------------------
-- Shared updated_at trigger function
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Order number sequence
-- ---------------------------------------------------------------------------

create sequence if not exists public.order_number_seq start 1;

create or replace function public.generate_order_number()
returns trigger language plpgsql as $$
begin
  new.order_number = 'KE-' || to_char(now(), 'YYYYMMDD') || '-'
    || lpad(nextval('public.order_number_seq')::text, 5, '0');
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. profiles  (extends auth.users)
-- ---------------------------------------------------------------------------

CREATE TYPE public.user_role AS ENUM ('customer', 'content_uploader', 'vendor', 'admin', 'super_admin');

create table public.profiles (
  id           uuid primary key references auth.users(id) on delete cascade,
  email        text not null,
  full_name    text,
  phone        text,
  avatar_url   text,
  role         public.user_role NOT NULL DEFAULT 'customer',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index profiles_email_idx       on public.profiles (email);
create index profiles_role_idx        on public.profiles (role);

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Admin helper (used in RLS policies)
-- ---------------------------------------------------------------------------

create or replace function public.is_admin()
returns boolean language sql stable security definer
set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  )
$$;

-- ---------------------------------------------------------------------------
-- 2. vendors
-- ---------------------------------------------------------------------------

create table public.vendors (
  id               uuid primary key default gen_random_uuid(),
  profile_id       uuid not null unique references public.profiles(id) on delete cascade,
  business_name    text not null,
  business_id      text not null unique,    -- ח.פ / עוסק מורשה
  contact_email    text not null,
  contact_phone    text,
  address          text,
  bank_account     text,                    -- encrypted at application level
  commission_rate  numeric(5,2) not null default 10
    check (commission_rate between 0 and 100),
  status           public.vendor_status not null default 'pending',
  created_at       timestamptz not null default now()
);

create index vendors_profile_id_idx on public.vendors (profile_id);
create index vendors_status_idx     on public.vendors (status);

-- ---------------------------------------------------------------------------
-- 3. categories
-- ---------------------------------------------------------------------------

create table public.categories (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null unique,
  name_he        text not null,
  name_en        text not null,
  description_he text,
  parent_id      uuid references public.categories(id) on delete set null,
  icon_url       text,
  sort_order     integer not null default 0,
  is_active      boolean not null default true
);

create index categories_parent_id_idx  on public.categories (parent_id);
create index categories_sort_order_idx on public.categories (sort_order);
create index categories_is_active_idx  on public.categories (is_active) where is_active = true;

-- ---------------------------------------------------------------------------
-- 4. products
-- ---------------------------------------------------------------------------

create table public.products (
  id              uuid primary key default gen_random_uuid(),
  vendor_id       uuid not null references public.vendors(id) on delete restrict,
  category_id     uuid references public.categories(id) on delete set null,
  slug            text not null unique,
  name_he         text not null,
  description_he  text,
  type            public.product_type not null default 'physical',
  base_price      numeric(12,2) not null check (base_price >= 0),
  sale_price      numeric(12,2) check (sale_price is null or sale_price >= 0),
  currency        text not null default 'ILS',
  stock_quantity  integer check (stock_quantity is null or stock_quantity >= 0),
  status          public.product_status not null default 'draft',
  images          jsonb not null default '[]'::jsonb,
  seo_meta        jsonb not null default '{}'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index products_vendor_id_idx    on public.products (vendor_id);
create index products_category_id_idx  on public.products (category_id);
create index products_slug_idx         on public.products (slug);
create index products_status_idx       on public.products (status);
create index products_type_idx         on public.products (type);
create index products_active_idx
  on public.products (vendor_id, category_id)
  where status = 'active';
create index products_name_he_trgm_idx
  on public.products using gin (name_he gin_trgm_ops);

create trigger products_set_updated_at
  before update on public.products
  for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 5. product_variants
-- ---------------------------------------------------------------------------

create table public.product_variants (
  id              uuid primary key default gen_random_uuid(),
  product_id      uuid not null references public.products(id) on delete cascade,
  sku             text not null unique,
  name_he         text not null,
  price_modifier  numeric(12,2) not null default 0,
  stock_quantity  integer check (stock_quantity is null or stock_quantity >= 0),
  attributes      jsonb not null default '{}'::jsonb,
  is_active       boolean not null default true
);

create index product_variants_product_id_idx on public.product_variants (product_id);
create index product_variants_sku_idx        on public.product_variants (sku);

-- ---------------------------------------------------------------------------
-- 6. coupons  (issued coupon instances for coupon-type products)
-- ---------------------------------------------------------------------------

create table public.coupons (
  id                     uuid primary key default gen_random_uuid(),
  product_id             uuid not null references public.products(id) on delete restrict,
  code                   text not null unique,
  qr_data                text not null,
  expiry_date            timestamptz,
  redeemed_at            timestamptz,
  redeemed_by_vendor_at  timestamptz,
  customer_id            uuid references public.profiles(id) on delete set null,
  status                 public.coupon_status not null default 'active',
  created_at             timestamptz not null default now()
);

create index coupons_product_id_idx   on public.coupons (product_id);
create index coupons_customer_id_idx  on public.coupons (customer_id);
create index coupons_status_idx       on public.coupons (status);
create index coupons_code_idx         on public.coupons (code);

-- ---------------------------------------------------------------------------
-- 7. orders
-- ---------------------------------------------------------------------------

create table public.orders (
  id               uuid primary key default gen_random_uuid(),
  order_number     text not null unique,
  customer_id      uuid not null references public.profiles(id) on delete restrict,
  status           public.order_status not null default 'pending',
  subtotal         numeric(12,2) not null check (subtotal >= 0),
  discount_amount  numeric(12,2) not null default 0 check (discount_amount >= 0),
  total            numeric(12,2) not null check (total >= 0),
  platform_fee     numeric(12,2) not null default 0 check (platform_fee >= 0),
  vendor_payout    numeric(12,2) not null default 0 check (vendor_payout >= 0),
  payment_method   text,
  payment_token_id uuid,
  shipping_address jsonb,
  notes            text,
  created_at       timestamptz not null default now(),
  paid_at          timestamptz,
  updated_at       timestamptz not null default now()
);

create index orders_customer_id_created_at_idx on public.orders (customer_id, created_at desc);
create index orders_order_number_idx           on public.orders (order_number);
create index orders_status_idx                 on public.orders (status);

create trigger orders_generate_order_number
  before insert on public.orders
  for each row when (new.order_number is null or new.order_number = '')
  execute procedure public.generate_order_number();

create trigger orders_set_updated_at
  before update on public.orders
  for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 8. order_items
-- ---------------------------------------------------------------------------

create table public.order_items (
  id            uuid primary key default gen_random_uuid(),
  order_id      uuid not null references public.orders(id) on delete cascade,
  product_id    uuid references public.products(id) on delete set null,
  variant_id    uuid references public.product_variants(id) on delete set null,
  vendor_id     uuid not null references public.vendors(id) on delete restrict,
  quantity      integer not null check (quantity > 0),
  unit_price    numeric(12,2) not null check (unit_price >= 0),
  subtotal      numeric(12,2) not null check (subtotal >= 0),
  platform_fee  numeric(12,2) not null default 0 check (platform_fee >= 0),
  vendor_payout numeric(12,2) not null default 0 check (vendor_payout >= 0),
  created_at    timestamptz not null default now()
);

create index order_items_order_id_idx   on public.order_items (order_id);
create index order_items_product_id_idx on public.order_items (product_id);
create index order_items_vendor_id_idx  on public.order_items (vendor_id);

-- ---------------------------------------------------------------------------
-- 9. wallets
-- ---------------------------------------------------------------------------

create table public.wallets (
  id               uuid primary key default gen_random_uuid(),
  profile_id       uuid not null unique references public.profiles(id) on delete cascade,
  balance          numeric(12,2) not null default 0 check (balance >= 0),
  lifetime_earned  numeric(12,2) not null default 0 check (lifetime_earned >= 0),
  lifetime_spent   numeric(12,2) not null default 0 check (lifetime_spent >= 0),
  updated_at       timestamptz not null default now()
);

create index wallets_profile_id_idx on public.wallets (profile_id);

create trigger wallets_set_updated_at
  before update on public.wallets
  for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 10. wallet_transactions
-- ---------------------------------------------------------------------------

create table public.wallet_transactions (
  id               uuid primary key default gen_random_uuid(),
  wallet_id        uuid not null references public.wallets(id) on delete cascade,
  type             public.wallet_tx_type not null,
  amount           numeric(12,2) not null,
  related_order_id uuid references public.orders(id) on delete set null,
  description      text,
  created_at       timestamptz not null default now()
);

create index wallet_transactions_wallet_id_idx
  on public.wallet_transactions (wallet_id, created_at desc);
create index wallet_transactions_order_id_idx
  on public.wallet_transactions (related_order_id);

-- ---------------------------------------------------------------------------
-- 11. payment_tokens  (Cardcom tokenised cards)
-- ---------------------------------------------------------------------------

create table public.payment_tokens (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid not null references public.profiles(id) on delete cascade,
  cardcom_token   text not null,
  last_4          char(4) not null,
  card_brand      text not null,
  expiry_month    smallint not null check (expiry_month between 1 and 12),
  expiry_year     smallint not null check (expiry_year >= 2024),
  is_default      boolean not null default false,
  created_at      timestamptz not null default now()
);

create index payment_tokens_profile_id_idx on public.payment_tokens (profile_id);

-- Only one default card per user
create unique index payment_tokens_default_idx
  on public.payment_tokens (profile_id)
  where is_default = true;

-- ---------------------------------------------------------------------------
-- 12. carts  (persistent + guest)
-- ---------------------------------------------------------------------------

create table public.carts (
  id          uuid primary key default gen_random_uuid(),
  profile_id  uuid references public.profiles(id) on delete cascade,
  session_id  text,
  items       jsonb not null default '[]'::jsonb,
  expires_at  timestamptz not null default now() + interval '30 days',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint carts_owner_check check (profile_id is not null or session_id is not null)
);

create index carts_profile_id_idx  on public.carts (profile_id);
create index carts_session_id_idx  on public.carts (session_id);
create index carts_expires_at_idx  on public.carts (expires_at);

create trigger carts_set_updated_at
  before update on public.carts
  for each row execute procedure public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Auto-create profile + wallet on signup
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer
set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    new.raw_user_meta_data->>'avatar_url'
  );

  insert into public.wallets (profile_id)
  values (new.id);

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

alter table public.profiles          enable row level security;
alter table public.vendors           enable row level security;
alter table public.categories        enable row level security;
alter table public.products          enable row level security;
alter table public.product_variants  enable row level security;
alter table public.coupons           enable row level security;
alter table public.orders            enable row level security;
alter table public.order_items       enable row level security;
alter table public.wallets           enable row level security;
alter table public.wallet_transactions enable row level security;
alter table public.payment_tokens    enable row level security;
alter table public.carts             enable row level security;

-- ---------- profiles ----------

create policy "profiles: owner select"
  on public.profiles for select to authenticated
  using (id = auth.uid() or public.is_admin());

create policy "profiles: owner update"
  on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and role = (select role from public.profiles where id = auth.uid()));

create policy "profiles: admin all"
  on public.profiles for all to authenticated
  using (public.is_admin());

-- ---------- vendors ----------

create policy "vendors: public select active"
  on public.vendors for select
  using (status = 'active' or public.is_admin());

create policy "vendors: owner manage"
  on public.vendors for all to authenticated
  using (profile_id = auth.uid() or public.is_admin())
  with check (profile_id = auth.uid() or public.is_admin());

-- ---------- categories ----------

create policy "categories: public read active"
  on public.categories for select
  using (is_active = true or public.is_admin());

create policy "categories: admin write"
  on public.categories for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- ---------- products ----------

create policy "products: public read active"
  on public.products for select
  using (status = 'active' or public.is_admin()
    or vendor_id in (select id from public.vendors where profile_id = auth.uid()));

create policy "products: vendor manage own"
  on public.products for all to authenticated
  using (
    vendor_id in (select id from public.vendors where profile_id = auth.uid())
    or public.is_admin()
  )
  with check (
    vendor_id in (select id from public.vendors where profile_id = auth.uid())
    or public.is_admin()
  );

-- ---------- product_variants ----------

create policy "variants: public read active"
  on public.product_variants for select
  using (
    is_active = true
    or public.is_admin()
    or product_id in (
      select id from public.products
      where vendor_id in (select id from public.vendors where profile_id = auth.uid())
    )
  );

create policy "variants: vendor manage own"
  on public.product_variants for all to authenticated
  using (
    product_id in (
      select id from public.products
      where vendor_id in (select id from public.vendors where profile_id = auth.uid())
    ) or public.is_admin()
  )
  with check (
    product_id in (
      select id from public.products
      where vendor_id in (select id from public.vendors where profile_id = auth.uid())
    ) or public.is_admin()
  );

-- ---------- coupons ----------

create policy "coupons: customer select own"
  on public.coupons for select to authenticated
  using (customer_id = auth.uid() or public.is_admin()
    or product_id in (
      select id from public.products
      where vendor_id in (select id from public.vendors where profile_id = auth.uid())
    ));

create policy "coupons: customer insert own"
  on public.coupons for insert to authenticated
  with check (customer_id = auth.uid() or public.is_admin());

create policy "coupons: vendor redeem"
  on public.coupons for update to authenticated
  using (
    product_id in (
      select id from public.products
      where vendor_id in (select id from public.vendors where profile_id = auth.uid())
    ) or public.is_admin()
  );

-- ---------- orders ----------

create policy "orders: customer select own"
  on public.orders for select to authenticated
  using (customer_id = auth.uid() or public.is_admin());

create policy "orders: customer insert"
  on public.orders for insert to authenticated
  with check (customer_id = auth.uid());

create policy "orders: system update"
  on public.orders for update to authenticated
  using (customer_id = auth.uid() or public.is_admin());

-- ---------- order_items ----------

create policy "order_items: customer select via order"
  on public.order_items for select to authenticated
  using (
    order_id in (select id from public.orders where customer_id = auth.uid())
    or public.is_admin()
    or vendor_id in (select id from public.vendors where profile_id = auth.uid())
  );

create policy "order_items: insert with order"
  on public.order_items for insert to authenticated
  with check (
    order_id in (select id from public.orders where customer_id = auth.uid())
    or public.is_admin()
  );

-- ---------- wallets ----------

create policy "wallets: owner select"
  on public.wallets for select to authenticated
  using (profile_id = auth.uid() or public.is_admin());

create policy "wallets: system update"
  on public.wallets for update to authenticated
  using (profile_id = auth.uid() or public.is_admin());

-- ---------- wallet_transactions ----------

create policy "wallet_transactions: owner select"
  on public.wallet_transactions for select to authenticated
  using (
    wallet_id in (select id from public.wallets where profile_id = auth.uid())
    or public.is_admin()
  );

create policy "wallet_transactions: system insert"
  on public.wallet_transactions for insert to authenticated
  with check (
    wallet_id in (select id from public.wallets where profile_id = auth.uid())
    or public.is_admin()
  );

-- ---------- payment_tokens ----------

create policy "payment_tokens: owner all"
  on public.payment_tokens for all to authenticated
  using (profile_id = auth.uid() or public.is_admin())
  with check (profile_id = auth.uid() or public.is_admin());

-- ---------- carts ----------

create policy "carts: owner all"
  on public.carts for all
  using (
    profile_id = auth.uid()
    or session_id = current_setting('request.cookies', true)::json->>'session_id'
    or public.is_admin()
  )
  with check (
    profile_id = auth.uid()
    or profile_id is null
    or public.is_admin()
  );
