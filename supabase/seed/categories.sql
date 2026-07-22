-- supabase/seed/categories.sql
-- Source file: refs/ke_live_singlefile.html (main navigation menu, ul#menu-all-departments-menu-1).
-- Extraction date: 2026-07-23.
-- idempotent: safe to run multiple times; do not run automatically.
--
-- Categories are listed in the exact live menu order. sort_order starts at 1 and
-- increments by 1 to preserve that order.
--
-- Column notes (verified against supabase/migrations/005_products_schema.sql):
--   slug       text UNIQUE NOT NULL  (conflict target below, confirmed UNIQUE)
--   name_he    text NOT NULL
--   sort_order int  NOT NULL DEFAULT 0  (the ordering column is named sort_order, not display_order)
--
-- Slug note: the live hrefs (/product-category/<slug>/) carry percent encoded UTF-8.
-- The slugs below are the decoded WooCommerce term slugs (hyphen separated Hebrew),
-- for example %d7%9e%d7%a1%d7%a2%d7%93%d7%95%d7%aa... decodes to the Hebrew slug shown.
-- Two categories already ship ASCII slugs on the live site (hot-deals, kursim-express).

INSERT INTO public.categories (name_he, slug, sort_order) VALUES
  ('דילים חמים 🔥',            'hot-deals',                 1),
  ('מסעדות ובתי קפה',          'מסעדות-ובתי-קפה',           2),
  ('יופי בריאות וטיפוח',       'יופי-בריאות-וטיפוח',        3),
  ('טלפונים מחשבים ואביזרים',  'טלפונים-מחשבים-ואביזרים',   4),
  ('תינוקות וילדים',           'תינוקות-וילדים',            5),
  ('צימרים ובתי מלון',         'צימרים-מלונות-ונופש',       6),
  ('ציוד ומזון לבעלי חיים',    'ציוד-ומזון-לבעלי-חיים',     7),
  ('בעלי מקצוע',               'בעלי-מקצוע',                8),
  ('קורסים Express - בקרוב . . .', 'קורסים-express',        9)
ON CONFLICT (slug) DO NOTHING;
