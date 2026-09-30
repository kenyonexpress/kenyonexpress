-- 245_saved_searches.sql
--
-- Saved searches, per customer (STEP 08, 30.09).
--
-- MEASURED BEFORE WRITING. 118 gave a signed-in shopper a HISTORY
-- (user_recent_searches: the last ten terms, written by fn_record_recent_search
-- on every results page, owner-only). Nothing let a shopper KEEP a search: a
-- query plus the facets that narrowed it (city, type, price band), named, to
-- come back to. `grep -ri saved.search src supabase migrations` found nothing
-- on 2026-09-30. This is that table.
--
-- SHAPE
--   href   the canonical `/search?...` URL the results page answers. Stored
--          whole rather than as columns because the facet set is the search
--          page's contract (lib/search/faceted.ts) and adding a facet there
--          must not require a migration here. The application canonicalises
--          it (sorted keys, no paging) before writing, and the CHECK below
--          refuses anything that is not a same-site search URL, so a row can
--          never carry a redirect to somewhere else.
--   query  the `q` alone, for the account list and for a future "new results
--          for your saved search" mail without parsing the href.
--   name   what the shopper called it; the application defaults it from the
--          query and the facet labels.
--
-- OWNER-ONLY, LIKE 118. The owner reads, inserts, updates and deletes their
-- own rows; nobody else reads anybody's. Staff have no operational reason to
-- see what one person is watching for, and search_events already answers
-- every catalogue question without naming anyone.
--
-- CAPPED AT 30 PER USER, IN THE DATABASE. The same reasoning as 118's cap of
-- ten: an unbounded per-person list on a table nobody but its owner may read
-- is a growing liability, and the cap is enforced here so it holds whichever
-- caller writes. The oldest rows go first.
--
-- ROLLBACK
--   DROP TRIGGER  IF EXISTS saved_searches_cap ON public.saved_searches;
--   DROP FUNCTION IF EXISTS public.fn_cap_saved_searches();
--   DROP TABLE    IF EXISTS public.saved_searches;

BEGIN;

CREATE TABLE IF NOT EXISTS public.saved_searches (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name        text        NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 60),
  query       text        NOT NULL CHECK (length(query) BETWEEN 0 AND 120),
  href        text        NOT NULL CHECK (href LIKE '/search?%' AND length(href) <= 600),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  -- Saving the same search twice renames it rather than duplicating it.
  UNIQUE (user_id, href)
);

COMMENT ON TABLE public.saved_searches IS
  'Per-customer saved searches: a canonical /search URL with a name. Owner-only by RLS, capped at 30 by fn_cap_saved_searches, oldest first.';
COMMENT ON COLUMN public.saved_searches.href IS
  'Canonical same-site search URL (sorted keys, no limit/offset), as lib/search/saved.ts writes it. The CHECK refuses anything that is not /search?...';

CREATE INDEX IF NOT EXISTS saved_searches_user_idx
  ON public.saved_searches (user_id, created_at DESC);

-- The 183/226 lesson: never restate a shared function. Create it only if the
-- database somehow lacks it; production already carries the live body.
DO $$
BEGIN
  IF to_regproc('public.set_updated_at') IS NULL THEN
    CREATE FUNCTION public.set_updated_at()
    RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $fn$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $fn$;
  END IF;
END $$;

DROP TRIGGER IF EXISTS saved_searches_updated_at ON public.saved_searches;
CREATE TRIGGER saved_searches_updated_at
  BEFORE UPDATE ON public.saved_searches
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ------------------------------------------------------------------ the cap

CREATE OR REPLACE FUNCTION public.fn_cap_saved_searches()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.saved_searches
   WHERE user_id = NEW.user_id
     AND id NOT IN (
       SELECT id FROM public.saved_searches
        WHERE user_id = NEW.user_id
        ORDER BY created_at DESC, id DESC
        LIMIT 30
     );
  RETURN NULL;
END
$$;

REVOKE ALL ON FUNCTION public.fn_cap_saved_searches() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS saved_searches_cap ON public.saved_searches;
CREATE TRIGGER saved_searches_cap
  AFTER INSERT ON public.saved_searches
  FOR EACH ROW EXECUTE FUNCTION public.fn_cap_saved_searches();

-- ------------------------------------------------------------------- RLS

ALTER TABLE public.saved_searches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "saved_searches_owner_select" ON public.saved_searches;
CREATE POLICY "saved_searches_owner_select"
  ON public.saved_searches FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "saved_searches_owner_insert" ON public.saved_searches;
CREATE POLICY "saved_searches_owner_insert"
  ON public.saved_searches FOR INSERT TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "saved_searches_owner_update" ON public.saved_searches;
CREATE POLICY "saved_searches_owner_update"
  ON public.saved_searches FOR UPDATE TO authenticated
  USING (user_id = (SELECT auth.uid()))
  WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "saved_searches_owner_delete" ON public.saved_searches;
CREATE POLICY "saved_searches_owner_delete"
  ON public.saved_searches FOR DELETE TO authenticated
  USING (user_id = (SELECT auth.uid()));

REVOKE ALL ON public.saved_searches FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_searches TO authenticated;

-- ------------------------------------------------------------------- checks

DO $$
DECLARE
  v_rls boolean;
  v_anon boolean;
BEGIN
  SELECT relrowsecurity INTO v_rls FROM pg_class WHERE oid = 'public.saved_searches'::regclass;
  IF NOT v_rls THEN
    RAISE EXCEPTION 'RLS is off on saved_searches';
  END IF;

  SELECT has_table_privilege('anon', 'public.saved_searches', 'SELECT') INTO v_anon;
  IF v_anon THEN
    RAISE EXCEPTION 'anon can read saved_searches; the revoke did not take';
  END IF;

  IF has_function_privilege('anon', 'public.fn_cap_saved_searches()', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon can execute fn_cap_saved_searches';
  END IF;
END $$;

COMMIT;

-- ============================================================================
-- VERIFICATION (after applying, inside a rolled-back DO block)
-- ============================================================================
-- Thirty-one inserts for one user leave thirty rows, the oldest gone:
--   DO $$ DECLARE u uuid := (SELECT id FROM public.profiles LIMIT 1); n int; BEGIN
--     FOR i IN 1..31 LOOP
--       INSERT INTO public.saved_searches (user_id, name, query, href)
--       VALUES (u, 'test ' || i, 'q' || i, '/search?q=q' || i);
--     END LOOP;
--     SELECT count(*) INTO n FROM public.saved_searches WHERE user_id = u;
--     RAISE EXCEPTION 'rollback: % rows (expect 30)', n;
--   END $$;
