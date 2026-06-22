-- Phase 5: storage buckets for products and coupons
-- Additive — does not touch 004 (product-images/vendor-logos/category-icons)
-- or 020 (admin access to product-images). Idempotent: safe to re-run.

-- ---------------------------------------------------------------------------
-- 1. Create buckets (public read, image uploads; coupons also allow PDF)
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  (
    'products',
    'products',
    true,
    5242880,  -- 5 MB
    ARRAY['image/jpeg','image/jpg','image/png','image/webp','image/gif']
  ),
  (
    'coupons',
    'coupons',
    true,
    5242880,  -- 5 MB
    ARRAY['image/jpeg','image/jpg','image/png','image/webp','image/gif','application/pdf']
  )
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. RLS on storage.objects (already enabled by Supabase)
--    Uploaders and admins may write; everyone may read (public buckets).
-- ---------------------------------------------------------------------------

-- ---- products ----

DROP POLICY IF EXISTS "products: public read" ON storage.objects;
CREATE POLICY "products: public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'products');

DROP POLICY IF EXISTS "products: uploader insert" ON storage.objects;
CREATE POLICY "products: uploader insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'products'
    AND (public.has_role('content_uploader') OR public.is_admin())
  );

DROP POLICY IF EXISTS "products: uploader update" ON storage.objects;
CREATE POLICY "products: uploader update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'products'
    AND (public.has_role('content_uploader') OR public.is_admin())
  )
  WITH CHECK (
    bucket_id = 'products'
    AND (public.has_role('content_uploader') OR public.is_admin())
  );

DROP POLICY IF EXISTS "products: uploader delete" ON storage.objects;
CREATE POLICY "products: uploader delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'products'
    AND (public.has_role('content_uploader') OR public.is_admin())
  );

-- ---- coupons ----

DROP POLICY IF EXISTS "coupons: public read" ON storage.objects;
CREATE POLICY "coupons: public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'coupons');

DROP POLICY IF EXISTS "coupons: uploader insert" ON storage.objects;
CREATE POLICY "coupons: uploader insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'coupons'
    AND (public.has_role('content_uploader') OR public.is_admin())
  );

DROP POLICY IF EXISTS "coupons: uploader update" ON storage.objects;
CREATE POLICY "coupons: uploader update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'coupons'
    AND (public.has_role('content_uploader') OR public.is_admin())
  )
  WITH CHECK (
    bucket_id = 'coupons'
    AND (public.has_role('content_uploader') OR public.is_admin())
  );

DROP POLICY IF EXISTS "coupons: uploader delete" ON storage.objects;
CREATE POLICY "coupons: uploader delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'coupons'
    AND (public.has_role('content_uploader') OR public.is_admin())
  );
