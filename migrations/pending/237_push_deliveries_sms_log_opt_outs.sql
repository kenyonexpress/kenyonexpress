-- 237_push_deliveries_sms_log_opt_outs.sql
--
-- The three tables the notification stack writes to and production does not
-- have: the Web Push delivery log, the SMS log with its cost, and the SMS
-- opt-out list. Plus one widened CHECK so a customer can switch SMS off on
-- its own rather than through the WhatsApp switch.
--
-- NUMBERED 237 BECAUSE 215 AND 216 ARE BURNED. `main` carries these two
-- tables as `215_push_deliveries.sql` and `216_sms_log_and_opt_outs.sql`,
-- never applied. Production spent 215 on `cashback_expiry_215`
-- (20260909132729) and 216 is taken by a pending file on another branch, so
-- the bodies move here under a free number. Same reason 226 skipped 225.
--
-- WHAT IS DELIBERATELY DIFFERENT FROM MAIN'S FILES. Main's 216 restates
-- `public.set_updated_at()` with CREATE OR REPLACE and NO search_path pin.
-- The live function is pinned (`SET search_path TO ''`, read with
-- pg_get_functiondef on 2026-09-17), and 188 exists precisely to pin every
-- invoker. A replace here would have silently un-pinned it for every table
-- that uses it -- the 183 trap one function over. This file asserts the
-- function exists and does not touch it.
--
-- ---------------------------------------------------------------- push log
--
-- `notification_outbox` carries `push_status`, `push_attempts`,
-- `push_sent_at` and `push_error`: one notification's push leg, in
-- aggregate. Web push is per SUBSCRIPTION, one row per browser the customer
-- said yes in, and each one fails differently: a phone whose browser data was
-- cleared answers 410 forever, a desktop behind a proxy answers 403, a third
-- works. The aggregate collapses all three into one `push_error` string. The
-- question an operator asks is "why did THIS customer stop getting
-- notifications", and that needs one row per attempt per subscription.
--
-- THE ENDPOINT IS A BEARER CAPABILITY AND IS NOT LOGGED. Anyone holding a
-- `push_subscriptions.endpoint` can push to that browser with nothing more
-- than a VAPID signature they mint themselves. A delivery log is the most
-- read, least guarded table in any system; only the HOST is stored
-- (`fcm.googleapis.com`, `updates.push.services.mozilla.com`), which is what
-- triage needs and is not a capability. The DO block at the end refuses a
-- table that carries a full `endpoint` column.
--
-- `subscription_id` IS NOT A FOREIGN KEY. A 410 means the subscription is
-- dead forever and the sender deletes the row; a CASCADE would erase the log
-- entry that explains why, and a RESTRICT would block the delete.
--
-- ----------------------------------------------------------------- sms log
--
-- PRICE IS `price_micro` + `price_currency`, NOT AGOROT, and that is a
-- deliberate exception to the project's money rule with two reasons that
-- both have to hold:
--   1. It is not shekels. Twilio bills in USD as a five-decimal string.
--      Agorot would freeze a USD/ILS rate at the moment of a text message.
--   2. Agorot cannot hold it. $0.0075 rounds to 1 agora, a 30% error on the
--      unit price, multiplied by every message.
-- It is a VENDOR COST, not customer money; nothing here is charged to
-- anybody and src/lib/money.ts is untouched. The INTEGER part of the rule is
-- not negotiable and the DO block checks the column type.
--
-- The sign is flipped on the way in (Twilio's negative means "debited from
-- your balance") and the column CHECKs non-negative to catch a writer that
-- forgets.
--
-- ------------------------------------------------------------- sms opt-outs
--
-- Twilio intercepts STOP, STOPALL, UNSUBSCRIBE, CANCEL, END and QUIT. All
-- English. An Israeli customer replies הסר, which Twilio forwards as an
-- ordinary inbound message and does nothing about. Under תיקון 40 the
-- customer's request is what counts, so the list is ours, keyed by the
-- HANDSET and not the account: the same number may sit on two accounts, and
-- stop means stop to that phone.
--
-- `sms_opt_outs` gets NO client read policy at all: keyed by phone number, a
-- self-read would compare the session against a column anyone can guess, and
-- "is this number opted out" is exactly the enumeration oracle not to build.
--
-- ----------------------------------------------------------- sms channel
--
-- `notification_preferences_channel_check` accepts email, push, whatsapp and
-- in_app (read from production 2026-09-17). The SMS leg on main read the
-- `whatsapp` switch because adding a fifth channel meant a migration. This
-- IS the migration, so `sms` becomes its own switch: a customer who turned
-- WhatsApp off did not thereby ask for the same text as an SMS, and one who
-- wants the coupon code by SMS at a till with no data should not have to
-- accept WhatsApp to get it. The constraint is restated from the LIVE list
-- plus one member, not from memory.
--
-- ROLLBACK:
--   drop table public.push_deliveries;
--   drop table public.sms_messages;
--   drop table public.sms_opt_outs;
--   alter table public.notification_preferences
--     drop constraint notification_preferences_channel_check,
--     add constraint notification_preferences_channel_check
--       check (channel in ('email','push','whatsapp','in_app'));
--   (any 'sms' rows must be deleted first)

BEGIN;

-- Refuse to run against a database that is not the one this was written for.
DO $$
BEGIN
  IF to_regclass('public.notification_outbox') IS NULL
     OR to_regclass('public.push_subscriptions') IS NULL
     OR to_regclass('public.notification_preferences') IS NULL THEN
    RAISE EXCEPTION '095/179/198 are not applied here; 237 has nothing to attach to';
  END IF;
  IF to_regproc('public.set_updated_at') IS NULL THEN
    RAISE EXCEPTION 'public.set_updated_at() is missing; 237 does not restate it (it is pinned in production and a replace would un-pin it)';
  END IF;
  IF to_regproc('public.is_admin') IS NULL THEN
    RAISE EXCEPTION 'public.is_admin() is missing; the admin read policies below depend on it';
  END IF;
END $$;

-- ================================================================ push log

CREATE TABLE IF NOT EXISTS public.push_deliveries (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The notification this attempt was for. CASCADE is right here and not on
  -- the subscription: a purged outbox row leaves the attempt with nothing to
  -- describe.
  outbox_id       uuid        REFERENCES public.notification_outbox(id) ON DELETE CASCADE,

  -- Deliberately not a foreign key. See the header.
  subscription_id uuid,

  user_id         uuid        REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Denormalised so the log reads on its own, without a join to rows that
  -- are settled and swept.
  kind            text        NOT NULL,

  transport       text        NOT NULL CHECK (transport IN ('web', 'expo')),

  --   sent      accepted by the push service
  --   gone      404/410; the subscription was deleted as a result
  --   retry     transient; the outbox backoff will try again
  --   rejected  permanent and ours: oversized payload, bad VAPID, bad keys
  --   skipped   nothing to send to, or the customer switched this kind off
  outcome         text        NOT NULL CHECK (outcome IN ('sent', 'gone', 'retry', 'rejected', 'skipped')),

  status_code     integer     CHECK (status_code IS NULL OR (status_code BETWEEN 100 AND 599)),

  -- The host only. NOT the endpoint. See the header.
  endpoint_host   text,

  reason          text,

  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS push_deliveries_user_created_idx
  ON public.push_deliveries (user_id, created_at DESC);

-- Partial: `sent` is the overwhelming majority and never what this is for.
CREATE INDEX IF NOT EXISTS push_deliveries_failing_idx
  ON public.push_deliveries (created_at DESC)
  WHERE outcome <> 'sent';

CREATE INDEX IF NOT EXISTS push_deliveries_outbox_idx
  ON public.push_deliveries (outbox_id);

ALTER TABLE public.push_deliveries ENABLE ROW LEVEL SECURITY;

-- Writes are service-role only, by omission: no INSERT policy, and the grant
-- is revoked so a later permissive policy cannot hand `authenticated` DML on
-- an audit log.
REVOKE ALL ON public.push_deliveries FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.push_deliveries TO authenticated;

DROP POLICY IF EXISTS "push_deliveries_select_own" ON public.push_deliveries;
CREATE POLICY "push_deliveries_select_own" ON public.push_deliveries
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "push_deliveries_select_admin" ON public.push_deliveries;
CREATE POLICY "push_deliveries_select_admin" ON public.push_deliveries
  FOR SELECT TO authenticated
  USING (public.is_admin());

COMMENT ON TABLE public.push_deliveries IS
  'One row per Web Push attempt per browser subscription. Written by /api/cron/notifications through the service role. Holds the push service HOST only, never the endpoint (a bearer capability). subscription_id is deliberately not a FK so the record outlives a 410-deleted subscription.';

-- ================================================================= sms log

CREATE TABLE IF NOT EXISTS public.sms_messages (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Twilio's message SID. UNIQUE because the status callback fires several
  -- times per message and each one updates this row.
  provider_sid   text        UNIQUE,

  user_id        uuid        REFERENCES auth.users(id) ON DELETE SET NULL,

  -- E.164 Israeli mobile, in full. A phone number is not a capability and it
  -- is the only way to answer "did this customer get their code".
  to_e164        text        NOT NULL CHECK (to_e164 ~ '^\+9725\d{8}$'),

  kind           text        NOT NULL,

  -- Twilio's own vocabulary, so the console and this table agree.
  status         text        NOT NULL DEFAULT 'queued'
                             CHECK (status IN ('queued', 'sent', 'delivered', 'undelivered', 'failed', 'skipped')),

  segments       integer     NOT NULL DEFAULT 1 CHECK (segments >= 1),

  -- Millionths of `price_currency`. Null until the receipt arrives.
  price_micro    bigint      CHECK (price_micro IS NULL OR price_micro >= 0),
  price_currency text        CHECK (price_currency IS NULL OR price_currency ~ '^[A-Z]{3}$'),

  -- Both or neither.
  CONSTRAINT sms_messages_price_is_complete
    CHECK ((price_micro IS NULL) = (price_currency IS NULL)),

  -- Twilio's numeric error code (30003 unreachable, 30006 landline, 21610
  -- blocked by opt-out), kept as the integer it is.
  error_code     integer,
  error_message  text,

  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS set_updated_at ON public.sms_messages;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.sms_messages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS sms_messages_user_created_idx
  ON public.sms_messages (user_id, created_at DESC);

-- The cost query. Partial: a message with no price is not spend yet.
CREATE INDEX IF NOT EXISTS sms_messages_priced_idx
  ON public.sms_messages (created_at DESC)
  WHERE price_micro IS NOT NULL;

CREATE INDEX IF NOT EXISTS sms_messages_failed_idx
  ON public.sms_messages (created_at DESC)
  WHERE status IN ('failed', 'undelivered');

-- ============================================================ sms opt-outs

CREATE TABLE IF NOT EXISTS public.sms_opt_outs (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- THE KEY. One row per handset, whatever account it is attached to.
  to_e164     text        NOT NULL UNIQUE CHECK (to_e164 ~ '^\+9725\d{8}$'),

  -- For support; deliberately not the uniqueness.
  user_id     uuid        REFERENCES auth.users(id) ON DELETE SET NULL,

  -- The word they actually sent. A dispute deserves better than a boolean.
  keyword     text,

  -- NULL means opted out. A resubscribe sets it rather than deleting the
  -- row, so the history of a number that opted out and back in survives.
  resumed_at  timestamptz,

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS set_updated_at ON public.sms_opt_outs;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.sms_opt_outs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- The send-time question, on the live rows only.
CREATE INDEX IF NOT EXISTS sms_opt_outs_active_idx
  ON public.sms_opt_outs (to_e164)
  WHERE resumed_at IS NULL;

ALTER TABLE public.sms_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_opt_outs ENABLE ROW LEVEL SECURITY;

-- Writes are service-role only on both, by omission and by revoke. A client
-- that could write sms_opt_outs could opt anybody else's phone out of their
-- own coupon codes; one that could write sms_messages could fabricate spend.
REVOKE ALL ON public.sms_messages FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.sms_opt_outs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.sms_messages TO authenticated;

DROP POLICY IF EXISTS "sms_messages_select_own" ON public.sms_messages;
CREATE POLICY "sms_messages_select_own" ON public.sms_messages
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "sms_messages_select_admin" ON public.sms_messages;
CREATE POLICY "sms_messages_select_admin" ON public.sms_messages
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- sms_opt_outs: RLS on, ZERO policies. Deliberate. See the header.

COMMENT ON TABLE public.sms_messages IS
  'One row per SMS handed to Twilio, updated by the /api/webhooks/twilio-sms receipt. segments is the billed UCS-2 count; price_micro is integer millionths of price_currency (USD from Twilio), a vendor cost and a documented exception to the agorot rule.';
COMMENT ON TABLE public.sms_opt_outs IS
  'Handsets that asked us to stop (STOP or הסר), keyed by phone and not by account. resumed_at NULL means opted out. RLS on with zero client policies by design: an enumeration oracle is the one query this table must not answer.';

-- ============================================================ sms channel

ALTER TABLE public.notification_preferences
  DROP CONSTRAINT IF EXISTS notification_preferences_channel_check;
ALTER TABLE public.notification_preferences
  ADD CONSTRAINT notification_preferences_channel_check
  CHECK (channel = ANY (ARRAY['email'::text, 'push'::text, 'whatsapp'::text, 'in_app'::text, 'sms'::text]));

-- ================================================================== proofs

-- CREATE TABLE IF NOT EXISTS against a table that already exists under a
-- different shape is a silent no-op, which is the one way this file can lie.
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

  SELECT count(*) INTO n
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'sms_messages'
     AND column_name IN ('provider_sid', 'user_id', 'to_e164', 'kind', 'status',
                         'segments', 'price_micro', 'price_currency', 'error_code',
                         'error_message');
  IF n <> 10 THEN
    RAISE EXCEPTION 'sms_messages has % of the 10 expected columns; it exists under another shape', n;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'sms_messages'
       AND column_name = 'price_micro' AND data_type NOT IN ('bigint', 'integer')
  ) THEN
    RAISE EXCEPTION 'price_micro is not an integer type; no float goes near a cost column';
  END IF;

  SELECT count(*) INTO n
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'sms_opt_outs'
     AND column_name IN ('to_e164', 'user_id', 'keyword', 'resumed_at');
  IF n <> 4 THEN
    RAISE EXCEPTION 'sms_opt_outs has % of the 4 expected columns', n;
  END IF;

  -- The set_updated_at pin survived: this file must not have touched it.
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc
     WHERE proname = 'set_updated_at' AND pronamespace = 'public'::regnamespace
       AND proconfig IS NOT NULL
       AND EXISTS (SELECT 1 FROM unnest(proconfig) c WHERE c LIKE 'search_path=%')
  ) THEN
    RAISE EXCEPTION 'public.set_updated_at() lost its search_path pin';
  END IF;

  -- The widened channel list, read back rather than assumed.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'notification_preferences_channel_check'
       AND pg_get_constraintdef(oid) LIKE '%''sms''%'
  ) THEN
    RAISE EXCEPTION 'notification_preferences_channel_check does not accept sms';
  END IF;

  -- No client role may write any of the three.
  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
     WHERE table_schema = 'public'
       AND table_name IN ('push_deliveries', 'sms_messages', 'sms_opt_outs')
       AND grantee IN ('anon', 'authenticated')
       AND privilege_type <> 'SELECT'
  ) THEN
    RAISE EXCEPTION 'a client role holds DML on a 237 table';
  END IF;
END $$;

COMMIT;
