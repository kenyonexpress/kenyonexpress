-- Migration 009: User addresses schema
-- Also wires the deferred orders.address_id FK promised in 007.

-- ---------------------------------------------------------------------------
-- 1. user_addresses
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.user_addresses (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name          text        NOT NULL,
  phone              text        NOT NULL,
  street             text        NOT NULL,
  street_number      text,
  apartment          text,
  entrance           text,
  floor              text,
  city               text        NOT NULL,
  zip                text,
  notes_for_courier  text,
  is_default         boolean     NOT NULL DEFAULT false,
  deleted_at         timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 2. Indexes
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_user_addresses_user_default
  ON public.user_addresses (user_id, is_default);

CREATE INDEX IF NOT EXISTS idx_user_addresses_user_active
  ON public.user_addresses (user_id)
  WHERE deleted_at IS NULL;

-- Only one default address per user (among non-deleted rows)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_default_address_per_user
  ON public.user_addresses (user_id)
  WHERE is_default = true AND deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 3. updated_at trigger
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS set_updated_at ON public.user_addresses;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.user_addresses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 4. Wire the FK deferred from 007 (orders.address_id → user_addresses)
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  ALTER TABLE public.orders
    ADD CONSTRAINT orders_address_id_fkey
    FOREIGN KEY (address_id) REFERENCES public.user_addresses(id) ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ---------------------------------------------------------------------------
-- 5. RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.user_addresses ENABLE ROW LEVEL SECURITY;

-- Users SELECT their own non-deleted addresses
DROP POLICY IF EXISTS addresses_user_select ON public.user_addresses;
CREATE POLICY addresses_user_select
  ON public.user_addresses FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND deleted_at IS NULL);

-- Users INSERT their own addresses
DROP POLICY IF EXISTS addresses_user_insert ON public.user_addresses;
CREATE POLICY addresses_user_insert
  ON public.user_addresses FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Users UPDATE their own addresses
DROP POLICY IF EXISTS addresses_user_update ON public.user_addresses;
CREATE POLICY addresses_user_update
  ON public.user_addresses FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Users DELETE their own addresses
DROP POLICY IF EXISTS addresses_user_delete ON public.user_addresses;
CREATE POLICY addresses_user_delete
  ON public.user_addresses FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Admins: full access
DROP POLICY IF EXISTS addresses_admin_all ON public.user_addresses;
CREATE POLICY addresses_admin_all
  ON public.user_addresses FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());
