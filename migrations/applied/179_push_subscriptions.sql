-- 179: web push subscriptions: one row per browser a customer said yes to
-- notifications in (PushManager endpoint + its two encryption keys).
--
-- WHAT LIVES HERE AND WHAT DOES NOT. Exactly what web-push needs to deliver
-- to one browser: the push service endpoint URL and the p256dh/auth keys the
-- browser minted for it. No notification content and no delivery log; those
-- belong to whatever sender is built later. There is no sender yet: this
-- table exists so the permission flow shipped with the PWA goal has somewhere
-- durable to put what the browser hands it, because a subscription that is
-- not stored the moment it is created is gone (the client cannot re-read the
-- auth secret later without re-subscribing).
--
-- WHY user_id REFERENCES auth.users AND NOT public.profiles. Same reasoning
-- as 178: profiles rows are created lazily for phone-only accounts, while
-- every session that can reach /account/notifications has an auth.users row
-- by definition.
--
-- endpoint IS THE NATURAL UNIQUE KEY. The push service mints one endpoint per
-- subscription; the same browser re-opting-in after a revoke gets a new one.
-- The upsert in src/server/actions/push.ts conflicts on it, so re-saving the
-- same subscription (every page load may re-post it) is one row, not many.
--
-- WRITE PATH IS SERVICE ROLE ONLY, BY OMISSION. Rows are written by the
-- server action after it has authenticated the caller and validated the
-- subscription shape. An INSERT policy for authenticated would let any
-- session attach arbitrary endpoints to itself with the anon key and turn the
-- future sender into a spam relay aimed at whatever URL was planted. SELECT
-- and DELETE of one's own rows are allowed: the notifications page shows the
-- state with the caller's own session, and deleting a subscription only ever
-- silences its owner.
--
-- ROLLBACK:
--   drop trigger if exists set_updated_at on public.push_subscriptions;
--   drop table public.push_subscriptions;

-- Defensive, same as 005+: 001 defines this and may stop early on a live DB.
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
