-- 118_search_intelligence.sql
--
-- Three tables that answer three different questions, and are deliberately not
-- one table with a `kind` column:
--
--   `search_events`         what shoppers looked for, and what came back
--   `popular_searches`      what an operator has decided to promote
--   `user_recent_searches`  one person's own history, private to them
--
-- Merging them would put an operator's curated list and a customer's private
-- history under one RLS policy, and the correct policies are opposites: the
-- first is world-readable, the third is readable by exactly one person.
--
-- THE EMPTY-RESULT LOG IS THE POINT OF THE FIRST TABLE. A search that returns
-- nothing is the clearest signal a catalogue can produce: it is a customer
-- telling you, in their own words, what you do not sell. Today nothing records
-- it and the information is lost the moment the page renders.
--
-- QUERIES ARE STORED NORMALISED AND AGGREGATED, NOT ROW-PER-KEYSTROKE. A
-- type-ahead fires on every character, so a row per request would store
-- "מ", "מס", "מסע", "מסעד", "מסעדה" and drown the real query in its own
-- prefixes. `fn_record_search` upserts on the normalised term instead, so the
-- table holds one row per distinct search with a count.
--
-- NO IP, NO USER AGENT, AND NO user_id ON `search_events`. What somebody
-- searched for is sensitive - health, gifts, relationships - and this table
-- exists to improve the catalogue, which needs the TERM and not the person. The
-- per-user table below is separate, is opt-in by being logged in, and the
-- customer can clear it.

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END; $$;

