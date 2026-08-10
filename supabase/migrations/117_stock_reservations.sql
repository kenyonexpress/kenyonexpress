-- 117_stock_reservations.sql
--
-- Stock that cannot be oversold, and the reservation that makes checkout mean
-- something.
--
-- WHAT WAS ACTUALLY BROKEN, MEASURED BEFORE THIS WAS WRITTEN:
--
--   1. The only stock check was at ADD TO CART. Between putting the last item
--      in a basket and paying for it there was no hold at all, so two shoppers
--      could both reach the payment page for one unit and both be charged.
--
--   2. The decrement in `finalizeOrder` was a read-modify-write in application
--      code: SELECT stock_quantity, then UPDATE to `max(0, stock - qty)`. Two
--      concurrent finalizes read the same number and write the same result, so
--      the second sale never decrements. The `max(0, ...)` then HIDES it - the
--      column floors at zero and the oversell leaves no trace.
--
-- THE FIX IS A RESERVATION, NOT A TIGHTER CHECK. A check, however atomic, is
-- only true at the instant it runs; the gap it has to cover is the minutes a
-- shopper spends on a hosted payment page. So stock is held at the moment the
-- order becomes payable and released if it is not paid for.
--
-- WHY 15 MINUTES. `ORDER_EXPIRY_MINUTES` in the checkout action is 30, and a
-- Cardcom Low Profile page outlives a shopper's attention long before that. A
-- hold that outlives the sale it was for is stock nobody can buy; a hold that
-- dies during a genuine payment is a charge with no goods. Fifteen is longer
-- than any real card entry including a 3-D Secure step, and short enough that a
-- sold-out page corrects itself within one browse.
--
-- AVAILABILITY IS DERIVED, NEVER STORED. `available = stock_quantity - sum(live
-- reservations)`. A second column holding "available" would be a copy that can
-- disagree with its source, and the first time it did, the disagreement would
-- be invisible. `stock_quantity` stays the single fact and is decremented only
-- when a reservation is CONSUMED at payment.
--
-- THE LOCK IS ON `products`, TAKEN IN PRIMARY-KEY ORDER. Two orders holding the
-- same two products in opposite order is the textbook deadlock; ordering the
-- rows before locking them is what prevents it.

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END; $$;

-- ---------------------------------------------------------------------------
-- 1. Where the "20%" in "only X left" comes from
-- ---------------------------------------------------------------------------

-- A percentage needs a denominator, and `stock_quantity` alone has none: 3 left
-- is nearly gone out of 100 and comfortable out of 4. This records what the
-- level was set TO, so scarcity can be stated as a fraction rather than guessed
-- from an absolute number that means different things per product.
--
-- Backfilled from the current level, which is the truthful starting point: for
-- an untouched product it is exactly right, and for a partly-sold one it means
-- the badge simply does not appear until the level falls further. The
-- alternative - inventing a larger original - would make products look scarcer
-- than they are, which is the direction that misleads a shopper.
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS stock_initial integer;

UPDATE public.products
   SET stock_initial = stock_quantity
 WHERE stock_initial IS NULL AND stock_quantity IS NOT NULL;

COMMENT ON COLUMN public.products.stock_initial IS
  'What stock_quantity was last set to. The denominator for the "only X left" badge; never decremented by a sale.';

-- Keeps the denominator honest when a manager restocks. Only ever moves UP or
-- when the level is set above it, so selling down does not shrink it and make
-- everything look scarce.
CREATE OR REPLACE FUNCTION public.tg_products_track_stock_initial()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.stock_quantity IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.stock_initial IS NULL OR NEW.stock_quantity > COALESCE(OLD.stock_quantity, -1) THEN
    -- A rise is a restock, not a sale, so the denominator follows it.
    NEW.stock_initial := GREATEST(COALESCE(NEW.stock_initial, 0), NEW.stock_quantity);
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS products_track_stock_initial ON public.products;
CREATE TRIGGER products_track_stock_initial
  BEFORE INSERT OR UPDATE OF stock_quantity ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.tg_products_track_stock_initial();

