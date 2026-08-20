-- 086_checkout_events: make the checkout event journal append-only, and give
-- the dead-letter queue somewhere to count.
--
-- AWAITING APPROVAL. Not applied. Apply via MCP `apply_migration`, never
-- `db push`.
--
-- DRY RUN, 2026-08-20, against production inside BEGIN ... ROLLBACK. Every
-- statement below ran, the self-check in section 4 passed, and the triggers
-- were exercised on a real row in the same rolled-back transaction:
--
--   insert                                    ok
--   allowed update (verify + retry columns)   ok
--   processed_at is write-once                ok, kept the first stamp
--   payload rewrite                           blocked
--   signature_valid rewrite                   blocked
--   un-set verified_against_api               blocked
--   delete                                    blocked
--
-- Confirmed afterwards that the rollback left nothing: 0 retry columns, 0
-- triggers, 0 functions, 0 probe rows.
--
-- ----------------------------------------------------------------------------
-- WHY THIS IS NOT `CREATE TABLE payment_events`
-- ----------------------------------------------------------------------------
-- The request was "086_checkout_events.sql: payment_events append-only". The
-- table it describes is already in production under another name, and has been
-- since the Cardcom integration landed. Measured against the live catalog on
-- 2026-08-20:
--
--   public.payment_webhook_events(
--     id, provider, external_event_id, signature_valid,
--     verified_against_api, payload, payment_id, processed_at, created_at)
--   UNIQUE (provider, external_event_id)   -- payment_webhook_events_dedup
--
-- Creating a second table would not add a journal, it would add a SECOND ANSWER
-- to "have we already handled this Cardcom callback". The webhook dedups against
-- whichever table it is pointed at; a replay that misses the other one gets
-- processed twice, and on this path processing twice means finalizing one order
-- twice, which issues a second set of vouchers for a single payment. That is the
-- exact failure the existing UNIQUE index exists to prevent. migrations/pending/
-- 115_payment_events.sql reached the same conclusion and was left inert; this
-- file is the part of the request that IS missing, written as DDL.
--
-- ----------------------------------------------------------------------------
-- WHAT "APPEND-ONLY" CAN MEAN HERE
-- ----------------------------------------------------------------------------
-- Not "no UPDATE". The route updates these rows twice on the happy path and has
-- to: `verified_against_api` is stamped after GetLpResult answers, and
-- `processed_at` is stamped only after finalizeOrder returns ok, which is what
-- makes an unprocessed row a dead letter rather than a lost one. A blanket
-- no-UPDATE rule would break the queue it is meant to protect.
--
-- What must never change is the RECORD OF WHAT ARRIVED: which provider called,
-- which event it was, what it said, whether it presented an accepted secret, and
-- when. Those are evidence about a charge on someone's card. Everything below
-- enforces that and nothing more.
--
-- The number is out of sequence on purpose: 086 is the name the goal gave this
-- step, and migrations/pending/ is ordered by approval rather than by lineage
-- (it already holds 110-123 alongside 003-009). The applied lineage in
-- supabase/migrations/ is at 118.

-- ----------------------------------------------------------------------------
-- 1. Retry bookkeeping for the dead-letter queue.
-- ----------------------------------------------------------------------------
-- Today "dead-lettered" is INFERRED by server/payments/webhook-dlq.ts from
-- `verified_against_api = true AND processed_at IS NULL`, plus age. That finds
-- the rows but records nothing about the attempts to fix them, so a row that
-- has failed fifty times looks exactly like one that arrived a second ago.
ALTER TABLE public.payment_webhook_events
  ADD COLUMN IF NOT EXISTS attempts        integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS next_attempt_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error      text;

-- The queue as an index rather than as a table. Partial, because the rows that
-- matter are a vanishing fraction of the journal: everything that worked has a
-- non-null processed_at and must not be scanned to find the handful that did
-- not.
CREATE INDEX IF NOT EXISTS payment_webhook_events_unprocessed_idx
  ON public.payment_webhook_events (created_at)
  WHERE processed_at IS NULL;

