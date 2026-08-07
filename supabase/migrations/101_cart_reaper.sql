-- 101: a reaper for expired carts, and the nudge history it must not take with it.
--
-- `public.carts.expires_at` has been NOT NULL DEFAULT now() + 30 days since the
-- beginning and every cart write pushes it forward, so a row past it is a cart
-- nobody has touched for a month. Nothing has ever deleted by it. The table
-- grows from real traffic and from every E2E run, and it had reached 253 rows
-- with 0 expired only because the oldest was 11 days old.
--
-- The reaper is deliberately a function rather than a DELETE in application
-- code: the predicate that decides what is disposable belongs next to the
-- column that defines it, and a batch limit that lives here cannot be widened
-- by a caller.

-- ---------------------------------------------------------------------------
-- 1. The nudge must outlive the cart.
-- ---------------------------------------------------------------------------
-- abandoned_cart_nudges.cart_id arrived (with the growth migrations) as NOT
-- NULL REFERENCES carts ON DELETE CASCADE. Left that way, the reaper would be a
-- second, silent deleter: a cart that was nudged AND recovered would take its
-- own evidence with it 30 days later, and v_abandoned_cart_recovery would keep
-- reporting a rate over a denominator that quietly shrinks. The recovery is a
-- historical fact about a person and an order; the cart row is only where it
-- happened.
--
-- The UNIQUE on cart_id still enforces one nudge per cart, because Postgres
-- treats NULLs as distinct in a unique index, and a cart that has been deleted
-- cannot be nudged again regardless.
ALTER TABLE public.abandoned_cart_nudges ALTER COLUMN cart_id DROP NOT NULL;

ALTER TABLE public.abandoned_cart_nudges
  DROP CONSTRAINT IF EXISTS abandoned_cart_nudges_cart_id_fkey;

ALTER TABLE public.abandoned_cart_nudges
  ADD CONSTRAINT abandoned_cart_nudges_cart_id_fkey
  FOREIGN KEY (cart_id) REFERENCES public.carts (id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 2. The index the reaper runs on.
-- ---------------------------------------------------------------------------
-- Partial on the predicate itself would need a non-immutable now(), so this is
-- a plain btree: the reaper scans the low end of it and stops.
CREATE INDEX IF NOT EXISTS idx_carts_expires_at ON public.carts (expires_at);

-- ---------------------------------------------------------------------------
-- 3. The reaper.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_reap_expired_carts(p_limit integer DEFAULT 500)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_deleted integer;
BEGIN
  -- Bounded on purpose. An unbounded DELETE on a table this hot takes row locks
  -- across every cart it matches, and a shopper adding an item mid-sweep would
  -- wait on it. The caller re-runs until it returns 0.
  IF p_limit IS NULL OR p_limit < 1 THEN
    p_limit := 500;
  END IF;
  IF p_limit > 5000 THEN
    p_limit := 5000;
  END IF;

  WITH doomed AS (
    SELECT id
      FROM public.carts
     WHERE expires_at < now()
     ORDER BY expires_at
     LIMIT p_limit
     -- A cart being written to right now is not disposable, and skipping it
     -- costs nothing: the next run picks it up if it is still expired.
     FOR UPDATE SKIP LOCKED
  )
  DELETE FROM public.carts c
   USING doomed d
   WHERE c.id = d.id;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$function$;

-- service_role only. This is the one function in the schema whose whole purpose
-- is to delete other people's rows, and no browser-reachable key should be able
-- to name it.
REVOKE ALL ON FUNCTION public.fn_reap_expired_carts(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_reap_expired_carts(integer) FROM anon;
REVOKE ALL ON FUNCTION public.fn_reap_expired_carts(integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fn_reap_expired_carts(integer) TO service_role;

-- ---------------------------------------------------------------------------
-- 4. What is waiting to be reaped, for the admin.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_cart_reaper_backlog AS
  SELECT
    count(*) AS total_carts,
    count(*) FILTER (WHERE expires_at < now()) AS expired_carts,
    count(*) FILTER (WHERE profile_id IS NULL) AS guest_carts,
    min(expires_at) AS oldest_expiry
  FROM public.carts;

REVOKE ALL ON public.v_cart_reaper_backlog FROM PUBLIC;
REVOKE ALL ON public.v_cart_reaper_backlog FROM anon;
GRANT SELECT ON public.v_cart_reaper_backlog TO service_role;
