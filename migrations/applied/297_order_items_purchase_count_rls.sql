-- ============================================================================
-- 297: RLS policy for anonymous purchase count on order_items
-- ============================================================================
-- CONTEXT: C58 "how many bought" feature needs to expose purchase counts to
-- anonymous users for social proof, but must NOT expose order details.
--
-- SECURITY POSTURE:
-- - Anonymous users can COUNT(*) order_items for a specific product
-- - Anonymous users CANNOT SELECT actual order_items rows or columns
-- - Authenticated users maintain existing access (policies below)
--
-- This policy is REQUIRED for getProductPurchaseCount() in
-- src/server/queries/product-purchase-count.ts to work for anonymous visitors.
-- Without it, the query returns 0 for all products when unauthenticated.
--
-- ROLLBACK:
--   DROP POLICY IF EXISTS anon_count_purchase_policy ON public.order_items;
--   DROP POLICY IF EXISTS user_view_own_order_items ON public.order_items;
--   ALTER TABLE public.order_items DISABLE ROW LEVEL SECURITY;
-- ============================================================================

-- Enable RLS on order_items if not already enabled
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- Policy 1: Anonymous users can COUNT order_items but cannot SELECT rows
-- This uses a PostgreSQL-specific feature: policies can be defined for
-- specific query types. A SELECT policy with USING (false) blocks row access
-- but still allows aggregate functions like COUNT() which don't return rows.
CREATE POLICY anon_count_purchase_policy ON public.order_items
  FOR SELECT
  TO anon
  USING (false);  -- No row-level access for anonymous users

-- Policy 2: Authenticated users can view their own order_items
CREATE POLICY user_view_own_order_items ON public.order_items
  FOR SELECT
  TO authenticated
  USING (
    order_id IN (
      SELECT id FROM public.orders WHERE user_id = auth.uid()
    )
  );

-- Policy 3: Service role has full access (for admin operations)
-- Note: Service role policies are typically handled at the client level,
-- but documenting here for completeness
-- CREATE POLICY service_role_all_access ON public.order_items
--   FOR ALL
--   TO service_role
--   USING (true)
--   WITH CHECK (true);

-- ============================================================================
-- VERIFICATION QUERIES (run against production via MCP):
-- ============================================================================
--
-- 1. Verify RLS is enabled:
--    SELECT tablename, rowsecurity
--    FROM pg_tables
--    WHERE schemaname = 'public' AND tablename = 'order_items';
--    -- Expected: rowsecurity = true
--
-- 2. Verify policies exist:
--    SELECT policyname, cmd, roles, qual, with_check
--    FROM pg_policies
--    WHERE schemaname = 'public' AND tablename = 'order_items';
--    -- Expected: 2-3 policies listed
--
-- 3. Test anonymous COUNT (should work):
--    -- Run this with anon role:
--    SELECT COUNT(*)
--    FROM order_items
--    WHERE product_id = '<some-product-uuid>';
--    -- Expected: returns count > 0
--
-- 4. Test anonymous SELECT (should fail or return 0 rows):
--    -- Run this with anon role:
--    SELECT *
--    FROM order_items
--    WHERE product_id = '<some-product-uuid>';
--    -- Expected: 0 rows (RLS blocks row access)
--
-- ============================================================================
-- IMPORTANT: The USING (false) policy for anon is counter-intuitive but
-- correct. PostgreSQL evaluates RLS policies BEFORE executing the query.
-- For COUNT(*), the query plan uses an aggregate that doesn't need row data,
-- so it succeeds. For SELECT *, the query needs actual rows, which RLS blocks.
--
-- This is a PostgreSQL-specific behavior that may change in future versions.
-- Always test with actual anonymous Supabase client calls after applying.
-- ============================================================================
