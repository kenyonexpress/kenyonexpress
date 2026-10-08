-- 267_category_banners.sql
--
-- Category landing banners (STEP 62): a hero banner at the top of
-- /category/[slug], composed in the admin, switched on by a schedule, and
-- counted. Two tables and one function.
--
-- WHAT A BANNER IS HERE
--
-- A row names one category, a Hebrew headline, an optional second line, an
-- image with mandatory Hebrew alt text, an optional call to action (label
-- plus an INTERNAL path), a theme (dark text over a light image or the
-- reverse), a window and a priority. The window is open on both ends:
-- `starts_at` null means "from the moment it is saved", `ends_at` null means
-- "until switched off". A category may hold several banners; the storefront
-- shows ONE, the live banner with the highest priority, and between equals
-- the one that started most recently. The selection is made in the
-- application at request time (`src/lib/category-banners/rules.ts`), on a
-- cached read of the category's active rows, so a banner scheduled for
-- 09:00 appears on the first request after 09:00 and not when a cache entry
-- happens to expire.
--
-- CLICKS AND IMPRESSIONS ARE AGGREGATE COUNTERS, NOT EVENTS. The analytics
-- registry (`fn_ingest_analytics_events`) filters on a name whitelist that is
-- an APPLIED migration, so a new event name there means re-applying a
-- function on production. This step does not need that: what the CMS shows
-- is "how many saw it, how many clicked, what rate", per banner per day, and
-- `category_banner_stats` holds exactly that. No visitor identifier, no IP,
-- no session: a row is (banner, day, two integers). That is also why it
-- needs no consent gate, unlike the PostHog mirror the client fires behind
-- the ordinary tracking cookie.
--
-- WHO MAY READ AND WRITE
--
--   * The storefront reads ACTIVE banners through the anon key. A banner an
--     admin is still composing (`is_active = false`) cannot be enumerated.
--   * Nobody reads the stats through a client role. The admin list reads
--     them on the service role behind `requireSection('catalog', 'read')`.
--   * The only writer of a stat is `record_category_banner_event`, a
--     SECURITY DEFINER function granted to the service role ONLY. The route
--     `POST /api/category-banners/[id]/events` rate-limits the caller and
--     then calls it on the admin client. Granting it to anon would make the
--     counter inflatable by anybody with the project URL, which is
--     everybody.
--   * Composition is the service role from
--     `src/server/actions/admin/category-banners.ts` behind
--     `requireSection('catalog', 'write')` with an audit row. A banner is
--     catalogue copy and moves no money, so the content role may author one,
--     the same way it authors a landing page (262). The `has_role('admin')`
--     policy is the belt 262, 265 and 266 wear for a direct admin session.
--
-- PRECONDITIONS: `public.categories`, `public.set_updated_at()` and
-- `public.has_role(text)` (all live, measured by 262 on 2026-10-08). No
-- dependency on any other pending file.
--
-- ROLLBACK:
--   DROP FUNCTION IF EXISTS public.record_category_banner_event(uuid, text);
--   DROP TABLE IF EXISTS public.category_banner_stats;
--   DROP TABLE IF EXISTS public.category_banners;
--   -- No pre-existing object is touched.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. The banners
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.category_banners (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id   uuid        NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  title_he      text        NOT NULL,
  subtitle_he   text,
  image_url     text        NOT NULL,
  image_alt_he  text        NOT NULL,
  -- Both or neither: a label with nowhere to go, or a path with no label,
  -- is a button the shopper cannot read or cannot press.
  cta_label_he  text,
  cta_href      text,
  -- Text colour over the image. 'dark' is dark text (a light image),
  -- 'light' is white text (a dark image or the gradient the component adds).
  theme         text        NOT NULL DEFAULT 'light',
  starts_at     timestamptz,
  ends_at       timestamptz,
  priority      integer     NOT NULL DEFAULT 0,
  is_active     boolean     NOT NULL DEFAULT true,
  created_by    uuid        REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'category_banners_title_check') THEN
    ALTER TABLE public.category_banners
      ADD CONSTRAINT category_banners_title_check
      CHECK (length(btrim(title_he)) BETWEEN 2 AND 120);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'category_banners_subtitle_check') THEN
    ALTER TABLE public.category_banners
      ADD CONSTRAINT category_banners_subtitle_check
      CHECK (subtitle_he IS NULL OR length(subtitle_he) <= 240);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'category_banners_alt_check') THEN
    ALTER TABLE public.category_banners
      ADD CONSTRAINT category_banners_alt_check
      CHECK (length(btrim(image_alt_he)) BETWEEN 2 AND 200);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'category_banners_cta_pair_check') THEN
    ALTER TABLE public.category_banners
      ADD CONSTRAINT category_banners_cta_pair_check
      CHECK ((cta_label_he IS NULL) = (cta_href IS NULL));
  END IF;
  -- Internal paths only. A banner that could point off-site is an open
  -- redirect with a picture on it.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'category_banners_cta_href_check') THEN
    ALTER TABLE public.category_banners
      ADD CONSTRAINT category_banners_cta_href_check
      CHECK (cta_href IS NULL OR (cta_href ~ '^/' AND cta_href !~ '^//' AND length(cta_href) <= 500));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'category_banners_theme_check') THEN
    ALTER TABLE public.category_banners
      ADD CONSTRAINT category_banners_theme_check
      CHECK (theme IN ('light', 'dark'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'category_banners_window_check') THEN
    ALTER TABLE public.category_banners
      ADD CONSTRAINT category_banners_window_check
      CHECK (starts_at IS NULL OR ends_at IS NULL OR starts_at < ends_at);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'category_banners_priority_check') THEN
    ALTER TABLE public.category_banners
      ADD CONSTRAINT category_banners_priority_check
      CHECK (priority BETWEEN -1000 AND 1000);
  END IF;
