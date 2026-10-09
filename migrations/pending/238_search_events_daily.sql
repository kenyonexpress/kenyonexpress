-- 238_search_events_daily.sql
--
-- A day axis for search analytics.
--
-- `search_events` (118) is an aggregate: one row per normalised term with a
-- running count. It answers "what do people search for that we do not sell"
-- and cannot answer "is that getting better": a term searched 40 times with
-- 30 empty results looks the same whether the 30 were last month, before the
-- product was added, or yesterday. The admin page's zero-result rate is
-- therefore all-time, and all-time is the one window an operator cannot act
-- on.
--
-- This file adds the per-day twin. Same normalisation, same two counters,
-- keyed by (day, term), written by the SAME function in the same statement
-- so the two tables cannot disagree about a search. No user, no IP, no
-- session: 118's privacy contract holds unchanged, and a day is the coarsest
-- bucket that still answers the trend question.
--
-- `fn_record_search` is restated in full. Its live body was read off
-- production on 2026-09-17 (pg_get_functiondef) and matches 118's file byte
-- for byte, so this CREATE OR REPLACE is 118 plus one INSERT, not a stale
-- copy over a drifted body (the 183 shape). Grants restated as production
-- has them: service_role only. anon/authenticated were revoked by 158/159
-- and the storefront records through the admin client (lib/search/record.ts).
--
-- Reads: staff only, the same `has_role('admin')` policy 118 gave
-- `search_events`; the admin page reads both through the session client.
--
-- The application degrades without this file: src/app/(admin)/admin/search
-- shows the all-time figures and no trend section on a database that
-- answers 42P01 for `search_events_daily`.
--
-- Idempotent: safe to re-run.
--
-- ROLLBACK:
--   (re-run 118's CREATE OR REPLACE FUNCTION public.fn_record_search body)
--   DROP TABLE IF EXISTS public.search_events_daily;

-- ---------------------------------------------------------------------------
-- 1. The day axis
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.search_events_daily (
  day           date        NOT NULL,
  -- Lower-cased and whitespace-collapsed, as in search_events.term.
  term          text        NOT NULL,
  -- The last spelling typed that day, for display.
  raw_term      text        NOT NULL,
  searches      integer     NOT NULL DEFAULT 0,
  empty_results integer     NOT NULL DEFAULT 0,
  updated_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (day, term),
  CONSTRAINT search_events_daily_counts_check
    CHECK (searches >= 0 AND empty_results >= 0 AND empty_results <= searches)
);

-- The trend query: a window of days, ordered by day.
CREATE INDEX IF NOT EXISTS search_events_daily_day_idx
  ON public.search_events_daily (day DESC);

ALTER TABLE public.search_events_daily ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.search_events_daily FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.search_events_daily TO authenticated;

DROP POLICY IF EXISTS "search_events_daily: staff read" ON public.search_events_daily;
CREATE POLICY "search_events_daily: staff read" ON public.search_events_daily
  FOR SELECT TO authenticated
  USING (public.has_role('admin'));

COMMENT ON TABLE public.search_events_daily IS
  'search_events by UTC day: one row per (day, normalised term). No user, no IP; the trend of what the catalogue fails to answer.';

-- ---------------------------------------------------------------------------
-- 2. Recording one, into both
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_record_search(
  p_term text,
  p_hits integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_raw   text := btrim(coalesce(p_term, ''));
  v_norm  text;
  v_empty integer := CASE WHEN coalesce(p_hits, 0) = 0 THEN 1 ELSE 0 END;
BEGIN
  v_norm := lower(regexp_replace(v_raw, '\s+', ' ', 'g'));
  IF length(v_norm) < 2 OR length(v_norm) > 120 THEN RETURN; END IF;

  INSERT INTO public.search_events (term, raw_term, searches, empty_results, last_hits)
  VALUES (v_norm, v_raw, 1, v_empty, p_hits)
  ON CONFLICT (term) DO UPDATE
     SET searches      = public.search_events.searches + 1,
         empty_results = public.search_events.empty_results + v_empty,
         last_hits     = p_hits,
         raw_term      = EXCLUDED.raw_term,
         last_seen_at  = now();

  -- The day twin. UTC, like every other date bucket here; the admin page
  -- labels the window as such.
  INSERT INTO public.search_events_daily (day, term, raw_term, searches, empty_results)
  VALUES ((now() AT TIME ZONE 'utc')::date, v_norm, v_raw, 1, v_empty)
  ON CONFLICT (day, term) DO UPDATE
     SET searches      = public.search_events_daily.searches + 1,
         empty_results = public.search_events_daily.empty_results + v_empty,
         raw_term      = EXCLUDED.raw_term,
         updated_at    = now();
END;
$function$;

REVOKE ALL ON FUNCTION public.fn_record_search(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fn_record_search(text, integer) TO service_role;
