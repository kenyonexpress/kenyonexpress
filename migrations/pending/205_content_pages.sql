-- 205_content_pages.sql
--
-- Editable page bodies, with a history that cannot be rewritten.
--
-- =============================================================================
-- THIS FILE SEEDS NOTHING, AND THAT IS THE MAIN DECISION IN IT
-- =============================================================================
--
-- The obvious shape is five INSERTs carrying the text of /about, /faq,
-- /contact, /suppliers and a new /page/how-it-works. It is not done, because
-- that text already exists in `src/content/about.ts`, `src/content/legal/faq.ts`
-- and `src/lib/content/pages.ts`, and those modules are what the routes render
-- TODAY. Copying it here would create a second copy of every paragraph, in a
-- file that is applied once and then never read again, and the two would drift
-- the first time somebody fixed a typo in the TypeScript - with the SQL copy
-- being the one nobody looks at and the one that is actually on screen.
--
-- So the built-in text stays in TypeScript and is the FLOOR: `getContentPage`
-- merges published rows over `BUILT_IN_PAGES`, and a page with no row renders
-- its built-in version. A row is created the first time an operator saves that
-- page, by `save_content_page` below, from the values the editor was showing.
--
-- The consequence worth stating plainly: APPLYING THIS FILE CHANGES NOTHING A
-- VISITOR SEES. It creates two empty tables. The site looks identical before
-- and after, and the first visible change is an operator pressing save.
--
-- =============================================================================
-- WHY `bound_route` EXISTS AND WHY NO FORM CAN WRITE IT
-- =============================================================================
--
-- Four of the five pages already have addresses that are in the sitemap, carry
-- canonicals, are linked from the footer and are indexed from the old
-- WordPress site. Serving the same words at `/page/about` as well would be
-- duplicate content competing with itself. `bound_route` records the address a
-- page renders at when it already has one; a NULL means `/page/<slug>`.
--
-- Binding is something a ROUTE FILE does by reading a fixed slug. The column
-- only records it, for the sitemap and for the admin's "view" link. It is not
-- exposed by any form and `save_content_page` does not take it: if an operator
-- could type it, they could point a page at `/checkout` and the sitemap would
-- publish a URL that renders something else. It is set by an operator with SQL
-- access, deliberately, or not at all.
--
-- =============================================================================
-- THE HISTORY IS APPEND-ONLY, AND ROLLBACK IS A NEW REVISION
-- =============================================================================
--
-- `content_page_revisions` has no UPDATE and no DELETE policy for anybody. A
-- rollback does not delete the revisions after the one being restored: it reads
-- an old revision, writes it as the current page, and appends a NEW revision
-- recording that it did. "Undo" that erases the thing being undone is how a
-- history stops being evidence, and the question this table is here to answer
-- is "who changed the refund paragraph, and when".
--
-- Revision numbers are per page and allocated inside `save_content_page` under
-- a row lock, not by the client. Two operators saving at the same moment would
-- otherwise both read max(revision) = 7, both write 8, and one of them would
-- get a unique violation instead of a saved page.
--
-- =============================================================================
-- RLS
-- =============================================================================
--
-- `content_pages`: anon and authenticated may SELECT PUBLISHED ROWS ONLY. The
-- storefront reads through the anon client, so a draft cannot reach a visitor
-- even if application code forgot a filter - which is the direction that
-- matters, since the filter would be the only thing standing between an
-- unfinished page and the public.
--
-- `content_page_revisions`: NO policy for anon or authenticated at all. A
-- revision row is a snapshot of a body that may never have been published, so
-- the history is strictly service-role, reached through the admin panel.

