-- 204_supplier_onboarding.sql
--
-- Applying to be a supplier, as a thing separate from being one.
--
-- =============================================================================
-- WHY AN APPLICATION TABLE AND NOT `suppliers.status = 'pending'`
-- =============================================================================
--
-- The obvious design is one new enum value. `supplier_status` is
-- `active, suspended, closed`, and adding `pending` looks like one line.
--
-- MEASURED, AND THAT IS WHY IT IS NOT DONE. `from('suppliers')` appears at 19
-- call sites in this repo and roughly nine of them filter on status at all. A
-- `pending` supplier would therefore be VISIBLE BY DEFAULT in about ten places
-- -- the supplier directory, the admin pickers, the product publish flow, the
-- payout statement generator -- and every one of them would have to be found
-- and fixed, with nothing failing if one were missed. That is a gap-by-default:
-- the safe state would depend on remembering.
--
-- A separate table inverts it. An applicant is not a supplier and cannot appear
-- anywhere a supplier appears, because there is no row. The `suppliers` row is
-- CREATED at approval, by which point every existing query is correct about it
-- without being touched. The 12 live supplier rows are untouched by this file.
--
-- The second reason is that an application holds things a supplier never
-- should: a bank secret reference, uploaded identity documents, a rejection
-- reason. Those do not belong on a row the whole admin reads.
--
-- =============================================================================
-- THE BANK ACCOUNT IS NOT A COLUMN
-- =============================================================================
--
-- `supabase_vault` is installed in this project (measured; `vault.secrets` and
-- `vault.decrypted_secrets` both exist, and a create/read round trip was
-- exercised and rolled back). The account number goes into a vault secret and
-- the application keeps the returned uuid.
--
-- What stays in the clear is the bank code, the branch and the LAST FOUR
-- digits, because a payout operator has to recognise an account without reading
-- it and those three cannot be used to move money. A leaked row, a `select *`,
-- a CSV export or a statement in the Postgres log therefore carries an opaque
-- id rather than somebody's bank account.
--
-- `vault.create_secret` is not reachable through PostgREST, so a SECURITY
-- DEFINER wrapper in `public` is what the action calls. It is granted to NOBODY
-- but the service role: the whole point is defeated if `authenticated` can read
-- a secret id back into a bank account.
--
-- =============================================================================
-- THE CONTRACT LOG IS APPEND-ONLY AND KEEPS A HASH
-- =============================================================================
--
-- "The supplier accepted the terms" is worth nothing if the terms can be edited
-- afterwards. Each acceptance stores the VERSION and a SHA-256 of the text that
-- was on screen, so a dispute about what was agreed is settled by comparing the
-- hash rather than by trusting that the document never changed. No UPDATE and
-- no DELETE policy exists for anyone, service role included by convention.

BEGIN;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- =============================================================================
-- 1. The vault wrapper
-- =============================================================================

/**
 * Stores a bank detail string and returns the id to keep on the application.
 *
 * SECURITY DEFINER with a pinned empty search_path, like the other 61 in this
 * database. It takes the value and gives back an id; there is deliberately NO
 * matching read function, because nothing in this application ever needs to
 * turn the id back into an account number - the payout run is manual today, and
 * the day it is not, the reader is written then, with its own grant and its own
 * audit row, rather than sitting here unused and reachable.
 */
