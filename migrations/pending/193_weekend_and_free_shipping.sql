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
