-- Migration 007: Orders schema
-- Supersedes orders + order_items from 001 with the authoritative design
-- from ARCHITECTURE.md §2.3, §3.1, §23.2.

-- ---------------------------------------------------------------------------
-- 1. Drop 001 order tables + enum
--    CASCADE removes the FK in wallet_transactions.related_order_id (from 006).
--    That FK is restored in section 5 below.
-- ---------------------------------------------------------------------------

DROP TABLE IF EXISTS public.order_items CASCADE;
DROP TABLE IF EXISTS public.orders CASCADE;
DROP TYPE IF EXISTS public.order_status;

-- ---------------------------------------------------------------------------
-- 2. ENUMs
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE public.order_status AS ENUM (
    'pending', 'paid', 'partially_fulfilled', 'fulfilled', 'cancelled', 'refunded'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.order_item_status AS ENUM (
    'pending', 'issued', 'shipped', 'delivered', 'cancelled', 'refunded'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ---------------------------------------------------------------------------
-- 3. orders
--
-- address_id is stored as a plain uuid; the FK to user_addresses will be
-- added in the migration that creates that table (not yet migrated).
-- accepted_terms_at captures §23.2 consent checkbox timestamp.
-- Financial table: soft delete via deleted_at (§3.2 rule).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.orders (
  id                   uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid          NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  status               public.order_status NOT NULL DEFAULT 'pending',
  subtotal_ils         numeric(12,2) NOT NULL CHECK (subtotal_ils >= 0),
  discount_ils         numeric(12,2) NOT NULL DEFAULT 0 CHECK (discount_ils >= 0),
  cashback_applied_ils numeric(12,2) NOT NULL DEFAULT 0 CHECK (cashback_applied_ils >= 0),
  total_ils            numeric(12,2) NOT NULL CHECK (total_ils >= 0),
  currency             text          NOT NULL DEFAULT 'ILS',
  cardcom_payment_id   text,
  invoice_number       text          UNIQUE,
  address_id           uuid,
  affiliate_code       text,
  referral_code_used   text,
  accepted_terms_at    timestamptz,
  notes                text,
  deleted_at           timestamptz,
  created_at           timestamptz   NOT NULL DEFAULT now(),
  updated_at           timestamptz   NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 4. order_items
--
-- commission_percent is a snapshot of the supplier's rate at order time —
-- not a live FK so historical reports stay accurate if the rate changes later.
-- Financial table: soft delete via deleted_at (§3.2 rule).
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.order_items (
  id                  uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id            uuid          NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id          uuid          REFERENCES public.products(id) ON DELETE SET NULL,
  variant_id          uuid          REFERENCES public.product_variants(id) ON DELETE SET NULL,
  product_type        public.product_type NOT NULL,
  supplier_id         uuid          REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  quantity            int           NOT NULL DEFAULT 1 CHECK (quantity > 0),
  unit_price_ils      numeric(12,2) NOT NULL CHECK (unit_price_ils >= 0),
  total_price_ils     numeric(12,2) NOT NULL CHECK (total_price_ils >= 0),
  commission_percent  numeric(5,2)  NOT NULL,
  supplier_payout_ils numeric(12,2) NOT NULL CHECK (supplier_payout_ils >= 0),
  cashback_earned_ils numeric(12,2) NOT NULL DEFAULT 0 CHECK (cashback_earned_ils >= 0),
  item_status         public.order_item_status NOT NULL DEFAULT 'pending',
  fulfilled_at        timestamptz,
  deleted_at          timestamptz,
  created_at          timestamptz   NOT NULL DEFAULT now(),
  updated_at          timestamptz   NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 5. Restore wallet_transactions FK that CASCADE removed above
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  ALTER TABLE public.wallet_transactions
    ADD CONSTRAINT wallet_transactions_related_order_id_fkey
    FOREIGN KEY (related_order_id) REFERENCES public.orders(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ---------------------------------------------------------------------------
-- 6. Indexes
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_orders_user_status
  ON public.orders (user_id, status);

CREATE INDEX IF NOT EXISTS idx_orders_created_at
  ON public.orders (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_orders_invoice_number
  ON public.orders (invoice_number);

CREATE INDEX IF NOT EXISTS idx_order_items_order_id
  ON public.order_items (order_id);

CREATE INDEX IF NOT EXISTS idx_order_items_supplier_id
  ON public.order_items (supplier_id);

CREATE INDEX IF NOT EXISTS idx_order_items_product_id
  ON public.order_items (product_id);

-- ---------------------------------------------------------------------------
-- 7. updated_at triggers
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS set_updated_at ON public.orders;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_updated_at ON public.order_items;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 8. RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.orders     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- orders: users read their own; admins do everything
DROP POLICY IF EXISTS orders_user_read ON public.orders;
CREATE POLICY orders_user_read
  ON public.orders FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS orders_admin_all ON public.orders;
CREATE POLICY orders_admin_all
  ON public.orders FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- order_items: users read items that belong to their own orders; admins do everything
DROP POLICY IF EXISTS order_items_user_read ON public.order_items;
CREATE POLICY order_items_user_read
  ON public.order_items FOR SELECT TO authenticated
  USING (
    order_id IN (SELECT id FROM public.orders WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS order_items_admin_all ON public.order_items;
CREATE POLICY order_items_admin_all
  ON public.order_items FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
