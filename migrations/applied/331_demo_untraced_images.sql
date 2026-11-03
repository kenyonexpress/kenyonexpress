-- 331_demo_untraced_images.sql (C188)
--
-- Two demo deals carried a second image that does not trace to wp_import
-- (no attachment in wp_import/raw, no hash in wp_import/media):
--   demo-laptop         /images/hero/slide-2.jpg
--   demo-store-voucher  /images/products/ke-live-deal-4.avif
-- Both keep their first image, a wp_import hash. scripts/demo/demo-deals.mjs
-- drops the same two entries so a regenerated 330 matches.
-- Data only, demo rows only, idempotent (jsonb - text removes the element).
-- Apply: supabase db query --linked -f migrations/pending/331_demo_untraced_images.sql

begin;

update public.products
   set images = images - '/images/hero/slide-2.jpg'
 where slug = 'demo-laptop' and is_demo;

update public.products
   set images = images - '/images/products/ke-live-deal-4.avif'
 where slug = 'demo-store-voucher' and is_demo;

commit;
