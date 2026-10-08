-- 265_product_bundles.sql
--
-- Product bundles with a FIXED discount (STEP 60): "buy these N products
-- together and pay ₪X less". Three tables and nothing else.
--
-- WHAT A BUNDLE IS HERE
--
-- A bundle is a named set of (product, quantity) rows and one integer amount
-- in agorot. It is not a product: it has no price of its own, no stock, no
-- slug the storefront routes to, and it never appears as a cart line. The
-- cart holds the component products exactly as before; when every component
-- is present in the quantities the bundle names, the amount comes off the
-- on-site charge as a savings line (`src/lib/bundles/evaluate.ts`), once per
-- complete set, and the checkout re-derives the same number from the same
-- rows before the card is charged. Nothing in these tables is money the
-- customer is owed; it is a rule the pricer reads.
--
-- WHY A FIXED AMOUNT AND NOT A PERCENT
--
-- The savings line is what the shopper reads, and "₪30 off the set" is one
-- number the admin typed and can defend. A percent of a set whose members
-- have different platform percents would be a different number for every
-- combination of variants, and the admin would be unable to say what the
-- bundle costs the platform before a shopper assembled it. The discount is
-- funded from the platform's commission like every other discount
-- (settlement.ts caps it there), so the admin needs to know the figure.
--
-- WHO MAY READ AND WRITE
--
--   * The storefront reads active bundles through the anon key: the cart
--     pricer and the product page both ask "which active bundles contain
--     these products". The policy exposes ACTIVE rows only, so a bundle an
--     admin is still composing cannot be enumerated.
--   * Items follow their bundle: readable where the parent is active.
--   * Every write is the service role from
--     `src/server/actions/admin/bundles.ts` behind
--     `requireSection('discounts', 'write')` with an audit row. The
--     `has_role('admin')` policy is the same belt 262 wears: it lets a future
--     direct-session admin tool work, and costs nothing today.
--   * `order_bundle_discounts` is the record of what a paid order saved and
--     under which bundle, written by the checkout on the service role. The
--     money truth is the order's own discount column; this table is the
--     breakdown a report needs, with the bundle's name copied in so deleting
--     the bundle later does not erase why an order was cheaper. Owner SELECT
--     only, so an account page can show it; no client role may write it.
--
-- MONEY IS INTEGER AGOROT: one column, CHECK > 0, and the application never
-- divides it. The form takes shekels and converts once in the action.
--
-- PRECONDITIONS: `public.products`, `public.orders`, `public.set_updated_at()`
-- and `public.has_role(text)` present (all live; 262 measured the last two on
-- 2026-10-08). No dependency on any other pending file.
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS public.order_bundle_discounts;
--   DROP TABLE IF EXISTS public.product_bundle_items;
--   DROP TABLE IF EXISTS public.product_bundles;
-- Orders keep their discount column; only the per-bundle breakdown is lost.

BEGIN;