CREATE OR REPLACE FUNCTION public.store_supplier_bank_secret(
  p_label text,
  p_value text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_value IS NULL OR length(btrim(p_value)) = 0 THEN
    RAISE EXCEPTION 'bank secret must not be empty' USING ERRCODE = 'check_violation';
  END IF;
  SELECT vault.create_secret(p_value, p_label, 'supplier bank details') INTO v_id;
  RETURN v_id;
END;
$$;

-- The grant IS the access surface, not the policy. Only the service role, which
-- reaches this through the server actions.
REVOKE ALL ON FUNCTION public.store_supplier_bank_secret(text, text) FROM PUBLIC, anon, authenticated;

-- =============================================================================
-- 2. supplier_applications
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.supplier_applications (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The account that applied. NOT NULL: an application nobody can be contacted
  -- through, or that nobody can log back in to continue, is a dead row.
  user_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  business_name   text NOT NULL CHECK (length(btrim(business_name)) BETWEEN 2 AND 200),
  -- Nine digits, check digit verified in `lib/suppliers/company-id.ts` before
  -- it gets here. Stored normalised (no separators) so two applications for one
  -- business cannot differ by a hyphen.
  business_id     text NOT NULL CHECK (business_id ~ '^\d{9}$'),
  legal_form      text NOT NULL CHECK (legal_form IN ('company', 'association', 'individual', 'partnership')),
  contact_name    text NOT NULL CHECK (length(btrim(contact_name)) BETWEEN 2 AND 120),
  email           text NOT NULL CHECK (position('@' in email) > 1),
  phone           text NOT NULL CHECK (length(btrim(phone)) BETWEEN 9 AND 20),
  city            text NOT NULL CHECK (length(btrim(city)) BETWEEN 2 AND 80),
  address         text,
  website         text,
  category        text,

  -- The vault id, and the three fields that are safe in the clear.
  bank_secret_id  uuid,
  bank_code       text CHECK (bank_code IS NULL OR bank_code ~ '^\d{2}$'),
  bank_branch     text CHECK (bank_branch IS NULL OR bank_branch ~ '^\d{3}$'),
  bank_last4      text CHECK (bank_last4 IS NULL OR bank_last4 ~ '^\d{4}$'),

  status          text NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft', 'submitted', 'in_review', 'approved', 'rejected', 'withdrawn')),
  submitted_at    timestamptz,
  reviewed_at     timestamptz,
  reviewed_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  review_note     text,
  -- Set on approval. This is the only link between an application and the
  -- supplier it became, and it is what makes "where did this supplier come
  -- from" answerable a year later.
  supplier_id     uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  -- A submitted application has a submission time; a draft does not. Without
  -- this, "how long has this been waiting" is answerable only for the rows
  -- somebody remembered to stamp.
  CONSTRAINT supplier_application_submitted_consistent CHECK (
    (status = 'draft') = (submitted_at IS NULL)
  ),
  -- A decision is a person, a time and an outcome, or it is not a decision.
  CONSTRAINT supplier_application_decided_consistent CHECK (
    (status IN ('approved', 'rejected')) = (reviewed_at IS NOT NULL)
  ),
  -- An approval that created no supplier is an approval that did nothing.
  CONSTRAINT supplier_application_approved_has_supplier CHECK (
    status <> 'approved' OR supplier_id IS NOT NULL
  ),
  -- A rejection has to say why. The applicant is told this text, and "no"
  -- with no reason is the message that generates the second application.
  CONSTRAINT supplier_application_rejected_has_reason CHECK (
    status <> 'rejected' OR length(btrim(coalesce(review_note, ''))) >= 3
  )
);

-- ONE LIVE APPLICATION PER BUSINESS NUMBER. A partial unique index rather than
-- a constraint, because a business that was rejected must be able to apply
-- again once it has fixed whatever was wrong -- and a business that withdrew
-- must be able to come back. Only the states that are actually in flight or
-- settled-as-yes are exclusive.
CREATE UNIQUE INDEX IF NOT EXISTS supplier_applications_live_business_idx
  ON public.supplier_applications (business_id)
  WHERE status IN ('draft', 'submitted', 'in_review', 'approved');

CREATE INDEX IF NOT EXISTS supplier_applications_queue_idx
  ON public.supplier_applications (submitted_at)
  WHERE status IN ('submitted', 'in_review');
CREATE INDEX IF NOT EXISTS supplier_applications_user_idx
  ON public.supplier_applications (user_id, created_at DESC);

DROP TRIGGER IF EXISTS set_updated_at ON public.supplier_applications;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.supplier_applications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.supplier_applications ENABLE ROW LEVEL SECURITY;

-- The applicant reads their own application, which is what lets the wizard show
-- them where they are and what was rejected.
DROP POLICY IF EXISTS "own_application_read" ON public.supplier_applications;
CREATE POLICY "own_application_read" ON public.supplier_applications
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "staff_application_all" ON public.supplier_applications;
CREATE POLICY "staff_application_all" ON public.supplier_applications
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- No INSERT or UPDATE for the applicant, for the reason 202 and 203 both give:
-- a policy cannot check the company-id check digit, cannot put the bank details
-- in the vault, and cannot refuse a second live application. Writes go through
-- the actions on the service-role client.
REVOKE INSERT, UPDATE, DELETE ON public.supplier_applications FROM anon, authenticated;
GRANT SELECT ON public.supplier_applications TO authenticated;

-- =============================================================================
-- 3. supplier_application_documents
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.supplier_application_documents (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id  uuid NOT NULL REFERENCES public.supplier_applications(id) ON DELETE CASCADE,
  kind            text NOT NULL CHECK (kind IN (
                    'business_certificate', 'bank_confirmation', 'id_document',
                    'vat_certificate', 'insurance', 'other')),
  -- The R2 object key in a PRIVATE bucket. Not a URL: a stored URL is either
  -- signed, and expires into a broken record, or unsigned, and is a public link
  -- to somebody's identity document sitting in a database column.
  r2_key          text NOT NULL,
  content_type    text NOT NULL,
  bytes           integer NOT NULL CHECK (bytes > 0),
  original_name   text,
  uploaded_at     timestamptz NOT NULL DEFAULT now(),
  uploaded_by     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,

  CONSTRAINT supplier_application_document_key_unique UNIQUE (r2_key)
);

CREATE INDEX IF NOT EXISTS supplier_application_documents_app_idx
  ON public.supplier_application_documents (application_id, kind);

ALTER TABLE public.supplier_application_documents ENABLE ROW LEVEL SECURITY;

-- The applicant sees WHICH documents they have uploaded, which is what the
-- wizard's checklist is. Seeing the row is not seeing the file: the object is
-- in a private bucket and only a signed URL minted server-side reaches it.
DROP POLICY IF EXISTS "own_documents_read" ON public.supplier_application_documents;
CREATE POLICY "own_documents_read" ON public.supplier_application_documents
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.supplier_applications a
    WHERE a.id = supplier_application_documents.application_id
      AND a.user_id = (SELECT auth.uid())
  ));

