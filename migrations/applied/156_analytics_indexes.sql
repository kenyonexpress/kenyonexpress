-- 156: two partial indexes for the admin analytics windows.
--
-- loadSalesLines filters order_items by orders.paid_at over a rolling window
-- (30/70/365 days), and the voucher metrics scan redeemed_at the same way.
-- Production has NO index on orders.paid_at for paid orders (measured
-- 2026-09-02: only idx_orders_pending_expiry, which is the opposite half --
-- WHERE paid_at IS NULL) and none on vouchers.redeemed_at alone
-- (vouchers_redeemed_by_supplier_idx leads on supplier_id, so an
-- admin-wide-window scan cannot use it).
--
-- Partial on purpose: the predicate halves each index and matches the query
-- shape exactly -- analytics never asks about unpaid orders or unredeemed
-- vouchers through these paths.
--
-- ROLLBACK
--
--   drop index if exists idx_orders_paid_at_paid;
--   drop index if exists idx_vouchers_redeemed_at;
--
-- DRY RUN, 2026-09-02, against production in a transaction that was rolled
-- back: both created and visible in pg_indexes (count=2) inside the
-- transaction. ok=t.
--
-- NOT APPLIED. migrations/pending/ is unapplied by definition. The route to
-- production is MCP apply_migration after a human approves this file.

CREATE INDEX IF NOT EXISTS idx_orders_paid_at_paid
  ON public.orders (paid_at DESC)
  WHERE paid_at IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_vouchers_redeemed_at
  ON public.vouchers (redeemed_at DESC)
  WHERE status = 'redeemed';
