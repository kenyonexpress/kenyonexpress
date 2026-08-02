-- Allow admins to upload/manage product-images (admin panel ProductForm).
-- Idempotent: safe to run multiple times.

DROP POLICY IF EXISTS "product-images: uploader insert" ON storage.objects;
CREATE POLICY "product-images: uploader insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'product-images'
    AND (public.has_role('content_uploader') OR public.is_admin())
  );

DROP POLICY IF EXISTS "product-images: uploader update" ON storage.objects;
CREATE POLICY "product-images: uploader update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'product-images'
    AND (public.has_role('content_uploader') OR public.is_admin())
  )
  WITH CHECK (
    bucket_id = 'product-images'
    AND (public.has_role('content_uploader') OR public.is_admin())
  );

DROP POLICY IF EXISTS "product-images: uploader delete" ON storage.objects;
CREATE POLICY "product-images: uploader delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'product-images'
    AND (public.has_role('content_uploader') OR public.is_admin())
  );
