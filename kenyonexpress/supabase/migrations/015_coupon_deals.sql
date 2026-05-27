-- Phase 4: Coupon Deals — admin-created deals (10% platform price model)
-- Idempotent: safe to run multiple times.

-- ---------------------------------------------------------------------------
-- 1. coupon_deals table
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.coupon_deals (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id           uuid        REFERENCES public.vendors(id) ON DELETE SET NULL,
  title_he            text        NOT NULL,
  business_name       text        NOT NULL,
  original_price      numeric(10,2) NOT NULL CHECK (original_price > 0),
  platform_price      numeric(10,2) GENERATED ALWAYS AS (ROUND(original_price * 0.10, 2)) STORED,
  discount_percentage numeric(5,2)  GENERATED ALWAYS AS (90.00) STORED,
  terms_he            text,
  valid_from          timestamptz NOT NULL DEFAULT now(),
  valid_until         timestamptz,
  max_uses            integer,
  max_uses_per_user   integer     NOT NULL DEFAULT 1,
  location_he         text,
  lat                 double precision,
  lng                 double precision,
  image_url           text,
  status              text        NOT NULL DEFAULT 'draft'
                        CHECK (status IN ('draft','active','paused','archived')),
  created_by          uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  deleted_at          timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS coupon_deals_status_idx     ON public.coupon_deals (status);
CREATE INDEX IF NOT EXISTS coupon_deals_vendor_id_idx  ON public.coupon_deals (vendor_id);
CREATE INDEX IF NOT EXISTS coupon_deals_deleted_at_idx ON public.coupon_deals (deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS coupon_deals_valid_idx      ON public.coupon_deals (valid_from, valid_until);

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_coupon_deals_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS coupon_deals_updated_at ON public.coupon_deals;
CREATE TRIGGER coupon_deals_updated_at
  BEFORE UPDATE ON public.coupon_deals
  FOR EACH ROW EXECUTE PROCEDURE public.set_coupon_deals_updated_at();

-- ---------------------------------------------------------------------------
-- 2. RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.coupon_deals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "coupon_deals: public read active" ON public.coupon_deals;
CREATE POLICY "coupon_deals: public read active"
  ON public.coupon_deals FOR SELECT
  USING (status = 'active' AND deleted_at IS NULL);

DROP POLICY IF EXISTS "coupon_deals: admin read all" ON public.coupon_deals;
CREATE POLICY "coupon_deals: admin read all"
  ON public.coupon_deals FOR SELECT TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "coupon_deals: admin insert" ON public.coupon_deals;
CREATE POLICY "coupon_deals: admin insert"
  ON public.coupon_deals FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "coupon_deals: admin update" ON public.coupon_deals;
CREATE POLICY "coupon_deals: admin update"
  ON public.coupon_deals FOR UPDATE TO authenticated
  USING  (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "coupon_deals: admin delete" ON public.coupon_deals;
CREATE POLICY "coupon_deals: admin delete"
  ON public.coupon_deals FOR DELETE TO authenticated
  USING (public.is_admin());

-- ---------------------------------------------------------------------------
-- 3. coupon-images storage bucket
-- ---------------------------------------------------------------------------

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'coupon-images',
  'coupon-images',
  true,
  3145728, -- 3 MB
  ARRAY['image/jpeg','image/jpg','image/png','image/webp']
)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "coupon-images: public read" ON storage.objects;
CREATE POLICY "coupon-images: public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'coupon-images');

DROP POLICY IF EXISTS "coupon-images: admin insert" ON storage.objects;
CREATE POLICY "coupon-images: admin insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'coupon-images' AND public.is_admin());

DROP POLICY IF EXISTS "coupon-images: admin update" ON storage.objects;
CREATE POLICY "coupon-images: admin update"
  ON storage.objects FOR UPDATE TO authenticated
  USING  (bucket_id = 'coupon-images' AND public.is_admin())
  WITH CHECK (bucket_id = 'coupon-images' AND public.is_admin());

DROP POLICY IF EXISTS "coupon-images: admin delete" ON storage.objects;
CREATE POLICY "coupon-images: admin delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'coupon-images' AND public.is_admin());

-- ---------------------------------------------------------------------------
-- 4. Audit trigger for coupon_deals
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS audit_coupon_deals ON public.coupon_deals;
CREATE TRIGGER audit_coupon_deals
  AFTER INSERT OR UPDATE OR DELETE ON public.coupon_deals
  FOR EACH ROW EXECUTE PROCEDURE public.audit_log_trigger_fn();