CREATE TABLE IF NOT EXISTS public.product_bundles (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  name_he         text        NOT NULL,
  description_he  text,
  -- The whole saving for one complete set, in agorot. Never a percent.
  discount_agorot integer     NOT NULL,
  is_active       boolean     NOT NULL DEFAULT true,
  starts_at       timestamptz,
  expires_at      timestamptz,
  created_by      uuid,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_bundles_name_check') THEN
    ALTER TABLE public.product_bundles
      ADD CONSTRAINT product_bundles_name_check
      CHECK (length(btrim(name_he)) BETWEEN 2 AND 120);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_bundles_discount_check') THEN
    ALTER TABLE public.product_bundles
      ADD CONSTRAINT product_bundles_discount_check
      CHECK (discount_agorot > 0);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_bundles_window_check') THEN
    ALTER TABLE public.product_bundles
      ADD CONSTRAINT product_bundles_window_check
      CHECK (starts_at IS NULL OR expires_at IS NULL OR starts_at < expires_at);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS product_bundles_active_idx
  ON public.product_bundles (is_active) WHERE is_active;

DROP TRIGGER IF EXISTS set_updated_at ON public.product_bundles;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.product_bundles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- One row per (bundle, product). A product appears in a bundle once, with a
-- quantity; "two of the same mug" is quantity 2, not two rows.
CREATE TABLE IF NOT EXISTS public.product_bundle_items (
  bundle_id  uuid    NOT NULL REFERENCES public.product_bundles(id) ON DELETE CASCADE,
  product_id uuid    NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity   integer NOT NULL DEFAULT 1,
  PRIMARY KEY (bundle_id, product_id)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'product_bundle_items_quantity_check') THEN
    ALTER TABLE public.product_bundle_items
      ADD CONSTRAINT product_bundle_items_quantity_check
      CHECK (quantity BETWEEN 1 AND 99);
  END IF;
END $$;

-- The storefront asks "which bundles hold this product": the product page
-- for its offer block, the cart for every product in it.
CREATE INDEX IF NOT EXISTS product_bundle_items_product_idx
  ON public.product_bundle_items (product_id);

-- What an order saved, per bundle. `bundle_id` is nullable with SET NULL so
-- an admin may delete a bundle that has been sold; the name and the amount
-- stay on the row, which is the record.
CREATE TABLE IF NOT EXISTS public.order_bundle_discounts (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id        uuid        NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  bundle_id       uuid        REFERENCES public.product_bundles(id) ON DELETE SET NULL,
  bundle_name_he  text        NOT NULL,
  -- How many complete sets the cart held.
  times           integer     NOT NULL,
  -- The saving actually applied for this bundle on this order, in agorot,
  -- after the cart's caps. Not `discount_agorot * times` by definition: the
  -- commission ceiling can clip it.
  discount_agorot integer     NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_bundle_discounts_times_check') THEN
    ALTER TABLE public.order_bundle_discounts
      ADD CONSTRAINT order_bundle_discounts_times_check CHECK (times >= 1);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'order_bundle_discounts_amount_check') THEN
    ALTER TABLE public.order_bundle_discounts
      ADD CONSTRAINT order_bundle_discounts_amount_check CHECK (discount_agorot >= 0);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS order_bundle_discounts_order_idx
  ON public.order_bundle_discounts (order_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.product_bundles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_bundle_items   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_bundle_discounts ENABLE ROW LEVEL SECURITY;

-- Active bundles only. The window is judged by the application against the
-- same clock as the cart (so a bundle that expires mid-session leaves the
-- savings line and the charge at the same moment); the policy hides what an
-- admin has switched off or not yet switched on.
DROP POLICY IF EXISTS "product_bundles: public read active" ON public.product_bundles;
CREATE POLICY "product_bundles: public read active" ON public.product_bundles
  FOR SELECT TO anon, authenticated USING (is_active);

DROP POLICY IF EXISTS "product_bundles: staff write" ON public.product_bundles;
CREATE POLICY "product_bundles: staff write" ON public.product_bundles
  FOR ALL TO authenticated
  USING (public.has_role('admin')) WITH CHECK (public.has_role('admin'));

DROP POLICY IF EXISTS "product_bundle_items: public read active" ON public.product_bundle_items;
CREATE POLICY "product_bundle_items: public read active" ON public.product_bundle_items
  FOR SELECT TO anon, authenticated
  USING (EXISTS (
    SELECT 1 FROM public.product_bundles b
     WHERE b.id = product_bundle_items.bundle_id AND b.is_active
  ));

DROP POLICY IF EXISTS "product_bundle_items: staff write" ON public.product_bundle_items;
CREATE POLICY "product_bundle_items: staff write" ON public.product_bundle_items
  FOR ALL TO authenticated
  USING (public.has_role('admin')) WITH CHECK (public.has_role('admin'));

-- The customer may read the breakdown of their own order; nobody else, and
-- no client role writes it (the checkout is the service role).
DROP POLICY IF EXISTS "order_bundle_discounts: owner read" ON public.order_bundle_discounts;
CREATE POLICY "order_bundle_discounts: owner read" ON public.order_bundle_discounts
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.orders o
     WHERE o.id = order_bundle_discounts.order_id AND o.user_id = (select auth.uid())
  ));

-- 144's rule: client roles get SELECT and nothing else on a new table.
REVOKE ALL ON public.product_bundles        FROM anon, authenticated;
REVOKE ALL ON public.product_bundle_items   FROM anon, authenticated;
REVOKE ALL ON public.order_bundle_discounts FROM anon, authenticated;
GRANT SELECT ON public.product_bundles        TO anon, authenticated;
GRANT SELECT ON public.product_bundle_items   TO anon, authenticated;
GRANT SELECT ON public.order_bundle_discounts TO authenticated;
-- The staff-write policies above need the DML grant to mean anything for a
-- direct admin session. Service-role writes bypass both.
GRANT INSERT, UPDATE, DELETE ON public.product_bundles      TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.product_bundle_items TO authenticated;

COMMENT ON TABLE public.product_bundles IS
  'Fixed-amount savings for buying a set of products together (STEP 60). Absent table = no bundles; the cart prices as before.';
COMMENT ON TABLE public.product_bundle_items IS
  'The (product, quantity) members of a bundle. A set is complete when the cart holds every row in at least its quantity.';
COMMENT ON TABLE public.order_bundle_discounts IS
  'Per-bundle breakdown of an order''s bundle savings. The order''s discount column is the money; this is the why.';

-- ---------------------------------------------------------------------------
-- Self-check, rolled back: a bundle of two products with quantity 1 and 2,
-- then the constraint that refuses a zero discount.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_bundle uuid;
  v_count  integer;
BEGIN
  INSERT INTO public.product_bundles (name_he, discount_agorot)
    VALUES ('בדיקת חבילה 265', 3000) RETURNING id INTO v_bundle;
  INSERT INTO public.product_bundle_items (bundle_id, product_id, quantity)
    SELECT v_bundle, id, 1 FROM public.products ORDER BY created_at LIMIT 1;
  SELECT count(*) INTO v_count FROM public.product_bundle_items WHERE bundle_id = v_bundle;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'product_bundles self-check: expected 1 item, found %', v_count;
  END IF;
  BEGIN
    INSERT INTO public.product_bundles (name_he, discount_agorot) VALUES ('אפס', 0);
    RAISE EXCEPTION 'product_bundles self-check: a zero discount was accepted';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;
  -- Roll the rehearsal rows back; the tables stay.
  RAISE EXCEPTION 'product_bundles: self-check passed and rolled back'
    USING ERRCODE = 'P0001';
EXCEPTION
  WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM LIKE 'product_bundles: self-check passed%' THEN
      RAISE NOTICE '%', SQLERRM;
    ELSE
      RAISE;
    END IF;
END $$;

COMMIT;

-- NOT APPLIED. Written 2026-10-08 (STEP 60). Apply through the dashboard
-- after review; the application tolerates the absent tables (42P01 reads as
-- "no bundles") until then.
