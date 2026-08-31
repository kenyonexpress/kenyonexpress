-- 127_homepage_cms.sql
--
-- ⛔ PENDING. NOT APPLIED TO PRODUCTION, by instruction.
--
-- The code that reads these tables treats their ABSENCE as the normal case and
-- falls back to the authored constants in `src/lib/hero-singlefile-data.ts`.
-- That is not a courtesy for the pending window; it is the permanent design,
-- for the same reason the invoice queue tolerates a database without 107: a
-- deployment that cannot reach a CMS table must still render a home page.
--
-- WHAT THIS REPLACES, AND WHAT IT DOES NOT. The hero slides, the side banners
-- and the ordered list of home page sections become editable. The section
-- COMPONENTS do not: `DealsOfTheDay` still decides how a deal renders, and the
-- comparison gate still measures that markup against the live template. A CMS
-- that could change markup is a CMS that can fail the gate from the admin
-- panel, with nobody running `compare.mjs`.
--
-- SCHEDULING IS A WINDOW, NOT A BOOLEAN. `starts_at`/`ends_at` are nullable on
-- both sides so "from now on", "until Sunday" and "the whole of next week" are
-- all expressible. A published flag alone means somebody has to be awake at
-- midnight to launch a campaign.
--
-- THE PREVIEW IS A QUERY PARAMETER, NOT A COLUMN. `?preview=1` on the home page
-- ignores the schedule and shows everything an editor has marked ready. A
-- `is_preview` column would be a second copy of every row that drifts from the
-- one customers see.

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END; $$;

