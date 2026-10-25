-- 305: Add gift_scheduled_at column for scheduled gift delivery
-- Additive only, safe to re-run
-- Note: Code currently uses gift_send_at from migration 186
-- This migration adds the column as specified in F59 goal

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS gift_scheduled_at timestamptz;

COMMENT ON COLUMN public.orders.gift_scheduled_at IS
  'When the gift email should be sent. NULL = send immediately after payment. F59 specification.';
