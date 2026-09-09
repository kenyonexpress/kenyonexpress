-- 215_push_deliveries.sql
--
-- The delivery log for push, and the one column deliberately NOT stored.
--
-- WHY A SEPARATE LOG WHEN THE OUTBOX ALREADY HAS ONE
--
-- `notification_outbox` carries `push_status`, `push_attempts`, `push_sent_at`
-- and `push_error`: five columns describing ONE notification's push leg. That
-- is the right shape for a retry loop and the wrong shape for the question an
-- operator actually asks, which is "why did this customer stop getting
-- notifications".
--
-- A customer has several devices. Web push is per SUBSCRIPTION, one row per
-- browser they said yes in, and each one fails differently: a phone whose
-- browser data was cleared answers 410 forever, a desktop behind a corporate
-- proxy answers 403, and a third works. The outbox row records the aggregate,
-- so all three collapse into one `push_error` string and the two that are
-- permanently dead are indistinguishable from the one that had a bad night.
--
-- THE ENDPOINT IS A BEARER CAPABILITY AND IS NOT LOGGED
--
-- `push_subscriptions.endpoint` is a URL that ANYONE holding it can push to,
-- with no further authentication beyond a VAPID signature they can mint
-- themselves. It is a credential. A delivery log is the most-read, least-
-- guarded table in any system - it gets dumped into support tickets, exported
-- to spreadsheets and joined into dashboards - and putting a credential in one
-- is how a capability leaks without anybody deciding to leak it.
--
-- `endpoint_host` is stored instead: `fcm.googleapis.com`,
-- `updates.push.services.mozilla.com`, `*.notify.windows.com`. That is what
-- triage needs (which push service is failing) and is not a capability.
--
-- `subscription_id` IS NOT A FOREIGN KEY, AND THAT IS THE POINT
--
-- A 410 means the subscription is dead forever and the sender deletes the row.
-- A foreign key would take the log entry with it under CASCADE, or block the
-- delete under RESTRICT - and the entry that would be erased is precisely the
-- record explaining why the subscription is gone. So the id is stored as a
-- plain uuid: it joins while the subscription lives and survives it after.
--
-- ROLLBACK:
--   drop table public.push_deliveries;

BEGIN;

CREATE TABLE IF NOT EXISTS public.push_deliveries (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The notification this attempt was for. CASCADE is correct here and not on
  -- the subscription: if the outbox row is purged, the attempt has nothing
  -- left to describe.
  outbox_id       uuid        REFERENCES public.notification_outbox(id) ON DELETE CASCADE,

  -- Deliberately not a foreign key. See the header.
  subscription_id uuid,

  user_id         uuid        REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Denormalised from the outbox row so the log is readable on its own. An
  -- operator triaging "voucher_expiring never arrives" should not need a join
  -- to a table whose rows are settled and swept.
  kind            text        NOT NULL,

  -- Which sender. The two transports fail in different vocabularies and a log
  -- that mixed them without saying which is which would be unreadable.
  transport       text        NOT NULL CHECK (transport IN ('web', 'expo')),

  -- The five things that can happen, and every one is a different next step:
  --   sent      accepted by the push service
  --   gone      404/410; the subscription was deleted as a result
  --   retry     transient; the outbox backoff will try again
  --   rejected  permanent and ours: oversized payload, bad VAPID, bad keys
  --   skipped   nothing to send to, or the customer switched this kind off
  outcome         text        NOT NULL CHECK (outcome IN ('sent', 'gone', 'retry', 'rejected', 'skipped')),

  -- HTTP status from the push service, where there was one. Null for `skipped`
  -- and for a transport failure that never got an answer.
  status_code     integer     CHECK (status_code IS NULL OR (status_code BETWEEN 100 AND 599)),

  -- The host only. NOT the endpoint. See the header.
  endpoint_host   text,

  reason          text,

  created_at      timestamptz NOT NULL DEFAULT now()
);

-- The triage query: everything that happened to one customer, newest first.
CREATE INDEX IF NOT EXISTS push_deliveries_user_created_idx
  ON public.push_deliveries (user_id, created_at DESC);

-- The other triage query: what is failing right now, across everybody. Partial,
-- because `sent` is the overwhelming majority of the table and is never what
-- this index is opened for.
CREATE INDEX IF NOT EXISTS push_deliveries_failing_idx
  ON public.push_deliveries (created_at DESC)
  WHERE outcome <> 'sent';

CREATE INDEX IF NOT EXISTS push_deliveries_outbox_idx
  ON public.push_deliveries (outbox_id);

ALTER TABLE public.push_deliveries ENABLE ROW LEVEL SECURITY;

-- WRITES ARE SERVICE ROLE ONLY, BY OMISSION. There is no INSERT policy and
-- there must not be: the writer is the notifications cron, and a client that
-- could insert here could fabricate a delivery record for anybody.
--
-- The revoke is not decoration. A policy filters an existing GRANT; it does not
-- create one, and it does not remove one either. Without this, the moment
-- somebody adds one permissive policy to this table, `authenticated` also gains
-- INSERT, UPDATE and DELETE on an audit log.
REVOKE ALL ON public.push_deliveries FROM anon;
REVOKE ALL ON public.push_deliveries FROM authenticated;
GRANT SELECT ON public.push_deliveries TO authenticated;

-- A customer may read their own delivery history: "you were sent this, at this
-- time, and your phone said it was gone" is the answer to a real support
-- question and it is their own data.
DROP POLICY IF EXISTS "push_deliveries_select_own" ON public.push_deliveries;
CREATE POLICY "push_deliveries_select_own" ON public.push_deliveries
  FOR SELECT TO authenticated
  -- Scalar subquery, not a bare auth.uid(): an InitPlan evaluated once rather
  -- than per row.
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "push_deliveries_select_admin" ON public.push_deliveries;
CREATE POLICY "push_deliveries_select_admin" ON public.push_deliveries
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- Proves the shape rather than assuming it: a CREATE TABLE IF NOT EXISTS
-- against a table that already exists under a different shape is a silent
-- no-op, which is the one way this file can lie.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'push_deliveries'
     AND column_name IN ('outbox_id', 'subscription_id', 'user_id', 'kind',
                         'transport', 'outcome', 'status_code', 'endpoint_host',
                         'reason', 'created_at');
  IF n <> 10 THEN
    RAISE EXCEPTION 'push_deliveries has % of the 10 expected columns; it exists under another shape', n;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'push_deliveries'
       AND column_name = 'endpoint'
  ) THEN
    RAISE EXCEPTION 'push_deliveries carries a full endpoint column; that is a bearer capability and must not be logged';
  END IF;
END $$;

COMMIT;
