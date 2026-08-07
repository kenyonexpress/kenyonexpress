-- 105_public_buckets_stop_listing.sql
--
-- Opened by the Supabase security advisor after 103 was applied, and measured
-- against production on 2026-08-03 rather than taken from the lint text.
--
-- All six storage buckets are public AND carry a SELECT policy on
-- `storage.objects` granted to the `public` role with nothing but
-- `bucket_id = '<name>'`. That policy is not what serves the images, and it is
-- what lets any caller enumerate them:
--
--   POST /storage/v1/object/list/product-images  {"prefix":"products"}
--     -> 200, 10 objects with names and byte sizes, publishable key only
--
-- Same shape as 104: latent rather than live. The ten objects today are
-- UUID-named product photos that are meant to be public anyway, so nothing is
-- leaking right now. It fires the first time anything reaches a public bucket
-- that was meant to be reachable only by whoever holds its URL.
--
-- MEASURED, so the fix is not a guess. With `product-images: public read`
-- dropped, against production:
--
--   GET /storage/v1/object/public/product-images/<path>   -> 200, 15114 bytes
--   POST /storage/v1/object/list/product-images            -> 200, []
--
-- A public bucket serves `/object/public/...` without consulting RLS at all,
-- which is exactly why dropping the policy costs nothing. `getPublicUrl()` in
-- `src/lib/storage/upload.ts:54` builds that route, and it is the only route
-- the app renders from. The transform route `/render/image/public/...` answers
-- `403 FeatureNotEnabled` on this tenant either way, and has zero references in
-- the repo.
--
-- The replacement is not "no SELECT". Supabase's delete path reads the row it
-- is about to remove, so every bucket gets SELECT back under EXACTLY the
-- predicate of its own DELETE policy. Whoever can delete from a bucket can list
-- it; nobody else can, including a signed-in customer.
--
-- Idempotent: DROP POLICY IF EXISTS before each CREATE.

begin;

-- category-icons: admin only, mirroring "category-icons: admin delete".
drop policy if exists "category-icons: public read" on storage.objects;
drop policy if exists "category-icons: manager read" on storage.objects;
create policy "category-icons: manager read"
  on storage.objects for select to authenticated
  using (bucket_id = 'category-icons' and is_admin());

-- coupon-images: admin only, mirroring "coupon-images: admin delete".
drop policy if exists "coupon-images: public read" on storage.objects;
drop policy if exists "coupon-images: manager read" on storage.objects;
create policy "coupon-images: manager read"
  on storage.objects for select to authenticated
  using (bucket_id = 'coupon-images' and is_admin());

-- coupons: uploader or admin, mirroring "coupons: uploader delete".
drop policy if exists "coupons: public read" on storage.objects;
drop policy if exists "coupons: manager read" on storage.objects;
create policy "coupons: manager read"
  on storage.objects for select to authenticated
  using (bucket_id = 'coupons' and (has_role('content_uploader') or is_admin()));

-- product-images: uploader or admin. Already dropped during the measurement
-- above; the guard makes re-running this file a no-op either way.
drop policy if exists "product-images: public read" on storage.objects;
drop policy if exists "product-images: manager read" on storage.objects;
create policy "product-images: manager read"
  on storage.objects for select to authenticated
  using (bucket_id = 'product-images' and (has_role('content_uploader') or is_admin()));

-- products: uploader or admin, mirroring "products: uploader delete".
drop policy if exists "products: public read" on storage.objects;
drop policy if exists "products: manager read" on storage.objects;
create policy "products: manager read"
  on storage.objects for select to authenticated
  using (bucket_id = 'products' and (has_role('content_uploader') or is_admin()));

-- vendor-logos: vendor role, mirroring "vendor-logos: vendor delete". Note that
-- this bucket's write policies do NOT include is_admin(), and this one does not
-- widen them: it mirrors, it does not improve.
drop policy if exists "vendor-logos: public read" on storage.objects;
drop policy if exists "vendor-logos: manager read" on storage.objects;
create policy "vendor-logos: manager read"
  on storage.objects for select to authenticated
  using (bucket_id = 'vendor-logos' and has_role('vendor'));

commit;
