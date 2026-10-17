-- Migration 130: Abandoned Cart Recovery Infrastructure
-- ============================================================================
-- Design: Multi-stage recovery emails with escalating discounts (+1h @5%, +24h @10%)
--
-- The system monitors abandoned carts hourly and sends recovery emails at:
-- - +1h: 5% discount incentive
-- - +24h: 10% discount incentive (if not recovered)
--
-- Fully idempotent. Apply via MCP apply_migration.
-- ============================================================================

-- 1. Track recovery email stages and escalating discounts
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.abandoned_cart_nudges (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  cart_id         uuid        REFERENCES public.carts(id) ON DELETE SET NULL,
  user_id         uuid        REFERENCES auth.users(id) ON DELETE CASCADE,
  email           text        NOT NULL,
  item_count      integer     NOT NULL,
  cart_value_agorot integer,

  -- Track recovery progression
  first_nudge_at  timestamptz NOT NULL DEFAULT now(),
  first_discount_percent integer DEFAULT 0,
  second_nudge_at timestamptz,
  second_discount_percent integer DEFAULT 0,

  -- Provider tracking for idempotency
  first_provider_id text,
  second_provider_id text,

  -- Recovery outcome
  recovered_at    timestamptz,
  recovered_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  -- One nudge history per cart, even after cart deletion (cart_id SET NULL)
  CONSTRAINT nudges_unique_per_cart UNIQUE NULLS DISTINCT (cart_id)
);

CREATE INDEX IF NOT EXISTS idx_abandoned_cart_nudges_user_id
  ON public.abandoned_cart_nudges (user_id);
CREATE INDEX IF NOT EXISTS idx_abandoned_cart_nudges_cart_id
  ON public.abandoned_cart_nudges (cart_id);
CREATE INDEX IF NOT EXISTS idx_abandoned_cart_nudges_first_nudge_at
  ON public.abandoned_cart_nudges (first_nudge_at);
CREATE INDEX IF NOT EXISTS idx_abandoned_cart_nudges_recovered
  ON public.abandoned_cart_nudges (recovered_at)
  WHERE recovered_at IS NOT NULL;

DROP TRIGGER IF EXISTS set_updated_at ON public.abandoned_cart_nudges;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.abandoned_cart_nudges
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.abandoned_cart_nudges ENABLE ROW LEVEL SECURITY;

-- 2. RLS: service_role only (cron jobs)
-- ============================================================================

DROP POLICY IF EXISTS "abandoned_cart_nudges_service_role_all"
  ON public.abandoned_cart_nudges;
CREATE POLICY "abandoned_cart_nudges_service_role_all"
  ON public.abandoned_cart_nudges
  USING (auth.role() = 'service_role');

