-- 226: fraud controls. Two server-only tables behind the checkout fraud gate:
-- durable per-customer flags (a chargeback on file blocks the next charge) and
-- the review queue the velocity and coupon-stacking detectors feed.
--
-- NO FOREIGN KEYS ON PURPOSE. `account-delete` cascades a dozen tables today;
-- a flag that dies with the account is a fraud history the abuser can erase by
-- deleting their profile and signing up again. The ids are historical
-- references, not joins the schema must defend.

-- Defensive: 001 defines this and 001 is not idempotent on a live database.
-- CREATE ONLY IF MISSING, not CREATE OR REPLACE: the live body (read with
-- pg_get_functiondef on 2026-09-10) pins `search_path TO 'public'`, and a
-- restatement here would silently edit a function every table's trigger uses.
-- That is the 183 lesson: a restated definition is only as current as the day
-- it was written.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'set_updated_at'
  ) THEN
    CREATE FUNCTION public.set_updated_at()
    RETURNS trigger
    LANGUAGE plpgsql
    SET search_path = ''
    AS $fn$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $fn$;
  END IF;
END $$;

-- Durable facts about a customer. `cleared_at IS NULL` means the flag is live;
-- a live 'chargeback' or 'manual' flag blocks beginCheckout for that user.
CREATE TABLE IF NOT EXISTS public.fraud_flags (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL,
  order_id    uuid,
  kind        text        NOT NULL CHECK (kind IN ('chargeback', 'manual', 'velocity')),
  reason      text        NOT NULL,
  created_by  uuid,       -- NULL means the system wrote it, not a staff member
  created_at  timestamptz NOT NULL DEFAULT now(),
  cleared_at  timestamptz,
  cleared_by  uuid
);

CREATE INDEX IF NOT EXISTS fraud_flags_user_active_idx
  ON public.fraud_flags (user_id)
  WHERE cleared_at IS NULL;

CREATE INDEX IF NOT EXISTS fraud_flags_order_idx
  ON public.fraud_flags (order_id)
  WHERE order_id IS NOT NULL;

-- Work items for a human. One pending row per (user, kind): the reviewer needs
-- to see the customer once, not once per blocked attempt.
CREATE TABLE IF NOT EXISTS public.fraud_review_queue (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL,
  order_id    uuid,
  kind        text        NOT NULL CHECK (kind IN ('velocity', 'coupon-stacking', 'chargeback-blocked', 'manual')),
  details     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  status      text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'blocked')),
  notes       text,
  reviewed_by uuid,
  reviewed_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS fraud_review_queue_pending_dedupe
  ON public.fraud_review_queue (user_id, kind)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS fraud_review_queue_status_idx
  ON public.fraud_review_queue (status, created_at DESC);

DROP TRIGGER IF EXISTS set_updated_at ON public.fraud_review_queue;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.fraud_review_queue
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Server-only, like rate_limits and settlement_events: RLS on, zero policies,
-- and the grants revoked too. A queue an authenticated user could read is a
-- queue whose contents (who we suspect, and why) leak to anyone who signs up.
ALTER TABLE public.fraud_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fraud_review_queue ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.fraud_flags FROM anon, authenticated;
REVOKE ALL ON public.fraud_review_queue FROM anon, authenticated;
