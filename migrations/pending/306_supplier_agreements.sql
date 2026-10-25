-- Migration 306: Supplier agreements for click-wrap onboarding
-- ============================================================================
-- Stores the agreement acceptance record including Cardcom terminal, IP, etc.
-- Links to supplier_applications for the full onboarding flow.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.supplier_agreements (
  id                    uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id        uuid        NOT NULL REFERENCES public.supplier_applications(id) ON DELETE CASCADE,
  cardcom_terminal_id   text        NOT NULL,
  agreement_version     text        NOT NULL DEFAULT 'v1.0',
  agreement_hash        text        NOT NULL, -- SHA-256 of agreement text
  accepted_ip           inet        NOT NULL,
  accepted_at           timestamptz NOT NULL DEFAULT now(),
  verification_charge_id text,                 -- Cardcom payment/transaction ID for 1 ILS charge
  verification_amount   int         NOT NULL DEFAULT 100, -- 1 ILS in agorot
  verification_status   text        CHECK (verification_status IN ('pending', 'verified', 'failed')),
  email_verified_at     timestamptz,
  verification_token    text        UNIQUE,   -- for email verification
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS supplier_agreements_application_idx
  ON public.supplier_agreements (application_id);
CREATE INDEX IF NOT EXISTS supplier_agreements_verification_token_idx
  ON public.supplier_agreements (verification_token)
  WHERE verification_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS supplier_agreements_verification_status_idx
  ON public.supplier_agreements (verification_status);

-- Update trigger
DROP TRIGGER IF EXISTS set_updated_at ON public.supplier_agreements;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.supplier_agreements
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS
ALTER TABLE public.supplier_agreements ENABLE ROW LEVEL SECURITY;

-- Owner can read their own agreement
DROP POLICY IF EXISTS "supplier_agreements: owner select" ON public.supplier_agreements;
CREATE POLICY "supplier_agreements: owner select"
  ON public.supplier_agreements FOR SELECT TO authenticated
  USING (
    application_id IN (
      SELECT id FROM public.supplier_applications
      WHERE user_id = auth.uid()
    )
  );

-- Admin can see all
DROP POLICY IF EXISTS "supplier_agreements: admin all" ON public.supplier_agreements;
CREATE POLICY "supplier_agreements: admin all"
  ON public.supplier_agreements FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Audit
DROP TRIGGER IF EXISTS audit_supplier_agreements ON public.supplier_agreements;
CREATE TRIGGER audit_supplier_agreements
  AFTER INSERT OR UPDATE OR DELETE ON public.supplier_agreements
  FOR EACH ROW EXECUTE PROCEDURE public.audit_log_trigger_fn();
