-- Phase 3: Storage buckets — product images, vendor logos, category icons

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
-- Accessible by content_uploader and above (has_role returns true for admin too)

CREATE POLICY "product-images: public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'product-images');

CREATE POLICY "product-images: uploader insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'product-images'
    AND public.has_role('content_uploader')
  );

-- UPDATE required for upsert to work
CREATE POLICY "product-images: uploader update"
  ON storage.objects FOR UPDATE TO authenticated
  USING  (bucket_id = 'product-images' AND public.has_role('content_uploader'))
  WITH CHECK (bucket_id = 'product-images' AND public.has_role('content_uploader'));

CREATE POLICY "product-images: uploader delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'product-images' AND public.has_role('content_uploader'));

-- ---- vendor-logos ----
-- Accessible by vendors and above

CREATE POLICY "vendor-logos: public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'vendor-logos');

CREATE POLICY "vendor-logos: vendor insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'vendor-logos'
    AND public.has_role('vendor')
  );

CREATE POLICY "vendor-logos: vendor update"
  ON storage.objects FOR UPDATE TO authenticated
  USING  (bucket_id = 'vendor-logos' AND public.has_role('vendor'))
  WITH CHECK (bucket_id = 'vendor-logos' AND public.has_role('vendor'));

CREATE POLICY "vendor-logos: vendor delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'vendor-logos' AND public.has_role('vendor'));

-- ---- category-icons ----
-- Restricted to admins only

CREATE POLICY "category-icons: public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'category-icons');

CREATE POLICY "category-icons: admin insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'category-icons'
    AND public.is_admin()
  );

CREATE POLICY "category-icons: admin update"
  ON storage.objects FOR UPDATE TO authenticated
  USING  (bucket_id = 'category-icons' AND public.is_admin())
  WITH CHECK (bucket_id = 'category-icons' AND public.is_admin());

CREATE POLICY "category-icons: admin delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'category-icons' AND public.is_admin());
