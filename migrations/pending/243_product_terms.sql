-- 243_product_terms.sql
--
-- Q05 (final-queue, 2026-09-25): the per-product commercial terms the admin
-- product form sets beside the money knobs. What shipping costs, how long
-- after fulfilment the supplier's share is transferred, how often the supplier
-- is paid for this product, how long the customer may cancel, and whether the
-- statutory cancellation fee is charged.
--
-- FIVE ADDITIVE COLUMNS ON `products`. Nothing existing is altered, dropped or
-- rewritten, and every statement is idempotent. Three carry a NOT NULL DEFAULT
-- (a fast metadata default on this Postgres, no table rewrite); two are NULL
-- to mean "the supplier's / the platform's own setting".
--
-- WHAT EACH DEFAULT MEANS, so nobody reads a default as a decision
-- (src/lib/admin/product-terms.ts carries the same table):
--
--   shipping_price_agorot 0        Free shipping is what checkout charges today
--                                  for every product; the cart has no shipping
--                                  line. The column records the operator's
--                                  price. Charging it is a checkout change and
--                                  is listed as open in STATE.md.
--   supplier_transfer_days NULL    = the supplier's own payout_hold_business_days
--                                  (PAYOUT-ENGINE.md), which the payout run
--                                  already applies. A number is a per-product
--                                  override the run does not yet read.
--   payout_cadence NULL            = the platform's daily run. Recorded for the
--                                  operator and the supplier statement; the run
--                                  does not yet group by it.
--   cancellation_window_days 14    The Consumer Protection Law's distance-sale
--                                  window (DISTANCE_SALE_WINDOW_DAYS). It is the
--                                  FLOOR: a product may offer more, never less,
--                                  and the CHECK refuses less.
--   refund_policy 'statutory'      The law's terms as /refund_returns states
--                                  them: cancellation inside the window with a
--                                  fee of up to 5% or 100 ILS. 'fee_waived'
--                                  keeps the window and waives the fee.
--
-- MONEY IS INTEGER AGOROT. `shipping_price_agorot` is an integer, never a
-- numeric shekel column; the form types shekels and converts once through
-- src/lib/commerce/money.ts (ilsToAgorot) in the server action.
--
-- READ PATH. `products` is read with the anon key on the storefront, so the
-- five columns get an explicit column-level SELECT grant; a no-op where a
-- table-level grant already exists.
--
-- THE CODE RUNS WITHOUT THIS FILE. The admin form reads the five columns
-- through readProductTerms (absent = default) and the write sends them as one
-- group that src/lib/admin/optional-column-groups.ts drops on the
-- missing-column error ONLY while every value is still the default. A product
-- whose terms the admin changed is refused with this filename until it is
-- applied, never written nowhere and reported as saved. Rehearse with
-- BEGIN ... ROLLBACK per docs/RUNBOOK.md.

BEGIN;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS shipping_price_agorot integer NOT NULL DEFAULT 0;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS supplier_transfer_days integer;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS payout_cadence text;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS cancellation_window_days integer NOT NULL DEFAULT 14;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS refund_policy text NOT NULL DEFAULT 'statutory';

COMMENT ON COLUMN public.products.shipping_price_agorot IS
  'Shipping charged for this product, integer agorot. 0 = free shipping. Recorded by the admin form; checkout does not yet add it to the charge.';

COMMENT ON COLUMN public.products.supplier_transfer_days IS
  'Days after fulfilment before the supplier''s share is transferred. NULL = the supplier''s own payout_hold_business_days.';

COMMENT ON COLUMN public.products.payout_cadence IS
  'How often the supplier is paid for this product: per_order, weekly or monthly. NULL = the platform''s daily payout run.';

COMMENT ON COLUMN public.products.cancellation_window_days IS
  'Calendar days from the charge in which the customer may cancel. Never below the statutory 14 (Consumer Protection Law, distance sale).';

COMMENT ON COLUMN public.products.refund_policy IS
  'statutory = the law''s terms with a cancellation fee of up to 5% or 100 ILS; fee_waived = same window, no fee.';

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_shipping_price_agorot_nonneg;
ALTER TABLE public.products
  ADD CONSTRAINT products_shipping_price_agorot_nonneg
  CHECK (shipping_price_agorot >= 0);

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_supplier_transfer_days_range;
ALTER TABLE public.products
  ADD CONSTRAINT products_supplier_transfer_days_range
  CHECK (supplier_transfer_days IS NULL OR supplier_transfer_days BETWEEN 0 AND 90);

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_payout_cadence_known;
ALTER TABLE public.products
  ADD CONSTRAINT products_payout_cadence_known
  CHECK (payout_cadence IS NULL OR payout_cadence IN ('per_order', 'weekly', 'monthly'));

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_cancellation_window_statutory_floor;
ALTER TABLE public.products
  ADD CONSTRAINT products_cancellation_window_statutory_floor
  CHECK (cancellation_window_days BETWEEN 14 AND 365);

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_refund_policy_known;
ALTER TABLE public.products
  ADD CONSTRAINT products_refund_policy_known
  CHECK (refund_policy IN ('statutory', 'fee_waived'));

GRANT SELECT (
  shipping_price_agorot,
  supplier_transfer_days,
  payout_cadence,
  cancellation_window_days,
  refund_policy
) ON public.products TO anon, authenticated;

COMMIT;
