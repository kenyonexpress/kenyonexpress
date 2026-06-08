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

-- Seed: 3 initial slides using the existing local hero image paths.
INSERT INTO public.hero_slides (title, subtitle, image_url, link_url, sort_order, is_active) VALUES
  ('ברוכים הבאים לקניון Express', 'מסדרים לך בילוי. . .', '/images/hero/slide-1.jpg', '/products', 1, true),
  ('הדילים החמים של השבוע', 'מבצעים שלא תרצו לפספס', '/images/hero/slide-2.jpg', '/products', 2, true),
  ('אלקטרוניקה במחירים הכי טובים', 'גאדג׳טים, מחשבים ועוד', '/images/hero/slide-3.jpg', '/category/electronics', 3, true);
