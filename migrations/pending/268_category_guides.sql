-- 268_category_guides.sql
--
-- Category buyer guides (STEP 65): a ~300-word Hebrew guide at the foot of
-- /category/[slug], written in the admin's category editor, served as
-- indexable copy. One table, no function.
--
-- WHAT A GUIDE IS HERE
--
-- One row per category (the category id is the primary key, so a category
-- holds at most one guide). `body_md` is the text in the three-shape
-- markdown the renderer accepts (`src/lib/category-guides/markdown.ts`):
-- `## ` headings, `- ` bullet lines and paragraphs separated by a blank
-- line. Nothing else is interpreted, there is no HTML, and the renderer
-- builds React elements rather than injecting a string, so the row can
-- never carry a script into the page. `title_he` is the optional H2 over
-- the guide; null renders the default "מדריך קנייה: <category>".
-- `is_published` false keeps the row but shows nothing, INCLUDING the
-- authored fallback below, which is how an editor hides a guide without
-- deleting the text.
--
-- THE FALLBACK IS THE DESIGN. Every live category ships an authored guide
-- in `src/lib/category-guides/authored.ts`, keyed by slug, that renders
-- when the category has no row (and when this table is absent, which is
-- the state until this file is applied). The admin editor prefills the
-- textarea with that text, so the first save of a category turns the
-- authored copy into a row an editor owns. A database row always wins.
--
-- WHO MAY READ AND WRITE
--
--   * The storefront reads on the anon key, every row, published or not,
--     and applies `is_published` itself: an unpublished guide must hide
--     the authored fallback too, which a policy that filtered the row out
--     could not express (an absent row means "authored", not "hidden").
--     A draft guide is catalogue copy, not a secret.
--   * Composition is the service role from
--     `src/server/actions/admin/categories.ts` behind `requireAdminSession`
--     with an audit row naming the actor, as the category row itself. The
--     `has_role('admin')` policy is the belt 262, 265, 266 and 267 wear for
--     a direct admin session.
--
-- PRECONDITIONS: `public.categories`, `public.set_updated_at()` and
-- `public.has_role(text)` (all live, measured by 262 on 2026-10-08 and
-- again by this file on 2026-10-09). No dependency on any other pending
-- file.
--
-- ROLLBACK:
--   DROP TABLE IF EXISTS public.category_guides;
--   -- No pre-existing object is touched.

BEGIN;

CREATE TABLE IF NOT EXISTS public.category_guides (
  category_id   uuid        PRIMARY KEY REFERENCES public.categories(id) ON DELETE CASCADE,
  title_he      text,
  body_md       text        NOT NULL,
  is_published  boolean     NOT NULL DEFAULT true,
  updated_by    uuid        REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'category_guides_title_check') THEN
    ALTER TABLE public.category_guides
      ADD CONSTRAINT category_guides_title_check
      CHECK (title_he IS NULL OR length(btrim(title_he)) BETWEEN 2 AND 120);
  END IF;
  -- A guide is a few hundred words; 20k characters is ten times a long one
  -- and well under anything that would slow the page. Empty is refused:
  -- "no guide" is the absent row or is_published = false, not blank text.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'category_guides_body_check') THEN
    ALTER TABLE public.category_guides
      ADD CONSTRAINT category_guides_body_check
      CHECK (length(btrim(body_md)) BETWEEN 1 AND 20000);
  END IF;
END $$;

DROP TRIGGER IF EXISTS category_guides_set_updated_at ON public.category_guides;
CREATE TRIGGER category_guides_set_updated_at
  BEFORE UPDATE ON public.category_guides
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.category_guides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "category_guides: public read" ON public.category_guides;
CREATE POLICY "category_guides: public read" ON public.category_guides
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "category_guides: staff write" ON public.category_guides;
CREATE POLICY "category_guides: staff write" ON public.category_guides
  FOR ALL TO authenticated
  USING (public.has_role('admin')) WITH CHECK (public.has_role('admin'));

-- 144's rule: client roles get SELECT and nothing else on a new table.
REVOKE ALL ON public.category_guides FROM anon, authenticated;
GRANT SELECT ON public.category_guides TO anon, authenticated;
-- The staff-write policy above needs the DML grant to mean anything for a
-- direct admin session. Service-role writes bypass both.
GRANT INSERT, UPDATE, DELETE ON public.category_guides TO authenticated;

COMMENT ON TABLE public.category_guides IS
  'Buyer guide at the foot of /category/[slug], one per category, markdown-lite (STEP 65). Absent table or row = the authored fallback in src/lib/category-guides/authored.ts.';

-- ---------------------------------------------------------------------------
-- Self-check, rolled back
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_category uuid;
  v_updated  timestamptz;
BEGIN
  SELECT id INTO v_category FROM public.categories LIMIT 1;
  IF v_category IS NULL THEN
    RAISE NOTICE 'category_guides: self-check skipped, no category to rehearse with';
    RETURN;
  END IF;

  INSERT INTO public.category_guides (category_id, title_he, body_md)
  VALUES (v_category, 'מדריך בדיקה', '## כותרת' || E'\n\n' || 'פסקה ראשונה.');

  -- One guide per category: a second row for the same category is refused.
  BEGIN
    INSERT INTO public.category_guides (category_id, body_md) VALUES (v_category, 'שני');
    RAISE EXCEPTION 'category_guides: self-check failed, a second guide for one category was accepted';
  EXCEPTION WHEN unique_violation THEN
    NULL;
  END;

  -- A blank body is refused.
  BEGIN
    UPDATE public.category_guides SET body_md = '   ' WHERE category_id = v_category;
    RAISE EXCEPTION 'category_guides: self-check failed, a blank body was accepted';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  -- The trigger moves updated_at on a real update.
  UPDATE public.category_guides SET updated_at = now() - interval '1 day' WHERE category_id = v_category;
  UPDATE public.category_guides SET is_published = false WHERE category_id = v_category;
  SELECT updated_at INTO v_updated FROM public.category_guides WHERE category_id = v_category;
  IF v_updated < now() - interval '1 minute' THEN
    RAISE EXCEPTION 'category_guides: self-check failed, updated_at did not move (%)', v_updated;
  END IF;

  RAISE EXCEPTION 'category_guides: self-check passed, rolling the rehearsal back';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM LIKE 'category_guides: self-check passed%' THEN
      RAISE NOTICE '%', SQLERRM;
    ELSE
      RAISE;
    END IF;
END $$;

COMMIT;

-- NOT APPLIED. Written 2026-10-09 (STEP 65). Rehearsed on production inside
-- BEGIN/ROLLBACK through the management API the same day (see
-- APPLY-ORDER.md). Apply through the dashboard after review; the application
-- tolerates the absent table (42P01 / PGRST205 reads as "no row", which
-- renders the authored guide) until then. No pre-existing object is touched.
