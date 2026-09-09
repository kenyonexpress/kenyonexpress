-- 216_sms_log_and_opt_outs.sql
--
-- Two tables: what we sent and what it cost, and who told us to stop.
--
-- WHY COST IS A COLUMN AND NOT A DASHBOARD QUERY
--
-- An SMS in Hebrew is not one message. Hebrew is outside GSM 03.38, so every
-- body switches the whole message to UCS-2, where a segment is 70 characters
-- and 67 for each part of a multipart -- not 160. A 140-character notification
-- that reads as "well under the limit" is THREE segments and is billed as
-- three. A Hebrew SMS programme costs two to three times what a per-message
-- estimate says, and the difference is invisible until the invoice.
--
-- So `segments` and the price are recorded per message, at the moment the
-- receipt arrives, rather than being reconstructed later from a template and a
-- guess about encoding.
--
-- PRICE IS NOT AGOROT HERE, AND THAT IS A DELIBERATE EXCEPTION TO THE PROJECT
-- RULE. Two reasons, and both had to be true to justify it:
--
--   1. IT IS NOT SHEKELS. Twilio bills in USD ("-0.00750", negative, as a
--      decimal string). Storing it as agorot means applying a USD/ILS rate at
--      write time, which this row does not have and which would be a rate
--      frozen at the moment of a text message -- unauditable and wrong the
--      next day.
--   2. AGOROT CANNOT HOLD IT. Twilio's unit price has five decimal places. One
--      segment at $0.0075 rounds to 1 agora at two decimals, which is a 30%
--      error on the unit -- multiplied by every message ever sent.
--
-- So the column is `price_micro`: integer millionths of `price_currency`,
-- which is exact for anything Twilio quotes. It is a VENDOR COST, not the
-- customer money path -- nothing here is charged to anybody, and
-- `src/lib/money.ts` is untouched. The report that turns this into shekels
-- (goal 48) applies a rate it states, at the time it states it.
--
-- The sign is flipped on the way in: Twilio's negative means "debited from
-- your balance", and a negative in a cost column reads as a credit to every
-- future SUM().
--
-- WHY OPT-OUTS ARE OUR TABLE AND NOT TWILIO'S
--
-- Twilio intercepts STOP, STOPALL, UNSUBSCRIBE, CANCEL, END and QUIT and blocks
-- the number itself. Every one of those is ENGLISH. An Israeli customer who
-- wants out replies **הסר**, which Twilio forwards as an ordinary inbound
-- message and does nothing about. A shop relying on the carrier's own handling
-- has an opt-out that works for the customers who would never have used it.
--
-- Twilio's block is also per (customer number, sender number): move to a second
-- sender and its list starts empty. This one is ours and moves with us.
--
-- THE PHONE IS THE KEY, NOT THE USER. An opt-out is a property of a handset,
-- not of an account: the same number may be on two accounts, and a customer who
-- says stop means stop to that phone. `user_id` is recorded where it is known,
-- for support, and is not what the uniqueness is on.
--
-- ROLLBACK:
--   drop table public.sms_messages;
--   drop table public.sms_opt_outs;

BEGIN;

-- Defensive, same as 005+: 001 defines this and may stop early on a live DB.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS public.sms_messages (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Twilio's message SID. UNIQUE because the status callback fires several
  -- times per message (queued, sent, delivered) and each one updates this row
  -- rather than adding another.
  provider_sid   text        UNIQUE,

  user_id        uuid        REFERENCES auth.users(id) ON DELETE SET NULL,

  -- E.164. Stored in full, unlike a push endpoint: a phone number is not a
  -- capability -- knowing it grants nothing -- and it is the only way to answer
  -- "did this customer get their code".
  to_e164        text        NOT NULL CHECK (to_e164 ~ '^\+9725\d{8}$'),

  kind           text        NOT NULL,

  -- queued -> sent -> delivered, or failed/undelivered. Twilio's own vocabulary
  -- rather than a translation of it: a status this table invented would have to
  -- be mapped back every time somebody compares it to the Twilio console.
  status         text        NOT NULL DEFAULT 'queued'
                             CHECK (status IN ('queued', 'sent', 'delivered', 'undelivered', 'failed', 'skipped')),

  -- What it really cost, filled in when the receipt arrives.
  segments       integer     NOT NULL DEFAULT 1 CHECK (segments >= 1),

  -- Millionths of `price_currency`. Null until the receipt arrives: a message
  -- with no price is not spend yet, it is a message whose fate is unknown.
  price_micro    bigint      CHECK (price_micro IS NULL OR price_micro >= 0),
  price_currency text        CHECK (price_currency IS NULL OR price_currency ~ '^[A-Z]{3}$'),

  -- Both or neither. A price with no currency is a number nobody can add up,
  -- and a currency with no price is a column that looks populated.
  CONSTRAINT sms_messages_price_is_complete
    CHECK ((price_micro IS NULL) = (price_currency IS NULL)),

  -- Twilio's numeric error code (30003 unreachable, 30006 landline, 21610
  -- blocked by opt-out). Kept as the integer it is, so the ones worth acting on
  -- can be counted.
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

