-- 256_product_terms_live_completion.sql
--
-- S16 (2026-11-04): admin product upload. Measured on production before writing.
--
-- 243 was never applied as written, yet four of its five columns are live, in a
-- different shape (another lineage added them):
--
--   shipping_price_agorot     integer, NULL, no default, CHECK 0..10000000
--   supplier_transfer_days    integer, NULL, CHECK 0..90
--   payout_cadence            text, NULL, CHECK IN (weekly, biweekly, monthly)
--   cancellation_window_days  integer, NULL, no default, CHECK 0..365
--   refund_policy             ABSENT
--
-- The admin form and the CSV import send the five as one group
-- (src/lib/admin/optional-column-groups.ts). With refund_policy absent, every
-- save that sets a shipping fee or a cancellation window gets PGRST204 on
-- refund_policy and is refused with the 243 notice. With payout_cadence's live
-- CHECK, 'per_order' (a form option) is a 23514.
--
-- This file closes exactly those two gaps, additively:
--
--   1. refund_policy text NOT NULL DEFAULT 'statutory', CHECK as in 243.
--   2. payout_cadence CHECK widened to the union of both vocabularies
--      (per_order, weekly, biweekly, monthly). Every live row is NULL (126/126).
--   3. A statutory floor on cancellation_window_days (NULL or 14..365). Live:
--      44 rows at 14, 82 NULL, none below 14. NULL stays legal; the code reads
--      it as 14 (readProductTerms).
--   4. Column SELECT grant on refund_policy for anon and authenticated, the
--      same as the other four already have.
--
-- 243 stays pending and is NOT to be applied on production after this: its
-- payout_cadence CHECK would intersect with the live one and drop 'biweekly'.
--
-- Rollback:
--   ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_cancellation_window_statutory_floor;
--   ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_payout_cadence_check;
--   ALTER TABLE public.products ADD CONSTRAINT products_payout_cadence_check
--     CHECK (payout_cadence IS NULL OR payout_cadence = ANY (ARRAY['weekly','biweekly','monthly']));
--   ALTER TABLE public.products DROP COLUMN IF EXISTS refund_policy;

BEGIN;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS refund_policy text NOT NULL DEFAULT 'statutory';

COMMENT ON COLUMN public.products.refund_policy IS
  'statutory = the law''s terms with a cancellation fee of up to 5% or 100 ILS; fee_waived = same window, no fee.';

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_refund_policy_known;
ALTER TABLE public.products
  ADD CONSTRAINT products_refund_policy_known
  CHECK (refund_policy IN ('statutory', 'fee_waived'));

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_payout_cadence_check;
ALTER TABLE public.products
  ADD CONSTRAINT products_payout_cadence_check
  CHECK (payout_cadence IS NULL OR payout_cadence IN ('per_order', 'weekly', 'biweekly', 'monthly'));

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_cancellation_window_statutory_floor;
ALTER TABLE public.products
  ADD CONSTRAINT products_cancellation_window_statutory_floor
  CHECK (cancellation_window_days IS NULL OR cancellation_window_days BETWEEN 14 AND 365);

GRANT SELECT (refund_policy) ON public.products TO anon, authenticated;

COMMIT;
