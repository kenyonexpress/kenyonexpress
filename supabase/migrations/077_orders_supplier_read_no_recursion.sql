-- 077_orders_supplier_read_no_recursion.sql
--
-- Breaks an RLS recursion cycle that makes `orders` unreadable by ANYONE.
--
-- 027 gives suppliers a read on orders containing their items:
--
--     orders_supplier_read USING (... EXISTS (SELECT 1 FROM order_items oi
--                                             WHERE oi.order_id = orders.id ...))
--
-- and 027 also gives customers a read on order_items:
--
--     order_items_user_read USING (order_id IN (SELECT id FROM orders
--                                               WHERE user_id = auth.uid()))
--
-- Evaluating the first requires reading order_items, which evaluates the second,
-- which requires reading orders, which evaluates the first. Postgres stops it
-- with 42P17 `infinite recursion detected in policy for relation "orders"`.
--
-- Policies are OR'd, so this fires for EVERY reader, not only suppliers: on a
-- database carrying both policies, a customer opening /account/orders gets the
-- recursion error rather than their own orders. Found by running
-- tests/sql/voucher_account_rls.sql against a freshly reset local stack.
--
-- The fix is the standard one: move the inner lookup into a SECURITY DEFINER
-- function. It runs as the owner, so the order_items read inside it does not
-- re-enter RLS, and the cycle cannot form. The function is narrow on purpose -
-- it answers one boolean about the CALLER's own memberships and exposes no row
-- to anybody.
--
-- ⚠️ This migration deliberately does NOT create the policy where it is absent.
-- The hosted project never received 027 in full (only the adapted subset in
-- 072), so it has no orders_supplier_read and suppliers cannot read orders
-- there. Granting them that access is a real change in who can see customer
-- orders and shipping addresses, and it belongs to whoever owns that decision,
-- not to a bug fix. Here this migration only creates the helper.
--
-- Idempotent, forward-only. Depends on: 027 (the policies), 072
-- (supplier_members, is_supplier_member).

-- Answers "does the caller staff a supplier with a line on this order", without
-- letting the order_items read pass back through RLS.
CREATE OR REPLACE FUNCTION public.is_supplier_order(p_order_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.order_items oi
    WHERE oi.order_id = p_order_id
      AND oi.supplier_id IS NOT NULL
      AND oi.deleted_at IS NULL
      AND public.is_supplier_member(oi.supplier_id)
  )
$$;

COMMENT ON FUNCTION public.is_supplier_order(uuid) IS
  'True when the caller is an active member of a supplier holding a line on this order. SECURITY DEFINER so that RLS on order_items is not re-entered from the orders policy, which is what caused 42P17 recursion. Returns a boolean only, never a row.';

REVOKE ALL ON FUNCTION public.is_supplier_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_supplier_order(uuid) TO authenticated;

-- Replace the recursive policy only where it already exists.
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.orders'::regclass
      AND polname = 'orders_supplier_read'
  ) THEN
    DROP POLICY orders_supplier_read ON public.orders;

    -- Same intent as 027: paid orders only, so pending carts stay hidden, and
    -- the supplier still needs the order row for the shipping address.
    CREATE POLICY orders_supplier_read
      ON public.orders FOR SELECT TO authenticated
      USING (
        deleted_at IS NULL
        AND status IN ('paid'::public.order_status,
                       'partially_fulfilled'::public.order_status,
                       'fulfilled'::public.order_status)
        AND public.is_supplier_order(id)
      );
  END IF;
END $$;

-- user_addresses carries the same shape of policy from 027 and the same cycle
-- risk, for the same reason: it reaches through order_items back into orders.
DO $$
DECLARE
  v_qual text;
BEGIN
  SELECT pg_get_expr(polqual, polrelid) INTO v_qual
  FROM pg_policy
  WHERE polrelid = 'public.user_addresses'::regclass
    AND polname = 'user_addresses_supplier_read';

  IF v_qual IS NOT NULL AND v_qual LIKE '%orders%' THEN
    DROP POLICY user_addresses_supplier_read ON public.user_addresses;

    CREATE POLICY user_addresses_supplier_read
      ON public.user_addresses FOR SELECT TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM public.orders o
          WHERE o.address_id = user_addresses.id
            AND o.deleted_at IS NULL
            AND o.status IN ('paid'::public.order_status,
                             'partially_fulfilled'::public.order_status,
                             'fulfilled'::public.order_status)
            AND public.is_supplier_order(o.id)
        )
      );
  END IF;
END $$;
