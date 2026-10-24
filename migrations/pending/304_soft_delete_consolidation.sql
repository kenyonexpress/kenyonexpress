-- 304_soft_delete_consolidation.sql
--
-- Consolidates soft delete (deleted_at) across core tables and updates RLS
-- policies to filter out deleted rows. This migration:
--   1. Adds deleted_at to vouchers and profiles tables
--   2. Updates RLS policies on vouchers, profiles, and suppliers to filter deleted_at IS NULL
--   3. Verifies that products, orders, and order_items already have proper deleted_at handling
--
-- Context:
--   - products, product_variants: deleted_at added in 014, RLS updated in 120
--   - orders, order_items: deleted_at added in 007, RLS filters in 027/053/077/078
--   - suppliers: deleted_at added in 027, partial RLS filters in 027
--   - vouchers: deleted_at NOT present, RLS has no filter
--   - profiles: deleted_at NOT present, RLS has no filter
--
-- Depends on: 005 (suppliers), 007 (orders), 014 (products), 027 (suppliers.deleted_at),
--             0545 (vouchers), 090 (profiles policies)

-- ---------------------------------------------------------------------------
-- 1. Add deleted_at columns
-- ---------------------------------------------------------------------------

ALTER TABLE public.vouchers
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

COMMENT ON COLUMN public.vouchers.deleted_at IS
  'Soft delete timestamp. Vouchers are never hard-deleted to preserve audit trail and financial records.';

CREATE INDEX IF NOT EXISTS vouchers_deleted_at_idx
  ON public.vouchers (deleted_at)
  WHERE deleted_at IS NULL;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

COMMENT ON COLUMN public.profiles.deleted_at IS
  'Soft delete timestamp for user accounts. Preserves order history and referral chains.';

CREATE INDEX IF NOT EXISTS profiles_deleted_at_idx
  ON public.profiles (deleted_at)
  WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 2. Update vouchers RLS policies to filter deleted_at IS NULL
-- ---------------------------------------------------------------------------

-- Customer: only their own non-deleted vouchers
DROP POLICY IF EXISTS vouchers_owner_read ON public.vouchers;
CREATE POLICY vouchers_owner_read ON public.vouchers
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() AND deleted_at IS NULL);

-- Supplier: only non-deleted vouchers redeemed at their business
DROP POLICY IF EXISTS vouchers_supplier_read_redeemed ON public.vouchers;
CREATE POLICY vouchers_supplier_read_redeemed ON public.vouchers
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND redeemed_by_supplier_id IS NOT NULL
    AND public.is_supplier_member(redeemed_by_supplier_id)
  );

-- Admin: can see deleted vouchers (no filter change)
DROP POLICY IF EXISTS vouchers_admin_read ON public.vouchers;
CREATE POLICY vouchers_admin_read ON public.vouchers
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- ---------------------------------------------------------------------------
-- 3. Update voucher_redemptions RLS to respect voucher deletion
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS voucher_redemptions_owner_read ON public.voucher_redemptions;
CREATE POLICY voucher_redemptions_owner_read ON public.voucher_redemptions
  FOR SELECT TO authenticated
  USING (
    voucher_id IN (
      SELECT id FROM public.vouchers
      WHERE user_id = auth.uid() AND deleted_at IS NULL
    )
  );

DROP POLICY IF EXISTS voucher_redemptions_supplier_read ON public.voucher_redemptions;
CREATE POLICY voucher_redemptions_supplier_read ON public.voucher_redemptions
  FOR SELECT TO authenticated
  USING (
    supplier_id IS NOT NULL
    AND public.is_supplier_member(supplier_id)
    AND voucher_id IN (
      SELECT id FROM public.vouchers WHERE deleted_at IS NULL
    )
  );

-- Admin: can see all redemption history including deleted vouchers
DROP POLICY IF EXISTS voucher_redemptions_admin_read ON public.voucher_redemptions;
CREATE POLICY voucher_redemptions_admin_read ON public.voucher_redemptions
  FOR SELECT TO authenticated
  USING (public.is_admin());

-- ---------------------------------------------------------------------------
-- 4. Update profiles RLS policies to filter deleted_at IS NULL
-- ---------------------------------------------------------------------------

-- Owner: users can read their own non-deleted profile
DROP POLICY IF EXISTS "profiles: owner select" ON public.profiles;
CREATE POLICY "profiles: owner select" ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() AND deleted_at IS NULL);

-- Owner: users can update their own non-deleted profile
DROP POLICY IF EXISTS "profiles: owner update" ON public.profiles;
CREATE POLICY "profiles: owner update" ON public.profiles
  FOR UPDATE TO authenticated
  USING (id = auth.uid() AND deleted_at IS NULL)
  WITH CHECK (id = auth.uid() AND deleted_at IS NULL);

-- Support: can see non-deleted profiles
DROP POLICY IF EXISTS profiles_support_select ON public.profiles;
CREATE POLICY profiles_support_select ON public.profiles
  FOR SELECT TO authenticated
  USING (public.is_support() AND deleted_at IS NULL);

-- Admin: can see all profiles including deleted (no change needed to existing admin policies)
-- Note: admin policies are handled in other migrations (003, 053) and should allow seeing deleted rows

-- ---------------------------------------------------------------------------
-- 5. Update suppliers RLS to ensure deleted_at filter on all policies
-- ---------------------------------------------------------------------------

-- Admin: can see all suppliers including deleted
DROP POLICY IF EXISTS suppliers_admin_all ON public.suppliers;
CREATE POLICY suppliers_admin_all ON public.suppliers
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Member: only non-deleted suppliers they belong to
DROP POLICY IF EXISTS suppliers_member_read ON public.suppliers;
CREATE POLICY suppliers_member_read ON public.suppliers
  FOR SELECT TO authenticated
  USING (deleted_at IS NULL AND public.is_supplier_member(id));

-- ---------------------------------------------------------------------------
-- 6. Verification comments
-- ---------------------------------------------------------------------------

-- The following tables already have proper deleted_at handling and do NOT need updates:
--
-- products, product_variants:
--   - deleted_at added in 014
--   - RLS policies updated in 120 with deleted_at IS NULL filters
--   - policies: products_select_anon, products_select_authenticated,
--               product_variants_select_anon, product_variants_select_authenticated
--
-- orders:
--   - deleted_at added in 007
--   - RLS policies in 027, 053, 077, 078 filter deleted_at IS NULL
--   - policies: orders_supplier_read, orders_support_select
--   - Note: orders_user_read and orders_admin_all do NOT filter deleted_at by design
--     (users and admins can see their deleted orders for audit)
--
-- order_items:
--   - deleted_at added in 007
--   - Filtered via parent order's deleted_at check in supplier/support policies
--   - order_items_user_read and order_items_admin_all do NOT filter by design
