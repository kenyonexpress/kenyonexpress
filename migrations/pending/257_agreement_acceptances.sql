-- 257_agreement_acceptances.sql
--
-- S17. The click-wrap log, and the 1 ILS card verification log.
--
-- =============================================================================
-- WHY A SECOND ACCEPTANCE TABLE WHEN 204 ALREADY HAS ONE
-- =============================================================================
--
-- `supplier_contract_acceptances` (204, live) is tied to one agreement: its
-- columns are `contract_version` / `contract_sha256` and its subject is an
-- application or a supplier. The queue asks for `agreement_acceptances`, a
-- general log keyed by WHICH agreement, so the next click-wrap (partner terms,
-- affiliate terms) is a new `agreement` value and not a new table.
--
-- 204's table is not dropped or migrated: it holds the live writer's history
-- and the admin review reads it. The action writes BOTH for now; nothing reads
-- `agreement_acceptances` that could disagree with it.
--
-- APPEND-ONLY BY TRIGGER, NOT ONLY BY GRANT. 204 relies on "no UPDATE policy",
-- which the service role ignores. A log of agreements that the server can
-- quietly rewrite is not evidence, so here an UPDATE or DELETE raises for every
-- role including service_role. A real correction is a new row.
--
-- =============================================================================
-- supplier_application_card_checks
-- =============================================================================
--
-- NOT `supplier_card_verifications`: that name is TAKEN in production by a
-- legacy table (supplier_lead_id, payload jsonb, voided boolean; 0 rows, no
-- writer anywhere in this repo, measured 04.11). The first apply of this file
-- failed on it with 42703 and rolled back whole. It is left alone, not dropped.
--
-- One row per 1 ILS verify-and-void attempt. The amount is pinned to 100
-- agorot by CHECK: this table can never become a place a real charge is
-- recorded. Only ids and the last four digits; never a card number.

BEGIN;

CREATE TABLE IF NOT EXISTS public.agreement_acceptances (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Which agreement. A closed list, so a typo is a refusal rather than a new
  -- agreement nobody reads.
  agreement     text NOT NULL CHECK (agreement IN ('supplier_contract')),
  version       text NOT NULL CHECK (length(btrim(version)) BETWEEN 1 AND 64),
  -- SHA-256 of the exact text on screen, computed on the server from the
  -- constant, never sent by the browser.
  sha256        text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  user_id       uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  -- What was being agreed to. Nullable for the case the subject is the user.
  subject_type  text CHECK (subject_type IS NULL OR subject_type IN ('supplier_application', 'supplier')),
  subject_id    uuid,
  accepted_at   timestamptz NOT NULL DEFAULT now(),
  -- Nullable: with no proxy in front `getClientIp` answers 'unknown', which
  -- `inet` rejects.
  client_ip     inet,
  user_agent    text CHECK (user_agent IS NULL OR length(user_agent) <= 512),

  CONSTRAINT agreement_acceptance_subject_pair CHECK (
    (subject_type IS NULL) = (subject_id IS NULL)
  )
);

CREATE INDEX IF NOT EXISTS agreement_acceptances_user_idx
  ON public.agreement_acceptances (user_id, accepted_at DESC);
CREATE INDEX IF NOT EXISTS agreement_acceptances_subject_idx
  ON public.agreement_acceptances (subject_type, subject_id);

CREATE OR REPLACE FUNCTION public.agreement_acceptances_append_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  RAISE EXCEPTION 'agreement_acceptances is append-only (% refused)', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;
REVOKE ALL ON FUNCTION public.agreement_acceptances_append_only() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS agreement_acceptances_append_only ON public.agreement_acceptances;
CREATE TRIGGER agreement_acceptances_append_only
  BEFORE UPDATE OR DELETE ON public.agreement_acceptances
  FOR EACH ROW EXECUTE FUNCTION public.agreement_acceptances_append_only();

ALTER TABLE public.agreement_acceptances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_agreement_read" ON public.agreement_acceptances;
CREATE POLICY "own_agreement_read" ON public.agreement_acceptances
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "staff_agreement_read" ON public.agreement_acceptances;
CREATE POLICY "staff_agreement_read" ON public.agreement_acceptances
  FOR SELECT TO authenticated
  USING (public.is_admin());

REVOKE ALL ON public.agreement_acceptances FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.agreement_acceptances FROM authenticated;
GRANT SELECT ON public.agreement_acceptances TO authenticated;

-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.supplier_application_card_checks (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id         uuid NOT NULL REFERENCES public.supplier_applications(id) ON DELETE CASCADE,
  user_id                uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  amount_agorot          integer NOT NULL CHECK (amount_agorot = 100),
  provider               text NOT NULL CHECK (provider IN ('mock', 'cardcom')),
  status                 text NOT NULL CHECK (status IN ('verified', 'failed')),
  low_profile_id         text,
  transaction_id         text,
  void_transaction_id    text,
  card_last4             text CHECK (card_last4 IS NULL OR card_last4 ~ '^\d{4}$'),
  failure_code           text,
  created_at             timestamptz NOT NULL DEFAULT now(),

  -- Verified means charged AND voided. A charge that was not voided is a
  -- failure the operator has to see, never a success.
  CONSTRAINT supplier_application_card_check_verified_is_voided CHECK (
    status <> 'verified' OR (transaction_id IS NOT NULL AND void_transaction_id IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS supplier_application_card_checks_app_idx
  ON public.supplier_application_card_checks (application_id, created_at DESC);

ALTER TABLE public.supplier_application_card_checks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_card_check_read" ON public.supplier_application_card_checks;
CREATE POLICY "own_card_check_read" ON public.supplier_application_card_checks
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "staff_card_check_read" ON public.supplier_application_card_checks;
CREATE POLICY "staff_card_check_read" ON public.supplier_application_card_checks
  FOR SELECT TO authenticated
  USING (public.is_admin());

REVOKE ALL ON public.supplier_application_card_checks FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.supplier_application_card_checks FROM authenticated;
GRANT SELECT ON public.supplier_application_card_checks TO authenticated;

COMMIT;
