-- 049_admin_rbac_support.sql
-- Phase 6 admin RBAC: support role + is_support() + explicit support SELECT
-- policies + unified pending-queues view for the admin cockpit.
--
-- Prerequisites (live): 025 consolidation, 046/047 checkout runtime and
-- settlement, 048 product approval workflow, 010 referrals/affiliates
-- (applied alongside this migration; both are idempotent).
--
-- Per ARCHITECTURE-ADMIN-OPS-V2 section 6: support sits OUTSIDE the
-- has_role() hierarchy. It gets is_support() plus explicit SELECT policies
-- only. No access to audit_log, security data, or money mutations.
-- Apply ONLY via Supabase MCP apply_migration.

-- Defensive: 001 is not idempotent and may have stopped early on a live DB.
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 1. support enum value
-- ---------------------------------------------------------------------------

ALTER TYPE public.user_role ADD VALUE IF NOT EXISTS 'support';

-- ---------------------------------------------------------------------------
-- 2. is_support(): true for support and for the admin tier.
--
-- The comparison is on role::text, NOT on enum literals: Postgres forbids
-- using an enum value added by ALTER TYPE ... ADD VALUE inside the same
-- transaction, and this migration runs as one transaction. Casting the
-- column to text sidesteps that while keeping the check exact.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_support()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role::text IN ('support', 'admin', 'super_admin')
  );
$$;

-- ---------------------------------------------------------------------------
-- 3. Explicit support SELECT policies (live tables only).
--    Admin tier already has ALL policies on these tables; is_support()
--    returning true for admins just makes the grants overlap harmlessly.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS orders_support_select ON public.orders;
CREATE POLICY orders_support_select
  ON public.orders FOR SELECT TO authenticated
  USING (public.is_support() AND deleted_at IS NULL);

DROP POLICY IF EXISTS order_items_support_select ON public.order_items;
CREATE POLICY order_items_support_select
  ON public.order_items FOR SELECT TO authenticated
  USING (public.is_support() AND deleted_at IS NULL);

DROP POLICY IF EXISTS profiles_support_select ON public.profiles;
CREATE POLICY profiles_support_select
  ON public.profiles FOR SELECT TO authenticated
  USING (public.is_support());

DROP POLICY IF EXISTS coupon_codes_support_select ON public.coupon_codes;
CREATE POLICY coupon_codes_support_select
  ON public.coupon_codes FOR SELECT TO authenticated
  USING (public.is_support());

DROP POLICY IF EXISTS wallet_balances_support_select ON public.wallet_balances;
CREATE POLICY wallet_balances_support_select
  ON public.wallet_balances FOR SELECT TO authenticated
  USING (public.is_support() AND deleted_at IS NULL);

DROP POLICY IF EXISTS wallet_transactions_support_select ON public.wallet_transactions;
CREATE POLICY wallet_transactions_support_select
  ON public.wallet_transactions FOR SELECT TO authenticated
  USING (public.is_support() AND deleted_at IS NULL);

-- Affiliates module (tables from 010): support reads, admin manages.
DO $$ BEGIN
  IF to_regclass('public.affiliates') IS NOT NULL THEN
    DROP POLICY IF EXISTS affiliates_support_select ON public.affiliates;
    CREATE POLICY affiliates_support_select
      ON public.affiliates FOR SELECT TO authenticated
      USING (public.is_support() AND deleted_at IS NULL);
  END IF;
  IF to_regclass('public.referrals') IS NOT NULL THEN
    DROP POLICY IF EXISTS referrals_support_select ON public.referrals;
    CREATE POLICY referrals_support_select
      ON public.referrals FOR SELECT TO authenticated
      USING (public.is_support() AND deleted_at IS NULL);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. Unified pending-queues view for the cockpit and sidebar badges.
--    security_invoker: the caller's own RLS applies, so non-staff callers
--    see zero rows rather than leaking counts.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE VIEW public.v_admin_pending_queues
WITH (security_invoker = true) AS
SELECT 'product_approvals' AS queue,
       count(*)::int       AS n,
       min(submitted_at)   AS oldest_at,
       interval '3 days'   AS sla
  FROM public.products
 WHERE approval_status = 'pending'::public.product_approval_status
   AND deleted_at IS NULL
UNION ALL
SELECT 'stuck_payments',
       count(*)::int,
       min(created_at),
       interval '1 hour'
  FROM public.payments
 WHERE status IN ('initiated'::public.payment_status,
                  'redirected'::public.payment_status)
   AND created_at < now() - interval '10 minutes'
UNION ALL
SELECT 'expired_pending_orders',
       count(*)::int,
       min(created_at),
       interval '1 day'
  FROM public.orders
 WHERE status = 'pending'::public.order_status
   AND expires_at IS NOT NULL
   AND expires_at < now()
   AND deleted_at IS NULL
UNION ALL
SELECT 'affiliate_applications',
       count(*)::int,
       min(created_at),
       interval '3 days'
  FROM public.affiliates
 WHERE status = 'pending_review'::public.affiliate_status
   AND deleted_at IS NULL;