END $$;

-- The storefront's read: one category's active rows.
CREATE INDEX IF NOT EXISTS category_banners_category_active_idx
  ON public.category_banners (category_id, priority DESC, starts_at DESC)
  WHERE is_active;

DROP TRIGGER IF EXISTS category_banners_set_updated_at ON public.category_banners;
CREATE TRIGGER category_banners_set_updated_at
  BEFORE UPDATE ON public.category_banners
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. The counters
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.category_banner_stats (
  banner_id    uuid    NOT NULL REFERENCES public.category_banners(id) ON DELETE CASCADE,
  day          date    NOT NULL,
  impressions  integer NOT NULL DEFAULT 0,
  clicks       integer NOT NULL DEFAULT 0,
  PRIMARY KEY (banner_id, day)
);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'category_banner_stats_nonneg_check') THEN
    ALTER TABLE public.category_banner_stats
      ADD CONSTRAINT category_banner_stats_nonneg_check
      CHECK (impressions >= 0 AND clicks >= 0);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. The one write
-- ---------------------------------------------------------------------------

-- Adds one impression or one click to today's row for an ACTIVE banner.
-- Returns true when counted; false for an unknown kind, an unknown banner or
-- a switched-off one, so the route can answer 204 either way without a
-- probe telling the two apart. `now()` is UTC on the server, and the day
-- boundary is the server's; the CMS shows totals over a window, where a
-- two-hour shift at midnight does not matter.
CREATE OR REPLACE FUNCTION public.record_category_banner_event(p_banner uuid, p_kind text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_exists boolean;
BEGIN
  IF p_kind NOT IN ('impression', 'click') THEN
    RETURN false;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.category_banners b WHERE b.id = p_banner AND b.is_active
  ) INTO v_exists;
  IF NOT v_exists THEN
    RETURN false;
  END IF;

  INSERT INTO public.category_banner_stats (banner_id, day, impressions, clicks)
  VALUES (
    p_banner,
    (now() AT TIME ZONE 'utc')::date,
    CASE WHEN p_kind = 'impression' THEN 1 ELSE 0 END,
    CASE WHEN p_kind = 'click' THEN 1 ELSE 0 END
  )
  ON CONFLICT (banner_id, day) DO UPDATE
    SET impressions = public.category_banner_stats.impressions + EXCLUDED.impressions,
        clicks      = public.category_banner_stats.clicks + EXCLUDED.clicks;

  RETURN true;
END;
$function$;

