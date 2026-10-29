-- 166_chips: data layer for the category-page filter chips (C13).
--
-- Chips: open-weekend, free-shipping, under-100.
--   * open-weekend  -> products.weekend_open   (new, this migration)
--   * free-shipping -> products.free_shipping  (new, this migration)
--   * under-100     -> no column. It is a range on products.kenyon_price, the
--                      same predicate the existing price facet already uses.
--
-- Both columns are opt-in per product: NOT NULL DEFAULT false, so every
-- existing row stays unflagged until an admin ticks it and the migration
-- cannot change what any current page shows. No money is stored here;
-- free_shipping is a flag, the threshold lives in store_settings
-- (free_shipping_threshold_agorot, migration 237).
--
-- NOTE ON NUMBERING. migrations/applied already holds a 166
-- (166_voucher_transition_guard.sql). The file name was fixed by queue item
-- C13 and 165 is permanently cancelled, so the name is kept; apply by file
-- name, not by number.
--
-- ROLLBACK
--   DROP INDEX IF EXISTS public.products_weekend_open_idx;
--   DROP INDEX IF EXISTS public.products_free_shipping_idx;
--   ALTER TABLE public.products DROP COLUMN IF EXISTS weekend_open;
--   ALTER TABLE public.products DROP COLUMN IF EXISTS free_shipping;

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS weekend_open boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS free_shipping boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.products.weekend_open IS
  'Category-page chip "פתוח בסוף שבוע": the product can be used/redeemed on the weekend. Default false, opt-in per product.';
COMMENT ON COLUMN public.products.free_shipping IS
  'Category-page chip "משלוח חינם": shipping is free for this product. Flag only, no amount; default false, opt-in per product.';

-- Partial indexes on the ticked rows only, proportional to the flagged few.
CREATE INDEX IF NOT EXISTS products_weekend_open_idx
  ON public.products (id)
  WHERE weekend_open;

CREATE INDEX IF NOT EXISTS products_free_shipping_idx
  ON public.products (id)
  WHERE free_shipping;

-- ============================================================================
-- VERIFICATION (after applying)
--   SELECT column_name, data_type, is_nullable, column_default
--     FROM information_schema.columns
--    WHERE table_schema='public' AND table_name='products'
--      AND column_name IN ('weekend_open','free_shipping');
--   -- expect 2 rows: boolean, NO, false
--   SELECT count(*) FILTER (WHERE weekend_open) AS weekend,
--          count(*) FILTER (WHERE free_shipping) AS free_ship
--     FROM public.products;   -- expect 0, 0 right after apply
-- ============================================================================
