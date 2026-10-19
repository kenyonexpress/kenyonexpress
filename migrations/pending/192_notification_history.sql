-- 192_notification_history.sql
--
-- Notification delivery history and feedback. Tracks when notifications are
-- viewed, clicked, or dismissed on the mobile app for analytics and debugging.

CREATE TABLE IF NOT EXISTS public.notification_deliveries (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  outbox_id       uuid        REFERENCES public.notification_outbox(id) ON DELETE SET NULL,
  -- The Expo ticket ID for the push notification
  ticket_id       text,
  -- Platform the notification was delivered to
  platform        text        NOT NULL DEFAULT 'unknown',
  -- The Expo token that was used
  expo_token      text,
  -- When the notification was delivered by Expo
  delivered_at    timestamptz,
  -- When the user interacted with the notification (opened, dismissed, etc.)
  interacted_at   timestamptz,
  interaction_type text,  -- 'opened', 'dismissed', null if not yet interacted
  -- Deep link path the notification pointed to
  target_path     text,
  -- Any delivery failure reason
  failure_reason  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.notification_deliveries ENABLE ROW LEVEL SECURITY;

-- Policies: users can view their own delivery history
DROP POLICY IF EXISTS "notification_deliveries_select_own" ON public.notification_deliveries;
CREATE POLICY "notification_deliveries_select_own" ON public.notification_deliveries
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "notification_deliveries_insert_own" ON public.notification_deliveries;
CREATE POLICY "notification_deliveries_insert_own" ON public.notification_deliveries
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "notification_deliveries_update_own" ON public.notification_deliveries;
CREATE POLICY "notification_deliveries_update_own" ON public.notification_deliveries
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Service role can read for analytics
DROP POLICY IF EXISTS "notification_deliveries_service_select" ON public.notification_deliveries;
CREATE POLICY "notification_deliveries_service_select" ON public.notification_deliveries
  FOR SELECT TO service_role
  USING (true);

-- Indexes
CREATE INDEX IF NOT EXISTS notification_deliveries_user_idx
  ON public.notification_deliveries (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS notification_deliveries_outbox_idx
  ON public.notification_deliveries (outbox_id) WHERE outbox_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS notification_deliveries_interaction_idx
  ON public.notification_deliveries (user_id, interaction_type)
  WHERE interaction_type IS NOT NULL;

-- Trigger for updated_at
DROP TRIGGER IF EXISTS set_updated_at ON public.notification_deliveries;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.notification_deliveries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.notification_deliveries IS
  'Push notification delivery history and interaction tracking for analytics and debugging.';

COMMENT ON COLUMN public.notification_deliveries.interaction_type IS
  'Type of user interaction: opened (tapped), dismissed (swiped away), or null if not yet interacted.';
