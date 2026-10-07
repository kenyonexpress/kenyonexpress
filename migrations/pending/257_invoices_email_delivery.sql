-- 257_invoices_email_delivery.sql
--
-- Two columns so the invoice queue can record that it mailed a document.
-- Additive only, safe to re-run.
--
-- WHY. Since STEP 42 the platform issues its own numbered tax document
-- (228's sequence, lib/invoices/pdf.ts) and mails it to the customer with
-- the PDF attached, from `server/payments/invoices.ts` right after the row
-- is marked issued. A mail that was not sent is a document the customer
-- does not hold, and the only trace of that today would be a log line.
-- `emailed_at` makes "every issued document reached a mailbox" a query, and
-- `email_error` keeps the provider's refusal next to the row it refused.
--
-- The application writes both in a separate, tolerant UPDATE and treats
-- 42703 as "257 not applied yet", so a deployment ahead of this file issues
-- and mails exactly as it would after it; only the record is missing.
--
-- MEASURED against production 2026-10-08 before writing: public.invoices has
-- 22 columns (107 + 116 + 228), none of them named emailed_at or email_error;
-- all 28 rows are `issued`, every one of them a mock-provider document
-- (`mock-doc-N`, document_url on mock.cardcom.invalid, series and
-- internal_number NULL) from E2E runs against the hosted database. They are
-- untouched here: a tax document is never edited, and those rows are test
-- artefacts whose cleanup is a data decision, not a schema one.
--
-- ROLLBACK:
--   ALTER TABLE public.invoices DROP COLUMN IF EXISTS email_error;
--   ALTER TABLE public.invoices DROP COLUMN IF EXISTS emailed_at;

ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS emailed_at timestamptz;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS email_error text;

COMMENT ON COLUMN public.invoices.emailed_at IS
  'When the platform mailed this document to the customer with the PDF attached. Null while not sent (no recipient, no mail key, or a refusal recorded in email_error). Added by 257.';

COMMENT ON COLUMN public.invoices.email_error IS
  'The last reason the document mail did not go out (no_api_key, http_4xx, network, no_recipient). Cleared on a successful send. Added by 257.';

-- The column's meaning moved in STEP 42: the number is the platform's own
-- (KE-INV-000042 and friends, allocated by fn_next_invoice_number), and the
-- provider's number, when there is one, lives in provider_response.provider.
COMMENT ON COLUMN public.invoices.document_number IS
  'The platform''s own sequential document number (formatInvoiceNumber over series + internal_number) since STEP 42. Rows issued before that carry the provider''s number. The provider''s reference number for the same sale is provider_response.provider.document_number.';

COMMENT ON COLUMN public.orders.invoice_number IS
  'The platform''s own number for the order''s tax invoice/receipt (invoices.document_number of the sale''s issued row). Written by the invoice issuer and nowhere else.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'invoices' AND column_name = 'emailed_at'
  ) THEN
    RAISE EXCEPTION '257: invoices.emailed_at is missing after ADD COLUMN';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'invoices' AND column_name = 'email_error'
  ) THEN
    RAISE EXCEPTION '257: invoices.email_error is missing after ADD COLUMN';
  END IF;
END $$;
