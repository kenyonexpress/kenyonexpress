-- Phase 3: RBAC — role hierarchy, created_by tracking, audit log

-- ---------------------------------------------------------------------------
-- 0. Ensure user_role enum and profiles.role enum column exist
--    Self-contained: handles databases where migration 001 predates the enum.
-- ---------------------------------------------------------------------------

DO $$ BEGIN
  CREATE TYPE public.user_role AS ENUM (
    'customer', 'content_uploader', 'vendor', 'admin', 'super_admin'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Convert profiles.role from text to the enum type if it hasn't been done yet.
-- Normalises any unrecognised stored values to 'customer' before the ALTER so
-- the USING expression never encounters an unmappable value.
-- The "profiles: owner update" policy contains a self-referencing subquery
-- (role = SELECT role ...) that Postgres re-validates during ALTER COLUMN TYPE;
-- with the old text type still partially visible it produces
-- "operator does not exist: user_role = text".  Drop it first; recreated below.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'profiles'
      AND column_name  = 'role'
      AND udt_name    <> 'user_role'
  ) THEN
    ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

    UPDATE public.profiles
    SET role = 'customer'
    WHERE role NOT IN ('customer','content_uploader','vendor','admin','super_admin');

    DROP POLICY IF EXISTS "profiles: owner update" ON public.profiles;

    ALTER TABLE public.profiles ALTER COLUMN role DROP DEFAULT;
    ALTER TABLE public.profiles
      ALTER COLUMN role TYPE public.user_role
      USING (
        CASE role
          WHEN 'customer'         THEN 'customer'        ::public.user_role
          WHEN 'content_uploader' THEN 'content_uploader'::public.user_role
          WHEN 'vendor'           THEN 'vendor'           ::public.user_role
          WHEN 'admin'            THEN 'admin'            ::public.user_role
          WHEN 'super_admin'      THEN 'super_admin'      ::public.user_role
          ELSE                         'customer'         ::public.user_role
        END
      );
    ALTER TABLE public.profiles
      ALTER COLUMN role SET DEFAULT 'customer'::public.user_role;
  END IF;
END $$;

-- Recreate the UPDATE policy unconditionally so re-runs are safe and the
-- policy is always in place with the correct enum types on both sides.
DROP POLICY IF EXISTS "profiles: owner update" ON public.profiles;
CREATE POLICY "profiles: owner update"
  ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND role = (SELECT role FROM public.profiles WHERE id = auth.uid())
  );

-- ---------------------------------------------------------------------------
-- 1. Add created_by to products, coupons, categories
-- ---------------------------------------------------------------------------

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.coupons
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS products_created_by_idx   ON public.products   (created_by);
CREATE INDEX IF NOT EXISTS coupons_created_by_idx    ON public.coupons    (created_by);
CREATE INDEX IF NOT EXISTS categories_created_by_idx ON public.categories (created_by);

-- ---------------------------------------------------------------------------
-- 2. RBAC helper functions
-- ---------------------------------------------------------------------------

-- Returns the role of the calling user (NULL outside authenticated session).
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS public.user_role LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$$;

-- Returns true when the caller holds at least `required_role` in the hierarchy:
-- customer < vendor < content_uploader < admin < super_admin.
-- All comparisons against v_role use explicit ::public.user_role casts to
-- avoid "operator does not exist: user_role = text" at planning time.
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
    WHEN 'vendor'           THEN v_role IN (
                                   'vendor'          ::public.user_role,
                                   'content_uploader'::public.user_role,
                                   'admin'           ::public.user_role,
                                   'super_admin'     ::public.user_role)
    WHEN 'content_uploader' THEN v_role IN (
                                   'content_uploader'::public.user_role,
                                   'admin'           ::public.user_role,
                                   'super_admin'     ::public.user_role)
    WHEN 'admin'            THEN v_role IN (
                                   'admin'      ::public.user_role,
                                   'super_admin'::public.user_role)
    WHEN 'super_admin'      THEN v_role = 'super_admin'::public.user_role
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
    WHERE id = auth.uid()
      AND role IN ('admin'::public.user_role, 'super_admin'::public.user_role)
  )
$$;

-- ---------------------------------------------------------------------------
-- 3. Admin audit log
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.admin_audit_log (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  action      text        NOT NULL,
  entity_type text        NOT NULL,
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

DROP POLICY IF EXISTS "audit_log: admin select" ON public.admin_audit_log;
CREATE POLICY "audit_log: admin select"
  ON public.admin_audit_log FOR SELECT TO authenticated
  USING (public.is_admin());

-- ---------------------------------------------------------------------------
-- 4. Audit trigger
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