-- ---------------------------------------------------------------------------
-- 2. The reservations
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.stock_reservations (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id     uuid        NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id   uuid        NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  variant_id   uuid        REFERENCES public.product_variants(id) ON DELETE CASCADE,
  quantity     integer     NOT NULL CHECK (quantity > 0),
  expires_at   timestamptz NOT NULL,
  -- Three terminal states, all of them nullable timestamps rather than one
  -- status column, because each answers a different question an operator asks:
  -- when did this become a sale, when was it let go, when did it lapse.
  consumed_at  timestamptz,
  released_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- One order holds one reservation per product/variant. The unique index is what
-- makes `reserve_stock` idempotent: a retried checkout re-reserves the same
-- rows instead of stacking a second hold on the same basket.
CREATE UNIQUE INDEX IF NOT EXISTS stock_reservations_order_line_idx
  ON public.stock_reservations (order_id, product_id, COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- The index the availability query runs on, restricted to live holds so the
-- table can grow without the read slowing down.
CREATE INDEX IF NOT EXISTS stock_reservations_live_idx
  ON public.stock_reservations (product_id, expires_at)
  WHERE consumed_at IS NULL AND released_at IS NULL;

DROP TRIGGER IF EXISTS set_updated_at ON public.stock_reservations;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.stock_reservations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.stock_reservations ENABLE ROW LEVEL SECURITY;

-- No policy for `authenticated` at all. A reservation is written by the money
-- path through the service role and read by nobody else; a shopper who could
-- insert one could hold a competitor's stock indefinitely.
COMMENT ON TABLE public.stock_reservations IS
  'Short-lived holds taken at checkout. available = stock_quantity - live reservations.';

-- ---------------------------------------------------------------------------
-- 3. Availability
-- ---------------------------------------------------------------------------

-- NULL means "not tracked" and is not the same as zero. Most of this catalogue
-- has no stock figure at all, and a function that returned 0 for those would
-- mark the whole shop sold out.
CREATE OR REPLACE FUNCTION public.available_stock(
  p_product_id uuid,
  p_variant_id uuid DEFAULT NULL,
  p_exclude_order uuid DEFAULT NULL
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN base.level IS NULL THEN NULL
    ELSE GREATEST(0, base.level - COALESCE(held.qty, 0))
  END
  FROM (
    SELECT COALESCE(
      (SELECT v.stock_quantity FROM public.product_variants v
        WHERE p_variant_id IS NOT NULL AND v.id = p_variant_id),
      (SELECT p.stock_quantity FROM public.products p WHERE p.id = p_product_id)
    ) AS level
  ) base
  LEFT JOIN LATERAL (
    SELECT sum(r.quantity)::integer AS qty
      FROM public.stock_reservations r
     WHERE r.product_id = p_product_id
       AND r.consumed_at IS NULL
       AND r.released_at IS NULL
       AND r.expires_at > now()
       AND (p_exclude_order IS NULL OR r.order_id <> p_exclude_order)
       AND (p_variant_id IS NULL OR r.variant_id = p_variant_id)
  ) held ON true;
$function$;

GRANT EXECUTE ON FUNCTION public.available_stock(uuid, uuid, uuid) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Taking the hold
-- ---------------------------------------------------------------------------
--
-- RESERVED AT PRODUCT LEVEL, NOT PER VARIANT, and that is a deliberate
-- simplification rather than an oversight. `order_items.variant_id` exists, but
-- a variant's `stock_quantity` is nullable and falls back to the product's, so
-- holding at the variant would let two colours of one shirt each reserve the
-- product's whole level. Product-level is the conservative direction: it can
-- refuse a sale that a per-variant model would have allowed, and it can never
-- allow one that oversells.

-- Reserves every line of an order, or none of them.
--
-- ALL OR NOTHING, and here that IS right - unlike the offline scan batch, whose
-- items are independent facts. These lines are one basket and one payment: a
-- partial hold would charge a customer for a basket they cannot be given.
--
-- Returns the product ids it could not satisfy, rather than raising, so the
-- caller can name them to the shopper. A raise would roll back the transaction
-- and lose which line was the problem.
CREATE OR REPLACE FUNCTION public.reserve_order_stock(
  p_order_id uuid,
  p_ttl_minutes integer DEFAULT 15
)
RETURNS TABLE (product_id uuid, requested integer, available integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_line     record;
  v_expires  timestamptz := now() + make_interval(mins => GREATEST(1, p_ttl_minutes));
  v_avail    integer;
  v_shortfall boolean := false;
BEGIN
  -- Locked in primary-key order. Two orders holding the same two products in
  -- opposite order is the textbook deadlock, and ordering here is the whole
  -- prevention.
  PERFORM 1
    FROM public.products p
   WHERE p.id IN (SELECT DISTINCT i.product_id FROM public.order_items i
                   WHERE i.order_id = p_order_id AND i.product_id IS NOT NULL)
   ORDER BY p.id
     FOR UPDATE;

  FOR v_line IN
    SELECT i.product_id, sum(i.quantity)::integer AS qty
      FROM public.order_items i
     WHERE i.order_id = p_order_id AND i.product_id IS NOT NULL
     GROUP BY i.product_id
     ORDER BY i.product_id
  LOOP
    -- The order's own existing hold is excluded, so re-running this for a
    -- retried checkout compares against the world minus itself instead of
    -- refusing on stock it is already holding.
    v_avail := public.available_stock(v_line.product_id, NULL, p_order_id);

    IF v_avail IS NOT NULL AND v_avail < v_line.qty THEN
      v_shortfall := true;
      product_id := v_line.product_id;
      requested := v_line.qty;
      available := v_avail;
      RETURN NEXT;
    END IF;
  END LOOP;

  IF v_shortfall THEN
    RETURN;
  END IF;

  FOR v_line IN
    SELECT i.product_id, sum(i.quantity)::integer AS qty
      FROM public.order_items i
     WHERE i.order_id = p_order_id AND i.product_id IS NOT NULL
     GROUP BY i.product_id
  LOOP
    INSERT INTO public.stock_reservations (order_id, product_id, quantity, expires_at)
    VALUES (p_order_id, v_line.product_id, v_line.qty, v_expires)
    ON CONFLICT (order_id, product_id, COALESCE(variant_id, '00000000-0000-0000-0000-000000000000'::uuid))
    DO UPDATE SET quantity = EXCLUDED.quantity,
                  expires_at = EXCLUDED.expires_at,
                  released_at = NULL;
  END LOOP;

  RETURN;
END;
$function$;

REVOKE ALL ON FUNCTION public.reserve_order_stock(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_order_stock(uuid, integer) TO service_role;

-- ---------------------------------------------------------------------------
-- 5. Turning a hold into a sale
-- ---------------------------------------------------------------------------

-- Called by `finalizeOrder` after the money moved. Replaces the read-modify-
-- write it used to do: this decrements in ONE statement, so two concurrent
-- finalizes cannot both read the same level and write the same result.
--
-- Idempotent through `consumed_at`. A replayed finalize finds the reservation
-- already consumed and decrements nothing, which is why the guard is on the
-- reservation rather than on the order's status.
--
-- No `max(0, ...)` floor, deliberately. The old one made an oversell
-- indistinguishable from a sell-out; the reservation is what guarantees the
-- level cannot go negative, and if it somehow did, a negative number in the
-- column is evidence rather than a silent zero.
CREATE OR REPLACE FUNCTION public.consume_order_stock(p_order_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_consumed integer := 0;
BEGIN
  WITH claimed AS (
    UPDATE public.stock_reservations r
       SET consumed_at = now()
     WHERE r.order_id = p_order_id
       AND r.consumed_at IS NULL
       AND r.released_at IS NULL
    RETURNING r.product_id, r.quantity
  ),
  applied AS (
    UPDATE public.products p
       SET stock_quantity = p.stock_quantity - c.qty
      FROM (SELECT product_id, sum(quantity)::integer AS qty FROM claimed GROUP BY product_id) c
     WHERE p.id = c.product_id AND p.stock_quantity IS NOT NULL
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_consumed FROM applied;

  RETURN v_consumed;
END;
$function$;

REVOKE ALL ON FUNCTION public.consume_order_stock(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_order_stock(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 6. Letting go
-- ---------------------------------------------------------------------------

-- A hold that was never paid for. Called both by the cleanup cron and directly
-- when an order is cancelled, because waiting for a cron to free stock that is
-- already known to be free is stock nobody can buy for up to an hour.
CREATE OR REPLACE FUNCTION public.release_order_stock(p_order_id uuid)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH released AS (
    UPDATE public.stock_reservations
       SET released_at = now()
     WHERE order_id = p_order_id
       AND consumed_at IS NULL
       AND released_at IS NULL
    RETURNING 1
  )
  SELECT count(*)::integer FROM released;
$function$;

-- The sweep. Expired holds already stop counting against availability the
-- moment they lapse (`available_stock` filters on `expires_at > now()`), so
-- this is bookkeeping rather than the thing that frees the stock. That ordering
-- matters: a cron that failed to run must not be able to keep a product sold
-- out.
CREATE OR REPLACE FUNCTION public.release_expired_stock_reservations()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH released AS (
    UPDATE public.stock_reservations
       SET released_at = now()
     WHERE consumed_at IS NULL
       AND released_at IS NULL
       AND expires_at <= now()
    RETURNING 1
  )
  SELECT count(*)::integer FROM released;
$function$;

REVOKE ALL ON FUNCTION public.release_order_stock(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_order_stock(uuid) TO service_role;
REVOKE ALL ON FUNCTION public.release_expired_stock_reservations() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_expired_stock_reservations() TO service_role;

-- ---------------------------------------------------------------------------
-- 7. What an operator needs to see
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.v_low_stock AS
  SELECT
    p.id,
    p.name_he,
    p.slug,
    p.type,
    p.stock_quantity,
    p.stock_initial,
    p.low_stock_threshold,
    public.available_stock(p.id) AS available,
    s.name AS supplier_name,
    s.contact_email AS supplier_email
  FROM public.products p
  LEFT JOIN public.suppliers s ON s.id = p.supplier_id
  WHERE p.deleted_at IS NULL
    AND p.status = 'active'::public.product_status
    AND p.stock_quantity IS NOT NULL
    AND public.available_stock(p.id) <= p.low_stock_threshold;

COMMENT ON VIEW public.v_low_stock IS
  'Active tracked products at or under their threshold, by AVAILABLE rather than by level.';