BEGIN;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- =============================================================================
-- 1. content_pages
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.content_pages (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Lowercase latin, digits, single hyphens. NOT Hebrew, even though the
  -- catalogue's slugs are: this field has no legacy rows to stay compatible
  -- with, and the catalogue is currently carrying `חיתולי-פמפרס-העתק` and a
  -- `₪` inside a slug, which is the argument for starting strict rather than
  -- against it. The Hebrew is the title; the slug is what a crawler, a log
  -- line and a support ticket carry.
  slug          text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),

  -- The address this page renders at, when it already has one. NULL means
  -- `/page/<slug>`. UNIQUE, and NULLs do not collide in Postgres, so any number
  -- of unbound pages coexist while two rows cannot claim `/about`.
  bound_route   text UNIQUE
                CHECK (bound_route IS NULL OR bound_route ~ '^/[a-z0-9][a-z0-9/-]*$'),
  -- A bound route under `/page/` would be the duplicate this column exists to
  -- prevent, spelled the long way.
  CONSTRAINT content_pages_bound_route_not_page
    CHECK (bound_route IS NULL OR bound_route NOT LIKE '/page/%'),

  title         text NOT NULL CHECK (length(btrim(title)) BETWEEN 2 AND 200),

  -- `prose` is the restricted markup of `lib/content/markup.ts`. `faq` is
  -- question/answer pairs and is NOT prose, because `/faq` derives its
  -- `FAQPage` JSON-LD from the same array it renders; flattening it to markup
  -- would mean either losing the rich result or guessing which headings are
  -- questions, and a structured-data mismatch is penalised exactly when nobody
  -- is looking.
  body_kind     text NOT NULL DEFAULT 'prose' CHECK (body_kind IN ('prose', 'faq')),
  body          text NOT NULL DEFAULT '',
  faq_entries   jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(faq_entries) = 'array'),

  -- All three are OVERRIDES. Null is not "missing", it is "use the derived
  -- value": the title falls back to `title` and the description to the body's
  -- first 160 characters. A CMS that forces an operator to retype the title
  -- into a second box gets two titles that disagree.
  seo_title       text CHECK (seo_title IS NULL OR length(btrim(seo_title)) BETWEEN 2 AND 200),
  seo_description text CHECK (seo_description IS NULL OR length(btrim(seo_description)) BETWEEN 20 AND 320),
  og_image_url    text CHECK (og_image_url IS NULL OR og_image_url ~ '^(https://|/)'),

  status        text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  published_at  timestamptz,

  created_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  -- A published page has a publication date. `published_at` is what the sitemap
  -- and the page footer print, and "published, date unknown" is a state that
  -- costs a `lastmod` and gains nothing.
  CONSTRAINT content_pages_published_has_date
    CHECK (status <> 'published' OR published_at IS NOT NULL),

  -- A DRAFT may be empty; that is what a draft is for. A PUBLISHED page may
  -- not, and the emptiness is checked per kind, so a prose page cannot be
  -- published on the strength of an faq array it does not use.
  CONSTRAINT content_pages_published_has_body
    CHECK (
      status <> 'published'
      OR (body_kind = 'prose' AND length(btrim(body)) > 0)
      OR (body_kind = 'faq' AND jsonb_array_length(faq_entries) > 0)
    )
);

DROP TRIGGER IF EXISTS content_pages_set_updated_at ON public.content_pages;
CREATE TRIGGER content_pages_set_updated_at
  BEFORE UPDATE ON public.content_pages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- The storefront's read is `status = 'published'` across every page at once, so
-- the index is on status and the planner gets the whole working set from it.
CREATE INDEX IF NOT EXISTS content_pages_status_idx
  ON public.content_pages (status)
  WHERE status = 'published';

ALTER TABLE public.content_pages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS content_pages_public_read ON public.content_pages;
CREATE POLICY content_pages_public_read ON public.content_pages
  FOR SELECT TO anon, authenticated
  USING (status = 'published');

-- No INSERT, UPDATE or DELETE policy for anyone. Writes go through
-- `save_content_page` and the service role, which is what the admin actions
-- use. A policy granting an admin direct UPDATE would be a way to change a
-- body WITHOUT a revision row, and the history is the point.
REVOKE INSERT, UPDATE, DELETE ON public.content_pages FROM anon, authenticated;

-- =============================================================================
-- 2. content_page_revisions
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.content_page_revisions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  page_id         uuid NOT NULL REFERENCES public.content_pages(id) ON DELETE CASCADE,

  -- Per page, 1-based, allocated under a row lock in `save_content_page`.
  revision        integer NOT NULL CHECK (revision > 0),

  -- A full snapshot, not a diff. A diff chain is unreadable the moment one link
  -- is missing, and these rows are a few kilobytes of Hebrew each in a table
  -- that grows by one row per save of a page that is saved a few times a year.
  title           text NOT NULL,
  body_kind       text NOT NULL CHECK (body_kind IN ('prose', 'faq')),
  body            text NOT NULL DEFAULT '',
  faq_entries     jsonb NOT NULL DEFAULT '[]'::jsonb,
  seo_title       text,
  seo_description text,
  og_image_url    text,
  -- The status the page HAD at this save, so the history distinguishes "edited
  -- a draft" from "changed what the public was reading".
  status          text NOT NULL CHECK (status IN ('draft', 'published')),

  -- Free text from the operator, or the sentence `rollback_content_page`
  -- writes. This is the column that answers "why".
  note            text CHECK (note IS NULL OR length(note) <= 500),

  created_by      uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),

  UNIQUE (page_id, revision)
);