-- ---------------------------------------------------------------------------
-- 1. What was searched for
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.search_events (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Lower-cased and whitespace-collapsed. The unique key, so the table is an
  -- aggregate rather than a log.
  term          text        NOT NULL UNIQUE,
  /** The last spelling a shopper actually typed, for display to an operator. */
  raw_term      text        NOT NULL,
  searches      integer     NOT NULL DEFAULT 0,
  /** How many of those searches came back empty. */
  empty_results integer     NOT NULL DEFAULT 0,
  /** The result count of the most recent search, for a quick read. */
  last_hits     integer,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

-- The admin's "what are people looking for that we do not have" query.
CREATE INDEX IF NOT EXISTS search_events_empty_idx
  ON public.search_events (empty_results DESC, last_seen_at DESC)
  WHERE empty_results > 0;

CREATE INDEX IF NOT EXISTS search_events_popular_idx
  ON public.search_events (searches DESC);

DROP TRIGGER IF EXISTS set_updated_at ON public.search_events;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.search_events
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.search_events ENABLE ROW LEVEL SECURITY;

-- Staff only. The aggregate is not personal, but it is commercially revealing:
-- it is a list of everything the catalogue fails to answer.
DROP POLICY IF EXISTS "search_events: staff read" ON public.search_events;
CREATE POLICY "search_events: staff read" ON public.search_events
  FOR SELECT TO authenticated
  USING (public.has_role('admin'));

COMMENT ON TABLE public.search_events IS
  'One row per distinct normalised query, with counts. No user, no IP: the term is what improves a catalogue.';

-- ---------------------------------------------------------------------------
-- 2. Recording one
-- ---------------------------------------------------------------------------

-- SECURITY DEFINER so an anonymous shopper's search can be counted without
-- giving `anon` write access to the table. The function is the only writer and
-- it accepts nothing but a term and a hit count.
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
  v_raw  text := btrim(coalesce(p_term, ''));
  v_norm text;
BEGIN
  -- Collapse internal whitespace as well as trimming, so "מסעדה  זוגי" and
  -- "מסעדה זוגי" are one row rather than two.
  v_norm := lower(regexp_replace(v_raw, '\s+', ' ', 'g'));

  -- Two characters is the floor the search routes already apply; below it every
  -- query matches most of the catalogue and means nothing. 120 is far past any
  -- real search and stops the table being used as storage.
  IF length(v_norm) < 2 OR length(v_norm) > 120 THEN
    RETURN;
  END IF;

  INSERT INTO public.search_events (term, raw_term, searches, empty_results, last_hits)
  VALUES (v_norm, v_raw, 1, CASE WHEN coalesce(p_hits, 0) = 0 THEN 1 ELSE 0 END, p_hits)
  ON CONFLICT (term) DO UPDATE
     SET searches      = public.search_events.searches + 1,
         empty_results = public.search_events.empty_results
                       + CASE WHEN coalesce(p_hits, 0) = 0 THEN 1 ELSE 0 END,
         last_hits     = p_hits,
         raw_term      = EXCLUDED.raw_term,
         last_seen_at  = now();
END;
$function$;

GRANT EXECUTE ON FUNCTION public.fn_record_search(text, integer) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. What an operator chose to promote
-- ---------------------------------------------------------------------------

-- CURATED, NOT COMPUTED, and that is the decision. The obvious alternative is
-- to show the top rows of `search_events`, which on a young catalogue means
-- showing whatever a handful of people typed - including typos, competitor
-- names and the occasional obscenity - on the home page. An operator picks
-- these; the analytics above are what they pick FROM.
CREATE TABLE IF NOT EXISTS public.popular_searches (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  term       text        NOT NULL UNIQUE,
  /** Optional destination. A term with a URL becomes a link, not a re-search. */
  target_url text,
  position   integer     NOT NULL DEFAULT 0,
  is_active  boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS popular_searches_order_idx
  ON public.popular_searches (position, term) WHERE is_active;

DROP TRIGGER IF EXISTS set_updated_at ON public.popular_searches;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.popular_searches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.popular_searches ENABLE ROW LEVEL SECURITY;

-- World-readable, because it is rendered to every visitor including logged-out
-- ones. Writable by staff only.
DROP POLICY IF EXISTS "popular_searches: public read" ON public.popular_searches;
CREATE POLICY "popular_searches: public read" ON public.popular_searches
  FOR SELECT TO anon, authenticated
  USING (is_active);

DROP POLICY IF EXISTS "popular_searches: staff write" ON public.popular_searches;
CREATE POLICY "popular_searches: staff write" ON public.popular_searches
  FOR ALL TO authenticated
  USING (public.has_role('admin'))
  WITH CHECK (public.has_role('admin'));

-- ---------------------------------------------------------------------------
-- 4. One customer's own history
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.user_recent_searches (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  term       text        NOT NULL,
  searched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Re-searching a term moves it to the top rather than adding a duplicate, so
  -- a list of five is five DIFFERENT things.
  UNIQUE (user_id, term)
);

CREATE INDEX IF NOT EXISTS user_recent_searches_recent_idx
  ON public.user_recent_searches (user_id, searched_at DESC);

DROP TRIGGER IF EXISTS set_updated_at ON public.user_recent_searches;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.user_recent_searches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.user_recent_searches ENABLE ROW LEVEL SECURITY;

-- The owner, and nobody else - not even staff. A person's search history is the
-- most revealing thing in this schema and there is no operational reason to
-- read it: `search_events` already answers every catalogue question without
-- naming anyone.
DROP POLICY IF EXISTS "user_recent_searches: own read" ON public.user_recent_searches;
CREATE POLICY "user_recent_searches: own read" ON public.user_recent_searches
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS "user_recent_searches: own delete" ON public.user_recent_searches;
CREATE POLICY "user_recent_searches: own delete" ON public.user_recent_searches
  FOR DELETE TO authenticated USING (user_id = auth.uid());

COMMENT ON TABLE public.user_recent_searches IS
  'Per-customer search history. Owner-only, capped at 10 by fn_record_recent_search, clearable by the customer.';

-- Writes go through the function so the cap is enforced in one place rather
-- than by whichever caller remembers it.
CREATE OR REPLACE FUNCTION public.fn_record_recent_search(p_term text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid := auth.uid();
  v_term text := btrim(coalesce(p_term, ''));
BEGIN
  IF v_user IS NULL THEN RETURN; END IF;
  v_term := regexp_replace(v_term, '\s+', ' ', 'g');
  IF length(v_term) < 2 OR length(v_term) > 120 THEN RETURN; END IF;

  INSERT INTO public.user_recent_searches (user_id, term)
  VALUES (v_user, v_term)
  ON CONFLICT (user_id, term) DO UPDATE SET searched_at = now();

  -- Ten, kept by recency. An unbounded history is a growing liability on a
  -- table nobody but its owner may read, and nobody scrolls their eleventh
  -- most recent search.
  DELETE FROM public.user_recent_searches
   WHERE user_id = v_user
     AND id NOT IN (
       SELECT id FROM public.user_recent_searches
        WHERE user_id = v_user
        ORDER BY searched_at DESC
        LIMIT 10
     );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.fn_record_recent_search(text) TO authenticated, service_role;
