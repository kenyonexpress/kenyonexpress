-- 235_product_live_and_rating.sql
--
-- Two small pieces the product page needs from the database and cannot
-- reconstruct from what is already there:
--
--   1. A LIVE CHANNEL PER PRODUCT. `loadProductBySlug` is `'use cache'` for an
--      hour, and the one field that moves inside that hour is availability:
--      `finalize.ts` decrements `stock_quantity` on every sale and does not
--      touch the catalogue tag (see product-detail.ts, "the one field that is
--      deliberately stale"). A shopper reading a page opened ten minutes ago
--      can press a buy button for a unit that is gone, and only the cart's
--      own re-read tells them. This trigger broadcasts the post-update
--      availability to `product:<id>` so an open page corrects itself.
--
--      WHY BROADCAST AND NOT `postgres_changes` ON `products`. A
--      postgres_changes subscription ships the WHOLE row to every subscriber
--      the RLS policy admits, and `products_select_anon` admits everyone.
--      Measured 2026-09-16 on production: `anon` holds column SELECT on all
--      93 columns of products, `cost_ils`, `platform_percent` and
--      `supplier_split_percent` included. That exposure predates this file and
--      is filed separately; this file must not widen it into a push feed.
--      `realtime.send` lets the trigger choose the payload, and it chooses the
--      six columns the page already renders.
--
--      WHY IT CAN NEVER FAIL A SALE. The trigger fires inside the same
--      transaction as the stock decrement in finalize, which is the
--      transaction that records a paid order. A broadcast that raised would
--      roll the payment record back. The body therefore swallows every error:
--      a lost notification costs one stale page, a lost order costs money.
--
--      PUBLIC CHANNEL, DELIBERATELY. `private := false` means no policy on
--      `realtime.messages` is needed and an anonymous storefront visitor can
--      listen; the payload is catalogue data the same visitor can already
--      SELECT, so there is nothing to protect. Nothing else broadcasts here
--      (`realtime.messages` policies: none, measured), so the topic prefix
--      `product:` cannot collide.
--
--   2. (REMOVED 2026-10-08, STEP 45.) This file used to add
--      `product_rating_summary(uuid)`, a SECURITY DEFINER average-and-count
--      over approved reviews for the product page's star row and its JSON-LD
--      AggregateRating. The business rule is stricter than 232 read it:
--      ratings are collected from buyers after delivery and read by the owner
--      in /admin/reviews only; NO number derived from them is displayed to a
--      visitor, not even an aggregate. Measured 2026-10-08 against production
--      (`to_regprocedure`): the function never existed there, so removing it
--      from the unapplied file is the whole change. The storefront reader
--      (`loadRatingSummary`), the star row (`RatingStars`) and the JSON-LD
--      node went in the same commit; src/__tests__/ratings-never-public.test.ts
--      pins that this file creates no such function and grants `anon` nothing.
--      The filename keeps its number and its name so the manifest, the
--      inventory test and every earlier STATE entry still resolve.
--
--
-- IDEMPOTENT: every statement is CREATE OR REPLACE / IF NOT EXISTS / DROP IF
-- EXISTS, so a second apply is a no-op.
--
-- ROLLBACK:
--   DROP TRIGGER IF EXISTS products_broadcast_live ON public.products;
--   DROP FUNCTION IF EXISTS public.products_broadcast_live();

BEGIN;

-- ------------------------------------------------------------- preconditions

DO $$
BEGIN
  IF to_regprocedure('realtime.send(jsonb, text, text, boolean)') IS NULL THEN
    RAISE EXCEPTION 'realtime.send(jsonb, text, text, boolean) is missing; the product channel would be silently dead';
  END IF;
  IF to_regprocedure('public.available_stock(uuid, uuid, uuid)') IS NULL THEN
    RAISE EXCEPTION 'public.available_stock(uuid, uuid, uuid) is missing; the live payload cannot subtract reservations';
  END IF;
END $$;

-- ------------------------------------------------------- 1. the live channel

CREATE OR REPLACE FUNCTION public.products_broadcast_live()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $fn$
DECLARE
  v_available integer;
BEGIN
  -- Every line below is inside the handler: a failure here must never reach
  -- the UPDATE that fired it. See the header.
  BEGIN
    v_available := public.available_stock(NEW.id, NULL, NULL);
    PERFORM realtime.send(
      jsonb_build_object(
        'product_id',     NEW.id,
        'stock_quantity', NEW.stock_quantity,
        'available',      v_available,
        'kenyon_price',   NEW.kenyon_price,
        'full_price',     NEW.full_price,
        'status',         NEW.status,
        'deleted_at',     NEW.deleted_at
      ),
      'live',
      'product:' || NEW.id::text,
      false
    );
  EXCEPTION WHEN OTHERS THEN
    -- Swallowed on purpose. RAISE WARNING keeps it in the Postgres log,
    -- which is where a dead channel is diagnosed.
    RAISE WARNING 'products_broadcast_live: % (product %)', SQLERRM, NEW.id;
  END;
  RETURN NEW;
END;
$fn$;

COMMENT ON FUNCTION public.products_broadcast_live() IS
  'AFTER UPDATE trigger body: broadcasts stock/price/status of one product to the public realtime topic product:<id>. Never raises.';

REVOKE ALL ON FUNCTION public.products_broadcast_live() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS products_broadcast_live ON public.products;
CREATE TRIGGER products_broadcast_live
  AFTER UPDATE OF stock_quantity, kenyon_price, full_price, status, deleted_at
  ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.products_broadcast_live();

-- ------------------------------------------------------ 2. (removed)
--
-- No rating summary. See the header: the owner reads ratings in
-- /admin/reviews, visitors read none. If a `product_rating_summary` from an
-- earlier draft of this file was ever applied by hand, it is dropped here so
-- the schema matches the rule.

DROP FUNCTION IF EXISTS public.product_rating_summary(uuid);

-- --------------------------------------------------------------- self-check

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
     WHERE tgname = 'products_broadcast_live' AND tgrelid = 'public.products'::regclass
  ) THEN
    RAISE EXCEPTION 'products_broadcast_live trigger did not land';
  END IF;
  IF to_regprocedure('public.product_rating_summary(uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'product_rating_summary still exists; ratings are owner-only and must not be readable by visitors (STEP 45)';
  END IF;
END $$;

COMMIT;
