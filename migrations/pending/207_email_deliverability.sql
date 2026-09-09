-- 207_email_deliverability.sql
--
-- The suppression list already exists. This is what it is missing.
--
-- =============================================================================
-- WHAT WAS MEASURED, AND WHY THE FIRST DRAFT OF THIS FILE WAS WRONG
-- =============================================================================
--
-- The first version of this file was `CREATE TABLE public.email_suppressions
-- (address text ...)`. Run against production inside a rolled-back DO block it
-- failed with `column "address" does not exist` - because
-- `CREATE TABLE IF NOT EXISTS` had silently done nothing. THE TABLE IS ALREADY
-- THERE, created by `supabase/migrations/095_notification_outbox.sql`, with:
--
--   email       text PRIMARY KEY      -- not `address`
--   reason      text CHECK (reason IN ('hard_bounce','complaint','manual','unsubscribed'))
--   detail      text
--   created_at  timestamptz
--
-- Zero rows. RLS on, with exactly ONE policy: `email_suppressions_admin_read`,
-- SELECT for authenticated where `is_admin()`.
--
-- That is the whole argument for probing a migration against production before
-- writing another line of it. `IF NOT EXISTS` does not warn; it succeeds. A
-- file that had been applied rather than probed would have left the new columns
-- uncreated, the new CHECK unadded, and every read in the application looking
-- for a column called `address` that does not exist - and it would have
-- reported success.
--
-- =============================================================================
-- THE LIST IS ALREADY CONSULTED. NOTHING HAS EVER FILLED IT.
-- =============================================================================
--
-- `fn_enqueue_notification` (095) checks it before queueing:
--
--   IF to_regclass('public.email_suppressions') IS NOT NULL THEN
--     IF EXISTS (SELECT 1 FROM public.email_suppressions s
--                 WHERE lower(s.email) = v_email) THEN RETURN;
--
-- and pending 190 checks it too. So the reader has been in place since 095 and
-- has always found the table empty, because Resend reports a bounce or a
-- complaint exactly once, over a webhook, and NOTHING IN THIS REPOSITORY
-- LISTENS TO THAT WEBHOOK. An address that hard-bounced last week is mailed
-- again by the next cron; an address whose owner pressed "spam" is mailed again
-- for as long as they have an account.
--
-- The cost is not paid by the address that bounced. Repeated hard bounces read
-- to a receiver as a sender who does not maintain a list, and mail after a
-- complaint is the strongest signal Gmail has for classifying a whole SENDING
-- DOMAIN. It is paid by every receipt and every coupon sent to everybody else.
--
-- =============================================================================
-- THE GRANTS ARE WIDER THAN THE POLICY
-- =============================================================================
--
-- Measured on the live table:
--
--   anon           SELECT
--   authenticated  SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
--
-- against a single SELECT policy. RLS closes INSERT, UPDATE and DELETE, because
-- a command with no policy is denied - so this is a latent grant and not a live
-- hole, and TRUNCATE is not reachable through PostgREST either. It is still
-- wrong in the direction that matters: TRUNCATE IS NOT SUBJECT TO RLS AT ALL,
-- so the only thing standing between `authenticated` and an emptied suppression
-- list is that PostgREST has no endpoint for it. `144_revoke_authenticated_dml`
-- swept this class and did not reach this table.
--
-- =============================================================================
-- THE COUNTERS HOLD NO ADDRESS, AND THAT IS THE DESIGN
-- =============================================================================
--
-- [60] asks for per-template open and click tracking "respecting privacy". The
-- normal implementation is a row per message with a recipient, an opened_at, a
-- user agent and an IP, which is a reading-behaviour profile per customer - on
-- a site whose own privacy page says search terms are kept "as terms only,
-- without a user and without an IP address".
--
-- `email_events_daily` is a counter per (day, template, event). It answers "is
-- the coupon mail being opened less than it was" and "is one template bouncing
-- harder than the others", which are the questions that change what anybody
-- does. It cannot answer "did this customer open it", and there is no column
-- that could be joined to make it answer that.

BEGIN;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- =============================================================================
-- 1. email_suppressions: three columns and a normalisation rule
-- =============================================================================

ALTER TABLE public.email_suppressions
  ADD COLUMN IF NOT EXISTS source     text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Nothing enforced the case of the key, while every reader compares
-- `lower(s.email)`. So `Person@x.com` and `person@x.com` are two rows, and a
-- suppression stored under one of them is invisible to a check against the
-- other -- which is a suppression list that silently does not suppress. Safe
-- to add: the table holds zero rows.
ALTER TABLE public.email_suppressions
  DROP CONSTRAINT IF EXISTS email_suppressions_normalised_check;
ALTER TABLE public.email_suppressions
  ADD CONSTRAINT email_suppressions_normalised_check
  CHECK (email = lower(btrim(email)) AND position('@' in email) > 1);

ALTER TABLE public.email_suppressions
  DROP CONSTRAINT IF EXISTS email_suppressions_source_len_check;
ALTER TABLE public.email_suppressions
  ADD CONSTRAINT email_suppressions_source_len_check
  CHECK (source IS NULL OR length(source) <= 200);

