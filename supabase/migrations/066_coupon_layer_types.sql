-- ============================================================================
-- 066_coupon_layer_types.sql
--
-- Final business rules (2026-07-24, STATE.md):
--   * Product types are coupon / physical / subscription. Only coupon is
--     implemented in the app; physical and subscription are schema-only.
--     'service' is the legacy third value; 067 migrates its rows to
--     'subscription' (enum ADD VALUE and its first use must live in separate
--     transactions, hence two files).
--   * Coupon money settles to the platform at paid-time: order_items gains the
--     settlement_status value 'platform_settled' (replaces the retired
--     escrow_held leg; escrow values remain only for rows written before the
--     cutover).
--
-- Idempotent: ADD VALUE IF NOT EXISTS only. Nothing here rewrites data.
-- Rollback: enum values cannot be dropped in place; restoring means recreating
-- the enum, which is intentionally out of scope for a forward-only file.
-- ============================================================================

ALTER TYPE public.product_type ADD VALUE IF NOT EXISTS 'subscription';

ALTER TYPE public.settlement_status ADD VALUE IF NOT EXISTS 'platform_settled';
