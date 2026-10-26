-- 276_stock_notifications.sql
--
-- Stock notification tracking for out-of-stock products. Allows customers to
-- register for notifications when a product comes back in stock.

CREATE TABLE IF NOT EXISTS public.stock_notifications (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id        uuid        NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  -- Email to notify (can differ from auth user email for guest checkouts)
  email             text        NOT NULL,
  -- Current stock level when notification was created (for tracking)
  stock_level_when_registered int DEFAULT 0,
  -- Has the notification been sent?
  notified_at       timestamptz,
  -- User unsubscribed manually
  unsubscribed_at   timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.stock_notifications ENABLE ROW LEVEL SECURITY;

-- Policies: users can manage their own notifications
DROP POLICY IF EXISTS "stock_notifications_select_own" ON public.stock_notifications;
CREATE POLICY "stock_notifications_select_own" ON public.stock_notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "stock_notifications_insert_own" ON public.stock_notifications;
CREATE POLICY "stock_notifications_insert_own" ON public.stock_notifications
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "stock_notifications_delete_own" ON public.stock_notifications;
CREATE POLICY "stock_notifications_delete_own" ON public.stock_notifications
  FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Service role can read/update for cron jobs
DROP POLICY IF EXISTS "stock_notifications_service_all" ON public.stock_notifications;
CREATE POLICY "stock_notifications_service_all" ON public.stock_notifications
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Composite unique constraint: one notification per user per product
CREATE UNIQUE INDEX IF NOT EXISTS stock_notifications_user_product_idx
  ON public.stock_notifications (user_id, product_id)
  WHERE unsubscribed_at IS NULL AND notified_at IS NULL;

-- Indexes for querying
CREATE INDEX IF NOT EXISTS stock_notifications_product_idx
  ON public.stock_notifications (product_id)
  WHERE unsubscribed_at IS NULL AND notified_at IS NULL;

CREATE INDEX IF NOT EXISTS stock_notifications_email_idx
  ON public.stock_notifications (email)
  WHERE unsubscribed_at IS NULL AND notified_at IS NULL;

CREATE INDEX IF NOT EXISTS stock_notifications_created_idx
  ON public.stock_notifications (created_at DESC);

-- Trigger for updated_at
DROP TRIGGER IF EXISTS set_updated_at ON public.stock_notifications;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.stock_notifications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMENT ON TABLE public.stock_notifications IS
  'Customer notifications for out-of-stock products. Tracks which users want alerts when a product is back in stock.';

COMMENT ON COLUMN public.stock_notifications.stock_level_when_registered IS
  'Stock level when the notification was registered, for audit trail and analytics.';

COMMENT ON COLUMN public.stock_notifications.notified_at IS
  'When the notification was sent, or null if pending.';

COMMENT ON COLUMN public.stock_notifications.unsubscribed_at IS
  'When the user manually unsubscribed, or null if still subscribed.';
