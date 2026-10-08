-- 262_landing_pages.sql
--
-- Campaign landing pages (STEP 55): `/lp/<slug>` rendered from a CMS row,
-- with per-page A/B variants and the campaign parameters the page stamps on
-- its own calls to action.
--
-- MEASURED BEFORE WRITING (production, 2026-10-08, read-only through the
-- management API): `public.landing_pages` and `public.v_landing_pages_live`
-- absent (`to_regclass` NULL); `public.set_updated_at()` and
-- `public.has_role(text)` present (127 and 003 use both);
-- `public.homepage_sections` present with two policies, which is the RLS
-- shape copied below (public read, admin write, scheduled view with
-- `security_invoker`). `analytics_events` carried `page_view` and
-- `purchase` in the trailing 30 days, the two events the A/B report joins.
--
-- WHAT THIS DOES.
--
-- 1. `public.landing_pages`: one row per campaign page. `slug` is the URL
--    segment and is constrained to the shape the route accepts
--    (`src/lib/landing/slug.ts` carries the same regex; the test beside it
--    reads this file). `blocks` is the page body as a JSON array of typed
--    blocks (hero, text, benefits, products, faq, countdown, cta) and
--    `variants` is the A/B configuration: an array of `{key, weight,
--    blocks?}` where a variant without `blocks` renders the base `blocks`.
--    Both arrays are validated by `src/lib/landing/schema.ts` on every
--    write AND on every read, so a hand-edited row that fails the schema
--    renders a 404 rather than a half page; the database only holds the
--    cheap shape checks (array, not object).
--
-- 2. `status` (draft / published / archived) plus `starts_at` / `ends_at`:
--    only a published row inside its window is served to the public. As in
--    127, the window lives in the VIEW and compares against the database's
--    `now()`, so the page can be cached without reading a clock.
--
-- 3. `indexable` (default false): a campaign page is `noindex` unless an
--    editor says otherwise. Paid-traffic pages that duplicate the catalogue
--    copy are the textbook duplicate-content case, and the default protects
--    the catalogue pages that should rank.
--
-- 4. `campaign` (default NULL = the slug): the `utm_campaign` value the
--    page writes onto its own CTA links when the visitor arrived without
--    one, so the attribution cookie (`ke_attr`) and the purchase row carry
--    the campaign even when the visitor's first click lost its query.
--
-- RLS. Public read is limited to `status = 'published'` so the anon key
-- cannot enumerate drafts; the schedule window is applied by the view,
-- never by a second policy (127's reasoning). Writes are admin-role only
-- through the policy, and in practice arrive on the service role from
-- `src/server/actions/admin/landing-pages.ts` behind `requireSection
-- ('catalog', 'write')` with an audit-log row per save.
--
-- NO BACKFILL AND NO SEED. Until this is applied, `/lp/<slug>` renders the
-- authored fallback pages in `src/lib/landing/authored.ts` (today: one,
-- `welcome`) and the admin list says so; that is the designed fallback,
-- the same rule the home page follows for a database without 127.
--
-- ROLLBACK:
--   DROP VIEW IF EXISTS public.v_landing_pages_live;
--   DROP TABLE IF EXISTS public.landing_pages;

CREATE TABLE IF NOT EXISTS public.landing_pages (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug           text        NOT NULL,
  title_he       text        NOT NULL,
  description_he text,
  hypothesis_he  text,
  status         text        NOT NULL DEFAULT 'draft',
  starts_at      timestamptz,
  ends_at        timestamptz,
  indexable      boolean     NOT NULL DEFAULT false,
  campaign       text,
  blocks         jsonb       NOT NULL DEFAULT '[]'::jsonb,
  variants       jsonb       NOT NULL DEFAULT '[]'::jsonb,
  created_by     uuid        REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'landing_pages_slug_key') THEN
    ALTER TABLE public.landing_pages
      ADD CONSTRAINT landing_pages_slug_key UNIQUE (slug);
  END IF;

  -- Lower-case, digits and single dashes, at most 60 characters: the shape
  -- `isLandingSlug` accepts, so a row the route would 404 cannot be saved.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'landing_pages_slug_check') THEN
    ALTER TABLE public.landing_pages
      ADD CONSTRAINT landing_pages_slug_check
      CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) <= 60);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'landing_pages_status_check') THEN
    ALTER TABLE public.landing_pages
      ADD CONSTRAINT landing_pages_status_check
      CHECK (status IN ('draft', 'published', 'archived'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'landing_pages_window_check') THEN
    ALTER TABLE public.landing_pages
      ADD CONSTRAINT landing_pages_window_check
      CHECK (starts_at IS NULL OR ends_at IS NULL OR starts_at < ends_at);
  END IF;

  -- The body and the variants are arrays. The element shape is the
  -- application's schema (src/lib/landing/schema.ts), not a CHECK: a
  -- CHECK that walked JSON would be a second schema that drifts.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'landing_pages_blocks_array_check') THEN
    ALTER TABLE public.landing_pages
      ADD CONSTRAINT landing_pages_blocks_array_check
      CHECK (jsonb_typeof(blocks) = 'array');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'landing_pages_variants_array_check') THEN
    ALTER TABLE public.landing_pages
      ADD CONSTRAINT landing_pages_variants_array_check
      CHECK (jsonb_typeof(variants) = 'array');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'landing_pages_campaign_check') THEN
    ALTER TABLE public.landing_pages
      ADD CONSTRAINT landing_pages_campaign_check
      CHECK (campaign IS NULL OR (length(campaign) BETWEEN 1 AND 200));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS landing_pages_published_idx
  ON public.landing_pages (slug) WHERE status = 'published';

DROP TRIGGER IF EXISTS set_updated_at ON public.landing_pages;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.landing_pages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.landing_pages ENABLE ROW LEVEL SECURITY;

-- Published rows only. A draft is an editor's work in progress and must not
-- be readable through the anon key by guessing a slug; the admin preview
-- reads the base table on the service role behind a panel session.
DROP POLICY IF EXISTS "landing_pages: public read" ON public.landing_pages;
CREATE POLICY "landing_pages: public read" ON public.landing_pages
  FOR SELECT TO anon, authenticated USING (status = 'published');

DROP POLICY IF EXISTS "landing_pages: staff write" ON public.landing_pages;
CREATE POLICY "landing_pages: staff write" ON public.landing_pages
  FOR ALL TO authenticated
  USING (public.has_role('admin')) WITH CHECK (public.has_role('admin'));

-- The schedule window, evaluated against ONE clock (127's reasoning).
-- `security_invoker` keeps the policies above in force through the view.
CREATE OR REPLACE VIEW public.v_landing_pages_live
WITH (security_invoker = true) AS
  SELECT id, slug, title_he, description_he, hypothesis_he, indexable,
         campaign, blocks, variants, starts_at, ends_at, updated_at
    FROM public.landing_pages
   WHERE status = 'published'
     AND (starts_at IS NULL OR starts_at <= now())
     AND (ends_at   IS NULL OR ends_at   >= now());

COMMENT ON TABLE public.landing_pages IS
  'Campaign landing pages served at /lp/<slug>. Absent table = the authored fallback pages render; that is the designed fallback.';
COMMENT ON VIEW public.v_landing_pages_live IS
  'Published landing pages whose window is open right now. The route reads this; the admin preview reads the base table.';
