-- 183_order_shipped_notification.sql
--
-- Shipping / fulfilment email: enqueue kind=order_shipped when an order
-- transitions INTO 'fulfilled'.
--
-- A trigger and not application code, on purpose: 'fulfilled' has at least
-- three writers (the admin order screen, the admin override action from the
-- state-machine work, and apps/mobile via RPC), and an enqueue in any one of
-- them silently skips the others. The trigger is the same pattern as
-- tg_orders_notify_paid in 102: freeze the payload at the moment of the
-- event, enqueue best-effort, never fail the UPDATE that fired it.
--
-- Fires only on the transition into 'fulfilled', not on partially_fulfilled:
-- one mail when everything is on its way, not one per supplier step.
--
-- The renderer (buildOrderShippedEmail, src/lib/email/notifications.ts) and
-- the drain support for the kind ship in the same commit as this file, so an
-- approved migration finds the application already able to render its rows.
--
-- AFTER APPLYING: re-measure notification_outbox_kind_check and move
-- 'order_shipped' into CHECK_ACCEPTS in src/lib/email/outbox-kinds.test.ts,
-- with the new measurement date.
--
-- STATUS: PENDING. Apply via MCP apply_migration only, per project rules.
--
-- ROLLBACK:
--   DROP TRIGGER IF EXISTS trg_orders_notify_shipped ON public.orders;
--   DROP FUNCTION IF EXISTS public.tg_orders_notify_shipped();
--   -- then restore the 121-era constraint (same statement as below without
--   -- the 'order_shipped' entry). Queued order_shipped rows, if any, must be
--   -- deleted first or the narrowed CHECK will refuse to validate.

-- 1. Widen the kind CHECK. Full list restated, same style as 121: the
--    constraint is the loud-failure gate for typo'd kinds and must stay total.
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
    -- (183): fulfilment complete, enqueued by tg_orders_notify_shipped below
    'order_shipped'
  ]::text[]));

-- 2. The trigger function. SECURITY DEFINER like its 102 sibling: the UPDATE
--    that moves an order to fulfilled may run as a role that cannot touch the
--    outbox, and the enqueue must not depend on who fulfilled the order.
CREATE OR REPLACE FUNCTION public.tg_orders_notify_shipped()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_email text;
  v_name  text;
  v_items integer;
BEGIN
  -- Only the transition INTO fulfilled, and only when it is a transition.
  IF NEW.status::text <> 'fulfilled' OR OLD.status::text = 'fulfilled' THEN
    RETURN NEW;
  END IF;

  SELECT p.email, p.full_name INTO v_email, v_name
  FROM public.profiles p WHERE p.id = NEW.user_id;

  SELECT count(*)::integer INTO v_items
  FROM public.order_items i WHERE i.order_id = NEW.id;

  -- Dedupe on the order id alone: an order that somehow bounces out of and
  -- back into fulfilled (an admin override reversed and reapplied) still
  -- produces exactly one mail, which is what the customer should see.
  PERFORM public.fn_enqueue_notification(
    'order_shipped',
    v_email,
    'order-shipped:' || NEW.id::text,
    jsonb_build_object(
      'order_id',      NEW.id,
      'order_ref',     upper(left(NEW.id::text, 8)),
      'customer_name', v_name,
      'item_count',    coalesce(v_items, 0),
      'fulfilled_at',  now()
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'tg_orders_notify_shipped failed for order %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.tg_orders_notify_shipped() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.tg_orders_notify_shipped() FROM anon, authenticated;

-- 3. The trigger itself. AFTER UPDATE OF status: fulfilment is a status fact,
--    and firing on every column touch would re-run the guard for nothing.
DROP TRIGGER IF EXISTS trg_orders_notify_shipped ON public.orders;
CREATE TRIGGER trg_orders_notify_shipped
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_orders_notify_shipped();
