-- 228_invoice_sequences.sql
--
-- Sequential document numbering the platform owns, per terminal and per
-- document type. Additive only, safe to re-run.
--
-- WHY THE PLATFORM NEEDS ITS OWN SEQUENCE WHEN CARDCOM ALREADY NUMBERS
--
-- The provider's number belongs to the provider's series and arrives only
-- when its document module answers. The platform's own Hebrew PDF (rendered
-- when the provider returns a number but no fetchable PDF, and mirrored into
-- R2 so the customer's link outlives the provider's) needs a number of its
-- own that is sequential per series, because an Israeli tax document without
-- a sequential number is not a document. One counter row per series, bumped
-- atomically by an upsert, so two concurrent issues can never print the same
-- number.
--
-- SERIES = '<cardcom account id>:<document type>'. A document is issued on
-- the terminal that took the money (payments.cardcom_account_id, measured
-- present in production 2026-09-10), and each terminal is its own issuer with
-- its own series; mixing them would interleave two businesses' numbering.
--
-- MEASURED against production 2026-09-10 before writing: public.invoices
-- exists (107 lineage, all 20 columns), invoice_counters does not,
-- fn_next_invoice_number does not, and invoices has no series or
-- internal_number column. Everything below CREATEs or ADDs; nothing is
-- restated (the 183 lesson).
--
-- SECURITY: service-role only, the invoices posture. RLS on with zero
-- policies, table privileges revoked, and EXECUTE revoked from PUBLIC
-- explicitly because CREATE FUNCTION grants it by default (the 158/159
-- lesson: a definer-adjacent helper reachable by anon is an incident, not a
-- convenience).

-- ---------------------------------------------------------------------------
-- 1. invoice_counters
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.invoice_counters (
  series text PRIMARY KEY,
  last_number bigint NOT NULL DEFAULT 0 CHECK (last_number >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.invoice_counters IS
  'One row per document series (<cardcom account id>:<document type>). last_number is the last allocated internal invoice number; allocation goes through fn_next_invoice_number only. Added by 228.';

ALTER TABLE public.invoice_counters ENABLE ROW LEVEL SECURITY;
-- Deliberately no policies: total denial to anyone who is not service_role.
REVOKE ALL ON public.invoice_counters FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. fn_next_invoice_number
-- ---------------------------------------------------------------------------

-- One statement, so allocation is atomic under concurrency: the ON CONFLICT
-- UPDATE takes the row lock, and RETURNING reads the post-update value. Two
-- callers on one series serialize on the row and get consecutive numbers.
CREATE OR REPLACE FUNCTION public.fn_next_invoice_number(p_series text)
RETURNS bigint
LANGUAGE sql
SET search_path TO 'public'
AS $$
  INSERT INTO invoice_counters AS c (series, last_number)
  VALUES (p_series, 1)
  ON CONFLICT (series) DO UPDATE
    SET last_number = c.last_number + 1,
        updated_at = now()
  RETURNING c.last_number;
$$;

COMMENT ON FUNCTION public.fn_next_invoice_number(text) IS
  'Atomically allocates the next internal invoice number for a series. Service-role only; SECURITY INVOKER, so it moves nothing an anon caller could not already touch (and anon has no privileges on invoice_counters).';

REVOKE EXECUTE ON FUNCTION public.fn_next_invoice_number(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_next_invoice_number(text) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. invoices carries its allocation
-- ---------------------------------------------------------------------------

ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS series text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS internal_number bigint;

COMMENT ON COLUMN public.invoices.internal_number IS
  'The platform''s own sequential number within series, allocated by fn_next_invoice_number at issue time. Null on rows issued before 228 and on rows issued while the sequence was unavailable; the provider''s number in document_number is unaffected.';

-- Two rows may never share a number within a series. Partial, because the
-- pre-228 backlog is all NULLs and NULLs are not a collision.
CREATE UNIQUE INDEX IF NOT EXISTS invoices_series_internal_number_key
  ON public.invoices (series, internal_number)
  WHERE internal_number IS NOT NULL;
