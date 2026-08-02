-- PENDING: NOT APPLIED. Do not run automatically.
-- Seed fix: 8 products that exist on the live kenyonexpress.co.il homepage
-- grid (extracted from refs/ke_live_singlefile.html via
-- scripts/sync-live-products.mjs) but are missing from public.products.
-- Slugs, names and prices mirror the live site verbatim, including live's
-- own mismatched slug for "פינוק גלידה" (צימר-מאסטר-copy-copy).
-- Idempotent: every insert is guarded by ON CONFLICT (slug) DO NOTHING.

BEGIN;

WITH cat AS (
  SELECT slug, id FROM public.categories
)
INSERT INTO public.products
  (category_id, type, status, slug, name_he, kenyon_price, full_price,
   price_ils, stock_quantity, images)
VALUES
  (
    (SELECT id FROM cat WHERE slug = 'professionals'),
    'coupon', 'active',
    'עוזרת-אישית-שירותי-משרד',
    'עוזרת אישית - שירותי משרד',
    949, 1500, 949, 1,
    '["/images/products/ke-live-deal-0.avif"]'::jsonb
  ),
  (
    (SELECT id FROM cat WHERE slug = 'beauty-health'),
    'coupon', 'active',
    'תספורת-לגבר-ילד-או-סידור-זקן-בפתח-תקווה',
    'תספורת לגבר, ילד, סידור זקן בפתח תקווה',
    20, 50, 20, 1,
    '["/images/products/ke-live-deal-1.avif"]'::jsonb
  ),
  (
    (SELECT id FROM cat WHERE slug = 'beauty-health'),
    'coupon', 'active',
    'קופון-טסט',
    'קופון טסט',
    9, NULL, 9, 1,
    '["/images/products/ke-live-deal-4.avif"]'::jsonb
  ),
  (
    NULL,
    'physical', 'active',
    'reverse-withdrawal-payment',
    'Reverse Withdrawal Payment',
    0, NULL, 0, 1,
    '[]'::jsonb
  ),
  (
    (SELECT id FROM cat WHERE slug = 'restaurants-cafes'),
    'coupon', 'active',
    'צימר-מאסטר-copy-copy',
    'פינוק גלידה',
    9, NULL, 9, 1,
    '["/images/products/ke-live-deal-7.avif"]'::jsonb
  ),
  (
    NULL, -- live category "כללי" has no matching row in public.categories
    'coupon', 'active',
    'מלון-5-כוכבים-בטבריה',
    'מלון 5 כוכבים בטבריה',
    480, NULL, 480, 1,
    '["/images/products/ke-live-deal-26.avif"]'::jsonb
  ),
  (
    NULL, -- live category "כללי" has no matching row in public.categories
    'coupon', 'active',
    'מלון-4-כוכבים-פלוס-ארוחת-בוקר',
    'מלון 4 כוכבים- פלוס ארוחת בוקר',
    300, 350, 300, 1,
    '["/images/products/ke-live-deal-29.avif"]'::jsonb
  ),
  (
    NULL, -- live category "כללי" has no matching row in public.categories
    'coupon', 'active',
    'ארוחת-בוקר-זוגית-בקפה-קפה',
    'ארוחת בוקר זוגית בקפה קפה',
    90, 110, 90, 1,
    '["/images/products/ke-live-deal-31.avif"]'::jsonb
  )
ON CONFLICT (slug) DO NOTHING;

COMMIT;
