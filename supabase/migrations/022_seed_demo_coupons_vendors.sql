-- 022: Restore public read for active vendors
-- Idempotent: safe to run multiple times.
--
-- The homepage Brands section reads vendors, but vendors lost its public read
-- (anon visitors get 0 rows). This restores public read for active vendors.
-- (The Hot Coupons section and its demo coupon seed were removed per product
-- decision; the demo vendors are seeded in migration 023.)

DROP POLICY IF EXISTS "vendors: public select active" ON public.vendors;
CREATE POLICY "vendors: public select active"
  ON public.vendors FOR SELECT
  USING ((status = 'active' AND deleted_at IS NULL) OR public.is_admin());
