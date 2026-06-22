-- 018_seed_categories.sql
-- Align public.categories with the canonical slugs in KE_LIVE_SPEC.md.
-- Strategy B: remap existing rows in place (no duplicates), then insert only
-- the spec categories that have no existing row.
-- Idempotent: each UPDATE matches the legacy slug (a no-op on re-run); the
-- INSERT uses ON CONFLICT (slug) DO NOTHING.

-- 1. Remap existing categories to canonical slugs + canonical sort order.
UPDATE public.categories SET slug = 'hot-deals',        sort_order = 1 WHERE slug = 'dyl-chm';
UPDATE public.categories SET slug = 'under-99',         sort_order = 2 WHERE slug = 'ad-99';
UPDATE public.categories SET slug = 'new',              sort_order = 3 WHERE slug = 'new-deals';
UPDATE public.categories SET slug = 'restaurants-cafes', sort_order = 4 WHERE slug = 'restaurant-coffee';
UPDATE public.categories SET slug = 'beauty-health',    sort_order = 5 WHERE slug = 'typvch-bryavt-vyvpy';
UPDATE public.categories SET slug = 'phones-computers', sort_order = 6 WHERE slug = 'phones-electronics';

-- 2. Insert spec categories that do not exist yet (not duplicates).
--    'electronics' is left untouched: it has no canonical equivalent in the spec.
INSERT INTO public.categories (slug, name_he, name_en, sort_order, is_active)
VALUES
  ('baby-kids',     'תינוקות וילדים',      'Baby & Kids',    7,  true),
  ('vacation',      'צימרים מלונות ונופש', 'Vacation',       8,  true),
  ('pets',          'ציוד ומזון לבעלי חיים', 'Pets',         9,  true),
  ('professionals', 'בעלי מקצוע',          'Professionals',  10, true),
  ('courses',       'קורסים Express בקרוב', 'Courses',       11, true)
ON CONFLICT (slug) DO NOTHING;
