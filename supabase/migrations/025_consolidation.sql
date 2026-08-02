-- Migration 025: DB consolidation
-- Consolidates created_by tracking, content_uploader RLS, audit log, storage policies.
-- Fully idempotent. Source of truth for RLS logic: 003_rbac.sql.

-- ===========================================================================
-- 1. created_by columns
--    products + categories already carry created_by (005 recreated them with it);
--    re-asserted defensively. The 001/003 `coupons` table was replaced in 008 by
--    coupon_codes (+ coupon_deals in 015, which already has created_by), so the
--    coupons branch is guarded and is a no-op unless a legacy table survives.
-- ===========================================================================

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

DO $$ BEGIN
  IF to_regclass('public.coupons') IS NOT NULL THEN
    ALTER TABLE public.coupons
      ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;
    CREATE INDEX IF NOT EXISTS coupons_created_by_idx ON public.coupons (created_by);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS products_created_by_idx   ON public.products   (created_by);
CREATE INDEX IF NOT EXISTS categories_created_by_idx ON public.categories (created_by);

-- ===========================================================================
-- 2. content_uploader own-row RLS (mirrors the 005 products pattern).
--    Permissive policies: these OR with the existing admin/vendor policies.
-- ===========================================================================

-- ---- products ----
DROP POLICY IF EXISTS "products: content_uploader select own" ON public.products;
CREATE POLICY "products: content_uploader select own"
  ON public.products FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'content_uploader'::public.user_role
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS "products: content_uploader insert" ON public.products;
CREATE POLICY "products: content_uploader insert"
  ON public.products FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role() = 'content_uploader'::public.user_role
    AND created_by = auth.uid()
  );

DROP POLICY IF EXISTS "products: content_uploader update" ON public.products;
CREATE POLICY "products: content_uploader update"
  ON public.products FOR UPDATE TO authenticated
  USING (
    public.current_user_role() = 'content_uploader'::public.user_role
    AND created_by = auth.uid()
  )
  WITH CHECK (
    public.current_user_role() = 'content_uploader'::public.user_role
    AND created_by = auth.uid()
  );

-- ---- categories (SELECT only; INSERT/UPDATE/DELETE stay admin-only per 012) ----
DROP POLICY IF EXISTS "categories: content_uploader select own" ON public.categories;
CREATE POLICY "categories: content_uploader select own"
  ON public.categories FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'content_uploader'::public.user_role
    AND created_by = auth.uid()
  );

-- ===========================================================================
-- 3. Audit consolidation: admin_audit_log -> audit_log
--    3a. Repoint the shared trigger fn FIRST (before dropping the old table),
--        mapping TG_OP -> audit_action enum. Without this, every INSERT/UPDATE/
--        DELETE on audited tables (products, vendors, profiles, coupon_deals)
--        would fail once admin_audit_log is dropped.
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.audit_log_trigger_fn()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  INSERT INTO public.audit_log
    (actor_id, actor_role, action, entity_type, entity_id, changes)
  VALUES (
    auth.uid(),
    public.current_user_role()::text,
    (CASE TG_OP
       WHEN 'INSERT' THEN 'created'
       WHEN 'UPDATE' THEN 'updated'
       WHEN 'DELETE' THEN 'deleted'
     END)::public.audit_action,
    TG_TABLE_NAME::text,
    CASE TG_OP WHEN 'DELETE' THEN OLD.id ELSE NEW.id END,
    CASE TG_OP
      WHEN 'INSERT' THEN jsonb_build_object('new', to_jsonb(NEW))
      WHEN 'UPDATE' THEN jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW))
      WHEN 'DELETE' THEN jsonb_build_object('old', to_jsonb(OLD))
    END
  );
  RETURN NULL;
END;
$$;

-- 3b. Migrate historical rows, then drop the old table. Guarded so a re-run
--     (table already gone) is a clean no-op; audit_log has no unique key, and
--     the drop-in-same-block prevents duplicate inserts. entity_id is NOT NULL
--     in audit_log, so null-entity rows (none expected) are skipped.
DO $$ BEGIN
  IF to_regclass('public.admin_audit_log') IS NOT NULL THEN
    INSERT INTO public.audit_log
      (actor_id, actor_role, action, entity_type, entity_id,
       changes, metadata, ip_address, user_agent, created_at)
    SELECT
      a.user_id,
      NULL,
      (CASE upper(a.action)
         WHEN 'INSERT'  THEN 'created'
         WHEN 'UPDATE'  THEN 'updated'
         WHEN 'DELETE'  THEN 'deleted'
         WHEN 'CREATED' THEN 'created'
         WHEN 'UPDATED' THEN 'updated'
         WHEN 'DELETED' THEN 'deleted'
         ELSE 'manual_override'
       END)::public.audit_action,
      a.entity_type,
      a.entity_id,
      COALESCE(a.changes, '{}'::jsonb),
      '{}'::jsonb,
      a.ip,
      a.user_agent,
      a.created_at
    FROM public.admin_audit_log a
    WHERE a.entity_id IS NOT NULL;

    DROP TABLE IF EXISTS public.admin_audit_log CASCADE;
  END IF;
END $$;

-- ===========================================================================
-- 4. Storage policies: the 12 from 004 (product-images / vendor-logos /
--    category-icons x 4). product-images writes keep the `OR is_admin()`
--    grant added in 020.
-- ===========================================================================

-- ---- product-images ----
DROP POLICY IF EXISTS "product-images: public read" ON storage.objects;
CREATE POLICY "product-images: public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'product-images');

DROP POLICY IF EXISTS "product-images: uploader insert" ON storage.objects;
CREATE POLICY "product-images: uploader insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'product-images'
             AND (public.has_role('content_uploader') OR public.is_admin()));

DROP POLICY IF EXISTS "product-images: uploader update" ON storage.objects;
CREATE POLICY "product-images: uploader update"
  ON storage.objects FOR UPDATE TO authenticated
  USING  (bucket_id = 'product-images'
          AND (public.has_role('content_uploader') OR public.is_admin()))
  WITH CHECK (bucket_id = 'product-images'
             AND (public.has_role('content_uploader') OR public.is_admin()));

DROP POLICY IF EXISTS "product-images: uploader delete" ON storage.objects;
CREATE POLICY "product-images: uploader delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'product-images'
         AND (public.has_role('content_uploader') OR public.is_admin()));

-- ---- vendor-logos ----
DROP POLICY IF EXISTS "vendor-logos: public read" ON storage.objects;
CREATE POLICY "vendor-logos: public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'vendor-logos');

DROP POLICY IF EXISTS "vendor-logos: vendor insert" ON storage.objects;
CREATE POLICY "vendor-logos: vendor insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'vendor-logos' AND public.has_role('vendor'));

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
DROP POLICY IF EXISTS "category-icons: public read" ON storage.objects;
CREATE POLICY "category-icons: public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'category-icons');

DROP POLICY IF EXISTS "category-icons: admin insert" ON storage.objects;
CREATE POLICY "category-icons: admin insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'category-icons' AND public.is_admin());

DROP POLICY IF EXISTS "category-icons: admin update" ON storage.objects;
CREATE POLICY "category-icons: admin update"
  ON storage.objects FOR UPDATE TO authenticated
  USING  (bucket_id = 'category-icons' AND public.is_admin())
  WITH CHECK (bucket_id = 'category-icons' AND public.is_admin());

DROP POLICY IF EXISTS "category-icons: admin delete" ON storage.objects;
CREATE POLICY "category-icons: admin delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'category-icons' AND public.is_admin());
