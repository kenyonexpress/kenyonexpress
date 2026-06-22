-- Migration 017: hero_slides for the homepage HeroSlider carousel
-- Public read of active slides only; writes via service role (admin).

-- Recreate cleanly on every run (idempotent like 005). Dropping first also keeps
-- the seed below duplicate-free when the migration is re-applied.
DROP TABLE IF EXISTS public.hero_slides CASCADE;

CREATE TABLE IF NOT EXISTS public.hero_slides (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title      text,
  subtitle   text,
  image_url  text,
  link_url   text,
  sort_order int NOT NULL DEFAULT 0,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hero_slides_active_sort_idx
  ON public.hero_slides (is_active, sort_order);

-- RLS: public SELECT restricted to active rows; no public writes.
ALTER TABLE public.hero_slides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "hero_slides public read active" ON public.hero_slides;
CREATE POLICY "hero_slides public read active"
  ON public.hero_slides
  FOR SELECT
  TO anon, authenticated
  USING (is_active = true);

-- Seed: 5 slides — refs/ke_live_home.html RevSlider rs-18 … rs-19
INSERT INTO public.hero_slides (title, subtitle, image_url, link_url, sort_order, is_active) VALUES
  ('ברוכים הבאים', 'מסדרים לך בילוי. . .', '/images/hero/slider/ios13-iphone-11pro-airpods-pro-setup-animation-steps.gif', '/products', 1, true),
  ('PREMIUM PRODUCT', NULL, '/images/hero/slider/redPhone-1-1.png', '/products', 2, true),
  ('ממשק מהיר ונוח', NULL, '/images/hero/slider/Smartwatches1.png', '/products', 3, true),
  ('תצוגה מושלמת', NULL, '/images/hero/slider/iapdlap.png', '/products', 4, true),
  ('האפליקציה בקרוב', NULL, '/images/hero/slider/Screen-Shot-2021-11-09-at-6.41.46.png', '/products', 5, true);
