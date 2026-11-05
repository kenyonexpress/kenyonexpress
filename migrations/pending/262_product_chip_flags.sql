-- 262: products.open_weekend and products.free_shipping, the two columns behind
-- the storefront filter chips "פתוח בסופ״ש" and "משלוח חינם".
--
-- S35 (06.11.2026). Until this file the two chips filtered on stand-ins:
--
--   open on the weekend  the marker tag 'open-weekend' inside products.tags,
--                        written by a checkbox in the admin product form.
--   free shipping        requires_shipping = true AND shipping_price_agorot = 0,
--                        a rule nobody set on purpose: a product landed in the
--                        chip because the form had saved a zero.
--
-- Both become a boolean the operator ticks in the admin form, NOT NULL DEFAULT
-- false, so a product is in a chip only because somebody said so.
--
-- WHAT IS CARRIED OVER, ONCE. Each column is added and backfilled inside one
-- "column does not exist yet" branch, so a second run adds nothing and, more
-- to the point, does not re-tick a box the operator has since unticked.
--
--   open_weekend   true for every row that carries the marker tag, and the tag
--                  is removed from tags in the same statement, so the tags box
--                  in the form does not start showing a marker it used to hide.
--                  Measured on production before applying: 0 rows.
--   free_shipping  true for exactly the rows the chip listed before this file
--                  (requires_shipping AND shipping_price_agorot = 0), so the
--                  chip shows the same products on both sides of the change.
--                  Measured on production before applying: 14 rows, 11 active.
--                  A NULL price is NOT carried over: it was never in the chip.
--
-- THE CHECK. "Free shipping" is a statement to a customer. A row that says it
-- while recording a shipping price, or while not shipping at all, would
-- advertise something the product's own terms contradict, so the table refuses
-- that row. The admin action checks the same rule first and answers in Hebrew;
-- the constraint is for every other writer.
--
-- Triggers fire on the backfill (audit_products, set_updated_at, the search
-- index queue, the realtime broadcast). That is intended: the rows did change.
-- enforce_product_approval returns NEW untouched when auth.uid() is NULL.
--
-- No index: 132 rows. No RLS change: the columns ride the table's policies.
--
-- Reversal:
--   ALTER TABLE public.products
--     DROP CONSTRAINT IF EXISTS products_free_shipping_consistent,
--     DROP COLUMN IF EXISTS open_weekend,
--     DROP COLUMN IF EXISTS free_shipping;
-- and deploy the commit before S35 first: the chips name these columns, and a
-- filter on a missing column is Postgres 42703, which fails the whole select.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'products'
       AND column_name = 'open_weekend'
  ) THEN
    ALTER TABLE public.products
      ADD COLUMN open_weekend boolean NOT NULL DEFAULT false;

    UPDATE public.products
       SET open_weekend = true,
           tags = array_remove(tags, 'open-weekend')
     WHERE tags @> ARRAY['open-weekend'];
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'products'
       AND column_name = 'free_shipping'
  ) THEN
    ALTER TABLE public.products
      ADD COLUMN free_shipping boolean NOT NULL DEFAULT false;

    UPDATE public.products
       SET free_shipping = true
     WHERE requires_shipping
       AND shipping_price_agorot = 0;
  END IF;
END
$$;

ALTER TABLE public.products
  DROP CONSTRAINT IF EXISTS products_free_shipping_consistent;
ALTER TABLE public.products
  ADD CONSTRAINT products_free_shipping_consistent
  CHECK (
    NOT free_shipping
    OR (requires_shipping AND COALESCE(shipping_price_agorot, 0) = 0)
  );

COMMENT ON COLUMN public.products.open_weekend IS
  'The business takes customers on Friday and Saturday. Set by the operator in the admin product form; the storefront chip ?open=weekend filters on it.';
COMMENT ON COLUMN public.products.free_shipping IS
  'The operator states this product ships free. Requires requires_shipping and a zero shipping_price_agorot (products_free_shipping_consistent); the storefront chip ?shipping=free filters on it.';
