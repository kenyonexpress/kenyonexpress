-- Migration 305: Supplier applications table
-- ============================================================================
-- Stores supplier onboarding applications before they are approved
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.supplier_applications (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  business_name     text        NOT NULL,
  contact_name      text        NOT NULL,
  contact_email     text        NOT NULL,
  contact_phone     text        NOT NULL,
  business_id       text        NOT NULL DEFAULT '',
  status            text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  rejection_reason  text,
  reviewed_by       uuid        REFERENCES auth.users(id),
  reviewed_at       timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS supplier_applications_user_idx
  ON public.supplier_applications (user_id);
CREATE INDEX IF NOT EXISTS supplier_applications_status_idx
  ON public.supplier_applications (status);

-- Update trigger
DROP TRIGGER IF EXISTS set_updated_at ON public.supplier_applications;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.supplier_applications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.supplier_applications ENABLE ROW LEVEL SECURITY;

-- User can read their own applications
DROP POLICY IF EXISTS "supplier_applications: owner select" ON public.supplier_applications;
CREATE POLICY "supplier_applications: owner select"
  ON public.supplier_applications FOR SELECT TO authenticated
  USING (user_id = auth.uid());

-- Admin can see all
DROP POLICY IF EXISTS "supplier_applications: admin all" ON public.supplier_applications;
CREATE POLICY "supplier_applications: admin all"
  ON public.supplier_applications FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Audit
DROP TRIGGER IF EXISTS audit_supplier_applications ON public.supplier_applications;
CREATE TRIGGER audit_supplier_applications
  AFTER INSERT OR UPDATE OR DELETE ON public.supplier_applications
  FOR EACH ROW EXECUTE PROCEDURE public.audit_log_trigger_fn();
