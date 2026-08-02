-- 095_notification_outbox.sql
--
-- The three notifications GOAL 6 asks for, enqueued by the database in the same
-- transaction as the event that causes them, and drained by
-- /api/cron/notifications through Resend.
--
-- WHY AN OUTBOX AND NOT A DIRECT SEND. The one email that exists today
-- (sendVoucherEmail) is sent inline at the end of finalizeOrder. If the process
-- dies between the charge and that call, the customer is charged and never
-- hears about it, and nothing anywhere records that an email was owed. A row
-- written in the same transaction as `paid_at` cannot be lost that way: either
-- the order is paid and the row exists, or neither happened.
--
-- WHY NOT A TRIGGER THAT SENDS. `pg_net` is not installed on this project
-- (checked: available, installed_version null), so a trigger cannot make an
-- HTTP call at all, and installing an extension on production to gain one is a
-- larger change than the feature justifies. The drain is the existing cron
-- mechanism instead, the same one 068's expiry sweep already uses.
--
-- WHY EVERY TRIGGER SWALLOWS ITS OWN ERRORS. These fire on `orders` at the
-- moment of payment and on `vouchers` inside redeem_voucher(). A notification
-- that cannot be enqueued must never fail a charge or refuse a coupon at a
-- counter. Every trigger body ends in EXCEPTION WHEN OTHERS, warns, and returns
-- NEW. The cost is a missed email; the alternative cost is a declined payment.
--
-- Idempotent and forward-only. Apply through MCP apply_migration only.

-- ---------------------------------------------------------------------------
-- 1. The outbox
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.notification_outbox (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  kind            text        NOT NULL
                              CHECK (kind IN ('order_paid', 'supplier_sale', 'voucher_redeemed')),
  recipient_email text        NOT NULL,
  payload         jsonb       NOT NULL DEFAULT '{}'::jsonb,
  -- One logical email, one row, forever. It is also handed to Resend as its
  -- idempotency key, so a row that is somehow sent twice is still one email.
  dedupe_key      text        NOT NULL UNIQUE,
  status          text        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending', 'sent', 'failed', 'dead')),
  attempts        integer     NOT NULL DEFAULT 0,
  last_error      text,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  sent_at         timestamptz
);

-- The drain's only query: pending and due, oldest first. Partial, because a
-- sent row is never selected again and there will be far more of those.
CREATE INDEX IF NOT EXISTS notification_outbox_due_idx
  ON public.notification_outbox (next_attempt_at)
  WHERE status = 'pending';

COMMENT ON TABLE public.notification_outbox IS
  'Durable queue for outbound email. Written in-transaction by triggers, drained by /api/cron/notifications with the service role. Never readable by a customer: it holds other people addresses.';

ALTER TABLE public.notification_outbox ENABLE ROW LEVEL SECURITY;

-- Admin read only. No customer or supplier policy exists on purpose: a row
-- names a recipient address, and the supplier rows name the platform's own
-- traffic. The drain runs as the service role, which bypasses RLS.
DROP POLICY IF EXISTS notification_outbox_admin_read ON public.notification_outbox;
CREATE POLICY notification_outbox_admin_read ON public.notification_outbox
  FOR SELECT USING (public.is_admin());

REVOKE ALL ON public.notification_outbox FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. Enqueue
-- ---------------------------------------------------------------------------

/**
 * The single write path. Refuses silently rather than raising, because every
 * caller is a trigger on a path that must not fail.
 *
 * Suppressions are honoured HERE and not at send time. An address that bounced
 * or complained must not be written to again, and a queue row for it would
 * otherwise sit and retry until it went dead.
 */
