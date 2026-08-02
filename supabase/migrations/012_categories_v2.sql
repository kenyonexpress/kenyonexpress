-- Phase 4: Categories v2 — soft delete, updated_at, depth enforcement
-- Idempotent: safe to run multiple times.

-- Add soft-delete + timestamps to categories
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS deleted_at  timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at  timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS created_at  timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS categories_deleted_at_idx ON public.categories (deleted_at)
  WHERE deleted_at IS NULL;

-- Enable RLS if not already
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;

-- Read: everyone can see active, non-deleted categories
DROP POLICY IF EXISTS "categories: public read" ON public.categories;
CREATE POLICY "categories: public read"
  ON public.categories FOR SELECT
  USING (is_active = true AND deleted_at IS NULL);

-- Admin read: see all including soft-deleted
DROP POLICY IF EXISTS "categories: admin read" ON public.categories;
CREATE POLICY "categories: admin read"
  ON public.categories FOR SELECT TO authenticated
  USING (public.is_admin());

-- Mutate: admin + super_admin only
DROP POLICY IF EXISTS "categories: admin insert" ON public.categories;
CREATE POLICY "categories: admin insert"
  ON public.categories FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "categories: admin update" ON public.categories;
CREATE POLICY "categories: admin update"
  ON public.categories FOR UPDATE TO authenticated
  USING  (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "categories: admin delete" ON public.categories;
CREATE POLICY "categories: admin delete"
  ON public.categories FOR DELETE TO authenticated
  USING (public.is_admin());

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_categories_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS categories_updated_at ON public.categories;
CREATE TRIGGER categories_updated_at
  BEFORE UPDATE ON public.categories
  FOR EACH ROW EXECUTE PROCEDURE public.set_categories_updated_at();