CREATE INDEX IF NOT EXISTS content_page_revisions_page_idx
  ON public.content_page_revisions (page_id, revision DESC);

ALTER TABLE public.content_page_revisions ENABLE ROW LEVEL SECURITY;

-- Deliberately no policy of any kind. RLS with zero policies denies everything
-- to anon and authenticated, which is the intent: a revision can hold a body
-- that was never published, and the history is reached through the admin panel
-- over the service role.
REVOKE ALL ON public.content_page_revisions FROM anon, authenticated;

-- =============================================================================
-- 3. save_content_page
-- =============================================================================

/**
 * Upsert a page by slug and append its revision, in one transaction.
 *
 * WHY A FUNCTION AND NOT TWO POSTGREST CALLS. Three reasons, in order of how
 * badly each one bites:
 *
 *   1. The revision number. `max(revision) + 1` computed by the client is a
 *      read-then-write that two overlapping saves both lose: both read 7, both
 *      write 8, and one operator gets a unique violation instead of a saved
 *      page. Here the page row is locked first, so the number is allocated
 *      under that lock.
 *
 *   2. Atomicity. A page updated without its revision appended is a body change
 *      with no record of who made it, and that is the exact hole the history is
 *      here to close. Two round trips can fail between them; one cannot.
 *
 *   3. `published_at` is set ONCE, on the first publish, and is not touched by
 *      later edits. Expressed from the client that is another read-then-write.
 *
 * SECURITY DEFINER with a pinned empty search_path, like the other definer
 * functions in this database, and granted to NOBODY but the service role. It
 * takes `p_actor` from the caller, which is safe only because the caller is the
 * service role: `content_pages` has no write policy, so `authenticated` cannot
 * reach this by any path, and it must never be granted to them - a definer
 * function that takes a uid as an argument attributes the edit to whoever the
 * caller names.
 */
