-- Migration 041: Seed demo suppliers, link ALL products, backfill product_images
-- ============================================================================
-- Business rule: every product (coupon AND physical) must carry supplier_id.
-- Uses only 005-era supplier columns (name, contact_email, contact_phone,
-- commission_percent, notes) so it runs on the live DB, which has not yet
-- applied 027/042.
--
-- ORDER NOTE: this file was numbered 043 and therefore ran AFTER 042, which
-- made every from-zero run fail, because 042's preflight raises unless every product
-- already carries supplier_id. Renumbered to 041 so the linking UPDATE lands
-- first. On a DB where 042 is already applied this migration is a safe no-op:
-- supplier_id is NOT NULL there, so the linking UPDATE matches zero rows.
-- Re-running it under the new number is harmless (see idempotency note below).
--
-- product_images backfill: per docs/ARCHITECTURE-WP-DATA-MIGRATION.md the
-- canonical model is dual: products.images jsonb is the denormalized read
-- model (first element = primary) and public.product_images is the
-- normalized table. Reality had only the jsonb side populated; this
-- migration projects it into product_images.
--
-- Fully idempotent: fixed supplier UUIDs + ON CONFLICT / NOT EXISTS guards.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Three demo suppliers (fixed UUIDs so linkage stays deterministic)
-- ---------------------------------------------------------------------------

INSERT INTO public.suppliers (id, name, contact_email, contact_phone, commission_percent, notes)
VALUES
  ('f47ac10b-58cc-4372-a567-0e02b2c3d101', 'אלקטרו סחר בע"מ',
   'orders@electro-sachar.co.il',  '03-5551001', 10,
   'ספק דמו: אלקטרוניקה ומוצרי חשמל'),
  ('f47ac10b-58cc-4372-a567-0e02b2c3d102', 'חופשות ישראל בע"מ',
   'bookings@hufshot-israel.co.il', '04-5552002', 12,
   'ספק דמו: נופש, צימרים וספא'),
  ('f47ac10b-58cc-4372-a567-0e02b2c3d103', 'בית ומשפחה שיווק בע"מ',
   'sales@bait-mishpacha.co.il',   '02-5553003', 8,
   'ספק דמו: מוצרי בית, ילדים ושירותים')
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Link every product without a supplier (deterministic round-robin by slug)
-- ---------------------------------------------------------------------------

UPDATE public.products p
SET supplier_id = (ARRAY[
      'f47ac10b-58cc-4372-a567-0e02b2c3d101'::uuid,
      'f47ac10b-58cc-4372-a567-0e02b2c3d102'::uuid,
      'f47ac10b-58cc-4372-a567-0e02b2c3d103'::uuid
    ])[1 + (r.rn % 3)]
FROM (
  SELECT id, (row_number() OVER (ORDER BY slug) - 1)::int AS rn
  FROM public.products
  WHERE supplier_id IS NULL
) r
WHERE p.id = r.id;

-- ---------------------------------------------------------------------------
-- 3. Project products.images jsonb into public.product_images
--    (first array element = primary image, sort_order 0)
-- ---------------------------------------------------------------------------

INSERT INTO public.product_images (product_id, url, alt_he, sort_order)
SELECT
  p.id,
  img.value #>> '{}',
  p.name_he,
  (img.ordinality - 1)::int
FROM public.products p
CROSS JOIN LATERAL jsonb_array_elements(p.images) WITH ORDINALITY AS img(value, ordinality)
WHERE jsonb_typeof(p.images) = 'array'
  AND NOT EXISTS (
    SELECT 1 FROM public.product_images pi
    WHERE pi.product_id = p.id
      AND pi.url = img.value #>> '{}'
  );