-- The cost query: everything billable in a period. Partial, because a message
-- with no price is one whose receipt has not arrived and is not spend yet.
CREATE INDEX IF NOT EXISTS sms_messages_priced_idx
  ON public.sms_messages (created_at DESC)
  WHERE price_micro IS NOT NULL;

-- The triage query.
CREATE INDEX IF NOT EXISTS sms_messages_failed_idx
  ON public.sms_messages (created_at DESC)
  WHERE status IN ('failed', 'undelivered');

CREATE TABLE IF NOT EXISTS public.sms_opt_outs (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),

  -- THE KEY. One row per handset, whatever account it is attached to.
  to_e164     text        NOT NULL UNIQUE CHECK (to_e164 ~ '^\+9725\d{8}$'),

  -- Recorded for support, deliberately not the uniqueness.
  user_id     uuid        REFERENCES auth.users(id) ON DELETE SET NULL,

  -- The word they actually sent. A customer disputing "I never opted out"
  -- deserves an answer better than a boolean, and a keyword list that starts
  -- matching the wrong thing shows up here first.
  keyword     text,

  -- NULL means opted out. A resubscribe sets it rather than deleting the row,
  -- so the history of a number that opted out and back in survives -- which is
  -- exactly the number a complaint is about.
  resumed_at  timestamptz,

  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS set_updated_at ON public.sms_opt_outs;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.sms_opt_outs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- The send-time question: "is this number opted out right now". Partial on the
-- live rows, which is the only state a sender asks about.
CREATE INDEX IF NOT EXISTS sms_opt_outs_active_idx
  ON public.sms_opt_outs (to_e164)
  WHERE resumed_at IS NULL;

ALTER TABLE public.sms_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_opt_outs ENABLE ROW LEVEL SECURITY;

-- WRITES ARE SERVICE ROLE ONLY, BY OMISSION, on both tables. There is no INSERT
-- or UPDATE policy and there must not be: the writers are the sender and the
-- Twilio webhook. A client that could write `sms_opt_outs` could opt anybody
-- else's phone out of their own coupon codes; a client that could write
-- `sms_messages` could fabricate spend.
--
-- The revoke is not decoration. A policy filters an existing GRANT, it does not
-- create one and does not remove one. Without this, the moment somebody adds a
-- permissive read policy, `authenticated` also gains INSERT, UPDATE and DELETE.
REVOKE ALL ON public.sms_messages FROM anon;
REVOKE ALL ON public.sms_messages FROM authenticated;
REVOKE ALL ON public.sms_opt_outs FROM anon;
REVOKE ALL ON public.sms_opt_outs FROM authenticated;
GRANT SELECT ON public.sms_messages TO authenticated;

-- A customer may see the messages sent to them. `sms_opt_outs` gets NO read
-- policy at all: it is keyed by phone number rather than by user, so a
-- self-read would have to compare the session against a number in a column
-- anyone can guess -- and the only useful query against it ("is this number
-- opted out") is exactly the enumeration oracle not to build.
DROP POLICY IF EXISTS "sms_messages_select_own" ON public.sms_messages;
CREATE POLICY "sms_messages_select_own" ON public.sms_messages
  FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "sms_messages_select_admin" ON public.sms_messages;
CREATE POLICY "sms_messages_select_admin" ON public.sms_messages
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- Proves the shape rather than assuming it: CREATE TABLE IF NOT EXISTS against
-- a table that already exists under a different shape is a silent no-op.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'sms_messages'
     AND column_name IN ('provider_sid', 'user_id', 'to_e164', 'kind', 'status',
                         'segments', 'price_micro', 'price_currency', 'error_code',
                         'error_message');
  IF n <> 10 THEN
    RAISE EXCEPTION 'sms_messages has % of the 10 expected columns; it exists under another shape', n;
  END IF;

  -- The money rule, checked rather than trusted. The unit is an exception,
  -- argued in the header; the INTEGER is not negotiable anywhere.
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
END $$;

COMMIT;
