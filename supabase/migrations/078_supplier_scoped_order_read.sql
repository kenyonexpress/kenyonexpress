-- 078_supplier_scoped_order_read.sql
--
-- Gives suppliers read access to the orders that contain their own products,
-- and nothing else. 077 deliberately stopped short of this: it repaired the
-- recursive policy where one already existed and left the decision about
-- granting the access to the owner. This is that decision, applied.
--
-- The three rules this encodes, in the order they matter:
--
--   1. A supplier reads ONLY their own lines. `order_items_supplier_read` is
--      keyed on order_items.supplier_id, so on an order that mixes two
--      suppliers each sees their own line and not the other's. There is no
--      "you can see the whole order because you are on it".
--
--   2. A supplier reads the ORDER ROW only for orders carrying such a line,
--      and only once it is paid. Pending carts stay invisible. The row itself
--      holds no personal data: `orders` has no name, email or phone column,
--      only `user_id` (an opaque uuid) and `address_id` (a reference that the
--      address policy below governs separately).
--
--   3. A supplier reads the SHIPPING ADDRESS only when they actually have to
--      ship something. The predicate requires a live PHYSICAL line of theirs on
--      that order. A coupon is redeemed in person at the business and needs no
--      address, so a coupon-only supplier never sees one. This is the concrete
--      line for "no customer personal data beyond what shipping requires".
--
-- What is NOT granted, and is worth stating because RLS is row-level and
-- silence here would be ambiguous: `profiles` gets no supplier policy, so
-- customer name, email and phone stay invisible. Suppliers also get no write
-- of any kind on any of these tables - every policy below is FOR SELECT.
--
-- Recursion: both helpers are SECURITY DEFINER. A policy on `orders` that
-- reads `order_items` re-enters that table's own policies, which read `orders`
-- back, and Postgres answers 42P17 for EVERY reader of the table, not only
-- suppliers. That outage is what 077 fixed and what these helpers avoid by
-- construction. See docs/PRODUCTION-CHANGES-2026-07-27.md section 7.
--
-- Idempotent, forward-only. Depends on: 072 (supplier_members,
-- is_supplier_member), 077 (is_supplier_order).

-- ---------------------------------------------------------------------------
-- 1. Helper: does the caller have something to SHIP on this order
-- ---------------------------------------------------------------------------
-- Narrower than is_supplier_order() on purpose. That one answers "is this
-- supplier on the order at all", which is the right test for seeing the order;
-- this one answers "does this supplier have a physical line here", which is the
-- only thing that justifies seeing where the customer lives.
CREATE OR REPLACE FUNCTION public.is_supplier_shipping_order(p_order_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.order_items oi
    WHERE oi.order_id = p_order_id
      AND oi.supplier_id IS NOT NULL
      AND oi.deleted_at IS NULL
      AND oi.product_type = 'physical'::public.product_type
      AND public.is_supplier_member(oi.supplier_id)
  )
$$;

COMMENT ON FUNCTION public.is_supplier_shipping_order(uuid) IS
  'True when the caller staffs a supplier with a live PHYSICAL line on this order, i.e. something to ship. Gates the supplier read on user_addresses: a coupon is redeemed in person, so a coupon-only supplier is never shown a customer address. SECURITY DEFINER so the order_items read does not re-enter RLS.';

REVOKE ALL ON FUNCTION public.is_supplier_shipping_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_supplier_shipping_order(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 2. Their own lines, never a co-supplier's line on the same order
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS order_items_supplier_read ON public.order_items;
CREATE POLICY order_items_supplier_read
  ON public.order_items FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND supplier_id IS NOT NULL
    AND public.is_supplier_member(supplier_id)
  );

-- ---------------------------------------------------------------------------
-- 3. The order row, once paid, for orders carrying one of those lines
-- ---------------------------------------------------------------------------
-- Statuses match what the supplier portal needs to act on. `pending` is
-- excluded so an abandoned cart is never visible, and a cancelled or refunded
-- order drops back out of sight.
DROP POLICY IF EXISTS orders_supplier_read ON public.orders;
CREATE POLICY orders_supplier_read
  ON public.orders FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND status IN ('paid'::public.order_status,
                   'partially_fulfilled'::public.order_status,
                   'fulfilled'::public.order_status)
    AND public.is_supplier_order(id)
  );

-- ---------------------------------------------------------------------------
-- 4. The shipping address, only where there is a physical line to ship
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS user_addresses_supplier_read ON public.user_addresses;
CREATE POLICY user_addresses_supplier_read
  ON public.user_addresses FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.address_id = user_addresses.id
        AND o.deleted_at IS NULL
        AND o.status IN ('paid'::public.order_status,
                         'partially_fulfilled'::public.order_status,
                         'fulfilled'::public.order_status)
        AND public.is_supplier_shipping_order(o.id)
    )
  );

COMMENT ON POLICY order_items_supplier_read ON public.order_items IS
  'A supplier reads only the lines carrying their own supplier_id. On a mixed-supplier order each sees their own line and not the other''s.';
COMMENT ON POLICY orders_supplier_read ON public.orders IS
  'A supplier reads paid orders that contain one of their lines. The row carries no customer personal data: orders has no name, email or phone column.';
COMMENT ON POLICY user_addresses_supplier_read ON public.user_addresses IS
  'A supplier reads a customer address only for a paid order on which they have a live PHYSICAL line. Coupon-only suppliers never see an address, since a coupon is redeemed in person.';
