-- 253_notification_outbox_order_delivered.sql
--
-- One more kind for the notification outbox: `order_delivered` (STEP 16, the
-- transactional email templates, 01.10).
--
-- WHAT EXISTS. `notification_outbox_kind_check` was last restated by 234
-- (applied 2026-09-10) and measured the same day at seventeen names, listed
-- in `src/lib/email/outbox-kinds.test.ts` as CHECK_ACCEPTS. The shipped mail
-- has a trigger (183/196) because `fulfilled` is an order status. Delivery
-- is not: on this schema it is a fold over `order_items.item_status`
-- (`summarizeShipping`, src/lib/orders/shipping-summary.ts), so there is no
-- status transition for a trigger to watch, and the customer's "delivered"
-- mail is enqueued by the application from the two writers of that status,
-- the fulfilment board and the per-line admin action, through
-- `fn_enqueue_notification` (five-argument overload) with dedupe key
-- `order-delivered:<order_id>` (src/server/orders/delivered-notification.ts).
--
-- WHAT THIS DOES. Widens the CHECK with `order_delivered`. Nothing else: no
-- trigger, no grant, no policy, no new column. Until this is applied the
-- INSERT inside `fn_enqueue_notification` raises 23514 for the new kind; the
-- enqueuer catches it, logs `fulfillment.delivered_kind_not_accepted`, and
-- the delivery itself stands. The renderer (`buildOrderDeliveredEmail`,
-- src/lib/email/notifications.ts) already knows the kind, so the drain can
-- send rows the moment this lands.
--
-- RESTATING A CONSTRAINT MEANS RE-MEASURING IT FIRST (183's lesson: a draft
-- that restated a stale list would have dropped `account_deleted`). The
-- seventeen below are the 2026-09-10 measurement. Before applying, run:
--
--   select pg_get_constraintdef(oid) from pg_constraint
--    where conname = 'notification_outbox_kind_check';
--
-- and if the live list has grown since, add the new names here first. The
-- closing DO block counts the names out of the applied constraint and raises
-- if any of the eighteen is missing, so a stale restatement cannot apply
-- quietly.
--
-- Idempotent: DROP CONSTRAINT IF EXISTS, then ADD. Re-running yields the
-- same constraint. Every existing row carries one of the seventeen old
-- kinds, so the new CHECK validates against them without a NOT VALID step.
--
-- AFTER APPLYING: re-measure, move `order_delivered` from PENDING_KINDS to
-- CHECK_ACCEPTS in src/lib/email/outbox-kinds.test.ts with the new date, and
-- move this file to migrations/applied/.
--
-- ROLLBACK (delete any order_delivered rows first, or the narrowed CHECK
-- will refuse to validate):
--   delete from public.notification_outbox where kind = 'order_delivered';
--   alter table public.notification_outbox drop constraint if exists notification_outbox_kind_check;
--   alter table public.notification_outbox add constraint notification_outbox_kind_check
--     check (kind = any (array['order_paid','supplier_sale','voucher_redeemed',
--       'voucher_issued','voucher_gifted','voucher_expiring','cashback_credited',
--       'invoice_dead','low_stock','reconciliation_gap','refund_completed','welcome',
--       'account_deleted','order_shipped','price_drop','back_in_stock',
--       'gift_card_issued']::text[]));

BEGIN;

ALTER TABLE public.notification_outbox
  DROP CONSTRAINT IF EXISTS notification_outbox_kind_check;

ALTER TABLE public.notification_outbox
  ADD CONSTRAINT notification_outbox_kind_check CHECK (kind = ANY (ARRAY[
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
    'refund_completed',
    'welcome',
    'account_deleted',
    'order_shipped',
    'price_drop',
    'back_in_stock',
    'gift_card_issued',
    -- (253): delivery confirmation, enqueued app-side when the last live
    -- physical line of the order is delivered
    'order_delivered'
  ]::text[]));

COMMENT ON CONSTRAINT notification_outbox_kind_check ON public.notification_outbox IS
  'The kinds buildNotification (src/lib/email/notifications.ts) can render. order_delivered added by 253; enqueued by src/server/orders/delivered-notification.ts, not by a trigger.';

-- Self-check: every one of the eighteen names is in the applied constraint.
DO $$
DECLARE
  v_def   text;
  v_name  text;
  v_names text[] := ARRAY[
    'order_paid', 'supplier_sale', 'voucher_redeemed', 'voucher_issued',
    'voucher_gifted', 'voucher_expiring', 'cashback_credited', 'invoice_dead',
    'low_stock', 'reconciliation_gap', 'refund_completed', 'welcome',
    'account_deleted', 'order_shipped', 'price_drop', 'back_in_stock',
    'gift_card_issued', 'order_delivered'
  ];
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_def
    FROM pg_constraint
   WHERE conname = 'notification_outbox_kind_check'
     AND conrelid = 'public.notification_outbox'::regclass;
  IF v_def IS NULL THEN
    RAISE EXCEPTION '253: notification_outbox_kind_check is missing after ADD';
  END IF;
  FOREACH v_name IN ARRAY v_names LOOP
    IF position('''' || v_name || '''' IN v_def) = 0 THEN
      RAISE EXCEPTION '253: constraint lacks %', v_name;
    END IF;
  END LOOP;
  RAISE NOTICE '253: notification_outbox_kind_check holds all % kinds', array_length(v_names, 1);
END $$;

COMMIT;