DROP POLICY IF EXISTS "staff_documents_all" ON public.supplier_application_documents;
CREATE POLICY "staff_documents_all" ON public.supplier_application_documents
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

REVOKE INSERT, UPDATE, DELETE ON public.supplier_application_documents FROM anon, authenticated;
GRANT SELECT ON public.supplier_application_documents TO authenticated;

-- =============================================================================
-- 4. supplier_contract_acceptances
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.supplier_contract_acceptances (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  application_id  uuid REFERENCES public.supplier_applications(id) ON DELETE SET NULL,
  supplier_id     uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  accepted_by     uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  contract_version text NOT NULL,
  -- SHA-256 of the exact text that was on screen. "They accepted the terms" is
  -- worth nothing if the terms can be edited afterwards; this settles a dispute
  -- by comparison rather than by trust.
  contract_sha256 text NOT NULL CHECK (contract_sha256 ~ '^[0-9a-f]{64}$'),
  accepted_at     timestamptz NOT NULL DEFAULT now(),
  -- Nullable: with no proxy in front, `getClientIp` returns 'unknown', which is
  -- not an address and `inet` would reject it.
  client_ip       inet,
  user_agent      text,

  -- One of the two has to be there or the acceptance belongs to nobody.
  CONSTRAINT supplier_contract_acceptance_subject CHECK (
    application_id IS NOT NULL OR supplier_id IS NOT NULL
  )
);

CREATE INDEX IF NOT EXISTS supplier_contract_acceptances_app_idx
  ON public.supplier_contract_acceptances (application_id);
CREATE INDEX IF NOT EXISTS supplier_contract_acceptances_supplier_idx
  ON public.supplier_contract_acceptances (supplier_id);

ALTER TABLE public.supplier_contract_acceptances ENABLE ROW LEVEL SECURITY;

-- APPEND-ONLY, AND THAT IS THE WHOLE VALUE OF THE TABLE. A log of agreements
-- that can be edited is not evidence of anything. SELECT for the person who
-- signed and for admins; no UPDATE and no DELETE policy for anybody.
DROP POLICY IF EXISTS "own_acceptance_read" ON public.supplier_contract_acceptances;
CREATE POLICY "own_acceptance_read" ON public.supplier_contract_acceptances
  FOR SELECT TO authenticated
  USING (accepted_by = (SELECT auth.uid()));

DROP POLICY IF EXISTS "staff_acceptance_read" ON public.supplier_contract_acceptances;
CREATE POLICY "staff_acceptance_read" ON public.supplier_contract_acceptances
  FOR SELECT TO authenticated
  USING (public.is_admin());

REVOKE INSERT, UPDATE, DELETE ON public.supplier_contract_acceptances FROM anon, authenticated;
GRANT SELECT ON public.supplier_contract_acceptances TO authenticated;

COMMIT;
