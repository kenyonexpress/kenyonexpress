-- 050_platform_percent_required.sql
-- Business decision 2026-07-24 (docs/CONTRADICTIONS.md C1, C2, C7):
--   * platform_percent is a MANDATORY per-product field set by the admin.
--     No default anywhere. NOT NULL, no DEFAULT clause.
--   * commission_percent is retired as the split knob; its DEFAULT 5 is dropped
--     and the column is marked deprecated (kept for one release so 047-era
--     snapshots keep reading).
--   * Per-product expiry stays on the existing products.coupon_expiry_days
--     column (042). No new expiry_days column is introduced.
-- Idempotent, forward-only.

-- 1. Backfill any NULL platform_percent BEFORE tightening the constraint.
--    Order of preference: the product's own legacy commission_percent, then the
--    supplier agreement percent. Rows that resolve to neither are left NULL and
--    reported by the guard in step 2 instead of being silently invented.
UPDATE public.products p
SET platform_percent = COALESCE(
  NULLIF(p.commission_percent, 0),
  (SELECT s.commission_percent FROM public.suppliers s WHERE s.id = p.supplier_id)
)
WHERE p.platform_percent IS NULL
  AND COALESCE(
    NULLIF(p.commission_percent, 0),
    (SELECT s.commission_percent FROM public.suppliers s WHERE s.id = p.supplier_id)
  ) IS NOT NULL;

-- 2. Tighten only when every row has a value. If anything is still NULL the
--    migration raises instead of inventing a default, per C1.
DO $$
DECLARE
  missing integer;
BEGIN
  SELECT count(*) INTO missing
  FROM public.products
  WHERE platform_percent IS NULL AND deleted_at IS NULL;

  IF missing > 0 THEN
    RAISE EXCEPTION
      '050: % live products have no platform_percent. Set it per product in admin before applying (no default is allowed).',
      missing;
  END IF;

  ALTER TABLE public.products ALTER COLUMN platform_percent DROP DEFAULT;
  ALTER TABLE public.products ALTER COLUMN platform_percent SET NOT NULL;
END $$;

COMMENT ON COLUMN public.products.platform_percent IS
  'Mandatory per-product platform commission percent, set by the admin. No default. Charged on the on-site amount only (the coupon upfront for coupons). Snapshotted into order_items.platform_percent at purchase.';

-- 3. Retire commission_percent as a knob: no default, no new writes.
ALTER TABLE public.products ALTER COLUMN commission_percent DROP DEFAULT;

COMMENT ON COLUMN public.products.commission_percent IS
  'DEPRECATED (2026-07-24). Superseded by platform_percent as the single commission knob. Kept read-only for pre-050 order snapshots; do not write.';

-- 4. Drop the last invented default in SQL. 027 defined product_platform_percent
--    as COALESCE(product, supplier, 10); the literal 10 is exactly the default C1
--    forbids. After step 2 the column is NOT NULL, so the product value is always
--    the answer and the supplier fallback is dead too (C2: one knob).
CREATE OR REPLACE FUNCTION public.product_platform_percent(p_product_id uuid)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT pr.platform_percent FROM public.products pr WHERE pr.id = p_product_id
$$;

COMMENT ON FUNCTION public.product_platform_percent(uuid) IS
  'Mandatory per-product platform percent (CONTRADICTIONS C1/C2). No default and no supplier fallback: returns NULL only when the product id does not exist.';

-- 5. Restate the canonical expiry field rather than adding a duplicate.
COMMENT ON COLUMN public.products.coupon_expiry_days IS
  'Per-product coupon validity in days (30 / 60 / 90 or any integer). On expiry without redemption the paid upfront is credited to the customer wallet (CONTRADICTIONS C6).';
