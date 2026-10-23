-- CANCELLED 2026-10-23 (F01): superseded before it was ever applied. The weekend
-- chip shipped as 284_products_weekend_only.sql (applied) and the free-shipping
-- chip needs no column: it reads shipping_price_agorot = 0 (278, applied). This
-- file would add a second `weekend_only` plus a redundant `free_shipping`
-- column. The number 193 stays burned; the other 193 is
-- 193_observability_endpoint_metrics.sql.
-- 193_weekend_and_free_shipping.sql
--
-- Weekend-only and free-shipping product chips for the UI.
-- Both default to false, enabling gradual rollout of weekend-only and
-- free-shipping product tiers.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS weekend_only boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS free_shipping boolean DEFAULT false NOT NULL;

-- Index for filtering by these flags
CREATE INDEX IF NOT EXISTS products_weekend_only_idx
  ON public.products (weekend_only) WHERE weekend_only = true;

CREATE INDEX IF NOT EXISTS products_free_shipping_idx
  ON public.products (free_shipping) WHERE free_shipping = true;

COMMENT ON COLUMN public.products.weekend_only IS
  'When true, product is only available on weekends (Friday-Sunday).';

COMMENT ON COLUMN public.products.free_shipping IS
  'When true, product qualifies for free shipping.';
