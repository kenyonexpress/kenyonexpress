-- Migration 044: Link ALL products to the 6 existing demo vendors, by category
-- ============================================================================
-- products.supplier_id references public.suppliers (NOT public.vendors), so
-- the 6 legacy vendor rows are first mirrored into public.suppliers with the
-- SAME UUIDs (the planned 036_vendors_unification direction: suppliers is the
-- canonical entity per 027). Then every product is linked by category:
--
--   electronics       -> אלקטרו פלוס
--   phones-computers  -> טק וורלד
--   restaurants-cafes -> טעמים גורמה
--   professionals     -> טעמים גורמה   (bar-drink: food & drink)
--   beauty-health     -> ביוטי לאב
--   vacation          -> ספורט מקס     (leisure)
--   baby-kids         -> סטייל הבית
--   anything else     -> סטייל הבית    (general catch-all)
--
-- Supersedes the interim 043 demo-supplier assignment; the three 043 demo
-- suppliers are removed once nothing references them.
-- Uses only 005-era supplier columns (live DB has not applied 027/042).
-- Fully idempotent.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Mirror the 6 vendors into public.suppliers (same UUIDs)
-- ---------------------------------------------------------------------------

INSERT INTO public.suppliers (id, name, contact_email, contact_phone, commission_percent, notes)
SELECT
  v.id,
  v.business_name,
  v.contact_email,
  v.contact_phone,
  COALESCE(v.commission_rate, 10),
  'שוקף מ-public.vendors (044); ישות קנונית עד איחוד 036'
FROM public.vendors v
WHERE v.deleted_at IS NULL
ON CONFLICT (id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 2. Link ALL products by category (also relinks previous assignments)
-- ---------------------------------------------------------------------------

WITH vendor_ids AS (
  SELECT
    (SELECT id FROM public.vendors WHERE business_name = 'אלקטרו פלוס')  AS electro,
    (SELECT id FROM public.vendors WHERE business_name = 'טק וורלד')     AS tech,
    (SELECT id FROM public.vendors WHERE business_name = 'טעמים גורמה')  AS gourmet,
    (SELECT id FROM public.vendors WHERE business_name = 'ביוטי לאב')    AS beauty,
    (SELECT id FROM public.vendors WHERE business_name = 'ספורט מקס')    AS sport,
    (SELECT id FROM public.vendors WHERE business_name = 'סטייל הבית')   AS home
),
target AS (
  SELECT
    p.id AS product_id,
    CASE COALESCE(c.slug, '')
      WHEN 'electronics'       THEN vi.electro
      WHEN 'phones-computers'  THEN vi.tech
      WHEN 'restaurants-cafes' THEN vi.gourmet
      WHEN 'professionals'     THEN vi.gourmet
      WHEN 'beauty-health'     THEN vi.beauty
      WHEN 'vacation'          THEN vi.sport
      ELSE vi.home
    END AS supplier_id
  FROM public.products p
  LEFT JOIN public.categories c ON c.id = p.category_id
  CROSS JOIN vendor_ids vi
)
UPDATE public.products p
SET supplier_id = t.supplier_id
FROM target t
WHERE p.id = t.product_id
  AND t.supplier_id IS NOT NULL
  AND p.supplier_id IS DISTINCT FROM t.supplier_id;

-- ---------------------------------------------------------------------------
-- 3. Drop the interim 043 demo suppliers once nothing references them
-- ---------------------------------------------------------------------------

DELETE FROM public.suppliers s
WHERE s.id IN (
  'f47ac10b-58cc-4372-a567-0e02b2c3d101',
  'f47ac10b-58cc-4372-a567-0e02b2c3d102',
  'f47ac10b-58cc-4372-a567-0e02b2c3d103'
)
AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.supplier_id = s.id);
