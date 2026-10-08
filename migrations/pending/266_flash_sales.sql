-- 266_flash_sales.sql
--
-- Flash sales (STEP 61): a product at a lower price for a fixed window, a
-- fixed number of units at that price, a per-shopper HOLD on a unit while a
-- timer runs, and a waiting room when more shoppers want units than there
-- are. Two tables, eight functions, and one replaced function body.
--
-- WHAT A FLASH SALE IS HERE
--
-- A row names one product, one integer price in agorot, a window
-- (`starts_at`, `ends_at`), how many units are offered at that price
-- (`allocation`), how many one shopper may take (`max_per_claim`) and how
-- long a hold lasts (`hold_minutes`). It is NOT a price change on the
-- product: `products.kenyon_price` is untouched, the product page keeps its
-- ordinary price, and only a shopper who HOLDS a unit is charged the flash
-- price (the cart prices the line from the claim, `src/lib/cart/pricing.ts`).
-- That is what makes the allocation mean something: a price written onto the
-- product row would be sold to everybody who reached the checkout first, with
-- nothing to count against.
--
-- A CLAIM IS THE RESERVATION. `flash_sale_claims` holds one row per
-- (sale, shopper). `held` is a unit taken for `hold_minutes`; `queued` is a
-- place in the waiting room; `consumed` is a paid order; `released` is a
-- shopper who left; `expired` is a hold that ran out. The allocation that is
-- spoken for is the sum of `consumed` plus LIVE `held` rows, and "live" means
-- `expires_at > now()` OR the hold is bound to an order (the checkout extends
-- the hold to its own stock reservation and then owns its lifetime).
--
-- THE HOLD IS ALSO PHYSICAL STOCK, through `available_stock`. A shopper
-- holding the last unit of a product at the flash price must not lose it to
-- a shopper paying full price in the ordinary checkout, or the hold is a
-- countdown to disappointment. So `available_stock` (117) now subtracts live
-- UNBOUND flash holds beside the checkout's own reservations. Unbound only:
-- once the checkout binds a claim to an order it also takes a
-- `stock_reservations` row for that order, and counting both would hold the
-- unit twice. The binding happens BEFORE `reserve_order_stock`, so the
-- shopper's own hold is never counted against their own order.
--
-- THE WAITING ROOM IS FIFO AND STRICT. `sweep_flash_sale` expires lapsed
-- holds, then promotes queued claims in `queue_position` order while each one
-- fits in the remaining allocation and stock, and STOPS at the first that
-- does not. Skipping ahead to a smaller claim behind it would let a shopper
-- asking for one unit leapfrog a shopper asking for two forever. The sweep
-- runs inside every claim, inside every status read the waiting room polls,
-- and from the stock cron, so a hold that lapses is handed on within one
-- poll interval without a scheduler in the path.
--
-- WHO MAY READ AND WRITE
--
--   * The storefront reads ACTIVE sales through the anon key (the banner,
--     the sale page, the cart). A sale an admin is still composing cannot be
--     enumerated.
--   * A shopper reads their OWN claim row and nothing else. The aggregate a
--     page needs ("12 of 40 left") comes from `flash_sale_remaining`, a
--     definer function granted to the client roles that exposes one integer.
--   * Every write is a SECURITY DEFINER function callable by the service role
--     only, from `src/server/actions/flash-sales.ts` (claim, leave), the
--     checkout (bind, unbind), `finalizeOrder` (consume) and the stock cron
--     (sweep). No client role may INSERT, UPDATE or DELETE a claim: a shopper
--     who could write their own row could write `consumed`.
--   * Admin composition is the service role from
--     `src/server/actions/admin/flash-sales.ts` behind
--     `requireSection('discounts', 'write')` with an audit row; the
--     `has_role('admin')` policy is the same belt 262 and 265 wear.
--
-- MONEY IS INTEGER AGOROT: `price_agorot`, `reference_agorot`, CHECKed, and
-- the application never divides them. The form takes shekels and converts
-- once in the action.
--
-- PRECONDITIONS: `public.products`, `public.orders`, `public.order_items`,
-- `public.stock_reservations` and `public.available_stock(uuid, uuid, uuid)`
-- (117, live), `public.set_updated_at()` and `public.has_role(text)` (live,
-- measured by 262 on 2026-10-08). No dependency on any other pending file.
--
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.sweep_flash_sales();
--   DROP FUNCTION IF EXISTS public.consume_flash_sale_claims(uuid);
--   DROP FUNCTION IF EXISTS public.unbind_flash_sale_claims(uuid);
--   DROP FUNCTION IF EXISTS public.bind_flash_sale_claims(uuid, uuid, integer);
--   DROP FUNCTION IF EXISTS public.leave_flash_sale(uuid, uuid);
--   DROP FUNCTION IF EXISTS public.claim_flash_sale(uuid, uuid, integer);
--   DROP FUNCTION IF EXISTS public.sweep_flash_sale(uuid);
--   DROP FUNCTION IF EXISTS public.flash_sale_remaining(uuid);
--   DROP FUNCTION IF EXISTS public.flash_sale_taken(uuid);
--   DROP TABLE IF EXISTS public.flash_sale_claims;
--   DROP TABLE IF EXISTS public.flash_sales;
--   -- and restore the 117 body of available_stock (the LATERAL without the
--   -- flash_sale_claims branch), which is the only pre-existing object touched.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. The sales
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.flash_sales (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id       uuid        NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  name_he          text        NOT NULL,
  -- The price a holder pays per unit, in agorot. Never a percent.
  price_agorot     integer     NOT NULL,
  -- The "was" price shown beside it, in agorot. Null means "the product's
  -- own compare-at, or its ordinary price" at render time.
  reference_agorot integer,
  -- Units offered at the flash price. Not the product's stock: a sale may
  -- offer 20 of 300.
  allocation       integer     NOT NULL,
  max_per_claim    integer     NOT NULL DEFAULT 1,
  hold_minutes     integer     NOT NULL DEFAULT 10,
  starts_at        timestamptz NOT NULL,
  ends_at          timestamptz NOT NULL,
  is_active        boolean     NOT NULL DEFAULT true,
  created_by       uuid        REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'flash_sales_name_check') THEN
    ALTER TABLE public.flash_sales
      ADD CONSTRAINT flash_sales_name_check
      CHECK (length(btrim(name_he)) BETWEEN 2 AND 120);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'flash_sales_price_check') THEN
    ALTER TABLE public.flash_sales
      ADD CONSTRAINT flash_sales_price_check CHECK (price_agorot > 0);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'flash_sales_reference_check') THEN
    ALTER TABLE public.flash_sales
      ADD CONSTRAINT flash_sales_reference_check
      CHECK (reference_agorot IS NULL OR reference_agorot > price_agorot);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'flash_sales_allocation_check') THEN
    ALTER TABLE public.flash_sales
      ADD CONSTRAINT flash_sales_allocation_check CHECK (allocation BETWEEN 1 AND 100000);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'flash_sales_max_per_claim_check') THEN
    ALTER TABLE public.flash_sales
      ADD CONSTRAINT flash_sales_max_per_claim_check CHECK (max_per_claim BETWEEN 1 AND 10);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'flash_sales_hold_minutes_check') THEN
    ALTER TABLE public.flash_sales
      ADD CONSTRAINT flash_sales_hold_minutes_check CHECK (hold_minutes BETWEEN 1 AND 60);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'flash_sales_window_check') THEN
    ALTER TABLE public.flash_sales
      ADD CONSTRAINT flash_sales_window_check CHECK (starts_at < ends_at);
  END IF;