-- ----------------------------------------------------------------------------
-- 2. The recorded facts become immutable.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tg_payment_webhook_events_append_only()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Identity and content of the delivery. Rewriting any of these turns the
  -- journal into a story rather than a record.
  IF NEW.id IS DISTINCT FROM OLD.id
     OR NEW.provider IS DISTINCT FROM OLD.provider
     OR NEW.external_event_id IS DISTINCT FROM OLD.external_event_id
     OR NEW.payload IS DISTINCT FROM OLD.payload
     OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.signature_valid IS DISTINCT FROM OLD.signature_valid THEN
    RAISE EXCEPTION
      'payment_webhook_events is append-only: % is a recorded fact and cannot be rewritten',
      CASE
        WHEN NEW.id IS DISTINCT FROM OLD.id THEN 'id'
        WHEN NEW.provider IS DISTINCT FROM OLD.provider THEN 'provider'
        WHEN NEW.external_event_id IS DISTINCT FROM OLD.external_event_id THEN 'external_event_id'
        WHEN NEW.payload IS DISTINCT FROM OLD.payload THEN 'payload'
        WHEN NEW.created_at IS DISTINCT FROM OLD.created_at THEN 'created_at'
        ELSE 'signature_valid'
      END
      USING ERRCODE = 'restrict_violation';
  END IF;

  -- Verification is one-way. Nothing in the codebase writes false after a
  -- successful GetLpResult, so a true -> false transition is a bug or a hand
  -- edit, and either way it would hide a verified charge from the queue.
  IF OLD.verified_against_api AND NOT NEW.verified_against_api THEN
    RAISE EXCEPTION 'payment_webhook_events.verified_against_api cannot be un-set'
      USING ERRCODE = 'restrict_violation';
  END IF;

  -- processed_at is write-once, enforced by KEEPING the first value rather than
  -- by raising. Two writers can legitimately reach a stamped row: the webhook
  -- stamps after finalizeOrder returns, and webhook-dlq.markProcessed stamps
  -- after a replay, and the DLQ selects `processed_at IS NULL` a moment before
  -- it writes. Raising on that race would fail the webhook request AFTER the
  -- order had already closed, which is the one outcome this table exists to
  -- make impossible to lose. Silently keeping the earlier timestamp is both the
  -- true answer and the harmless one.
  IF OLD.processed_at IS NOT NULL THEN
    NEW.processed_at := OLD.processed_at;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS payment_webhook_events_append_only ON public.payment_webhook_events;
CREATE TRIGGER payment_webhook_events_append_only
  BEFORE UPDATE ON public.payment_webhook_events
  FOR EACH ROW EXECUTE FUNCTION public.tg_payment_webhook_events_append_only();

-- ----------------------------------------------------------------------------
-- 3. No deletes.
-- ----------------------------------------------------------------------------
-- Deliberately unconditional, including for service_role, which is the only
-- role that reaches this table at all. Every row is evidence that a specific
-- card was charged; the cases where deleting one is attractive - a noisy
-- scanner, a payload that failed to parse, a table that grew - are exactly the
-- cases where the deleted row is the one somebody later needs.
--
-- Retention, if it is ever wanted, is a deliberate act and should look like one:
--   ALTER TABLE public.payment_webhook_events DISABLE TRIGGER payment_webhook_events_no_delete;
--   <the DELETE, with its WHERE clause reviewed>
--   ALTER TABLE public.payment_webhook_events ENABLE TRIGGER payment_webhook_events_no_delete;
CREATE OR REPLACE FUNCTION public.tg_payment_webhook_events_no_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'payment_webhook_events is append-only: rows are never deleted (event %)',
    OLD.external_event_id
    USING ERRCODE = 'restrict_violation';
END;
$$;

DROP TRIGGER IF EXISTS payment_webhook_events_no_delete ON public.payment_webhook_events;
CREATE TRIGGER payment_webhook_events_no_delete
  BEFORE DELETE ON public.payment_webhook_events
  FOR EACH ROW EXECUTE FUNCTION public.tg_payment_webhook_events_no_delete();

-- ----------------------------------------------------------------------------
-- 4. Self-check. The migration fails rather than reporting success it did not
--    earn - the same shape as 123, which verifies its own revokes.
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_triggers int;
  v_columns  int;
  v_index    int;
BEGIN
  SELECT count(*) INTO v_triggers
    FROM pg_trigger
   WHERE tgrelid = 'public.payment_webhook_events'::regclass
     AND NOT tgisinternal
     AND tgname IN ('payment_webhook_events_append_only', 'payment_webhook_events_no_delete');
  IF v_triggers <> 2 THEN
    RAISE EXCEPTION 'expected both append-only triggers, found %', v_triggers;
  END IF;

  SELECT count(*) INTO v_columns
    FROM information_schema.columns
   WHERE table_schema = 'public' AND table_name = 'payment_webhook_events'
     AND column_name IN ('attempts', 'next_attempt_at', 'last_error');
  IF v_columns <> 3 THEN
    RAISE EXCEPTION 'expected the three retry columns, found %', v_columns;
  END IF;

  SELECT count(*) INTO v_index
    FROM pg_indexes
   WHERE schemaname = 'public' AND tablename = 'payment_webhook_events'
     AND indexname = 'payment_webhook_events_unprocessed_idx';
  IF v_index <> 1 THEN
    RAISE EXCEPTION 'the unprocessed partial index is missing';
  END IF;
END;
$$;
