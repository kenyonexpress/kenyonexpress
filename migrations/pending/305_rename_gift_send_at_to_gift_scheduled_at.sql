-- 305: Rename gift_send_at to gift_scheduled_at for clarity
-- Migration 186 added gift_send_at but the feature spec calls it gift_scheduled_at
-- This is a rename only, no data loss
-- Rollback: ALTER TABLE public.orders RENAME COLUMN gift_scheduled_at TO gift_send_at;

ALTER TABLE public.orders
  RENAME COLUMN gift_send_at TO gift_scheduled_at;

COMMENT ON COLUMN public.orders.gift_scheduled_at IS
  'When the gift email for this order should be sent. NULL = send immediately after payment.';