CREATE OR REPLACE FUNCTION public.fn_enqueue_notification(
  p_kind    text,
  p_email   text,
  p_dedupe  text,
  p_payload jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_email text := lower(btrim(coalesce(p_email, '')));
BEGIN
  IF v_email = '' OR position('@' IN v_email) = 0 THEN
    RETURN;
  END IF;

  IF to_regclass('public.email_suppressions') IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM public.email_suppressions s WHERE lower(s.email) = v_email
    ) THEN
      RETURN;
    END IF;
  END IF;

  INSERT INTO public.notification_outbox (kind, recipient_email, dedupe_key, payload)
  VALUES (p_kind, v_email, p_dedupe, coalesce(p_payload, '{}'::jsonb))
  ON CONFLICT (dedupe_key) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_enqueue_notification(text, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_enqueue_notification(text, text, text, jsonb) FROM anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Order paid: the customer, and every supplier who sold something
-- ---------------------------------------------------------------------------

/**
 * Fires when `paid_at` goes from null to a time, which is the lineage-neutral
 * signal: `status` reaches `paid` by more than one route and the money columns
 * differ between deployments, but paid_at is set once and only on payment.
 *
 * The order total is read out of `to_jsonb(NEW)` rather than named as a column.
 * This project carries `orders.total_ils` and the migrated lineage carries
 * `total_agorot`; naming either one directly would make this trigger fail to
 * even parse on the other, and a trigger that will not parse is a payment that
 * will not commit.
 */
CREATE OR REPLACE FUNCTION public.tg_orders_notify_paid()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_row           jsonb  := to_jsonb(NEW);
  v_total_agorot  bigint;
  v_email         text;
  v_name          text;
  v_items         integer;
  v_has_vouchers  boolean;
  v_supplier      record;
BEGIN
  IF NEW.paid_at IS NULL OR OLD.paid_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_total_agorot := coalesce(
    (v_row->>'total_agorot')::bigint,
    round((v_row->>'total_ils')::numeric * 100)::bigint,
    0
  );

  SELECT p.email, p.full_name INTO v_email, v_name
  FROM public.profiles p WHERE p.id = NEW.user_id;

  SELECT count(*)::integer INTO v_items
  FROM public.order_items i WHERE i.order_id = NEW.id;

  -- A coupon order already gets the voucher email from finalizeOrder, and that
  -- email IS its confirmation: it carries the codes and the link to each QR.
  -- Enqueuing another one here would send two emails for one purchase, so the
  -- confirmation is enqueued only when nothing else will be sent.
  SELECT EXISTS (SELECT 1 FROM public.vouchers v WHERE v.order_id = NEW.id)
    INTO v_has_vouchers;

  IF NOT v_has_vouchers THEN
    PERFORM public.fn_enqueue_notification(
      'order_paid',
      v_email,
      'order_paid:' || NEW.id::text,
      jsonb_build_object(
        'order_id',      NEW.id,
        'order_ref',     upper(left(NEW.id::text, 8)),
        'customer_name', v_name,
        'total_agorot',  v_total_agorot,
        'item_count',    coalesce(v_items, 0),
        'paid_at',       NEW.paid_at
      )
    );
  END IF;

  -- One alert per supplier, not per line: a business that sold three products
  -- in one order wants one message listing them.
  FOR v_supplier IN
    SELECT
      i.supplier_id,
      coalesce(max(s.name), max(i.supplier_name))  AS supplier_name,
      max(s.contact_email)                          AS contact_email,
      sum(coalesce(
        (to_jsonb(i)->>'total_price_agorot')::bigint,
        round((to_jsonb(i)->>'total_price_ils')::numeric * 100)::bigint,
        0
      ))::bigint                                    AS amount_agorot,
      jsonb_agg(jsonb_build_object(
        'product_name', coalesce(pr.name_he, 'פריט'),
        'quantity',     coalesce(i.quantity, 1),
        'product_type', i.product_type::text
      ) ORDER BY pr.name_he)                        AS lines
    FROM public.order_items i
    LEFT JOIN public.suppliers s  ON s.id = i.supplier_id
    LEFT JOIN public.products  pr ON pr.id = i.product_id
    WHERE i.order_id = NEW.id AND i.supplier_id IS NOT NULL
    GROUP BY i.supplier_id
  LOOP
    PERFORM public.fn_enqueue_notification(
      'supplier_sale',
      v_supplier.contact_email,
      'supplier_sale:' || NEW.id::text || ':' || v_supplier.supplier_id::text,
      jsonb_build_object(
        'order_id',      NEW.id,
        'order_ref',     upper(left(NEW.id::text, 8)),
        'supplier_id',   v_supplier.supplier_id,
        'supplier_name', v_supplier.supplier_name,
        'amount_agorot', v_supplier.amount_agorot,
        'lines',         v_supplier.lines
      )
    );
  END LOOP;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- The charge has already happened. Losing the email is recoverable; refusing
  -- the payment is not.
  RAISE WARNING 'tg_orders_notify_paid failed for order %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_orders_notify_paid ON public.orders;
CREATE TRIGGER trg_orders_notify_paid
  AFTER UPDATE OF paid_at ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_orders_notify_paid();

-- ---------------------------------------------------------------------------
-- 4. Coupon scanned
-- ---------------------------------------------------------------------------

/**
 * Fires inside redeem_voucher(), which is the whole point: the customer learns
 * their coupon was used at the instant it is used, from the same transaction
 * that used it. If this raised, a cashier would see a coupon refused with money
 * already collected, so it cannot.
 */
CREATE OR REPLACE FUNCTION public.tg_vouchers_notify_redeemed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_email    text;
  v_product  text;
  v_supplier text;
BEGIN
  IF NEW.status <> 'redeemed'::public.voucher_status
     OR OLD.status IS NOT DISTINCT FROM NEW.status THEN
    RETURN NEW;
  END IF;

  SELECT p.email INTO v_email FROM public.profiles p WHERE p.id = NEW.user_id;
  SELECT pr.name_he INTO v_product FROM public.products pr WHERE pr.id = NEW.product_id;
  SELECT s.name INTO v_supplier FROM public.suppliers s WHERE s.id = NEW.supplier_id;

  PERFORM public.fn_enqueue_notification(
    'voucher_redeemed',
    v_email,
    'voucher_redeemed:' || NEW.id::text,
    jsonb_build_object(
      'voucher_id',        NEW.id,
      'code',              NEW.code,
      'product_name',      v_product,
      'supplier_name',     v_supplier,
      'redeemed_at',       NEW.redeemed_at,
      'collected_agorot',  coalesce(NEW.redeemed_amount_collected_agorot, 0)
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'tg_vouchers_notify_redeemed failed for voucher %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vouchers_notify_redeemed ON public.vouchers;
CREATE TRIGGER trg_vouchers_notify_redeemed
  AFTER UPDATE OF status ON public.vouchers
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_vouchers_notify_redeemed();