CREATE OR REPLACE FUNCTION public.save_content_page(
  p_slug            text,
  p_title           text,
  p_body_kind       text,
  p_body            text,
  p_faq_entries     jsonb,
  p_seo_title       text,
  p_seo_description text,
  p_og_image_url    text,
  p_status          text,
  p_actor           uuid,
  p_note            text
)
RETURNS TABLE (page_id uuid, revision integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_id       uuid;
  v_revision integer;
BEGIN
  SELECT id INTO v_id
  FROM public.content_pages
  WHERE slug = p_slug
  FOR UPDATE;

  IF v_id IS NULL THEN
    INSERT INTO public.content_pages (
      slug, title, body_kind, body, faq_entries,
      seo_title, seo_description, og_image_url,
      status, published_at, created_by, updated_by
    )
    VALUES (
      p_slug, p_title, p_body_kind, coalesce(p_body, ''), coalesce(p_faq_entries, '[]'::jsonb),
      p_seo_title, p_seo_description, p_og_image_url,
      p_status,
      CASE WHEN p_status = 'published' THEN now() ELSE NULL END,
      p_actor, p_actor
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.content_pages SET
      title           = p_title,
      body_kind       = p_body_kind,
      body            = coalesce(p_body, ''),
      faq_entries     = coalesce(p_faq_entries, '[]'::jsonb),
      seo_title       = p_seo_title,
      seo_description = p_seo_description,
      og_image_url    = p_og_image_url,
      status          = p_status,
      -- Set on the first publish and never moved. `published_at` answers "since
      -- when has this been public", and resetting it on every typo fix makes it
      -- answer "when was it last edited", which `updated_at` already answers.
      published_at    = CASE
                          WHEN p_status = 'published' THEN coalesce(published_at, now())
                          ELSE published_at
                        END,
      updated_by      = p_actor
    WHERE id = v_id;
  END IF;

  SELECT coalesce(max(r.revision), 0) + 1 INTO v_revision
  FROM public.content_page_revisions r
  WHERE r.page_id = v_id;

  INSERT INTO public.content_page_revisions (
    page_id, revision, title, body_kind, body, faq_entries,
    seo_title, seo_description, og_image_url, status, note, created_by
  )
  SELECT
    c.id, v_revision, c.title, c.body_kind, c.body, c.faq_entries,
    c.seo_title, c.seo_description, c.og_image_url, c.status, p_note, p_actor
  FROM public.content_pages c
  WHERE c.id = v_id;

  RETURN QUERY SELECT v_id, v_revision;
END;
$$;

REVOKE ALL ON FUNCTION public.save_content_page(
  text, text, text, text, jsonb, text, text, text, text, uuid, text
) FROM PUBLIC, anon, authenticated;

-- =============================================================================
-- 4. rollback_content_page
-- =============================================================================

/**
 * Restore an earlier revision by writing it forward.
 *
 * NOTHING IS DELETED. The revisions after the one being restored stay exactly
 * where they are, and the restore itself is appended as a new revision with a
 * note naming the source. An undo that erases what it undid turns the history
 * from evidence into a guess, and "who changed the refund paragraph" is the
 * question this table exists to answer.
 *
 * `status` is deliberately NOT restored. Rolling back the text of a live page
 * would otherwise be able to unpublish it as a side effect, or - worse -
 * publish a page an operator had just taken down, because an old revision
 * happened to have been published. The body comes back; whether the page is
 * public stays a separate decision made by a separate button.
 */
CREATE OR REPLACE FUNCTION public.rollback_content_page(
  p_page_id  uuid,
  p_revision integer,
  p_actor    uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_source   public.content_page_revisions%ROWTYPE;
  v_revision integer;
BEGIN
  PERFORM 1 FROM public.content_pages WHERE id = p_page_id FOR UPDATE;

  SELECT * INTO v_source
  FROM public.content_page_revisions
  WHERE page_id = p_page_id AND revision = p_revision;

  IF v_source.id IS NULL THEN
    RAISE EXCEPTION 'revision % not found for page %', p_revision, p_page_id
      USING ERRCODE = 'no_data_found';
  END IF;

  UPDATE public.content_pages SET
    title           = v_source.title,
    body_kind       = v_source.body_kind,
    body            = v_source.body,
    faq_entries     = v_source.faq_entries,
    seo_title       = v_source.seo_title,
    seo_description = v_source.seo_description,
    og_image_url    = v_source.og_image_url,
    updated_by      = p_actor
  WHERE id = p_page_id;

  SELECT coalesce(max(r.revision), 0) + 1 INTO v_revision
  FROM public.content_page_revisions r
  WHERE r.page_id = p_page_id;

  INSERT INTO public.content_page_revisions (
    page_id, revision, title, body_kind, body, faq_entries,
    seo_title, seo_description, og_image_url, status, note, created_by
  )
  SELECT
    c.id, v_revision, c.title, c.body_kind, c.body, c.faq_entries,
    c.seo_title, c.seo_description, c.og_image_url, c.status,
    'שוחזר מגרסה ' || p_revision, p_actor
  FROM public.content_pages c
  WHERE c.id = p_page_id;

  RETURN v_revision;
END;
$$;

REVOKE ALL ON FUNCTION public.rollback_content_page(uuid, integer, uuid)
  FROM PUBLIC, anon, authenticated;

-- =============================================================================
-- 5. set_content_page_status
-- =============================================================================

/**
 * Publish or unpublish, as its own verb.
 *
 * Separate from `save_content_page` because publishing is a different decision
 * from editing, and because it is the one an operator reaches for when the text
 * is already right. It still appends a revision: "the page went dark on
 * Tuesday" is a fact about the page, and a status change that left no trace
 * would be the one edit the history could not explain.
 */
CREATE OR REPLACE FUNCTION public.set_content_page_status(
  p_page_id uuid,
  p_status  text,
  p_actor   uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_revision integer;
BEGIN
  IF p_status NOT IN ('draft', 'published') THEN
    RAISE EXCEPTION 'unknown status %', p_status USING ERRCODE = 'check_violation';
  END IF;

  UPDATE public.content_pages SET
    status       = p_status,
    published_at = CASE
                     WHEN p_status = 'published' THEN coalesce(published_at, now())
                     ELSE published_at
                   END,
    updated_by   = p_actor
  WHERE id = p_page_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'page % not found', p_page_id USING ERRCODE = 'no_data_found';
  END IF;

  SELECT coalesce(max(r.revision), 0) + 1 INTO v_revision
  FROM public.content_page_revisions r
  WHERE r.page_id = p_page_id;

  INSERT INTO public.content_page_revisions (
    page_id, revision, title, body_kind, body, faq_entries,
    seo_title, seo_description, og_image_url, status, note, created_by
  )
  SELECT
    c.id, v_revision, c.title, c.body_kind, c.body, c.faq_entries,
    c.seo_title, c.seo_description, c.og_image_url, c.status,
    CASE WHEN p_status = 'published' THEN 'פורסם' ELSE 'הוסר מפרסום' END,
    p_actor
  FROM public.content_pages c
  WHERE c.id = p_page_id;

  RETURN v_revision;
END;
$$;

REVOKE ALL ON FUNCTION public.set_content_page_status(uuid, text, uuid)
  FROM PUBLIC, anon, authenticated;

COMMIT;