REVOKE ALL ON FUNCTION public.record_category_banner_event(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_category_banner_event(uuid, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 4. RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.category_banners      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.category_banner_stats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "category_banners: public read active" ON public.category_banners;
CREATE POLICY "category_banners: public read active" ON public.category_banners
  FOR SELECT TO anon, authenticated USING (is_active);

DROP POLICY IF EXISTS "category_banners: staff write" ON public.category_banners;
CREATE POLICY "category_banners: staff write" ON public.category_banners
  FOR ALL TO authenticated
  USING (public.has_role('admin')) WITH CHECK (public.has_role('admin'));

-- The stats carry no policy at all: RLS on, zero policies, which denies
-- every client role. The service role bypasses RLS and is the only reader.

-- 144's rule: client roles get SELECT and nothing else on a new table.
REVOKE ALL ON public.category_banners      FROM anon, authenticated;
REVOKE ALL ON public.category_banner_stats FROM anon, authenticated;
GRANT SELECT ON public.category_banners TO anon, authenticated;
-- The staff-write policy above needs the DML grant to mean anything for a
-- direct admin session. Service-role writes bypass both.
GRANT INSERT, UPDATE, DELETE ON public.category_banners TO authenticated;

COMMENT ON TABLE public.category_banners IS
  'Hero banners at the top of /category/[slug], scheduled and prioritised (STEP 62). Absent table = no banners.';
COMMENT ON TABLE public.category_banner_stats IS
  'Per-banner, per-day impression and click counters (STEP 62). Written only by record_category_banner_event on the service role; no client role reads it.';
COMMENT ON FUNCTION public.record_category_banner_event(uuid, text) IS
  'Adds one impression or click to today''s counters for an active banner. Service role only; the API route rate-limits the caller.';

-- ---------------------------------------------------------------------------
-- 5. Self-check, rolled back
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_category uuid;
  v_banner   uuid;
  v_clicks   integer;
  v_imps     integer;
  v_ok       boolean;
BEGIN
  SELECT id INTO v_category FROM public.categories LIMIT 1;
  IF v_category IS NULL THEN
    RAISE NOTICE 'category_banners: self-check skipped, no category to rehearse with';
    RETURN;
  END IF;

  INSERT INTO public.category_banners (category_id, title_he, image_url, image_alt_he, cta_label_he, cta_href)
  VALUES (v_category, 'בדיקה', 'https://example.invalid/x.webp', 'תמונת בדיקה', 'לכל המבצעים', '/products')
  RETURNING id INTO v_banner;

  -- Two impressions and a click land on one row.
  PERFORM public.record_category_banner_event(v_banner, 'impression');
  PERFORM public.record_category_banner_event(v_banner, 'impression');
  PERFORM public.record_category_banner_event(v_banner, 'click');
  SELECT impressions, clicks INTO v_imps, v_clicks FROM public.category_banner_stats WHERE banner_id = v_banner;
  IF v_imps <> 2 OR v_clicks <> 1 THEN
    RAISE EXCEPTION 'category_banners: self-check failed, counters % / % (expected 2 / 1)', v_imps, v_clicks;
  END IF;

  -- An unknown kind and a switched-off banner are refused quietly.
  SELECT public.record_category_banner_event(v_banner, 'hover') INTO v_ok;
  IF v_ok THEN RAISE EXCEPTION 'category_banners: self-check failed, unknown kind was counted'; END IF;
  UPDATE public.category_banners SET is_active = false WHERE id = v_banner;
  SELECT public.record_category_banner_event(v_banner, 'click') INTO v_ok;
  IF v_ok THEN RAISE EXCEPTION 'category_banners: self-check failed, inactive banner was counted'; END IF;

  -- A label without a path is refused by the pair CHECK.
  BEGIN
    INSERT INTO public.category_banners (category_id, title_he, image_url, image_alt_he, cta_label_he)
    VALUES (v_category, 'בדיקה שנייה', 'https://example.invalid/y.webp', 'תמונת בדיקה', 'לחצו');
    RAISE EXCEPTION 'category_banners: self-check failed, a CTA label with no path was accepted';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  -- An external CTA is refused.
  BEGIN
    INSERT INTO public.category_banners (category_id, title_he, image_url, image_alt_he, cta_label_he, cta_href)
    VALUES (v_category, 'בדיקה שלישית', 'https://example.invalid/z.webp', 'תמונת בדיקה', 'לחצו', 'https://evil.example');
    RAISE EXCEPTION 'category_banners: self-check failed, an external CTA was accepted';
  EXCEPTION WHEN check_violation THEN
    NULL;
  END;

  RAISE EXCEPTION 'category_banners: self-check passed, rolling the rehearsal back';
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM LIKE 'category_banners: self-check passed%' THEN
      RAISE NOTICE '%', SQLERRM;
    ELSE
      RAISE;
    END IF;
END $$;

COMMIT;

-- NOT APPLIED. Written 2026-10-08 (STEP 62). Apply through the dashboard
-- after review; the application tolerates the absent tables (42P01 / PGRST205
-- reads as "no banner") until then: the category page renders exactly as
-- before, the admin list says the migration is pending, and the event route
-- answers 204 without writing. No pre-existing object is touched.
