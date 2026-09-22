-- 239_customer_invoice_settings.sql
--
-- OWNER DECISIONS, 2026-09-23, Invoices: "account settings toggle 'invoice to
-- business name' with business name + registration number fields, applied to
-- future invoices."
--
-- A NEW TABLE, NOT THREE COLUMNS ON `profiles`, AND THIS IS DELIBERATE.
--
-- `runUpdateProfileDetails` (src/server/actions/account.ts) already documents
-- that every non-admin UPDATE on `profiles` fails in production today:
-- `enforce_profile_privilege_columns` references `NEW.supplier_id`, a column
-- `profiles` does not have, and raises 42703 on the write. The fix for that is
-- migration 218, written 2026-09-09 and still pending. Building this feature
-- as more columns on `profiles` would inherit that failure on day one -- a
-- toggle a customer flips, sees "saved", and that never actually wrote.
--
-- A dedicated table sidesteps the broken trigger entirely (it is defined on
-- `profiles`, not here) rather than making this feature wait on an unrelated
-- migration landing first. It is also the same separation this codebase
-- already uses for `notification_preferences` and `user_addresses`: settings
-- that belong to an account but are not the account's core identity get their
-- own table, one row per user, own RLS.
--
-- BOTH FIELDS REQUIRED TOGETHER, ENFORCED IN THE APPLICATION, NOT HERE. A tax
-- invoice with a business name and no registration number is not a usable
-- business invoice, but the CHECK that would enforce it is a business rule
-- that will need adjusting, and adjusting a CHECK is a migration while
-- adjusting the zod schema in `src/server/actions/account.ts` is a deploy.
-- IDEMPOTENT.

BEGIN;

CREATE TABLE IF NOT EXISTS public.customer_invoice_settings (
  user_id                       uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  invoice_to_business           boolean NOT NULL DEFAULT false,
  business_name                 text,
  business_registration_number  text,
  created_at                    timestamptz NOT NULL DEFAULT now(),
  updated_at                    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.customer_invoice_settings IS
  'Per-customer opt-in to receive future tax invoices addressed to a business name + registration number instead of the account holder''s own name. Read by src/server/payments/invoices.ts at document-build time; never touches an already-issued document.';

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_updated_at ON public.customer_invoice_settings;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.customer_invoice_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.customer_invoice_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customer_invoice_settings_select_own" ON public.customer_invoice_settings;
CREATE POLICY "customer_invoice_settings_select_own"
  ON public.customer_invoice_settings FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "customer_invoice_settings_insert_own" ON public.customer_invoice_settings;
CREATE POLICY "customer_invoice_settings_insert_own"
  ON public.customer_invoice_settings FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "customer_invoice_settings_update_own" ON public.customer_invoice_settings;
CREATE POLICY "customer_invoice_settings_update_own"
  ON public.customer_invoice_settings FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- Read from the service-role client too, at invoice-build time
-- (src/server/payments/invoices.ts) -- that path already bypasses RLS via the
-- admin client, so no additional policy is needed for it.

REVOKE ALL ON public.customer_invoice_settings FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.customer_invoice_settings TO authenticated;

COMMIT;