END $$;

-- The storefront asks "which active sale is on now or next" and "is there an
-- active sale on this product".
CREATE INDEX IF NOT EXISTS flash_sales_active_window_idx
  ON public.flash_sales (ends_at, starts_at) WHERE is_active;
CREATE INDEX IF NOT EXISTS flash_sales_product_idx
  ON public.flash_sales (product_id);

DROP TRIGGER IF EXISTS set_updated_at ON public.flash_sales;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.flash_sales
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. The claims: one per (sale, shopper)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.flash_sale_claims (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  flash_sale_id  uuid        NOT NULL REFERENCES public.flash_sales(id) ON DELETE CASCADE,
  user_id        uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  quantity       integer     NOT NULL,
  status         text        NOT NULL,
  -- Waiting-room order, assigned once when the claim first queues and kept
  -- when it is promoted, so "how many are ahead of me" is one count.
  queue_position integer,
  -- For `held`: when the hold lapses. The checkout extends it when it binds
  -- the claim to an order.
  expires_at     timestamptz,
  order_id       uuid        REFERENCES public.orders(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (flash_sale_id, user_id)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'flash_sale_claims_quantity_check') THEN
    ALTER TABLE public.flash_sale_claims
      ADD CONSTRAINT flash_sale_claims_quantity_check CHECK (quantity BETWEEN 1 AND 10);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'flash_sale_claims_status_check') THEN
    ALTER TABLE public.flash_sale_claims
      ADD CONSTRAINT flash_sale_claims_status_check
      CHECK (status IN ('held', 'queued', 'consumed', 'released', 'expired'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS flash_sale_claims_sale_status_idx
  ON public.flash_sale_claims (flash_sale_id, status, queue_position);
CREATE INDEX IF NOT EXISTS flash_sale_claims_user_idx
  ON public.flash_sale_claims (user_id);
CREATE INDEX IF NOT EXISTS flash_sale_claims_order_idx
  ON public.flash_sale_claims (order_id) WHERE order_id IS NOT NULL;

DROP TRIGGER IF EXISTS set_updated_at ON public.flash_sale_claims;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.flash_sale_claims
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. How much of the allocation is spoken for
-- ---------------------------------------------------------------------------

-- Consumed units plus live holds. A hold bound to an order is live until the
-- order consumes or abandons it, whatever its own expires_at says: the
-- checkout extended it and owns it from there.
CREATE OR REPLACE FUNCTION public.flash_sale_taken(p_sale uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT COALESCE(sum(c.quantity), 0)::integer
    FROM public.flash_sale_claims c
   WHERE c.flash_sale_id = p_sale
     AND (
       c.status = 'consumed'
       OR (c.status = 'held' AND (c.order_id IS NOT NULL OR c.expires_at > now()))
     );
$function$;

REVOKE ALL ON FUNCTION public.flash_sale_taken(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.flash_sale_taken(uuid) TO service_role;

-- The one aggregate a page may read through the client roles: units still
-- open at the flash price, for an ACTIVE sale. Null for a sale that is not
-- visible, so the function leaks nothing about a switched-off row.
CREATE OR REPLACE FUNCTION public.flash_sale_remaining(p_sale uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT GREATEST(0, s.allocation - public.flash_sale_taken(s.id))
    FROM public.flash_sales s
   WHERE s.id = p_sale AND s.is_active;
$function$;

GRANT EXECUTE ON FUNCTION public.flash_sale_remaining(uuid) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. Availability now counts live flash holds (replaces the 117 body)
-- ---------------------------------------------------------------------------

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
    ELSE GREATEST(0, base.level - COALESCE(held.qty, 0) - COALESCE(flash.qty, 0))
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
  ) held ON true
  -- Live UNBOUND flash holds. A bound hold's order has its own reservation
  -- row above, and counting both would hold the unit twice. Product-level,
  -- like the reservations the 117 header explains.
  LEFT JOIN LATERAL (
    SELECT sum(c.quantity)::integer AS qty
      FROM public.flash_sale_claims c
      JOIN public.flash_sales s ON s.id = c.flash_sale_id
     WHERE s.product_id = p_product_id
       AND c.status = 'held'
       AND c.order_id IS NULL
       AND c.expires_at > now()
  ) flash ON true;
$function$;

GRANT EXECUTE ON FUNCTION public.available_stock(uuid, uuid, uuid) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. The sweep: lapse what ran out, promote the queue in order
-- ---------------------------------------------------------------------------

-- Caller holds the sale row FOR UPDATE, or is the cron (which takes it here).
-- Returns how many queued claims became holds.
CREATE OR REPLACE FUNCTION public.sweep_flash_sale(p_sale uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_sale      public.flash_sales%ROWTYPE;
  v_claim     record;
  v_remaining integer;
  v_avail     integer;
  v_promoted  integer := 0;
BEGIN
  SELECT * INTO v_sale FROM public.flash_sales WHERE id = p_sale FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  -- Lapsed, unbound holds. A bound hold belongs to its order now.
  UPDATE public.flash_sale_claims
     SET status = 'expired'
   WHERE flash_sale_id = p_sale
     AND status = 'held'
     AND order_id IS NULL
     AND expires_at <= now();

  -- A bound hold whose order died without the checkout unbinding it (a crash
  -- between the cancel and the unbind) would otherwise count forever. The
  -- order's own status is the truth: cancelled or expired means the unit is
  -- free again. Compared as text so a status the enum does not carry is a
  -- non-match and not an error.
  UPDATE public.flash_sale_claims c
     SET status = 'expired'
    FROM public.orders o
   WHERE c.flash_sale_id = p_sale
     AND c.status = 'held'
     AND c.order_id = o.id
     AND o.status::text IN ('cancelled', 'expired', 'failed')
     AND c.expires_at <= now();

  -- A sale that has ended, or been switched off, promotes nobody, and the
  -- waiting room is told so: every queued claim lapses.
  IF NOT v_sale.is_active OR v_sale.ends_at <= now() THEN
    UPDATE public.flash_sale_claims
       SET status = 'expired'
     WHERE flash_sale_id = p_sale AND status = 'queued';
    RETURN 0;
  END IF;
  IF v_sale.starts_at > now() THEN
    RETURN 0;
  END IF;

  v_remaining := v_sale.allocation - public.flash_sale_taken(p_sale);
  v_avail := public.available_stock(v_sale.product_id, NULL, NULL);

  FOR v_claim IN
    SELECT id, quantity
      FROM public.flash_sale_claims
     WHERE flash_sale_id = p_sale AND status = 'queued'
     ORDER BY queue_position, created_at
  LOOP
    -- Strict FIFO: the first claim that does not fit ends the round.
    IF v_claim.quantity > v_remaining THEN
      EXIT;
    END IF;
    IF v_avail IS NOT NULL AND v_claim.quantity > v_avail THEN
      EXIT;
    END IF;
    UPDATE public.flash_sale_claims
       SET status = 'held',
           expires_at = now() + make_interval(mins => v_sale.hold_minutes)
     WHERE id = v_claim.id;
    v_remaining := v_remaining - v_claim.quantity;
    IF v_avail IS NOT NULL THEN
      v_avail := v_avail - v_claim.quantity;
    END IF;
    v_promoted := v_promoted + 1;
  END LOOP;

  RETURN v_promoted;
END;
$function$;

REVOKE ALL ON FUNCTION public.sweep_flash_sale(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sweep_flash_sale(uuid) TO service_role;

-- The cron's round: every active sale that is open or ended within the day.
-- Ended sales are swept once more so their waiting rooms are told.
CREATE OR REPLACE FUNCTION public.sweep_flash_sales()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_sale uuid;
  v_total integer := 0;
BEGIN
  FOR v_sale IN
    SELECT id FROM public.flash_sales
     WHERE is_active
       AND starts_at <= now()
       AND ends_at > now() - interval '1 day'
     ORDER BY starts_at
  LOOP
    v_total := v_total + public.sweep_flash_sale(v_sale);
  END LOOP;
  RETURN v_total;
END;
$function$;

REVOKE ALL ON FUNCTION public.sweep_flash_sales() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sweep_flash_sales() TO service_role;

-- ---------------------------------------------------------------------------
-- 6. Taking a unit, or a place in line
-- ---------------------------------------------------------------------------

-- Outcomes: 'held' (a unit is yours until expires_at), 'queued' (ahead = how
-- many queued claims precede yours), 'consumed' (you already bought in this
-- sale), 'not_started', 'ended', 'inactive', 'not_found', 'bad_quantity'.
-- Idempotent per (sale, user): a repeat call returns the current claim.
CREATE OR REPLACE FUNCTION public.claim_flash_sale(
  p_sale uuid,
  p_user uuid,
  p_quantity integer
)
RETURNS TABLE (
  outcome    text,
  status     text,
  quantity   integer,
  queue_position   integer,
  ahead      integer,
  expires_at timestamptz,
  remaining  integer
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
-- The output columns share names with the table's columns; inside SQL an
-- unqualified name is the COLUMN, and the output variables are only ever
-- assigned with `:=`. Without this pragma Postgres refuses the query as
-- ambiguous at run time.
#variable_conflict use_column
DECLARE
  v_sale      public.flash_sales%ROWTYPE;
  v_claim     public.flash_sale_claims%ROWTYPE;
  v_remaining integer;
  v_avail     integer;
  v_position  integer;
BEGIN
  SELECT * INTO v_sale FROM public.flash_sales WHERE id = p_sale FOR UPDATE;
  IF NOT FOUND THEN
    outcome := 'not_found'; RETURN NEXT; RETURN;
  END IF;

  PERFORM public.sweep_flash_sale(p_sale);
  v_remaining := GREATEST(0, v_sale.allocation - public.flash_sale_taken(p_sale));
  remaining := v_remaining;

  IF NOT v_sale.is_active THEN
    outcome := 'inactive'; RETURN NEXT; RETURN;
  END IF;
  IF v_sale.starts_at > now() THEN
    outcome := 'not_started'; RETURN NEXT; RETURN;
  END IF;
  IF v_sale.ends_at <= now() THEN
    outcome := 'ended'; RETURN NEXT; RETURN;
  END IF;
  IF p_quantity IS NULL OR p_quantity < 1 OR p_quantity > v_sale.max_per_claim THEN
    outcome := 'bad_quantity'; RETURN NEXT; RETURN;
  END IF;

  SELECT * INTO v_claim
    FROM public.flash_sale_claims
   WHERE flash_sale_id = p_sale AND user_id = p_user
   FOR UPDATE;

  IF FOUND THEN
    IF v_claim.status = 'consumed' THEN
      outcome := 'consumed'; status := 'consumed'; quantity := v_claim.quantity;
      RETURN NEXT; RETURN;
    END IF;
    IF v_claim.status = 'held' AND (v_claim.order_id IS NOT NULL OR v_claim.expires_at > now()) THEN
      outcome := 'held'; status := 'held'; quantity := v_claim.quantity;
      queue_position := v_claim.queue_position; expires_at := v_claim.expires_at;
      RETURN NEXT; RETURN;
    END IF;
    IF v_claim.status = 'queued' THEN
      outcome := 'queued'; status := 'queued'; quantity := v_claim.quantity;
      queue_position := v_claim.queue_position;
      SELECT count(*)::integer INTO ahead
        FROM public.flash_sale_claims
       WHERE flash_sale_id = p_sale AND status = 'queued' AND queue_position < v_claim.queue_position;
      RETURN NEXT; RETURN;
    END IF;
    -- 'expired' or 'released': a fresh attempt reuses the row below.
  END IF;

  v_avail := public.available_stock(v_sale.product_id, NULL, NULL);

  IF p_quantity <= v_remaining AND (v_avail IS NULL OR p_quantity <= v_avail) THEN
    INSERT INTO public.flash_sale_claims (flash_sale_id, user_id, quantity, status, expires_at)
    VALUES (p_sale, p_user, p_quantity, 'held', now() + make_interval(mins => v_sale.hold_minutes))
    ON CONFLICT (flash_sale_id, user_id) DO UPDATE
      SET quantity = EXCLUDED.quantity,
          status = 'held',
          expires_at = EXCLUDED.expires_at,
          order_id = NULL
    RETURNING * INTO v_claim;
    outcome := 'held'; status := 'held'; quantity := v_claim.quantity;
    queue_position := v_claim.queue_position; expires_at := v_claim.expires_at;
    remaining := GREATEST(0, v_remaining - p_quantity);
    RETURN NEXT; RETURN;
  END IF;

  SELECT COALESCE(max(c.queue_position), 0) + 1 INTO v_position
    FROM public.flash_sale_claims c WHERE c.flash_sale_id = p_sale;
  INSERT INTO public.flash_sale_claims (flash_sale_id, user_id, quantity, status, queue_position)
  VALUES (p_sale, p_user, p_quantity, 'queued', v_position)
  ON CONFLICT (flash_sale_id, user_id) DO UPDATE
    SET quantity = EXCLUDED.quantity,
        status = 'queued',
        queue_position = EXCLUDED.queue_position,
        expires_at = NULL,
        order_id = NULL
  RETURNING * INTO v_claim;
  outcome := 'queued'; status := 'queued'; quantity := v_claim.quantity;
  queue_position := v_claim.queue_position;
  SELECT count(*)::integer INTO ahead
    FROM public.flash_sale_claims
   WHERE flash_sale_id = p_sale AND status = 'queued' AND queue_position < v_claim.queue_position;
  RETURN NEXT; RETURN;
END;
$function$;

REVOKE ALL ON FUNCTION public.claim_flash_sale(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_flash_sale(uuid, uuid, integer) TO service_role;

-- Leaving: a hold or a queue place is given back, and the queue moves up.
-- A hold bound to an order is the order's now and is not touched here.
CREATE OR REPLACE FUNCTION public.leave_flash_sale(p_sale uuid, p_user uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_rows integer;
BEGIN
  PERFORM 1 FROM public.flash_sales WHERE id = p_sale FOR UPDATE;
  UPDATE public.flash_sale_claims
     SET status = 'released', expires_at = NULL
   WHERE flash_sale_id = p_sale
     AND user_id = p_user
     AND order_id IS NULL
     AND status IN ('held', 'queued');
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  PERFORM public.sweep_flash_sale(p_sale);
  RETURN v_rows > 0;
END;
$function$;

REVOKE ALL ON FUNCTION public.leave_flash_sale(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.leave_flash_sale(uuid, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 7. The checkout's three steps
-- ---------------------------------------------------------------------------

-- Binds the shopper's live holds for the order's products to the order and
-- extends each to the checkout's own TTL. Returns the bound claims so the
-- checkout can verify every flash-priced line has one. Called BEFORE
-- reserve_order_stock, so the hold stops counting against the order's own
-- availability check (see the available_stock note above).
CREATE OR REPLACE FUNCTION public.bind_flash_sale_claims(
  p_order uuid,
  p_user uuid,
  p_ttl_minutes integer DEFAULT 15
)
RETURNS TABLE (flash_sale_id uuid, product_id uuid, price_agorot integer, quantity integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
#variable_conflict use_column
BEGIN
  RETURN QUERY
  WITH bound AS (
    UPDATE public.flash_sale_claims c
       SET order_id = p_order,
           expires_at = GREATEST(c.expires_at, now() + make_interval(mins => GREATEST(1, p_ttl_minutes)))
      FROM public.flash_sales s
     WHERE s.id = c.flash_sale_id
       AND c.user_id = p_user
       AND c.status = 'held'
       AND (c.order_id IS NULL OR c.order_id = p_order)
       AND (c.order_id = p_order OR c.expires_at > now())
       AND s.product_id IN (
         SELECT i.product_id FROM public.order_items i
          WHERE i.order_id = p_order AND i.product_id IS NOT NULL
       )
    RETURNING c.flash_sale_id, s.product_id, s.price_agorot, c.quantity
  )
  SELECT bound.flash_sale_id, bound.product_id, bound.price_agorot, bound.quantity FROM bound;
END;
$function$;

REVOKE ALL ON FUNCTION public.bind_flash_sale_claims(uuid, uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bind_flash_sale_claims(uuid, uuid, integer) TO service_role;

-- A checkout that failed after binding (stock short, code refused) hands the
-- hold back to the shopper, who still has the minutes the bind added.
CREATE OR REPLACE FUNCTION public.unbind_flash_sale_claims(p_order uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_rows integer;
BEGIN
  UPDATE public.flash_sale_claims
     SET order_id = NULL
   WHERE order_id = p_order AND status = 'held';
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$function$;

REVOKE ALL ON FUNCTION public.unbind_flash_sale_claims(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.unbind_flash_sale_claims(uuid) TO service_role;

-- The money moved: the hold becomes a sale, once. A hold the sweep had
-- already marked expired (a webhook that arrived late) is consumed too; the
-- customer paid the flash price and the record must say so.
CREATE OR REPLACE FUNCTION public.consume_flash_sale_claims(p_order uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_rows integer;
BEGIN
  UPDATE public.flash_sale_claims
     SET status = 'consumed'
   WHERE order_id = p_order AND status IN ('held', 'expired');
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RETURN v_rows;
END;
$function$;

REVOKE ALL ON FUNCTION public.consume_flash_sale_claims(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_flash_sale_claims(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.flash_sales       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.flash_sale_claims ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "flash_sales: public read active" ON public.flash_sales;
CREATE POLICY "flash_sales: public read active" ON public.flash_sales
  FOR SELECT TO anon, authenticated USING (is_active);

DROP POLICY IF EXISTS "flash_sales: staff write" ON public.flash_sales;
CREATE POLICY "flash_sales: staff write" ON public.flash_sales
  FOR ALL TO authenticated
  USING (public.has_role('admin')) WITH CHECK (public.has_role('admin'));

-- A shopper sees their own claim and nobody else's; no client role writes.
DROP POLICY IF EXISTS "flash_sale_claims: owner read" ON public.flash_sale_claims;
CREATE POLICY "flash_sale_claims: owner read" ON public.flash_sale_claims
  FOR SELECT TO authenticated USING (user_id = (select auth.uid()));

-- 144's rule: client roles get SELECT and nothing else on a new table.
REVOKE ALL ON public.flash_sales       FROM anon, authenticated;
REVOKE ALL ON public.flash_sale_claims FROM anon, authenticated;
GRANT SELECT ON public.flash_sales       TO anon, authenticated;
GRANT SELECT ON public.flash_sale_claims TO authenticated;
-- The staff-write policy above needs the DML grant to mean anything for a
-- direct admin session. Service-role writes bypass both.
GRANT INSERT, UPDATE, DELETE ON public.flash_sales TO authenticated;

COMMENT ON TABLE public.flash_sales IS
  'A product at a flash price for a window, with a unit allocation (STEP 61). Absent table = no flash sales.';
COMMENT ON TABLE public.flash_sale_claims IS
  'One row per (sale, shopper): held (a unit, until expires_at), queued (waiting room), consumed, released, expired. Written only by the definer functions.';

-- ---------------------------------------------------------------------------
-- Self-check, rolled back: a sale of one unit; the first shopper holds it,
-- the second queues behind; the hold lapses, the sweep promotes the second;
-- the reference CHECK refuses a "was" price below the flash price.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_product uuid;
  v_user_a  uuid;
  v_user_b  uuid;
  v_sale    uuid;
  v_out     record;
  v_promoted integer;
  v_status  text;
BEGIN
  -- A product the stock gate lets through: untracked, or at least one unit
  -- available after live reservations. A product at zero would queue the
  -- first shopper and the rehearsal would read as a defect in the function.
  SELECT p.id INTO v_product
    FROM public.products p
   WHERE p.deleted_at IS NULL
     AND (public.available_stock(p.id, NULL, NULL) IS NULL
          OR public.available_stock(p.id, NULL, NULL) >= 1)
   ORDER BY p.created_at
   LIMIT 1;
  SELECT id INTO v_user_a FROM auth.users ORDER BY created_at LIMIT 1;
  SELECT id INTO v_user_b FROM auth.users ORDER BY created_at OFFSET 1 LIMIT 1;
  IF v_product IS NULL OR v_user_a IS NULL THEN
    RAISE NOTICE 'flash_sales: self-check skipped (no product or no user to rehearse with)';
    RETURN;
  END IF;

  INSERT INTO public.flash_sales
    (product_id, name_he, price_agorot, reference_agorot, allocation, max_per_claim, hold_minutes, starts_at, ends_at)
  VALUES (v_product, 'בדיקת מבצע בזק 266', 1000, 5000, 1, 2, 10, now() - interval '1 minute', now() + interval '1 hour')
  RETURNING id INTO v_sale;

  SELECT * INTO v_out FROM public.claim_flash_sale(v_sale, v_user_a, 1);
  IF v_out.outcome <> 'held' THEN
    RAISE EXCEPTION 'flash_sales self-check: first claim expected held, got %', v_out.outcome;
  END IF;
  IF public.flash_sale_remaining(v_sale) <> 0 THEN
    RAISE EXCEPTION 'flash_sales self-check: remaining expected 0 after the hold';
  END IF;

  IF v_user_b IS NOT NULL THEN
    SELECT * INTO v_out FROM public.claim_flash_sale(v_sale, v_user_b, 1);
    IF v_out.outcome <> 'queued' OR v_out.ahead <> 0 THEN
      RAISE EXCEPTION 'flash_sales self-check: second claim expected queued with 0 ahead, got % / %', v_out.outcome, v_out.ahead;
    END IF;
    -- Lapse the first hold and sweep: the second shopper is promoted.
    UPDATE public.flash_sale_claims SET expires_at = now() - interval '1 second'
     WHERE flash_sale_id = v_sale AND user_id = v_user_a;
    v_promoted := public.sweep_flash_sale(v_sale);
    IF v_promoted <> 1 THEN
      RAISE EXCEPTION 'flash_sales self-check: expected 1 promotion, got %', v_promoted;
    END IF;
    SELECT status INTO v_status FROM public.flash_sale_claims WHERE flash_sale_id = v_sale AND user_id = v_user_b;
    IF v_status <> 'held' THEN
      RAISE EXCEPTION 'flash_sales self-check: promoted claim expected held, got %', v_status;
    END IF;
  END IF;

  BEGIN
    INSERT INTO public.flash_sales
      (product_id, name_he, price_agorot, reference_agorot, allocation, starts_at, ends_at)
    VALUES (v_product, 'שגוי', 5000, 1000, 1, now(), now() + interval '1 hour');
    RAISE EXCEPTION 'flash_sales self-check: a reference below the flash price was accepted';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  RAISE EXCEPTION 'flash_sales: self-check passed and rolled back'
    USING ERRCODE = 'P0001';
EXCEPTION
  WHEN SQLSTATE 'P0001' THEN
    IF SQLERRM LIKE 'flash_sales: self-check passed%' THEN
      RAISE NOTICE '%', SQLERRM;
    ELSE
      RAISE;
    END IF;
END $$;

COMMIT;

-- NOT APPLIED. Written 2026-10-08 (STEP 61). Apply through the dashboard
-- after review; the application tolerates the absent tables (42P01 / PGRST205
-- reads as "no flash sale") until then. The one pre-existing object this
-- changes is the body of available_stock; its signature and grants are the
-- same, so no caller (src/ or apps/mobile) changes.
