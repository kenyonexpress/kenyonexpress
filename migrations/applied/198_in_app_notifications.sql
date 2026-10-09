-- 198_in_app_notifications.sql
--
-- The bell, and the settings behind it.
--
-- WHAT EXISTS AND WHAT DOES NOT
--
-- `notification_outbox` is an EMAIL QUEUE. It holds an address, a payload and a
-- dedupe key, it is drained by a cron, and a row leaves it when the mail is
-- sent. It is not a record of what a customer has been told; it is a record of
-- what we tried to send them. Nothing in it can back a bell with an unread
-- count, and reusing it for one would mean an "unread" that clears when a cron
-- runs rather than when somebody reads it.
--
-- `push_subscriptions` (179, applied) and the whatsapp tables (173, applied)
-- are the OTHER channels and are complete. What has never existed is the
-- in-app one: a customer who is on the site has no way to see that their
-- voucher was redeemed unless they happen to open the mail.
--
-- THE REALTIME TRAP, MEASURED
--
--     select * from pg_publication_tables where pubname = 'supabase_realtime'
--     -> 0 rows
--
-- The publication is EMPTY. A `postgres_changes` subscription against a table
-- that is not in it connects, reports SUBSCRIBED, and receives nothing, ever.
-- No error, no warning, on either side. Nothing in this codebase subscribes to
-- anything today, so it is not currently a live bug -- it is the bug the bell
-- would have had. The `ALTER PUBLICATION` at the bottom is therefore part of
-- the feature, not housekeeping, and `REPLICA IDENTITY` with it: without a
-- replica identity the payload of an UPDATE carries no old values and the
-- filter Supabase applies on `user_id` cannot be evaluated.
--
-- THE CLIENT MAY MARK READ AND NOTHING ELSE, ENFORCED BY COLUMN GRANT
--
-- An UPDATE policy scoped to the owner would let a customer rewrite the title
-- of their own notification, which sounds harmless until one of them is quoted
-- in a support conversation. `GRANT UPDATE (read_at)` is the narrower tool and
-- it is enforced by the grant system rather than by a policy predicate, so no
-- WITH CHECK has to be got exactly right.

BEGIN;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- ----------------------------------------------------------- the bell's rows

CREATE TABLE IF NOT EXISTS public.notifications (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL,
  -- The same vocabulary the outbox uses, so one event can produce a mail and a
  -- bell row that agree about what happened. Text and not an enum for the
  -- reason 135 was split over: adding a kind should not need an ALTER TYPE that
  -- cannot run in the same transaction as the row using it.
  kind       text NOT NULL,
  title_he   text NOT NULL,
  body_he    text,
  -- Where clicking goes. A relative path only -- an absolute URL here would let
  -- a writer point the bell at another origin, and the bell is a link a
  -- customer trusts because it is inside their account.
  href       text CHECK (href IS NULL OR href LIKE '/%'),
  read_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.notifications IS
  'In-app notifications: what a customer has been TOLD. notification_outbox is what we tried to SEND. See docs/NOTIFICATIONS.md.';

-- The bell's only query: this user's newest, unread first.
CREATE INDEX IF NOT EXISTS notifications_user_recent
  ON public.notifications (user_id, created_at DESC);

-- The count in the badge. Partial, because the unread set is small and the read
-- set grows forever.
CREATE INDEX IF NOT EXISTS notifications_unread
  ON public.notifications (user_id) WHERE read_at IS NULL;

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_select_own" ON public.notifications;
CREATE POLICY "notifications_select_own"
  ON public.notifications FOR SELECT TO authenticated
  -- Scalar subquery, not a bare `auth.uid()`: it turns a per-row evaluation
  -- into an InitPlan evaluated once.
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "notifications_mark_read_own" ON public.notifications;
CREATE POLICY "notifications_mark_read_own"
  ON public.notifications FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

-- No INSERT or DELETE policy. Rows are written by the server and kept.
REVOKE ALL ON public.notifications FROM anon, authenticated;
GRANT SELECT ON public.notifications TO authenticated;
-- The narrow grant that makes the UPDATE policy safe: `read_at` and nothing
-- else, so a customer cannot rewrite the title of their own notification.
GRANT UPDATE (read_at) ON public.notifications TO authenticated;

-- ------------------------------------------------------------- preferences

CREATE TABLE IF NOT EXISTS public.notification_preferences (
  user_id    uuid NOT NULL,
  kind       text NOT NULL,
  channel    text NOT NULL CHECK (channel IN ('email', 'push', 'whatsapp', 'in_app')),
  enabled    boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, kind, channel)
);

COMMENT ON TABLE public.notification_preferences IS
  'Per-customer opt-outs for OPTIONAL notification kinds. Required kinds are refused before this table is read; see src/lib/notifications/preferences.ts.';

-- No CHECK on `kind`, deliberately.
--
-- Which kinds may be switched off is a product decision that changes with the
-- catalogue of messages, and a constraint here would mean a migration every
-- time one moved between required and optional. The list lives in
-- `src/lib/notifications/preferences.ts`, which checks `REQUIRED_KINDS` BEFORE
-- reading a row -- so a row for a required kind is inert rather than dangerous,
-- which is the property that makes the missing constraint safe.

DROP TRIGGER IF EXISTS set_updated_at ON public.notification_preferences;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.notification_preferences
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notification_preferences_select_own" ON public.notification_preferences;
CREATE POLICY "notification_preferences_select_own"
  ON public.notification_preferences FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "notification_preferences_write_own" ON public.notification_preferences;
CREATE POLICY "notification_preferences_write_own"
  ON public.notification_preferences FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "notification_preferences_update_own" ON public.notification_preferences;
CREATE POLICY "notification_preferences_update_own"
  ON public.notification_preferences FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

REVOKE ALL ON public.notification_preferences FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.notification_preferences TO authenticated;

-- ------------------------------------------------------------------ realtime
--
-- Part of the feature. Without this the bell's subscription is inert and the
-- badge only updates on navigation -- silently, with the channel reporting
-- SUBSCRIBED the whole time.
--
-- REPLICA IDENTITY FULL because Supabase evaluates the `user_id=eq.` filter
-- against the row in the WAL record, and the default (primary key only) carries
-- no `user_id` for an UPDATE. The cost is a wider WAL record on a table whose
-- rows are small and whose updates are one timestamp.

ALTER TABLE public.notifications REPLICA IDENTITY FULL;

DO $$
BEGIN
  -- `ADD TABLE` errors if the table is already a member, and this file has to
  -- be re-runnable.
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
     WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
  END IF;
END $$;

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM pg_publication_tables
   WHERE pubname = 'supabase_realtime' AND tablename = 'notifications';
  IF n <> 1 THEN
    RAISE EXCEPTION 'notifications is not in supabase_realtime; the bell would be silently dead';
  END IF;
END $$;

COMMIT;