-- ---------------------------------------------------------------------------
-- 1. The ordered list of blocks on the home page
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.homepage_sections (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Which built-in block this row configures. NOT free text: a section kind
  -- the code has no component for renders nothing, and an editor who typed it
  -- would see an empty home page with no error.
  kind        text        NOT NULL,
  title_he    text,
  subtitle_he text,
  position    integer     NOT NULL DEFAULT 0,
  is_active   boolean     NOT NULL DEFAULT true,
  starts_at   timestamptz,
  ends_at     timestamptz,
  -- Per-kind settings: which city, which category, how many products. Read
  -- defensively by the component, so an unknown key is ignored rather than
  -- crashing a page every visitor sees.
  config      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'homepage_sections_kind_check') THEN
    ALTER TABLE public.homepage_sections
      ADD CONSTRAINT homepage_sections_kind_check
      CHECK (kind IN ('hero', 'categories', 'benefits', 'deals', 'featured', 'city_deals', 'banner_row'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS homepage_sections_order_idx
  ON public.homepage_sections (position, id) WHERE is_active;

DROP TRIGGER IF EXISTS set_updated_at ON public.homepage_sections;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.homepage_sections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.homepage_sections ENABLE ROW LEVEL SECURITY;

-- Public read, because it is rendered to every visitor including logged-out
-- ones. The schedule is NOT enforced here: a policy that filtered on `now()`
-- would make the preview impossible to build without a second, wider policy,
-- and two policies over one table is how the wider one gets used by accident.
-- The window is applied in the query.
DROP POLICY IF EXISTS "homepage_sections: public read" ON public.homepage_sections;
CREATE POLICY "homepage_sections: public read" ON public.homepage_sections
  FOR SELECT TO anon, authenticated USING (is_active);

DROP POLICY IF EXISTS "homepage_sections: staff write" ON public.homepage_sections;
CREATE POLICY "homepage_sections: staff write" ON public.homepage_sections
  FOR ALL TO authenticated
  USING (public.has_role('admin')) WITH CHECK (public.has_role('admin'));

-- ---------------------------------------------------------------------------
-- 2. Hero slides and promotional banners
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.banners (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 'hero' is a carousel slide; 'side' is one of the two stacked promos beside
  -- it; 'strip' is a full-width row. Same reason as `kind` above: a closed set,
  -- because the renderer is a switch.
  placement   text        NOT NULL,
  title_he    text,
  subtitle_he text,
  -- R2 or Supabase Storage. Uploaded through the existing image pipeline, which
  -- is why there is no width/height here: `media_assets` already holds them.
  image_url   text        NOT NULL,
  -- Hebrew alt text, required for the same reason 049 made it required on
  -- media_assets: a decorative-looking hero image is the largest thing on the
  -- page and a screen reader gets nothing from an empty alt.
  alt_he      text        NOT NULL,
  link_url    text,
  cta_label_he text,
  position    integer     NOT NULL DEFAULT 0,
  is_active   boolean     NOT NULL DEFAULT true,
  starts_at   timestamptz,
  ends_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'banners_placement_check') THEN
    ALTER TABLE public.banners
      ADD CONSTRAINT banners_placement_check
      CHECK (placement IN ('hero', 'side', 'strip'));
  END IF;

  -- A link that leaves the site from our own hero is an open redirect surface
  -- wearing a marketing hat, and the whole point of these is that they look
  -- like the site's own words.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'banners_link_internal_check') THEN
    ALTER TABLE public.banners
      ADD CONSTRAINT banners_link_internal_check
      CHECK (link_url IS NULL OR (link_url LIKE '/%' AND link_url NOT LIKE '//%'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS banners_placement_order_idx
  ON public.banners (placement, position, id) WHERE is_active;

DROP TRIGGER IF EXISTS set_updated_at ON public.banners;
CREATE TRIGGER set_updated_at
  BEFORE UPDATE ON public.banners
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.banners ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "banners: public read" ON public.banners;
CREATE POLICY "banners: public read" ON public.banners
  FOR SELECT TO anon, authenticated USING (is_active);

DROP POLICY IF EXISTS "banners: staff write" ON public.banners;
CREATE POLICY "banners: staff write" ON public.banners
  FOR ALL TO authenticated
  USING (public.has_role('admin')) WITH CHECK (public.has_role('admin'));

COMMENT ON TABLE public.banners IS
  'Hero slides and promos. Absent table = the authored constants render instead; that is the designed fallback.';

-- ---------------------------------------------------------------------------
-- 3. The scheduled views, which is where the clock lives
-- ---------------------------------------------------------------------------
--
-- ⚠️ THE WINDOW IS APPLIED HERE AND NOT IN THE APPLICATION, and that is a
-- correctness fix rather than a tidiness one.
--
-- The first version computed `new Date().toISOString()` in the page and passed
-- it as a filter. `next build` refused it outright: under `cacheComponents`,
-- reading the current time in a statically prerendered Server Component is an
-- error ("used `new Date()` before accessing either uncached data or Request
-- data"). The home page would have had to become dynamic to keep a schedule,
-- and the hero is the LCP element.
--
-- Pushing the comparison into a view fixes both halves at once. The page reads
-- a plain table with no time in it and stays static, and the schedule is
-- evaluated against ONE clock - the database's - instead of against whichever
-- server rendered the page. Two app servers a second apart could otherwise
-- disagree about whether a campaign had started.
--
-- `security_invoker` so the RLS policies above still decide who sees what. A
-- view without it runs as its owner and would hand every row to anonymous.

CREATE OR REPLACE VIEW public.v_homepage_sections_live
WITH (security_invoker = true) AS
  SELECT id, kind, title_he, subtitle_he, position, config
    FROM public.homepage_sections
   WHERE is_active
     AND (starts_at IS NULL OR starts_at <= now())
     AND (ends_at   IS NULL OR ends_at   >= now());

CREATE OR REPLACE VIEW public.v_banners_live
WITH (security_invoker = true) AS
  SELECT id, placement, title_he, subtitle_he, image_url, alt_he,
         link_url, cta_label_he, position
    FROM public.banners
   WHERE is_active
     AND (starts_at IS NULL OR starts_at <= now())
     AND (ends_at   IS NULL OR ends_at   >= now());

COMMENT ON VIEW public.v_banners_live IS
  'Banners whose schedule window is open right now. The page reads this; the admin preview reads the base table.';
