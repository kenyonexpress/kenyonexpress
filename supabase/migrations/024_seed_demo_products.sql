-- 024: Demo products seed (Hebrew, themed to seeded categories, with city)
-- Idempotent: guarded by slug.
--
-- Fills the homepage DealsOfTheDay and Featured Products sections. Each product
-- carries a city in attributes->>'city' (תל אביב / חיפה / ירושלים / הרצליה /
-- רמת גן / באר שבע / נתניה). supplier_id is left NULL (it references suppliers,
-- which is not seeded). category_id is matched to the existing seeded categories.

INSERT INTO public.products (
  slug, name_he, type, status, price_ils, full_price, kenyon_price,
  stock_quantity, category_id, attributes, images, published_at
)
SELECT
  v.slug,
  v.name_he,
  'physical'::public.product_type,
  'active'::public.product_status,
  v.full_price,
  v.full_price,
  v.kenyon_price,
  v.stock,
  (SELECT id FROM public.categories WHERE slug = v.cat_slug),
  jsonb_build_object('city', v.city),
  '[]'::jsonb,
  now()
FROM (VALUES
  ('demo-prod-01', 'חופשה זוגית במלון 5 כוכבים',      1900::numeric, 1290::numeric, 14, 'vacation',      'תל אביב'),
  ('demo-prod-02', 'סופ"ש מפנק בצימר בגליל',          1400::numeric,  990::numeric,  9, 'vacation',      'חיפה'),
  ('demo-prod-03', 'חבילת ספא ולינה זוגית',           1200::numeric,  850::numeric,  0, 'vacation',      'ירושלים'),
  ('demo-prod-04', 'מארז מתנה מפנק לתינוק',            320::numeric,  219::numeric, 25, 'baby-kids',     'הרצליה'),
  ('demo-prod-05', 'עגלת תינוק פרימיום',              2400::numeric, 1790::numeric,  7, 'baby-kids',     'רמת גן'),
  ('demo-prod-06', 'סט בגדי תינוק אורגני',             260::numeric,  179::numeric, 40, 'baby-kids',     'באר שבע'),
  ('demo-prod-07', 'מזון פרימיום לכלבים 15 קג',        380::numeric,  279::numeric, 33, 'pets',          'נתניה'),
  ('demo-prod-08', 'מתחם גירוד מפואר לחתולים',         450::numeric,  299::numeric, 12, 'pets',          'תל אביב'),
  ('demo-prod-09', 'חבילת צילום אירועים מקצועית',     3500::numeric, 2490::numeric,  5, 'professionals', 'חיפה'),
  ('demo-prod-10', 'עיצוב גרפי ללוגו ומיתוג',         1500::numeric,  990::numeric,  0, 'professionals', 'ירושלים'),
  ('demo-prod-11', 'ייעוץ משכנתאות אישי',             1200::numeric,  790::numeric, 18, 'professionals', 'הרצליה'),
  ('demo-prod-12', 'קורס בישול איטלקי',                890::numeric,  590::numeric, 22, 'courses',       'רמת גן'),
  ('demo-prod-13', 'סדנת צילום מקצועית',               750::numeric,  490::numeric, 16, 'courses',       'באר שבע'),
  ('demo-prod-14', 'קורס אנגלית למתחילים',             990::numeric,  649::numeric, 30, 'courses',       'נתניה')
) AS v(slug, name_he, full_price, kenyon_price, stock, cat_slug, city)
WHERE NOT EXISTS (
  SELECT 1 FROM public.products p WHERE p.slug = v.slug
);
