-- 046_checkout_settlement.sql
-- Settlement lifecycle for orders (phase6/checkout):
--   pending, paid, split_executed, escrow_held, escrow_released, redeemed, refunded, cancelled
-- Coupon: customer pays upfront percent on site -> escrow per coupon code -> released to supplier on redemption.
-- Physical: customer pays 100% on site -> immediate split (supplier share = face - platform commission).
-- Platform commission default: 5% of the on-site charge, admin-overridable per product (products.commission_percent).
-- Depends on: 007 (orders/order_items), 008/027 (coupon_codes), 026 (payments, coupon_redemptions), 042 (agorot snapshots).

-- Defensive: 001 may stop early on live DBs.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- 1. Enums ------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE public.settlement_status AS ENUM (
    'pending',
    'paid',
    'split_executed',
    'escrow_held',
    'escrow_released',
    'redeemed',
    'refunded',
    'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  CREATE TYPE public.escrow_status AS ENUM ('held', 'released', 'refunded');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 2. Product-level commission override --------------------------------------

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS commission_percent numeric(5,2) NOT NULL DEFAULT 5
    CHECK (commission_percent >= 0 AND commission_percent <= 100);

COMMENT ON COLUMN public.products.commission_percent IS
  'Platform commission percent charged on the on-site amount (default 5). platform_percent stays the coupon upfront percent / legacy physical split knob.';

-- 2b. Order header: finalize timestamp + pending-order expiry ---------------

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_orders_pending_expiry
  ON public.orders (expires_at)
  WHERE paid_at IS NULL;

-- 3. Order item settlement snapshot -----------------------------------------

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS settlement_status public.settlement_status NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS upfront_percent numeric(5,2),
  ADD COLUMN IF NOT EXISTS commission_percent_snapshot numeric(5,2),
  ADD COLUMN IF NOT EXISTS face_value_agorot integer,
  ADD COLUMN IF NOT EXISTS paid_on_site_agorot integer,
  ADD COLUMN IF NOT EXISTS commission_agorot integer,
  ADD COLUMN IF NOT EXISTS supplier_immediate_agorot integer,
  ADD COLUMN IF NOT EXISTS escrow_held_agorot integer,
  ADD COLUMN IF NOT EXISTS escrow_release_agorot integer,
  ADD COLUMN IF NOT EXISTS balance_due_agorot integer;

CREATE INDEX IF NOT EXISTS idx_order_items_settlement_status
  ON public.order_items (settlement_status);

-- 4. Escrow holds: one row per purchased coupon code ------------------------

CREATE TABLE IF NOT EXISTS public.escrow_holds (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_code_id     uuid NOT NULL UNIQUE REFERENCES public.coupon_codes(id) ON DELETE RESTRICT,
  order_id           uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  order_item_id      uuid NOT NULL REFERENCES public.order_items(id) ON DELETE RESTRICT,
  supplier_id        uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  held_agorot        integer NOT NULL CHECK (held_agorot >= 0),
  commission_agorot  integer NOT NULL CHECK (commission_agorot >= 0),
  release_agorot     integer NOT NULL CHECK (release_agorot >= 0),
  status             public.escrow_status NOT NULL DEFAULT 'held',
  held_at            timestamptz NOT NULL DEFAULT now(),
  released_at        timestamptz,
  refunded_at        timestamptz,
  release_idempotency_key text UNIQUE,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT escrow_holds_conservation CHECK (held_agorot = commission_agorot + release_agorot)
);

CREATE INDEX IF NOT EXISTS idx_escrow_holds_supplier ON public.escrow_holds (supplier_id, status);
CREATE INDEX IF NOT EXISTS idx_escrow_holds_order ON public.escrow_holds (order_id);

DROP TRIGGER IF EXISTS set_updated_at ON public.escrow_holds;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.escrow_holds
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5. Split executions: one row per physical order item ----------------------

CREATE TABLE IF NOT EXISTS public.split_executions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_item_id      uuid NOT NULL UNIQUE REFERENCES public.order_items(id) ON DELETE RESTRICT,
  order_id           uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  supplier_id        uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  face_value_agorot  integer NOT NULL CHECK (face_value_agorot >= 0),
  commission_agorot  integer NOT NULL CHECK (commission_agorot >= 0),
  supplier_agorot    integer NOT NULL CHECK (supplier_agorot >= 0),
  executed_at        timestamptz NOT NULL DEFAULT now(),
  payment_id         uuid REFERENCES public.payments(id) ON DELETE SET NULL,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT split_executions_conservation CHECK (face_value_agorot = commission_agorot + supplier_agorot)
);

CREATE INDEX IF NOT EXISTS idx_split_executions_supplier ON public.split_executions (supplier_id);
CREATE INDEX IF NOT EXISTS idx_split_executions_order ON public.split_executions (order_id);

DROP TRIGGER IF EXISTS set_updated_at ON public.split_executions;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.split_executions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 6. RLS --------------------------------------------------------------------

ALTER TABLE public.escrow_holds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.split_executions ENABLE ROW LEVEL SECURITY;

-- Customers: read escrow rows of their own orders.
DROP POLICY IF EXISTS escrow_holds_owner_read ON public.escrow_holds;
CREATE POLICY escrow_holds_owner_read ON public.escrow_holds
  FOR SELECT USING (
    order_id IN (SELECT o.id FROM public.orders o WHERE o.user_id = auth.uid())
  );

-- Supplier members: read escrow rows of their supplier.
DROP POLICY IF EXISTS escrow_holds_supplier_read ON public.escrow_holds;
CREATE POLICY escrow_holds_supplier_read ON public.escrow_holds
  FOR SELECT USING (public.is_supplier_member(supplier_id));

DROP POLICY IF EXISTS escrow_holds_admin_read ON public.escrow_holds;
CREATE POLICY escrow_holds_admin_read ON public.escrow_holds
  FOR SELECT USING (public.is_admin());

DROP POLICY IF EXISTS split_executions_owner_read ON public.split_executions;
CREATE POLICY split_executions_owner_read ON public.split_executions
  FOR SELECT USING (
    order_id IN (SELECT o.id FROM public.orders o WHERE o.user_id = auth.uid())
  );

DROP POLICY IF EXISTS split_executions_supplier_read ON public.split_executions;
CREATE POLICY split_executions_supplier_read ON public.split_executions
  FOR SELECT USING (public.is_supplier_member(supplier_id));

DROP POLICY IF EXISTS split_executions_admin_read ON public.split_executions;
CREATE POLICY split_executions_admin_read ON public.split_executions
  FOR SELECT USING (public.is_admin());

-- All writes to escrow_holds / split_executions go through the service role
-- (server actions / webhook finalize). No INSERT/UPDATE/DELETE policies on purpose.
