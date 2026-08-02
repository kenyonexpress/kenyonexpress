-- Migration 049: media_assets - metadata for the image upload pipeline.
-- Each uploaded image is converted server-side (webp/avif, multiple widths,
-- blur placeholder) and registered here keyed by its main public URL, with a
-- mandatory Hebrew alt text. Storefront components join by URL to get
-- blur/alt/renditions.
-- Idempotent: safe to run multiple times.

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.media_assets (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  url           text        NOT NULL UNIQUE,
  alt_he        text        NOT NULL,
  blur_data_url text,
  width         integer,
  height        integer,
  -- {"webp":[{"w":1600,"url":"..."},...],"avif":[{"w":1600,"url":"..."}]}
  renditions    jsonb       NOT NULL DEFAULT '{}'::jsonb,
  provider      text        NOT NULL DEFAULT 'supabase',
  bucket        text,
  base_path     text,
  created_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS set_updated_at ON public.media_assets;
CREATE TRIGGER set_updated_at BEFORE UPDATE ON public.media_assets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS media_assets_base_path_idx
  ON public.media_assets (base_path) WHERE base_path IS NOT NULL;

ALTER TABLE public.media_assets ENABLE ROW LEVEL SECURITY;

-- Public content metadata: anyone may read (the images themselves are public).
DROP POLICY IF EXISTS "media_assets: public read" ON public.media_assets;
CREATE POLICY "media_assets: public read"
  ON public.media_assets FOR SELECT
  USING (true);

DROP POLICY IF EXISTS "media_assets: staff insert" ON public.media_assets;
CREATE POLICY "media_assets: staff insert"
  ON public.media_assets FOR INSERT TO authenticated
  WITH CHECK (public.has_role('content_uploader') OR public.is_admin());

DROP POLICY IF EXISTS "media_assets: staff update" ON public.media_assets;
CREATE POLICY "media_assets: staff update"
  ON public.media_assets FOR UPDATE TO authenticated
  USING (public.has_role('content_uploader') OR public.is_admin())
  WITH CHECK (public.has_role('content_uploader') OR public.is_admin());

DROP POLICY IF EXISTS "media_assets: admin delete" ON public.media_assets;
CREATE POLICY "media_assets: admin delete"
  ON public.media_assets FOR DELETE TO authenticated
  USING (public.is_admin());
