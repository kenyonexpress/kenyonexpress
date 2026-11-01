-- ============================================================================
-- PENDING: push_subscriptions -- Browser push notification subscriptions
-- ============================================================================
--
-- STATUS: NOT APPLIED. Apply only through MCP apply_migration, never db push.
--
-- This table stores web push protocol subscriptions for users who have
-- opted into push notifications (order updates, deal alerts, etc).
-- Each subscription contains the browser endpoint and encryption keys needed
-- to send encrypted notifications via the Web Push API.
--
-- ============================================================================

CREATE TABLE public.push_subscriptions (
  id bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint text NOT NULL,
  keys_p256dh text NOT NULL,
  keys_auth text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, endpoint)
);

COMMENT ON TABLE public.push_subscriptions IS
  'Web push notification subscriptions. Each subscription represents a browser/device that has opted into push notifications.';

COMMENT ON COLUMN public.push_subscriptions.id IS
  'Unique identifier for the subscription';

COMMENT ON COLUMN public.push_subscriptions.user_id IS
  'FK to auth.users. Cascade delete removes all subscriptions when user is deleted.';

COMMENT ON COLUMN public.push_subscriptions.endpoint IS
  'Browser push service endpoint URL. The Web Push API sends requests to this URL.';

COMMENT ON COLUMN public.push_subscriptions.keys_p256dh IS
  'Base64-encoded ECDH public key for encrypting the payload';

COMMENT ON COLUMN public.push_subscriptions.keys_auth IS
  'Base64-encoded auth secret for HMAC-based integrity';

COMMENT ON COLUMN public.push_subscriptions.created_at IS
  'Subscription creation timestamp';

CREATE INDEX push_subscriptions_user_id_idx
  ON public.push_subscriptions(user_id);

-- RLS: users can only insert/read/delete their own subscriptions
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own push subscriptions"
  ON public.push_subscriptions
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- ============================================================================
-- VERIFICATION (after applying)
-- ============================================================================
--
-- 1. Table exists with correct columns:
--
--      SELECT column_name, data_type, is_nullable, column_default
--      FROM information_schema.columns
--      WHERE table_schema = 'public' AND table_name = 'push_subscriptions'
--      ORDER BY ordinal_position;
--
-- 2. Unique constraint on (user_id, endpoint):
--
--      SELECT constraint_name, constraint_type
--      FROM information_schema.table_constraints
--      WHERE table_schema = 'public' AND table_name = 'push_subscriptions';
--
-- 3. RLS is enabled and policy exists:
--
--      SELECT tablename, rowsecurity
--      FROM pg_tables
--      WHERE schemaname = 'public' AND tablename = 'push_subscriptions';
--
--      SELECT policyname, qual
--      FROM pg_policies
--      WHERE tablename = 'push_subscriptions';
--
-- ROLLBACK
--
--   DROP TABLE public.push_subscriptions;
-- ============================================================================
