-- 121: the outbox CHECK allowed 5 kinds while the application emits 10.
--
-- APPLIED TO THE HOSTED PROJECT VIA MCP apply_migration ON 2026-08-19.
--
-- MEASURED, NOT ASSUMED. A rolled-back DO block inserted all ten kinds the
-- code enqueues and counted what the constraint refused:
--
--   ACCEPTED: order_paid, supplier_sale, voucher_redeemed, voucher_issued, voucher_gifted
--   REJECTED: voucher_expiring, cashback_credited, invoice_dead, low_stock, reconciliation_gap
--
-- `fn_enqueue_notification` does a plain INSERT, so each of those five raises
-- 23514 straight back at the caller. In production that silently disabled the
-- coupon-expiry reminder sweep, the cashback credit mail INSIDE the payment
-- finalize path, and all three operator alerts -- dead invoice, low stock, and
-- the reconciliation gap, the alert whose whole job is to be the thing that
-- tells someone the money does not reconcile.
--
-- Widened to every kind `buildNotification` in src/lib/email/notifications.ts
-- can render, plus the two (21) called for. The CHECK is kept rather than
-- dropped: it is what makes a typo'd kind fail loudly at the insert instead of
-- parking a row the drain can never render.
--
-- `src/lib/email/outbox-kinds.test.ts` holds this list as a measurement and
-- fails if src starts enqueuing something absent from it.

alter table public.notification_outbox
  drop constraint if exists notification_outbox_kind_check;

alter table public.notification_outbox
  add constraint notification_outbox_kind_check check (kind = any (array[
    -- rendered today by buildNotification()
    'order_paid',
    'supplier_sale',
    'voucher_redeemed',
    'voucher_issued',
    'voucher_gifted',
    'voucher_expiring',
    'cashback_credited',
    'invoice_dead',
    'low_stock',
    'reconciliation_gap',
    -- (21): builders landed in the same commit as this constraint
    'refund_completed',
    'welcome'
  ]::text[]));
