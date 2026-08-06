-- 107_invoices.sql
--
-- What [55] needs from the schema, measured against production on 2026-08-07
-- rather than read off the migration files. Additive only, safe to re-run.
--
-- WHAT EXISTS TODAY, AND WHY IT IS NOT ENOUGH
--
--   select column_name from information_schema.columns
--    where table_schema='public' and column_name ilike any (array['%invoice%','%document%'])
--   -> exactly one row: orders.invoice_number, text, nullable.
--
-- and in the data:
--
--   select count(*), count(invoice_number) from public.orders  -> 4, 0
--
-- One nullable text column, four orders, not one of them carrying a number.
-- In the code that column has FOUR readers and ZERO writers, and that is not
-- neutral: `admin/orders/page.tsx:93` searches `invoice_number.ilike`, so
-- "find the order by its invoice number" in the admin cannot return a row
-- today, and three screens render `invoice_number ?? id.slice(0,8)` and are
-- therefore always showing the fallback.
--
-- A single text column also cannot carry the thing itself. A document has a
-- type (tax invoice/receipt vs credit note), an issue time, a URL to the PDF,
-- and - because it is issued by an external provider over the network, after
-- the card has already been charged - a delivery state with attempts and an
-- error. `orders.invoice_number` stays as the human-facing number, written for
-- the first time by this feature so the admin search starts working, and the
-- document itself gets a table.
--
-- WHY A ROW PER DOCUMENT AND NOT A COLUMN PER ORDER
--
-- A refunded order needs a credit note (חשבונית זיכוי) while the original tax
-- invoice stays valid and issued - that is the whole point of a credit note, a
-- tax document is never edited or deleted. Partial refunds produce more than
-- one. Columns on `orders` can hold one document; the real cardinality is
-- one-to-many, and it is the refund path ([48], migration 106) that makes it so.
--
-- IDEMPOTENCY. `idempotency_key` is unique and is built by the caller as
-- `order:<id>:tax_invoice_receipt` for the charge and
-- `payment:<id>:credit_note` for a refund. This is the same shape the wallet
-- already uses for `fn_wallet_transfer` (`order:<id>:cashback`). finalizeOrder
-- is replay-safe by design - the webhook and the return page reconcile the same
-- order - so the second enqueue has to be a no-op at the database level and not
-- at the mercy of a flag somebody has to keep correct. A duplicate tax document
-- is not a cosmetic bug: two invoices for one sale are two taxable events.
--
-- RLS: ENABLED, ZERO POLICIES, ON PURPOSE
--
-- Same posture as `settlement_events` and for the reason [54] measured there:
-- RLS on with no policy is the tightest state Postgres offers - total denial to
-- anyone who is not service_role - and it is deliberate here, not a gap.
-- [54] also measured what the alternative costs: an anon read of such a table
-- returns `200 []`, NOT an error, so a customer-facing screen built on the
-- request-bound client would show "no invoice" for an invoice that exists, with
-- no error anywhere. Every read of this table therefore goes through the
-- service client behind an ownership check that has already run
-- (`getOrderDetail` scopes to `user_id`), and the PDF is served through
-- `/account/orders/[id]/invoice`, which re-checks ownership before it redirects.
--
-- MONEY. Integer agorot, as everywhere on this path, and `net + vat = total` is
-- a CHECK rather than a comment, because the split is computed from a
-- VAT-inclusive price and rounding is exactly the place that quietly loses an
-- agora. `vat_percent` is stored per document: the rate is a fact about the day
-- the document was issued (17% until 2024-12-31, 18% from 2025-01-01), so a
-- document reprinted next year must not be recomputed at next year's rate.

-- ---------------------------------------------------------------------------
-- 1. invoices
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  -- Null for a wallet-covered order, which never creates a payments row, and
  -- set on a credit note to the refund payment that caused it.
  payment_id uuid REFERENCES public.payments(id) ON DELETE RESTRICT,

  document_type text NOT NULL CHECK (
    document_type = ANY (ARRAY['tax_invoice_receipt'::text, 'credit_note'::text])
  ),

  -- pending -> issued, or pending -> failed -> ... -> dead after MAX_ATTEMPTS.
  -- `dead` is a state an admin can see and requeue; it is not a silent drop.
  status text NOT NULL DEFAULT 'pending' CHECK (
    status = ANY (ARRAY['pending'::text, 'issued'::text, 'failed'::text, 'dead'::text])
  ),

  idempotency_key text NOT NULL,

  total_agorot integer NOT NULL CHECK (total_agorot >= 0),
  net_agorot   integer NOT NULL CHECK (net_agorot   >= 0),
  vat_agorot   integer NOT NULL CHECK (vat_agorot   >= 0),
  vat_percent  numeric(5, 2) NOT NULL CHECK (vat_percent >= 0 AND vat_percent <= 100),
  CONSTRAINT invoices_amounts_add_up CHECK (net_agorot + vat_agorot = total_agorot),

  -- What the provider gave back. Null until issued.
  document_number text,
  document_url text,
  issued_at timestamptz,

  provider text NOT NULL DEFAULT 'cardcom',
  provider_response jsonb,

  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  last_error text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS invoices_idempotency_key_key
  ON public.invoices (idempotency_key);

CREATE INDEX IF NOT EXISTS idx_invoices_order
  ON public.invoices (order_id);

-- The drain's only question: what is due now. Partial, because `issued` rows
-- are the overwhelming majority in a healthy system and none of them are due.
CREATE INDEX IF NOT EXISTS idx_invoices_due
  ON public.invoices (next_attempt_at)
  WHERE status = ANY (ARRAY['pending'::text, 'failed'::text]);

COMMENT ON TABLE public.invoices IS
  'One row per tax document (invoice/receipt or credit note) requested from the payment provider. Written by the money path, read through the service role only. Added by 107 for [55].';

COMMENT ON COLUMN public.invoices.idempotency_key IS
  'order:<order_id>:tax_invoice_receipt or payment:<payment_id>:credit_note. Unique, because finalizeOrder is replay-safe and two invoices for one sale are two taxable events.';

COMMENT ON COLUMN public.invoices.vat_percent IS
  'The rate this document was issued under, not the current rate. 17 until 2024-12-31, 18 from 2025-01-01.';

-- ---------------------------------------------------------------------------
-- 2. updated_at
-- ---------------------------------------------------------------------------

-- public.set_updated_at() already exists in this database (measured; alongside
-- set_vendors_updated_at and set_coupon_deals_updated_at).
DROP TRIGGER IF EXISTS trg_invoices_updated_at ON public.invoices;
CREATE TRIGGER trg_invoices_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
-- Deliberately no policies. See the header: service-role only, and every read
-- happens behind an ownership check in the application.

-- ---------------------------------------------------------------------------
-- 4. orders.invoice_number gets a writer
-- ---------------------------------------------------------------------------

COMMENT ON COLUMN public.orders.invoice_number IS
  'The provider''s document number for the order''s tax invoice/receipt. Existed with four readers and no writer until 107; written by the invoice issuer, which is why the admin order search by invoice number can return a row at all.';
