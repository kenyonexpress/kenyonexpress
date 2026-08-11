-- 096_notification_voucher_issued.sql
--
-- Move coupon delivery email onto the outbox path.
-- When paid_at is set and the order already has vouchers, enqueue
-- kind=voucher_issued (one email per order) instead of relying on
-- finalizeOrder → Resend. order_paid stays only for physical-only orders.
--
-- Idempotent. Apply via MCP apply_migration only.

-- Widen the kind CHECK to include voucher_issued.
ALTER TABLE public.notification_outbox
  DROP CONSTRAINT IF EXISTS notification_outbox_kind_check;

ALTER TABLE public.notification_outbox
  ADD CONSTRAINT notification_outbox_kind_check
  CHECK (kind IN ('order_paid', 'supplier_sale', 'voucher_redeemed', 'voucher_issued'));

/**
 * Replace the paid trigger body: coupon orders enqueue voucher_issued with a
 * frozen voucher list; physical-only orders keep order_paid.
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
  v_vouchers      jsonb;
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

  SELECT EXISTS (SELECT 1 FROM public.vouchers v WHERE v.order_id = NEW.id)
    INTO v_has_vouchers;

  IF v_has_vouchers THEN
    SELECT coalesce(jsonb_agg(
      jsonb_build_object(
        'id',                        v.id,
        'code',                      v.code,
        'product_name',              pr.name_he,
        'supplier_name',             s.name,
        'supplier_address',          s.address,
        'supplier_phone',            s.contact_phone,
        'face_value_agorot',         v.face_value_agorot,
        'coupon_price_agorot',       v.coupon_price_agorot,
        'remaining_amount_due_agorot', v.remaining_amount_due_agorot,
        'expires_at',                v.expires_at
      )
      ORDER BY v.issued_at
    ), '[]'::jsonb)
    INTO v_vouchers
    FROM public.vouchers v
    LEFT JOIN public.products pr ON pr.id = v.product_id
    LEFT JOIN public.suppliers s ON s.id = v.supplier_id
    WHERE v.order_id = NEW.id;

    -- Dedupe key matches the historical Resend Idempotency-Key so replays of
    -- the transitional finalize sender cannot produce a second mail.
    PERFORM public.fn_enqueue_notification(
      'voucher_issued',
      v_email,
      'voucher-email:' || NEW.id::text,
      jsonb_build_object(
        'order_id',      NEW.id,
        'order_ref',     upper(left(NEW.id::text, 8)),
        'customer_name', v_name,
        'vouchers',      v_vouchers
      )
    );
  ELSE
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
  RAISE WARNING 'tg_orders_notify_paid failed for order %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;
