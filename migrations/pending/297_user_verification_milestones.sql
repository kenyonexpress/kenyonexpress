-- Migration 297: User Verification Milestones
-- Tracks when users reach verification milestones (e.g., phone verification after 5 orders)
-- C65: Phone verification via WhatsApp OTP after 5 physical orders

-- ---------------------------------------------------------------------------
-- 1. milestone_type ENUM
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE public.milestone_type AS ENUM (
    'phone_verification_after_5_orders',
    'address_verification_after_5_orders'
  );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ---------------------------------------------------------------------------
-- 2. user_verification_milestones table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.user_verification_milestones (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid          NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  milestone_type  public.milestone_type NOT NULL,
  achieved_at     timestamptz   NOT NULL DEFAULT now(),
  verified_at     timestamptz,
  metadata        jsonb         DEFAULT '{}'::jsonb,
  created_at      timestamptz   NOT NULL DEFAULT now(),
  updated_at      timestamptz   NOT NULL DEFAULT now(),

  -- A user can only achieve each milestone type once
  UNIQUE (user_id, milestone_type)
);

-- ---------------------------------------------------------------------------
-- 3. Indexes
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_user_verification_milestones_user_id
  ON public.user_verification_milestones (user_id);

CREATE INDEX IF NOT EXISTS idx_user_verification_milestones_type
  ON public.user_verification_milestones (milestone_type);

CREATE INDEX IF NOT EXISTS idx_user_verification_milestones_verified
  ON public.user_verification_milestones (verified_at)
  WHERE verified_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 4. updated_at trigger
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS set_updated_at ON public.user_verification_milestones;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.user_verification_milestones
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 5. RLS Policies
-- ---------------------------------------------------------------------------

ALTER TABLE public.user_verification_milestones ENABLE ROW LEVEL SECURITY;

-- Users can read their own milestones
CREATE POLICY user_verification_milestones_select_own
  ON public.user_verification_milestones
  FOR SELECT
  USING (auth.uid() = user_id);

-- System can insert milestones (service role only)
-- Users cannot insert their own milestones

-- Users cannot update or delete milestones (system-managed)

-- ---------------------------------------------------------------------------
-- 6. Helper function: Count user's completed physical orders
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_count_user_physical_orders(p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer;
BEGIN
  SELECT COUNT(DISTINCT oi.order_id)
  INTO v_count
  FROM order_items oi
  INNER JOIN orders o ON o.id = oi.order_id
  WHERE o.user_id = p_user_id
    AND o.status IN ('paid', 'fulfilled', 'partially_fulfilled')
    AND oi.product_type = 'physical'
    AND o.deleted_at IS NULL
    AND oi.deleted_at IS NULL;

  RETURN COALESCE(v_count, 0);
END;
$$;

-- Grant execute to authenticated users so they can check their own count
GRANT EXECUTE ON FUNCTION public.fn_count_user_physical_orders(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. Helper function: Check if user needs phone verification
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_user_needs_phone_verification(p_user_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_count integer;
  v_milestone_exists boolean;
  v_milestone_verified boolean;
BEGIN
  -- Count completed physical orders
  v_order_count := fn_count_user_physical_orders(p_user_id);

  -- Check if milestone exists
  SELECT
    EXISTS(SELECT 1 FROM user_verification_milestones WHERE user_id = p_user_id AND milestone_type = 'phone_verification_after_5_orders'),
    (SELECT verified_at IS NOT NULL FROM user_verification_milestones WHERE user_id = p_user_id AND milestone_type = 'phone_verification_after_5_orders' LIMIT 1)
  INTO v_milestone_exists, v_milestone_verified;

  -- Needs verification if:
  -- 1. Has 5+ physical orders
  -- 2. Milestone does not exist OR exists but not verified
  RETURN v_order_count >= 5 AND (NOT v_milestone_exists OR NOT COALESCE(v_milestone_verified, false));
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.fn_user_needs_phone_verification(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 8. Trigger function: Create milestone when user reaches 5 physical orders
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_check_and_create_verification_milestone()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order_count integer;
  v_milestone_exists boolean;
BEGIN
  -- Only process on order completion (status changes to paid/fulfilled)
  IF TG_OP = 'UPDATE' AND NEW.status IN ('paid', 'fulfilled', 'partially_fulfilled')
     AND OLD.status != NEW.status THEN

    -- Check if this order contains physical items
    IF EXISTS (
      SELECT 1 FROM order_items
      WHERE order_id = NEW.id
        AND product_type = 'physical'
        AND deleted_at IS NULL
    ) THEN

      -- Count total completed physical orders for this user
      v_order_count := fn_count_user_physical_orders(NEW.user_id);

      -- Check if milestone already exists
      SELECT EXISTS(
        SELECT 1 FROM user_verification_milestones
        WHERE user_id = NEW.user_id
          AND milestone_type = 'phone_verification_after_5_orders'
      ) INTO v_milestone_exists;

      -- Create milestone if user has reached 5 orders and milestone doesn't exist
      IF v_order_count >= 5 AND NOT v_milestone_exists THEN
        INSERT INTO user_verification_milestones (
          user_id,
          milestone_type,
          metadata
        ) VALUES (
          NEW.user_id,
          'phone_verification_after_5_orders',
          jsonb_build_object(
            'order_id', NEW.id,
            'order_count', v_order_count,
            'triggered_at', now()
          )
        )
        ON CONFLICT (user_id, milestone_type) DO NOTHING;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 9. Trigger: Auto-create milestone on order completion
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_check_verification_milestone ON public.orders;
CREATE TRIGGER trg_check_verification_milestone
  AFTER INSERT OR UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_check_and_create_verification_milestone();

-- ---------------------------------------------------------------------------
-- 10. Comments
-- ---------------------------------------------------------------------------

COMMENT ON TABLE public.user_verification_milestones IS
  'Tracks verification milestones triggered by user activity (e.g., phone verification after 5 orders)';

COMMENT ON COLUMN public.user_verification_milestones.achieved_at IS
  'When the milestone was triggered (e.g., when user completed 5th order)';

COMMENT ON COLUMN public.user_verification_milestones.verified_at IS
  'When the user completed the verification (e.g., verified phone via OTP)';

COMMENT ON COLUMN public.user_verification_milestones.metadata IS
  'Additional context: order_id, order_count, phone_verified_via, etc.';
