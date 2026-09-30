-- 243_homepage_hero_seed.sql
--
-- Five hero slides for the CMS hero (127), one per authored slide position.
--
-- INSERTED INACTIVE, AND THAT IS THE POINT OF THIS FILE. The build that reads
-- these rows (`src/lib/homepage/cms.ts`, 2026-09-30) lets a row inherit the
-- composition of the authored slide at its position - the welcome slide stays
-- the welcome slide, the app slide stays the app slide - and only the title,
-- the tagline, the photograph and the link come from the row. The build that
-- production runs today forces every row to the plain product composition.
-- Activating these rows before that build is deployed would repaint the LCP
-- element of the live home page for every visitor, with no deploy path open
-- to fix it (docs/RUNBOOK.md, Vercel preflight). So the rows exist, are
-- readable in the admin preview (which reads the base table), and are invisible
-- to `v_banners_live` until the one statement at the bottom is run AFTER the
-- deploy.
--
-- Idempotent: fixed ids, and a re-run refreshes the content without touching
-- `is_active`, so re-applying never activates or deactivates anything.
--
-- Photographs are this catalogue's own product images (live's content, per
-- docs/SOURCING-RULES.md rule 2), one per slide theme. Links are internal, as
-- `banners_link_internal_check` requires.
--
-- Rollback:
--   DELETE FROM public.banners WHERE id IN (
--     'c3a7d2b4-0001-4e11-8a5f-4b9d0c1e2f01', 'c3a7d2b4-0002-4e11-8a5f-4b9d0c1e2f02',
--     'c3a7d2b4-0003-4e11-8a5f-4b9d0c1e2f03', 'c3a7d2b4-0004-4e11-8a5f-4b9d0c1e2f04',
--     'c3a7d2b4-0005-4e11-8a5f-4b9d0c1e2f05');

INSERT INTO public.banners
  (id, placement, title_he, subtitle_he, image_url, alt_he, link_url, cta_label_he, position, is_active)
VALUES
  ('c3a7d2b4-0001-4e11-8a5f-4b9d0c1e2f01', 'hero', 'ברוכים הבאים', 'מסדרים לך בילוי . . .',
   '/images/products/rm5-600x600.webp', 'ארוחה בשרית זוגית במסעדה', '/products', 'לכל המוצרים', 0, false),
  ('c3a7d2b4-0002-4e11-8a5f-4b9d0c1e2f02', 'hero', 'חוויות', NULL,
   '/images/products/facial-small-600x600.webp', 'טיפול פנים בקליניקה', '/category/beauty-health', 'לטיפוח ויופי', 1, false),
  ('c3a7d2b4-0003-4e11-8a5f-4b9d0c1e2f03', 'hero', 'ממשק', NULL,
   '/images/products/maldives1-600x440.webp', 'חוף במלדיבים', '/category/vacation', 'לנופש', 2, false),
  ('c3a7d2b4-0004-4e11-8a5f-4b9d0c1e2f04', 'hero', 'תצוגה', NULL,
   '/images/products/e-baby-d2.webp', 'מארז מפנק לתינוק', '/category/baby-kids', 'לתינוקות וילדים', 3, false),
  ('c3a7d2b4-0005-4e11-8a5f-4b9d0c1e2f05', 'hero', 'האפליקציה', NULL,
   '/images/products/galaxy-s22_highlights_kv_img-600x600.webp', 'סמסונג גלקסי S22', '/category/phones-computers', 'לטלפונים ואלקטרוניקה', 4, false)
ON CONFLICT (id) DO UPDATE SET
  placement    = EXCLUDED.placement,
  title_he     = EXCLUDED.title_he,
  subtitle_he  = EXCLUDED.subtitle_he,
  image_url    = EXCLUDED.image_url,
  alt_he       = EXCLUDED.alt_he,
  link_url     = EXCLUDED.link_url,
  cta_label_he = EXCLUDED.cta_label_he,
  position     = EXCLUDED.position;

-- Proof the five rows are there and none is live.
DO $$
DECLARE
  n_rows integer;
  n_live integer;
BEGIN
  SELECT count(*) INTO n_rows FROM public.banners WHERE id::text LIKE 'c3a7d2b4-000_-4e11-8a5f-4b9d0c1e2f0_';
  SELECT count(*) INTO n_live FROM public.v_banners_live WHERE id::text LIKE 'c3a7d2b4-000_-4e11-8a5f-4b9d0c1e2f0_';
  IF n_rows <> 5 THEN RAISE EXCEPTION '243: expected 5 seeded hero rows, found %', n_rows; END IF;
  IF n_live <> 0 THEN RAISE EXCEPTION '243: seeded rows must not be live yet, % are', n_live; END IF;
END $$;

-- ACTIVATION, run by hand AFTER the build carrying the inheriting mapping is
-- deployed (never inside this file):
--   UPDATE public.banners SET is_active = true
--    WHERE id::text LIKE 'c3a7d2b4-000_-4e11-8a5f-4b9d0c1e2f0_';
