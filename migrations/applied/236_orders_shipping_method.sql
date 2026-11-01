-- 236_orders_shipping_method.sql
--
-- Where the shopper's shipping choice lands on the order.
--
-- The cart offers two methods (lib/shipping/methods.ts): delivery by the
-- supplier, which is what every order has meant until now, and self pickup
-- at the supplier. The choice is held in a cookie until checkout and then has
-- nowhere to go: `orders` records an address and no fulfilment method, so a
-- customer who asked to collect gets a parcel.
--
-- Checkout already writes the column, in its own UPDATE after the order
-- INSERT and only for a non-default pick, and logs
-- `checkout.shipping_method_not_recorded` when the column is missing. This
-- file turns that warning into a recorded fact. Nothing reads the column yet;
-- the supplier and admin order pages gain it once this is applied, because a
-- SELECT naming it before then fails those pages with 42703.
--
-- `shipping_agorot` is the rate, integer agorot like every money column here.
-- Every registered rate is zero today (methods-cost-nothing.test.ts pins it
-- there until the settlement engine learns to add it); the column exists so
-- the first non-zero rate is a code change and not a second migration under
-- the purchase path.
--
-- Idempotent: safe to re-run.
--
-- ROLLBACK:
--   ALTER TABLE public.orders DROP COLUMN IF EXISTS shipping_agorot;
--   ALTER TABLE public.orders DROP COLUMN IF EXISTS shipping_method;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS shipping_method text
    CHECK (shipping_method IS NULL OR shipping_method IN ('supplier_delivery', 'pickup'));

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS shipping_agorot bigint NOT NULL DEFAULT 0
    CHECK (shipping_agorot >= 0);

COMMENT ON COLUMN public.orders.shipping_method IS
  'How the shopper asked to receive the order. NULL means supplier_delivery (the only method before this column existed). Values mirror lib/shipping/methods.ts.';

COMMENT ON COLUMN public.orders.shipping_agorot IS
  'Shipping charged on the on-site payment, integer agorot. 0 for every method registered as of 2026-09-16.';
