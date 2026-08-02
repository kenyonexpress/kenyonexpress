-- Phase 3: Storage buckets — product images, vendor logos, category icons
-- Idempotent: safe to run multiple times.

-- ---------------------------------------------------------------------------
-- 1. Create buckets
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  (
    'product-images',
    'product-images',
    true,
    5242880,  -- 5 MB
    ARRAY['image/jpeg','image/jpg','image/png','image/webp','image/gif']
  ),
  (
    'vendor-logos',
    'vendor-logos',
    true,
    2097152,  -- 2 MB
    ARRAY['image/jpeg','image/jpg','image/png','image/webp','image/svg+xml']
  ),
  (
    'category-icons',
    'category-icons',
    true,
    1048576,  -- 1 MB
    ARRAY['image/jpeg','image/jpg','image/png','image/webp','image/svg+xml']
  )
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. RLS on storage.objects
--    (storage.objects already has RLS enabled by Supabase)
-- ---------------------------------------------------------------------------

-- ---- product-images ----

DROP POLICY IF EXISTS "product-images: public read"    ON storage.objects;
CREATE POLICY "product-images: public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'product-images');

DROP POLICY IF EXISTS "product-images: uploader insert" ON storage.objects;
CREATE POLICY "product-images: uploader insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'product-images'
    AND public.has_role('content_uploader')
  );

DROP POLICY IF EXISTS "product-images: uploader update" ON storage.objects;
CREATE POLICY "product-images: uploader update"
  ON storage.objects FOR UPDATE TO authenticated
  USING  (bucket_id = 'product-images' AND public.has_role('content_uploader'))
  WITH CHECK (bucket_id = 'product-images' AND public.has_role('content_uploader'));

DROP POLICY IF EXISTS "product-images: uploader delete" ON storage.objects;
CREATE POLICY "product-images: uploader delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'product-images' AND public.has_role('content_uploader'));

-- ---- vendor-logos ----

DROP POLICY IF EXISTS "vendor-logos: public read"   ON storage.objects;
CREATE POLICY "vendor-logos: public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'vendor-logos');

DROP POLICY IF EXISTS "vendor-logos: vendor insert" ON storage.objects;
CREATE POLICY "vendor-logos: vendor insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'vendor-logos'
    AND public.has_role('vendor')
  );

DROP POLICY IF EXISTS "vendor-logos: vendor update" ON storage.objects;
CREATE POLICY "vendor-logos: vendor update"
  ON storage.objects FOR UPDATE TO authenticated
  USING  (bucket_id = 'vendor-logos' AND public.has_role('vendor'))
  WITH CHECK (bucket_id = 'vendor-logos' AND public.has_role('vendor'));

DROP POLICY IF EXISTS "vendor-logos: vendor delete" ON storage.objects;
CREATE POLICY "vendor-logos: vendor delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'vendor-logos' AND public.has_role('vendor'));

-- ---- category-icons ----

DROP POLICY IF EXISTS "category-icons: public read"   ON storage.objects;
CREATE POLICY "category-icons: public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'category-icons');

DROP POLICY IF EXISTS "category-icons: admin insert" ON storage.objects;
CREATE POLICY "category-icons: admin insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'category-icons'
    AND public.is_admin()
  );

DROP POLICY IF EXISTS "category-icons: admin update" ON storage.objects;
CREATE POLICY "category-icons: admin update"
  ON storage.objects FOR UPDATE TO authenticated
  USING  (bucket_id = 'category-icons' AND public.is_admin())
  WITH CHECK (bucket_id = 'category-icons' AND public.is_admin());

DROP POLICY IF EXISTS "category-icons: admin delete" ON storage.objects;
CREATE POLICY "category-icons: admin delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'category-icons' AND public.is_admin());
