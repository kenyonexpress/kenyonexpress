-- Phase 3: RBAC — role hierarchy, created_by tracking, audit log

-- ---------------------------------------------------------------------------
-- 1. Add created_by to products, coupons, categories
-- ---------------------------------------------------------------------------

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.coupons
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS products_created_by_idx   ON public.products  (created_by);
CREATE INDEX IF NOT EXISTS coupons_created_by_idx    ON public.coupons   (created_by);
CREATE INDEX IF NOT EXISTS categories_created_by_idx ON public.categories(created_by);

-- ---------------------------------------------------------------------------
-- 3. RBAC helper functions
-- ---------------------------------------------------------------------------

-- Returns the role of the calling user from the profiles table.
-- Returns NULL when called outside of an authenticated session.
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.user_role LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$$;

-- Returns true when the calling user holds at least `required_role` in the
-- role hierarchy: customer < vendor < content_uploader < admin < super_admin.
CREATE OR REPLACE FUNCTION public.has_role(required_role text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_role public.user_role;
BEGIN
  IF auth.uid() IS NULL THEN RETURN false; END IF;

  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF v_role IS NULL THEN RETURN false; END IF;

  RETURN CASE required_role
    WHEN 'customer'         THEN true
    WHEN 'vendor'           THEN v_role IN ('vendor','content_uploader','admin','super_admin')
    WHEN 'content_uploader' THEN v_role IN ('content_uploader','admin','super_admin')
    WHEN 'admin'            THEN v_role IN ('admin','super_admin')
    WHEN 'super_admin'      THEN v_role = 'super_admin'
    ELSE false
  END;
END;
$$;

-- Extend is_admin() to cover super_admin as well.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'super_admin')
  )
$$;

-- ---------------------------------------------------------------------------
-- 4. Admin audit log
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  action      text        NOT NULL,   -- INSERT | UPDATE | DELETE
  entity_type text        NOT NULL,   -- table name
  entity_id   uuid,
  changes     jsonb,
  ip          inet,
  user_agent  text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS admin_audit_log_user_id_idx    ON public.admin_audit_log (user_id);
CREATE INDEX IF NOT EXISTS admin_audit_log_entity_idx     ON public.admin_audit_log (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS admin_audit_log_created_at_idx ON public.admin_audit_log (created_at DESC);

ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;

-- Admins can read all entries; no direct write via the Data API.
CREATE POLICY "audit_log: admin select"
  ON public.admin_audit_log FOR SELECT TO authenticated
  USING (public.is_admin());

-- ---------------------------------------------------------------------------
-- 5. Audit trigger
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.audit_log_trigger_fn()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  INSERT INTO public.admin_audit_log (user_id, action, entity_type, entity_id, changes)
  VALUES (
    auth.uid(),
    TG_OP,
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

CREATE OR REPLACE TRIGGER audit_products
  AFTER INSERT OR UPDATE OR DELETE ON public.products
  FOR EACH ROW EXECUTE PROCEDURE public.audit_log_trigger_fn();

CREATE OR REPLACE TRIGGER audit_coupons
  AFTER INSERT OR UPDATE OR DELETE ON public.coupons
  FOR EACH ROW EXECUTE PROCEDURE public.audit_log_trigger_fn();

CREATE OR REPLACE TRIGGER audit_vendors
  AFTER INSERT OR UPDATE OR DELETE ON public.vendors
  FOR EACH ROW EXECUTE PROCEDURE public.audit_log_trigger_fn();

CREATE OR REPLACE TRIGGER audit_profiles
  AFTER INSERT OR UPDATE OR DELETE ON public.profiles
  FOR EACH ROW EXECUTE PROCEDURE public.audit_log_trigger_fn();

-- ---------------------------------------------------------------------------
-- 6. Additional RLS policies for content_uploader on products
--    (the existing vendor/admin policies stay in place and are OR-ed with these)
-- ---------------------------------------------------------------------------

-- content_uploader can see their own products regardless of status
CREATE POLICY "products: content_uploader select own"
  ON public.products FOR SELECT TO authenticated
  USING (
    public.current_user_role() = 'content_uploader'
    AND created_by = auth.uid()
  );

-- content_uploader can insert products they own
CREATE POLICY "products: content_uploader insert"
  ON public.products FOR INSERT TO authenticated
  WITH CHECK (
    public.current_user_role() = 'content_uploader'
    AND created_by = auth.uid()
  );

-- content_uploader can update their own products
CREATE POLICY "products: content_uploader update"
  ON public.products FOR UPDATE TO authenticated
  USING (
    public.current_user_role() = 'content_uploader'
    AND created_by = auth.uid()
  )
  WITH CHECK (
    public.current_user_role() = 'content_uploader'
    AND created_by = auth.uid()
  );
