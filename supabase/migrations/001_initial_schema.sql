-- KenyonExpress — initial schema
-- Fully idempotent: safe to re-run on a live database.

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ---------------------------------------------------------------------------
-- set_updated_at — MUST be first: migrations 005-010 depend on it.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE public.vendor_status AS ENUM ('pending', 'active', 'suspended');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.product_type AS ENUM ('physical', 'coupon');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.product_status AS ENUM ('draft', 'active', 'paused', 'archived');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.coupon_status AS ENUM ('active', 'redeemed', 'expired');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.order_status AS ENUM (
    'pending', 'paid', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.wallet_tx_type AS ENUM (
    'cashback_earned', 'order_payment', 'refund', 'adjustment'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.user_role AS ENUM (
    'customer', 'content_uploader', 'vendor', 'admin', 'super_admin'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ---------------------------------------------------------------------------
-- Order number sequence
-- ---------------------------------------------------------------------------

CREATE SEQUENCE IF NOT EXISTS public.order_number_seq START 1;

CREATE OR REPLACE FUNCTION public.generate_order_number()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.order_number = 'KE-' || to_char(now(), 'YYYYMMDD') || '-'
    || lpad(nextval('public.order_number_seq')::text, 5, '0');
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 1. profiles
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.profiles (
  id         uuid             PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email      text             NOT NULL,
  full_name  text,
  phone      text,
  avatar_url text,
  role       public.user_role NOT NULL DEFAULT 'customer',
  created_at timestamptz      NOT NULL DEFAULT now(),
  updated_at timestamptz      NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS profiles_email_idx ON public.profiles (email);
CREATE INDEX IF NOT EXISTS profiles_role_idx  ON public.profiles (role);

DROP TRIGGER IF EXISTS profiles_set_updated_at ON public.profiles;
CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Admin helper — includes super_admin (same as migration 003 version)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('admin'::public.user_role, 'super_admin'::public.user_role)
  )
$$;

-- ---------------------------------------------------------------------------
-- 2. vendors
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.vendors (
  id              uuid                 PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id      uuid                 NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  business_name   text                 NOT NULL,
  business_id     text                 NOT NULL UNIQUE,
  contact_email   text                 NOT NULL,
  contact_phone   text,
  address         text,
  bank_account    text,
  commission_rate numeric(5,2)         NOT NULL DEFAULT 10
    CHECK (commission_rate BETWEEN 0 AND 100),
  status          public.vendor_status NOT NULL DEFAULT 'pending',
  created_at      timestamptz          NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS vendors_profile_id_idx ON public.vendors (profile_id);
CREATE INDEX IF NOT EXISTS vendors_status_idx     ON public.vendors (status);

-- ---------------------------------------------------------------------------
-- 3. categories
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.categories (
  id             uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  slug           text    NOT NULL UNIQUE,
  name_he        text    NOT NULL,
  name_en        text    NOT NULL,
  description_he text,
  parent_id      uuid    REFERENCES public.categories(id) ON DELETE SET NULL,
  icon_url       text,
  sort_order     integer NOT NULL DEFAULT 0,
  is_active      boolean NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS categories_parent_id_idx  ON public.categories (parent_id);
CREATE INDEX IF NOT EXISTS categories_sort_order_idx ON public.categories (sort_order);
CREATE INDEX IF NOT EXISTS categories_is_active_idx
  ON public.categories (is_active) WHERE is_active = true;

-- ---------------------------------------------------------------------------
-- 4. products
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.products (
  id             uuid                  PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id      uuid                  NOT NULL REFERENCES public.vendors(id) ON DELETE RESTRICT,
  category_id    uuid                  REFERENCES public.categories(id) ON DELETE SET NULL,
  slug           text                  NOT NULL UNIQUE,
  name_he        text                  NOT NULL,
  description_he text,
  type           public.product_type   NOT NULL DEFAULT 'physical',
  base_price     numeric(12,2)         NOT NULL CHECK (base_price >= 0),
  sale_price     numeric(12,2)         CHECK (sale_price IS NULL OR sale_price >= 0),
  currency       text                  NOT NULL DEFAULT 'ILS',
  stock_quantity integer               CHECK (stock_quantity IS NULL OR stock_quantity >= 0),
  status         public.product_status NOT NULL DEFAULT 'draft',
  images         jsonb                 NOT NULL DEFAULT '[]'::jsonb,
  seo_meta       jsonb                 NOT NULL DEFAULT '{}'::jsonb,
  created_at     timestamptz           NOT NULL DEFAULT now(),
  updated_at     timestamptz           NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS products_category_id_idx ON public.products (category_id);
CREATE INDEX IF NOT EXISTS products_slug_idx        ON public.products (slug);
CREATE INDEX IF NOT EXISTS products_status_idx      ON public.products (status);
CREATE INDEX IF NOT EXISTS products_type_idx        ON public.products (type);
CREATE INDEX IF NOT EXISTS products_name_he_trgm_idx
  ON public.products USING gin (name_he gin_trgm_ops);
-- products_vendor_id_idx and products_active_idx removed: migration 005 renames
-- vendor_id -> supplier_id. Indexes and policies on products are owned by 005.

DROP TRIGGER IF EXISTS products_set_updated_at ON public.products;
CREATE TRIGGER products_set_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 5. product_variants
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.product_variants (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id     uuid        NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  sku            text        NOT NULL UNIQUE,
  name_he        text        NOT NULL,
  price_modifier numeric(12,2) NOT NULL DEFAULT 0,
  stock_quantity integer     CHECK (stock_quantity IS NULL OR stock_quantity >= 0),
  attributes     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  is_active      boolean     NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS product_variants_product_id_idx ON public.product_variants (product_id);
CREATE INDEX IF NOT EXISTS product_variants_sku_idx        ON public.product_variants (sku);

-- ---------------------------------------------------------------------------
-- 6. coupons
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.coupons (
  id                    uuid                 PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id            uuid                 NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  code                  text                 NOT NULL UNIQUE,
  qr_data               text                 NOT NULL,
  expiry_date           timestamptz,
  redeemed_at           timestamptz,
  redeemed_by_vendor_at timestamptz,
  customer_id           uuid                 REFERENCES public.profiles(id) ON DELETE SET NULL,
  status                public.coupon_status NOT NULL DEFAULT 'active',
  created_at            timestamptz          NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS coupons_product_id_idx  ON public.coupons (product_id);
CREATE INDEX IF NOT EXISTS coupons_customer_id_idx ON public.coupons (customer_id);
CREATE INDEX IF NOT EXISTS coupons_status_idx      ON public.coupons (status);
CREATE INDEX IF NOT EXISTS coupons_code_idx        ON public.coupons (code);

-- ---------------------------------------------------------------------------
-- 7. orders
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.orders (
  id               uuid                 PRIMARY KEY DEFAULT gen_random_uuid(),
  order_number     text                 NOT NULL UNIQUE,
  customer_id      uuid                 NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  status           public.order_status  NOT NULL DEFAULT 'pending',
  subtotal         numeric(12,2)        NOT NULL CHECK (subtotal >= 0),
  discount_amount  numeric(12,2)        NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  total            numeric(12,2)        NOT NULL CHECK (total >= 0),
  platform_fee     numeric(12,2)        NOT NULL DEFAULT 0 CHECK (platform_fee >= 0),
  vendor_payout    numeric(12,2)        NOT NULL DEFAULT 0 CHECK (vendor_payout >= 0),
  payment_method   text,
  payment_token_id uuid,
  shipping_address jsonb,
  notes            text,
  created_at       timestamptz          NOT NULL DEFAULT now(),
  paid_at          timestamptz,
  updated_at       timestamptz          NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS orders_customer_id_created_at_idx
  ON public.orders (customer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_order_number_idx ON public.orders (order_number);
CREATE INDEX IF NOT EXISTS orders_status_idx       ON public.orders (status);

DROP TRIGGER IF EXISTS orders_generate_order_number ON public.orders;
CREATE TRIGGER orders_generate_order_number
  BEFORE INSERT ON public.orders
  FOR EACH ROW WHEN (NEW.order_number IS NULL OR NEW.order_number = '')
  EXECUTE FUNCTION public.generate_order_number();

DROP TRIGGER IF EXISTS orders_set_updated_at ON public.orders;
CREATE TRIGGER orders_set_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 8. order_items
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.order_items (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id      uuid        NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id    uuid        REFERENCES public.products(id) ON DELETE SET NULL,
  variant_id    uuid        REFERENCES public.product_variants(id) ON DELETE SET NULL,
  vendor_id     uuid        NOT NULL REFERENCES public.vendors(id) ON DELETE RESTRICT,
  quantity      integer     NOT NULL CHECK (quantity > 0),
  unit_price    numeric(12,2) NOT NULL CHECK (unit_price >= 0),
  subtotal      numeric(12,2) NOT NULL CHECK (subtotal >= 0),
  platform_fee  numeric(12,2) NOT NULL DEFAULT 0 CHECK (platform_fee >= 0),
  vendor_payout numeric(12,2) NOT NULL DEFAULT 0 CHECK (vendor_payout >= 0),
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS order_items_order_id_idx   ON public.order_items (order_id);
CREATE INDEX IF NOT EXISTS order_items_product_id_idx ON public.order_items (product_id);
CREATE INDEX IF NOT EXISTS order_items_vendor_id_idx  ON public.order_items (vendor_id);

-- ---------------------------------------------------------------------------
-- 9. wallets
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.wallets (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id      uuid        NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  balance         numeric(12,2) NOT NULL DEFAULT 0 CHECK (balance >= 0),
  lifetime_earned numeric(12,2) NOT NULL DEFAULT 0 CHECK (lifetime_earned >= 0),
  lifetime_spent  numeric(12,2) NOT NULL DEFAULT 0 CHECK (lifetime_spent >= 0),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wallets_profile_id_idx ON public.wallets (profile_id);

DROP TRIGGER IF EXISTS wallets_set_updated_at ON public.wallets;
CREATE TRIGGER wallets_set_updated_at
  BEFORE UPDATE ON public.wallets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 10. wallet_transactions
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.wallet_transactions (
  id               uuid                    PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id        uuid                    NOT NULL REFERENCES public.wallets(id) ON DELETE CASCADE,
  type             public.wallet_tx_type   NOT NULL,
  amount           numeric(12,2)           NOT NULL,
  related_order_id uuid                    REFERENCES public.orders(id) ON DELETE SET NULL,
  description      text,
  created_at       timestamptz             NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wallet_transactions_wallet_id_idx
  ON public.wallet_transactions (wallet_id, created_at DESC);
CREATE INDEX IF NOT EXISTS wallet_transactions_order_id_idx
  ON public.wallet_transactions (related_order_id);

-- ---------------------------------------------------------------------------
-- 11. payment_tokens
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.payment_tokens (
  id            uuid     PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id    uuid     NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  cardcom_token text     NOT NULL,
  last_4        char(4)  NOT NULL,
  card_brand    text     NOT NULL,
  expiry_month  smallint NOT NULL CHECK (expiry_month BETWEEN 1 AND 12),
  expiry_year   smallint NOT NULL CHECK (expiry_year >= 2024),
  is_default    boolean  NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS payment_tokens_profile_id_idx ON public.payment_tokens (profile_id);

CREATE UNIQUE INDEX IF NOT EXISTS payment_tokens_default_idx
  ON public.payment_tokens (profile_id) WHERE is_default = true;

-- ---------------------------------------------------------------------------
-- 12. carts
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.carts (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid        REFERENCES public.profiles(id) ON DELETE CASCADE,
  session_id text,
  items      jsonb       NOT NULL DEFAULT '[]'::jsonb,
  expires_at timestamptz NOT NULL DEFAULT now() + INTERVAL '30 days',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT carts_owner_check CHECK (profile_id IS NOT NULL OR session_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS carts_profile_id_idx ON public.carts (profile_id);
CREATE INDEX IF NOT EXISTS carts_session_id_idx ON public.carts (session_id);
CREATE INDEX IF NOT EXISTS carts_expires_at_idx ON public.carts (expires_at);

DROP TRIGGER IF EXISTS carts_set_updated_at ON public.carts;
CREATE TRIGGER carts_set_updated_at
  BEFORE UPDATE ON public.carts
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Auto-create profile + wallet on signup
-- NOTE: after migration 006, wallets is replaced by wallet_balances.
-- handle_new_user must be updated in a later migration to use wallet_balances.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.raw_user_meta_data->>'avatar_url'
  );

  INSERT INTO public.wallets (profile_id)
  VALUES (NEW.id);

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------

ALTER TABLE public.profiles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendors            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_variants   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupons            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.orders             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallets            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.wallet_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_tokens     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.carts              ENABLE ROW LEVEL SECURITY;

-- profiles

DROP POLICY IF EXISTS "profiles: owner select" ON public.profiles;
CREATE POLICY "profiles: owner select"
  ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "profiles: owner update" ON public.profiles;
CREATE POLICY "profiles: owner update"
  ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND role = (SELECT role FROM public.profiles WHERE id = auth.uid())
  );

DROP POLICY IF EXISTS "profiles: admin all" ON public.profiles;
CREATE POLICY "profiles: admin all"
  ON public.profiles FOR ALL TO authenticated
  USING (public.is_admin());

-- vendors

DROP POLICY IF EXISTS "vendors: public select active" ON public.vendors;
CREATE POLICY "vendors: public select active"
  ON public.vendors FOR SELECT
  USING (status = 'active'::public.vendor_status OR public.is_admin());

DROP POLICY IF EXISTS "vendors: owner manage" ON public.vendors;
CREATE POLICY "vendors: owner manage"
  ON public.vendors FOR ALL TO authenticated
  USING (profile_id = auth.uid() OR public.is_admin())
  WITH CHECK (profile_id = auth.uid() OR public.is_admin());

-- categories

DROP POLICY IF EXISTS "categories: public read active" ON public.categories;
CREATE POLICY "categories: public read active"
  ON public.categories FOR SELECT
  USING (is_active = true OR public.is_admin());

DROP POLICY IF EXISTS "categories: admin write" ON public.categories;
CREATE POLICY "categories: admin write"
  ON public.categories FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- products and product_variants: policies owned by migration 005.
-- 005 renames vendor_id -> supplier_id and removes is_active from variants.
-- RLS is enabled above; 005 creates the authoritative policies.

-- coupons

-- coupons: vendor_id removed from products in 005; coupon_codes table in 008
-- replaces this table entirely. Keep only owner-select and admin policies.

DROP POLICY IF EXISTS "coupons: customer select own" ON public.coupons;
CREATE POLICY "coupons: customer select own"
  ON public.coupons FOR SELECT TO authenticated
  USING (customer_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "coupons: customer insert own" ON public.coupons;
CREATE POLICY "coupons: customer insert own"
  ON public.coupons FOR INSERT TO authenticated
  WITH CHECK (customer_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "coupons: vendor redeem" ON public.coupons;
CREATE POLICY "coupons: vendor redeem"
  ON public.coupons FOR UPDATE TO authenticated
  USING (public.is_admin());

-- orders

DROP POLICY IF EXISTS "orders: customer select own" ON public.orders;
CREATE POLICY "orders: customer select own"
  ON public.orders FOR SELECT TO authenticated
  USING (customer_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "orders: customer insert" ON public.orders;
CREATE POLICY "orders: customer insert"
  ON public.orders FOR INSERT TO authenticated
  WITH CHECK (customer_id = auth.uid());

DROP POLICY IF EXISTS "orders: system update" ON public.orders;
CREATE POLICY "orders: system update"
  ON public.orders FOR UPDATE TO authenticated
  USING (customer_id = auth.uid() OR public.is_admin());

-- order_items

DROP POLICY IF EXISTS "order_items: customer select via order" ON public.order_items;
CREATE POLICY "order_items: customer select via order"
  ON public.order_items FOR SELECT TO authenticated
  USING (
    order_id IN (SELECT id FROM public.orders WHERE customer_id = auth.uid())
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "order_items: insert with order" ON public.order_items;
CREATE POLICY "order_items: insert with order"
  ON public.order_items FOR INSERT TO authenticated
  WITH CHECK (
    order_id IN (SELECT id FROM public.orders WHERE customer_id = auth.uid())
    OR public.is_admin()
  );

-- wallets

DROP POLICY IF EXISTS "wallets: owner select" ON public.wallets;
CREATE POLICY "wallets: owner select"
  ON public.wallets FOR SELECT TO authenticated
  USING (profile_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "wallets: system update" ON public.wallets;
CREATE POLICY "wallets: system update"
  ON public.wallets FOR UPDATE TO authenticated
  USING (profile_id = auth.uid() OR public.is_admin());

-- wallet_transactions

DROP POLICY IF EXISTS "wallet_transactions: owner select" ON public.wallet_transactions;
CREATE POLICY "wallet_transactions: owner select"
  ON public.wallet_transactions FOR SELECT TO authenticated
  USING (
    wallet_id IN (SELECT id FROM public.wallets WHERE profile_id = auth.uid())
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "wallet_transactions: system insert" ON public.wallet_transactions;
CREATE POLICY "wallet_transactions: system insert"
  ON public.wallet_transactions FOR INSERT TO authenticated
  WITH CHECK (
    wallet_id IN (SELECT id FROM public.wallets WHERE profile_id = auth.uid())
    OR public.is_admin()
  );

-- payment_tokens

DROP POLICY IF EXISTS "payment_tokens: owner all" ON public.payment_tokens;
CREATE POLICY "payment_tokens: owner all"
  ON public.payment_tokens FOR ALL TO authenticated
  USING (profile_id = auth.uid() OR public.is_admin())
  WITH CHECK (profile_id = auth.uid() OR public.is_admin());

-- carts

DROP POLICY IF EXISTS "carts: owner all" ON public.carts;
CREATE POLICY "carts: owner all"
  ON public.carts FOR ALL
  USING (
    profile_id = auth.uid()
    OR session_id = current_setting('request.cookies', true)::json->>'session_id'
    OR public.is_admin()
  )
  WITH CHECK (
    profile_id = auth.uid()
    OR profile_id IS NULL
    OR public.is_admin()
  );
