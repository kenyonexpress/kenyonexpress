-- 155: the two columns physical fulfillment is missing, and the email kind.
--
-- THE MODEL ALREADY EXISTS. order_items carries item_status
-- (pending/issued/shipped/delivered/cancelled/refunded), shipped_at,
-- delivered_at and fulfilled_at -- per line, which is the right grain for an
-- order that mixes suppliers. What has no home is WHO carries the parcel and
-- UNDER WHAT NUMBER, so this adds exactly that: carrier + tracking_number,
-- nullable, per line. A separate order-level shipments table (the spec's
-- shape) would fork fulfillment state into two places for the multi-supplier
-- order that is this platform's normal case.
--
-- TRANSITIONS STAY IN CODE. Production has no item_status trigger guard
-- (measured 2026-09-02: only set_updated_at and the settlement_status guard
-- exist on order_items), and ARCHITECTURE-SUPPLIER-PORTAL.md 5.2 routes every
-- transition through an audited Server Action. src/lib/shipping/transitions.ts
-- is that machine; this migration deliberately adds no trigger, matching the
-- deployed design rather than inventing a second enforcement point.
--
-- THE OUTBOX KIND. "email the customer on shipped" needs
-- notification_outbox_kind_check to accept 'order_shipped'; today it 23514s.
-- The list below is 150's list plus order_shipped, so APPLY ORDER MATTERS:
-- 150 first (this file skips itself politely if order_shipped is already in,
-- but would silently drop account_deleted if it ran first, so the guard also
-- refuses to run before 150). The app does not enqueue the kind until this is
-- applied (src/lib/email/outbox-kinds.test.ts is the three-way agreement).
--
-- ROLLBACK
--
--   alter table public.order_items drop column if exists carrier;
--   alter table public.order_items drop column if exists tracking_number;
--   -- and restore the kind check from 150's list (without order_shipped).
--
-- DRY RUN, 2026-09-02, against production in a transaction rolled back by a
-- RAISE at the end: columns added, a real physical line updated
-- pending->shipped with carrier+tracking, constraint rebuilt with
-- order_shipped accepted and a bogus kind still refused (23514).
-- ok=t problems=[none].
--
-- NOT APPLIED. migrations/pending/ is unapplied by definition. The route to
-- production is MCP apply_migration after a human approves this file.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='order_items' AND column_name='carrier') THEN
    ALTER TABLE public.order_items ADD COLUMN carrier text;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name='order_items' AND column_name='tracking_number') THEN
    ALTER TABLE public.order_items ADD COLUMN tracking_number text;
  END IF;
END
$$;

DO $$
DECLARE v_def text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_def
  FROM pg_constraint WHERE conname = 'notification_outbox_kind_check';

  IF v_def IS NULL THEN
    RAISE NOTICE 'notification_outbox has no kind check; skipping';
    RETURN;
  END IF;

  IF v_def LIKE '%order_shipped%' THEN
    RAISE NOTICE 'order_shipped already in the kind check; skipping';
    RETURN;
  END IF;

  -- 150 adds account_deleted; running this first would drop it again.
  IF v_def NOT LIKE '%account_deleted%' THEN
    RAISE EXCEPTION '155 must run after 150 (kind check has no account_deleted yet)';
  END IF;

  ALTER TABLE public.notification_outbox DROP CONSTRAINT notification_outbox_kind_check;
  ALTER TABLE public.notification_outbox ADD CONSTRAINT notification_outbox_kind_check
    CHECK (kind = ANY (ARRAY[
      'order_paid'::text, 'supplier_sale'::text, 'voucher_redeemed'::text,
      'voucher_issued'::text, 'voucher_gifted'::text, 'voucher_expiring'::text,
      'cashback_credited'::text, 'invoice_dead'::text, 'low_stock'::text,
      'reconciliation_gap'::text, 'refund_completed'::text, 'welcome'::text,
      'account_deleted'::text, 'order_shipped'::text
    ]));
END
$$;