-- 3. Function: Identify carts due for first recovery email (+1h)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_due_abandoned_carts_stage_1(p_limit integer DEFAULT 100)
RETURNS TABLE (
  cart_id uuid,
  user_id uuid,
  email text,
  item_count integer,
  hours_abandoned numeric
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.profile_id,
    COALESCE(u.email, 'guest@' || c.session_id) as email,
    jsonb_array_length(c.items)::integer,
    EXTRACT(EPOCH FROM (now() - c.updated_at)) / 3600::numeric
  FROM public.carts c
  LEFT JOIN auth.users u ON c.profile_id = u.id
  WHERE
    -- Cart is 1-2 hours old (1h+ and not yet 2h)
    c.updated_at < now() - INTERVAL '1 hour'
    AND c.updated_at > now() - INTERVAL '2 hours'
    -- Has items
    AND jsonb_array_length(c.items) > 0
    -- Not yet expired
    AND c.expires_at > now()
    -- No recovery email yet for this cart
    AND NOT EXISTS (
      SELECT 1 FROM public.abandoned_cart_nudges acn
      WHERE acn.cart_id = c.id
    )
  ORDER BY c.updated_at ASC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public', 'auth';

REVOKE ALL ON FUNCTION public.fn_due_abandoned_carts_stage_1(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_due_abandoned_carts_stage_1(integer) TO service_role;

-- 4. Function: Identify carts due for second recovery email (+24h)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_due_abandoned_carts_stage_2(p_limit integer DEFAULT 100)
RETURNS TABLE (
  cart_id uuid,
  user_id uuid,
  email text,
  item_count integer,
  hours_abandoned numeric,
  nudge_id uuid
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.profile_id,
    COALESCE(u.email, 'guest@' || c.session_id) as email,
    jsonb_array_length(c.items)::integer,
    EXTRACT(EPOCH FROM (now() - c.updated_at)) / 3600::numeric,
    acn.id
  FROM public.carts c
  LEFT JOIN auth.users u ON c.profile_id = u.id
  INNER JOIN public.abandoned_cart_nudges acn ON c.id = acn.cart_id
  WHERE
    -- Cart is 24-25 hours old (24h+ and not yet 25h)
    c.updated_at < now() - INTERVAL '24 hours'
    AND c.updated_at > now() - INTERVAL '25 hours'
    -- Has items
    AND jsonb_array_length(c.items) > 0
    -- Not yet expired
    AND c.expires_at > now()
    -- First nudge was sent but second was not
    AND acn.first_nudge_at IS NOT NULL
    AND acn.second_nudge_at IS NULL
    -- Cart not yet recovered
    AND acn.recovered_at IS NULL
  ORDER BY c.updated_at ASC
  LIMIT p_limit;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public', 'auth';

REVOKE ALL ON FUNCTION public.fn_due_abandoned_carts_stage_2(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_due_abandoned_carts_stage_2(integer) TO service_role;

-- 5. View: Recovery metrics for dashboard
-- ============================================================================

CREATE OR REPLACE VIEW public.v_abandoned_cart_recovery AS
  SELECT
    count(*) FILTER (WHERE recovered_at IS NULL) as total_pending,
    count(*) FILTER (WHERE recovered_at IS NOT NULL) as total_recovered,
    count(*) FILTER (WHERE recovered_at IS NOT NULL
      AND recovered_at < first_nudge_at + INTERVAL '1 day') as recovered_within_day,
    count(*) FILTER (WHERE recovered_at IS NOT NULL
      AND recovered_at < first_nudge_at + INTERVAL '7 days') as recovered_within_week,
    ROUND(100.0 * count(*) FILTER (WHERE recovered_at IS NOT NULL)
      / NULLIF(count(*), 0), 2) as recovery_rate_percent,
    COALESCE(ROUND(AVG(cart_value_agorot)::numeric / 100, 2), 0) as avg_cart_value_ils,
    COALESCE(
      ROUND(SUM(cart_value_agorot) FILTER (WHERE recovered_at IS NOT NULL)::numeric / 100, 2),
      0
    ) as total_recovered_value_ils
  FROM public.abandoned_cart_nudges;

-- 6. Function: Mark cart as recovered after order placement
-- ============================================================================

CREATE OR REPLACE FUNCTION public.fn_mark_cart_recovered(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
DECLARE
  v_cart_id uuid;
BEGIN
  -- Find the cart from the order
  SELECT session_id INTO v_cart_id FROM public.carts
  WHERE session_id = (
    SELECT session_id FROM public.orders
    WHERE id = p_order_id LIMIT 1
  ) LIMIT 1;

  IF v_cart_id IS NOT NULL THEN
    UPDATE public.abandoned_cart_nudges
    SET
      recovered_at = now(),
      recovered_order_id = p_order_id
    WHERE cart_id = v_cart_id AND recovered_at IS NULL;
  END IF;
END;
$$ LANGUAGE plpgsql;

REVOKE ALL ON FUNCTION public.fn_mark_cart_recovered(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_mark_cart_recovered(uuid) TO service_role;
