-- 241_seed_product_city_from_title.sql
--
-- Q03 (2026-09-25): the home page deal card carries a meta line with the
-- product's city (`products.city`, else `suppliers.city`). Measured against
-- production on 2026-09-25 with the anon key: 46 active rows, `products.city`
-- is NULL on every one, and no active product belongs to a supplier whose
-- `city` is set (the five suppliers with a city have no active product). So
-- the meta line renders nothing until somebody sets a city.
--
-- THIS FILE SETS A CITY ONLY WHERE THE PRODUCT'S OWN TITLE NAMES ONE. Three
-- rows do: the barbershop says Petah Tikva, the spa suite says Tel Aviv, the
-- hotel says Tiberias. Nothing is guessed from a category, a supplier or a
-- picture; the operator owns the field from the admin form (Q05) and this is
-- data, not schema.
--
-- GUARDED. Each UPDATE matches on the slug AND on `city IS NULL`, so a value
-- an operator has set since is never overwritten, and re-applying is a no-op.
-- The spellings are the ones `src/lib/geo/cities.ts` knows, so the card prints
-- them canonically and the category page can sort by them.
--
-- NOT APPLIED. `migrations/pending/` files wait for explicit approval.
--
-- Reversal:
--   UPDATE public.products SET city = NULL WHERE slug IN (
--     'תספורת-לגבר-ילד-או-סידור-זקן-בפתח-תקווה',
--     'חבילות-עיסוי-זוגיות-בסוויטה-ספא-בוטיק',
--     'מלון-5-כוכבים-בטבריה');

BEGIN;

UPDATE public.products
   SET city = 'פתח תקווה'
 WHERE slug = 'תספורת-לגבר-ילד-או-סידור-זקן-בפתח-תקווה'
   AND city IS NULL;

UPDATE public.products
   SET city = 'תל אביב'
 WHERE slug = 'חבילות-עיסוי-זוגיות-בסוויטה-ספא-בוטיק'
   AND city IS NULL;

UPDATE public.products
   SET city = 'טבריה'
 WHERE slug = 'מלון-5-כוכבים-בטבריה'
   AND city IS NULL;

COMMIT;

-- Verify (expect three rows, each with the city its title names):
--   SELECT slug, city FROM public.products
--    WHERE slug IN ('תספורת-לגבר-ילד-או-סידור-זקן-בפתח-תקווה',
--                   'חבילות-עיסוי-זוגיות-בסוויטה-ספא-בוטיק',
--                   'מלון-5-כוכבים-בטבריה');
