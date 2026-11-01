-- ============================================================================
-- PENDING: Add push notification tracking columns
-- ============================================================================
--
-- STATUS: NOT APPLIED. Apply only through MCP apply_migration, never db push.
--
-- Adds tracking columns to vouchers table to avoid sending duplicate
-- expiry notifications to the same user.
--
-- ============================================================================

ALTER TABLE public.vouchers
  ADD COLUMN IF NOT EXISTS push_expiry_notified_at timestamp with time zone;

COMMENT ON COLUMN public.vouchers.push_expiry_notified_at IS
  'When the user was notified that this voucher is expiring soon (24h reminder)';

CREATE INDEX IF NOT EXISTS vouchers_push_expiry_notified_at_idx
  ON public.vouchers (push_expiry_notified_at)
  WHERE push_expiry_notified_at IS NULL;

-- ============================================================================
-- ROLLBACK
--
--   ALTER TABLE public.vouchers DROP COLUMN IF EXISTS push_expiry_notified_at;
--   DROP INDEX IF EXISTS vouchers_push_expiry_notified_at_idx;
-- ============================================================================