DROP TRIGGER IF EXISTS email_suppressions_set_updated_at ON public.email_suppressions;
CREATE TRIGGER email_suppressions_set_updated_at
  BEFORE UPDATE ON public.email_suppressions
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- The grant fix. The admin read policy stays; what goes is every write the
-- policy never permitted and the TRUNCATE that no policy could have stopped.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.email_suppressions FROM authenticated;
-- anon keeps nothing at all: the SELECT it holds is already refused by RLS
-- (there is no anon policy), and a grant that only RLS is closing is a grant
-- that outlives the next policy someone adds.
REVOKE ALL ON public.email_suppressions FROM anon;

-- =============================================================================
-- 2. email_events_daily
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.email_events_daily (
  day        date NOT NULL,
  -- The `tag` the send carried. `unknown` when a send set none, which is a
  -- state worth seeing rather than a row to drop: it means a call site is
  -- sending untagged mail and its numbers are pooled with everyone else's.
  template   text NOT NULL CHECK (length(btrim(template)) BETWEEN 1 AND 100),
  event      text NOT NULL CHECK (event IN (
    'sent', 'delivered', 'delivery_delayed', 'bounced', 'complained', 'opened', 'clicked'
  )),
  count      integer NOT NULL DEFAULT 0 CHECK (count >= 0),
  updated_at timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (day, template, event)
);

ALTER TABLE public.email_events_daily ENABLE ROW LEVEL SECURITY;

-- No policy for anybody, and no client grant. The admin panel reads it over
-- the service role. Aggregate counts are not secret, but a table nobody
-- outside the server needs is a table nobody outside the server gets.
REVOKE ALL ON public.email_events_daily FROM anon, authenticated;

-- =============================================================================
-- 3. The two writers
-- =============================================================================

/**
 * Increment one counter.
 *
 * A FUNCTION AND NOT A POSTGREST UPSERT, for the reason 191 gives about
 * `seen_count`: `count = count + 1` cannot be expressed from the client at all,
 * so the client would read then write, and two webhook deliveries arriving
 * together would each read 4 and each write 5.
 *
 * The day is derived HERE, from the database's clock, rather than taken as an
 * argument. Three app servers in three regions would otherwise disagree about
 * which day an event at 23:59 belongs to, and one day's counters would be split
 * across two rows with nothing saying so.
 */
CREATE OR REPLACE FUNCTION public.bump_email_event(p_template text, p_event text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.email_events_daily (day, template, event, count)
  VALUES (current_date, coalesce(nullif(btrim(p_template), ''), 'unknown'), p_event, 1)
  ON CONFLICT (day, template, event)
  DO UPDATE SET count = public.email_events_daily.count + 1, updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.bump_email_event(text, text) FROM PUBLIC, anon, authenticated;

/**
 * Add an address to the suppression list, or strengthen the reason on one that
 * is already there.
 *
 * THE REASON ONLY EVER GETS STRONGER, and the ranking is here rather than in
 * the caller so that a second writer - an admin form, a future provider -
 * cannot get the order wrong. An address that complained and later hard-bounces
 * stays `complaint`, because a complaint is a receiver telling us the mail was
 * unwanted and it must not be overwritten by `manual`, which a person can add
 * by mistake.
 *
 * `unsubscribed` is the spelling the CHECK from 095 uses. Not `unsubscribe`:
 * the constraint is already in production and renaming a value to match a
 * preference would be a migration that can only break things.
 */
CREATE OR REPLACE FUNCTION public.suppress_email(
  p_email  text,
  p_reason text,
  p_source text DEFAULT NULL,
  p_detail text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_email   text := lower(btrim(p_email));
  v_rank    integer;
  v_current integer;
BEGIN
  IF position('@' in v_email) < 2 THEN
    RAISE EXCEPTION 'not an address: %', p_email USING ERRCODE = 'check_violation';
  END IF;

  v_rank := CASE p_reason
              WHEN 'complaint' THEN 4
              WHEN 'hard_bounce' THEN 3
              WHEN 'unsubscribed' THEN 2
              WHEN 'manual' THEN 1
            END;
  IF v_rank IS NULL THEN
    RAISE EXCEPTION 'unknown reason: %', p_reason USING ERRCODE = 'check_violation';
  END IF;

  SELECT CASE s.reason
           WHEN 'complaint' THEN 4
           WHEN 'hard_bounce' THEN 3
           WHEN 'unsubscribed' THEN 2
           WHEN 'manual' THEN 1
         END
    INTO v_current
    FROM public.email_suppressions s
   WHERE s.email = v_email;

  IF v_current IS NULL THEN
    INSERT INTO public.email_suppressions (email, reason, source, detail)
    VALUES (v_email, p_reason, p_source, p_detail);
  ELSIF v_rank > v_current THEN
    UPDATE public.email_suppressions s
       SET reason = p_reason, source = p_source, detail = p_detail
     WHERE s.email = v_email;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.suppress_email(text, text, text, text)
  FROM PUBLIC, anon, authenticated;

COMMIT;
