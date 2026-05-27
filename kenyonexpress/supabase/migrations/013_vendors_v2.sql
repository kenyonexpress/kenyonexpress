-- Phase 4: Vendors v2 — add missing fields, soft delete, RLS
-- Idempotent: safe to run multiple times.

ALTER TABLE public.vendors
  ADD COLUMN IF NOT EXISTS legal_name          text,
  ADD COLUMN IF NOT EXISTS tax_id              text,
  ADD COLUMN IF NOT EXISTS contact_name        text,
  ADD COLUMN IF NOT EXISTS bank_account_holder text,
  ADD COLUMN IF NOT EXISTS bank_name           text,
  ADD COLUMN IF NOT EXISTS bank_branch         text,
  ADD COLUMN IF NOT EXISTS logo_url            text,
  ADD COLUMN IF NOT EXISTS deleted_at          timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at          timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS vendors_deleted_at_idx ON public.vendors (deleted_at)
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS vendors_status_idx     ON public.vendors (status);

ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;

-- Super admin only for vendor mutations
DROP POLICY IF EXISTS "vendors: super_admin insert" ON public.vendors;
CREATE POLICY "vendors: super_admin insert"
  ON public.vendors FOR INSERT TO authenticated
  WITH CHECK (public.current_user_role() = 'super_admin'::public.user_role);

DROP POLICY IF EXISTS "vendors: super_admin update" ON public.vendors;
CREATE POLICY "vendors: super_admin update"
  ON public.vendors FOR UPDATE TO authenticated
  USING  (public.current_user_role() = 'super_admin'::public.user_role)
  WITH CHECK (public.current_user_role() = 'super_admin'::public.user_role);

DROP POLICY IF EXISTS "vendors: super_admin delete" ON public.vendors;
CREATE POLICY "vendors: super_admin delete"
  ON public.vendors FOR DELETE TO authenticated
  USING (public.current_user_role() = 'super_admin'::public.user_role);

-- Admins + super_admin can read all vendors
DROP POLICY IF EXISTS "vendors: admin read" ON public.vendors;
CREATE POLICY "vendors: admin read"
  ON public.vendors FOR SELECT TO authenticated
  USING (public.is_admin());

-- Vendors can read their own row
DROP POLICY IF EXISTS "vendors: owner read" ON public.vendors;
CREATE POLICY "vendors: owner read"
  ON public.vendors FOR SELECT TO authenticated
  USING (profile_id = auth.uid());

CREATE OR REPLACE FUNCTION public.set_vendors_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS vendors_updated_at ON public.vendors;
CREATE TRIGGER vendors_updated_at
  BEFORE UPDATE ON public.vendors
  FOR EACH ROW EXECUTE PROCEDURE public.set_vendors_updated_at();
