-- 196_shipped_notification_carries_tracking.sql
--
-- Put the tracking numbers in the mail that announces the shipment.
--
-- THE CHAIN, AND THE LINK THAT WAS MISSING
--
-- 155 gave `order_items` a `carrier` and a `tracking_number`, both applied.
-- The admin records them. 183 gave the order a trigger that mails the customer
-- "ההזמנה שלך נשלחה" with a button reading "למעקב אחרי ההזמנה". That button
-- points at `/account/orders`, which rendered the word "נשלח" and nothing else.
--
-- So the number was captured, stored, and shown to nobody, and the mail raised
-- precisely the question the page it linked to could not answer. The customer's
-- only remaining move was to write to support for a string already in the
-- database.
--
-- The page half is fixed in code (`src/server/queries/orders.ts` now selects
-- both columns and `src/lib/shipping/carriers.ts` turns them into a link). This
-- file is the mail half: `tg_orders_notify_shipped` builds its payload from
-- `orders` and a COUNT of items, and never looked at the two columns at all.
--
-- A LIST, BECAUSE THE DATA IS PER LINE
--
-- `carrier` and `tracking_number` are on `order_items`, one per line, and 155
-- says why in as many words: a separate order-level shipments table "would fork
-- fulfillment state into two places for the multi-supplier order that is this
-- platform's normal case". Suppliers ship separately, so an order with three
-- suppliers is three parcels with three numbers. A payload carrying one pair
-- would be wrong in exactly the case the model was built for.
--
-- `shipments` is therefore an array, and it is NULL rather than `[]` when no
-- line carries a number -- which is every shipment recorded before this. The
-- email builder reads a missing array as "say nothing about tracking" and the
-- mail then reads exactly as it did before.
--
-- WHAT IS NOT CHANGED, AND IT MATTERS
--
-- The firing condition, the dedupe key and the EXCEPTION clause are byte for
-- byte the ones production carries today, read out with `pg_get_functiondef`
-- rather than reconstructed from 183. The trigger fires on the order reaching
-- `fulfilled`, once per order, and swallows its own failures so a notification
-- problem can never roll back a fulfilment. Restating a function is how a live
-- guard gets dropped by accident; the diff here is one key in
-- `jsonb_build_object`.

BEGIN;

CREATE OR REPLACE FUNCTION public.tg_orders_notify_shipped()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_email     text;
  v_name      text;
  v_items     integer;
  v_shipments jsonb;
BEGIN
  IF NEW.status::text <> 'fulfilled' OR OLD.status::text = 'fulfilled' THEN
    RETURN NEW;
  END IF;

  SELECT p.email, p.full_name INTO v_email, v_name
  FROM public.profiles p WHERE p.id = NEW.user_id;

  SELECT count(*)::integer INTO v_items
  FROM public.order_items i WHERE i.order_id = NEW.id;

  -- One entry per line that actually has a number. A line with a carrier and
  -- no number is skipped: "דואר ישראל" with nothing to look up is a sentence
  -- the customer cannot act on, and printing it invites them to go looking.
  --
  -- `jsonb_agg` over zero rows returns NULL, not '[]', and that is the
  -- behaviour wanted here rather than something to correct: the email builder
  -- treats a missing array as "this order has no tracking to report".
  SELECT jsonb_agg(
           jsonb_build_object('carrier', i.carrier, 'tracking_number', i.tracking_number)
           ORDER BY i.created_at
         )
    INTO v_shipments
    FROM public.order_items i
   WHERE i.order_id = NEW.id
     AND i.tracking_number IS NOT NULL
     AND btrim(i.tracking_number) <> '';

  PERFORM public.fn_enqueue_notification(
    'order_shipped',
    v_email,
    'order-shipped:' || NEW.id::text,
    jsonb_build_object(
      'order_id',      NEW.id,
      'order_ref',     upper(left(NEW.id::text, 8)),
      'customer_name', v_name,
      'item_count',    coalesce(v_items, 0),
      'fulfilled_at',  now(),
      'shipments',     v_shipments
    )
  );

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'tg_orders_notify_shipped failed for order %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$function$;

-- No CREATE TRIGGER. `trg_orders_notify_shipped` already exists and points at
-- this function by name, so replacing the body is the whole change. Dropping
-- and recreating the trigger would be a chance to get its WHEN clause wrong for
-- no benefit.

COMMIT;
