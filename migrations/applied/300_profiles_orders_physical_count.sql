-- Migration 300: profiles.orders_physical_count (G20)
-- Counts PAID orders that contain at least one physical line. The checkout
-- gate (F42) forces a complete address + WhatsApp OTP on the 6th such order.
-- Integer counter, no money. Not applied: apply via Supabase MCP, one at a time.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS orders_physical_count integer NOT NULL DEFAULT 0;

-- Backfill from paid history (idempotent: recomputes the same number).
UPDATE public.profiles p
   SET orders_physical_count = s.n
  FROM (
    SELECT o.user_id, count(DISTINCT o.id)::integer AS n
      FROM public.orders o
      JOIN public.order_items oi ON oi.order_id = o.id
     WHERE oi.product_type = 'physical'
       AND oi.deleted_at IS NULL
       AND o.status IN ('paid', 'partially_fulfilled', 'fulfilled', 'platform_settled')
     GROUP BY o.user_id
  ) s
 WHERE s.user_id = p.id
   AND p.orders_physical_count IS DISTINCT FROM s.n;

-- Atomic bump, called once per order on its pending->paid transition.
CREATE OR REPLACE FUNCTION public.bump_orders_physical_count(p_user_id uuid)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.profiles
     SET orders_physical_count = orders_physical_count + 1
   WHERE id = p_user_id
  RETURNING orders_physical_count;
$$;

REVOKE ALL ON FUNCTION public.bump_orders_physical_count(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bump_orders_physical_count(uuid) TO service_role;
