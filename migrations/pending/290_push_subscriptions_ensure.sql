-- 290: ensure public.push_subscriptions exists (rc5 F14 browser push).
--
-- The code (src/app/api/push/subscribe, src/lib/push/dispatch.ts) reads and
-- writes this table, but no migration for it exists on closeout/v1-final: it
-- was 179_push_subscriptions.sql on another branch, applied there in the
-- 177/178/179 batch. This is that file, verbatim in effect and fully
-- idempotent, so it is a no-op wherever 179 already ran and creates the table
-- anywhere it did not. Service role writes only (no INSERT/UPDATE policy).
--
-- ROLLBACK:
--   drop trigger if exists set_updated_at on public.push_subscriptions;
--   drop table public.push_subscriptions;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- The push service URL, https by W3C requirement, enforced again here so a
  -- bug in the action cannot store a plantable http target.
  endpoint    text        NOT NULL UNIQUE CHECK (endpoint LIKE 'https://%'),
  -- Browser-minted ECDH public key and auth secret, base64url as the
  -- PushSubscription.toJSON() wire format carries them. text, not bytea, for
  -- the same reason as 178: every reader and writer speaks base64url.
  p256dh      text        NOT NULL,
  auth        text        NOT NULL,
  -- For a future management UI's device label ("Chrome, Android").
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_subscriptions_user_id_idx
  ON public.push_subscriptions (user_id);

DROP TRIGGER IF EXISTS set_updated_at ON public.push_subscriptions;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.push_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "push_subscriptions_select_own" ON public.push_subscriptions;
CREATE POLICY "push_subscriptions_select_own"
  ON public.push_subscriptions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "push_subscriptions_delete_own" ON public.push_subscriptions;
CREATE POLICY "push_subscriptions_delete_own"
  ON public.push_subscriptions
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- No INSERT policy, no UPDATE policy: service role only, see header.
