-- 223_restock_on_refund.sql
--
-- The missing fourth verb of the reservation lifecycle: put consumed stock
-- back when the sale is undone.
--
-- WHAT WAS ACTUALLY MISSING, MEASURED BEFORE THIS WAS WRITTEN:
--
--   117 gave the lifecycle three verbs. `reserve_order_stock` holds units at
--   checkout, `consume_order_stock` decrements `products.stock_quantity` when
--   the charge succeeds, and `release_order_stock` frees an UNCONSUMED hold
--   when a pending order is cancelled. But `release` filters on
--   `consumed_at IS NULL`, so once an order is paid its units are gone from
--   the shelf forever - including when the refund console moves the money
--   back. Measured in the code: `refund.ts` flips `orders.status` from `paid`
--   to `refunded` and touches payments, vouchers, order_items, settlement
--   events and the credit note queue, and never mentions stock. A refunded
--   physical order therefore leaves the product looking one unit more sold
--   out than it is, permanently, and nothing corrects it.
--
-- THE FIX IS THE MIRROR OF CONSUME, NOT A SECOND RELEASE. A released hold
-- never touched the level, so releasing is just a stamp; a consumed hold DID
-- decrement, so undoing it must increment by exactly what was consumed and
-- must refuse to do so twice. That wants its own stamp rather than reusing
-- `released_at`: a consumed-then-released row would read as two different
-- stories depending on which column you trusted, and the whole point of the
-- 117 design is that each row tells one.
--
-- IDEMPOTENT THE SAME WAY CONSUME IS. The UPDATE that stamps `restocked_at`
-- filters on `restocked_at IS NULL`, so a replayed refund (the refund action
-- is already replay-guarded, but best-effort callers retry) increments
-- nothing the second time. One statement, no read-modify-write - the same
-- lesson 117's header records about the original decrement bug.
--
-- UNTRACKED STAYS UNTRACKED. `stock_quantity IS NULL` means "not counted";
-- the increment skips those rows exactly as consume's decrement does.
-- `stock_initial` is untouched by design: the restock UPDATE fires
-- `products_track_stock_initial`, whose GREATEST() only moves the denominator
-- if the level rises ABOVE it, which a refund of a real sale cannot do.
--
-- SERVICE-ROLE ONLY, like the other three verbs (117): the caller is the
-- refund action on the admin client. No client role can EXECUTE.

ALTER TABLE public.stock_reservations
  ADD COLUMN IF NOT EXISTS restocked_at timestamptz;

COMMENT ON COLUMN public.stock_reservations.restocked_at IS
  'When a CONSUMED reservation was returned to products.stock_quantity by a refund. NULL while the sale stands. Terminal, like consumed_at/released_at; set only by restock_order_stock().';

CREATE OR REPLACE FUNCTION public.restock_order_stock(p_order_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_restocked integer := 0;
BEGIN
  WITH undone AS (
    UPDATE public.stock_reservations r
       SET restocked_at = now()
     WHERE r.order_id = p_order_id
       AND r.consumed_at IS NOT NULL
       AND r.restocked_at IS NULL
    RETURNING r.product_id, r.quantity
  ),
  grouped AS (
    SELECT product_id, sum(quantity)::integer AS qty FROM undone GROUP BY product_id
  ),
  applied AS (
    UPDATE public.products p
       SET stock_quantity = p.stock_quantity + g.qty
      FROM grouped g
     WHERE p.id = g.product_id AND p.stock_quantity IS NOT NULL
    RETURNING 1
  )
  SELECT count(*)::integer INTO v_restocked FROM applied;

  RETURN v_restocked;
END;
$$;

COMMENT ON FUNCTION public.restock_order_stock(uuid) IS
  'Returns consumed stock to the shelf when a paid order is refunded. Mirror of consume_order_stock: stamps restocked_at and increments products.stock_quantity in one statement; idempotent per reservation; untracked products (stock_quantity IS NULL) are skipped. Returns the number of product rows incremented.';

REVOKE ALL ON FUNCTION public.restock_order_stock(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.restock_order_stock(uuid) TO service_role;
