-- 072_027subset_supplier_members.sql
-- Applied to the hosted project 2026-07-27 as `027_subset_supplier_members_for_vouchers`.
--
-- WHY A SUBSET OF 027 AND NOT THE WHOLE FILE
--
-- 054 (vouchers) depends on supplier_members and is_supplier_member. Applying
-- 027_suppliers.sql verbatim to get them would REGRESS this database, because
-- 070 ran first and supersedes two of its objects:
--
--   1. 027 defines product_platform_percent() as
--        COALESCE(pr.platform_percent, s.commission_percent, 10)
--      That literal 10 is exactly the fixed commission CONTRADICTIONS C1
--      forbids. 070 replaced this function with one returning NULL so callers
--      refuse the sale rather than invent a rate. Running 027 would undo that.
--   2. 027 comments products.platform_percent with the old "NULL falls back to
--      suppliers.commission_percent" model, overwriting what 070 wrote.
--
-- Verified that 054 references nothing else from 027. The remainder of 027
-- (payout statements, cardcom settlements, disputes, applications, bank
-- accounts: 8 tables and 12 functions) is still unapplied and is not needed to
-- close a coupon order. Same precedent as applying section 2 of 054 alone.
--
-- Idempotent. Depends on: suppliers, auth.users, products.

DO $$ BEGIN
  CREATE TYPE public.supplier_member_role AS ENUM ('owner', 'manager', 'scanner');
EXCEPTION WHEN duplicate_object THEN null; END $$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.supplier_members (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id uuid        NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  member_role public.supplier_member_role NOT NULL DEFAULT 'scanner'::public.supplier_member_role,
  is_active   boolean     NOT NULL DEFAULT true,
  invited_by  uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (supplier_id, user_id)
);

COMMENT ON TABLE public.supplier_members IS
  'Which users act for which supplier, and in what role. Applied as a subset of 027 on 2026-07-27 because 054 (vouchers) depends on it; the rest of 027 is still unapplied.';

DROP TRIGGER IF EXISTS set_updated_at ON public.supplier_members;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.supplier_members
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS supplier_members_supplier_idx ON public.supplier_members (supplier_id) WHERE is_active;
CREATE INDEX IF NOT EXISTS supplier_members_user_idx     ON public.supplier_members (user_id)     WHERE is_active;

CREATE OR REPLACE FUNCTION public.is_supplier_member(p_supplier_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.supplier_members
    WHERE supplier_id = p_supplier_id AND user_id = auth.uid() AND is_active
  )
$$;

CREATE OR REPLACE FUNCTION public.is_supplier_owner(p_supplier_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.supplier_members
    WHERE supplier_id = p_supplier_id AND user_id = auth.uid() AND is_active
      AND member_role = 'owner'::public.supplier_member_role
  )
$$;

CREATE OR REPLACE FUNCTION public.current_supplier_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT supplier_id FROM public.supplier_members
  WHERE user_id = auth.uid() AND is_active
  ORDER BY created_at LIMIT 1
$$;

ALTER TABLE public.supplier_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "supplier_members: member read own supplier" ON public.supplier_members;
CREATE POLICY "supplier_members: member read own supplier"
  ON public.supplier_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_supplier_owner(supplier_id));

DROP POLICY IF EXISTS "supplier_members: owner manages" ON public.supplier_members;
CREATE POLICY "supplier_members: owner manages"
  ON public.supplier_members FOR ALL TO authenticated
  USING (public.is_supplier_owner(supplier_id))
  WITH CHECK (public.is_supplier_owner(supplier_id));

-- 027's actual repair: the live "products: vendor read own" policy compares
-- products.supplier_id against vendors.id, but that column references
-- suppliers, so the policy matches nothing. Replaced with the membership check
-- it was meant to be. No supplier_members rows exist yet, so this grants nobody
-- anything today; it stops being silently broken.
DROP POLICY IF EXISTS "products: vendor read own" ON public.products;
DROP POLICY IF EXISTS "products: supplier member read own" ON public.products;
CREATE POLICY "products: supplier member read own"
  ON public.products FOR SELECT TO authenticated
  USING (supplier_id IS NOT NULL AND public.is_supplier_member(supplier_id));
