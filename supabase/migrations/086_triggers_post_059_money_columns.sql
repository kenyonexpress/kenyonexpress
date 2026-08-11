-- 086_triggers_post_059_money_columns.sql
--
-- LOCAL ONLY. NOT APPLIED TO PRODUCTION.
--
-- Two trigger functions still read row fields that 059 renamed. A trigger body
-- is not checked when the column changes underneath it: it compiles fine and
-- raises at runtime, on the row that fires it. Both of these sit on the
-- purchase path, and each one alone is enough to stop a sale.
--
--   fn_snapshot_commission_ledger  (042, ON INSERT order_items)
--       reads NEW.platform_percent and NEW.cashback_percent.
--       059 renamed those to platform_bp and cashback_bp.
--       => every INSERT into order_items raises
--          `record "new" has no field "platform_percent"`.
--          NO ORDER LINE CAN BE WRITTEN.
--
--   trg_orders_notification_events (ON UPDATE orders)
--       reads NEW.total_ils inside the status-changed branch.
--       059 renamed that to total_agorot.
--       => the UPDATE that moves an order to 'paid' raises.
--          THE CUSTOMER IS CHARGED AND THE ORDER NEVER CLOSES,
--          which is the worst of the available failures.
--
-- The second one is quiet in a way the first is not: it only fires on the
-- status transition, so every test that stops at "order created" passes.
--
-- Found by running tests/sql/voucher_redemption_lifecycle.sql after repairing
-- its own fixtures, then by scanning every function body in the schema for
-- NEW./OLD. references to the fifteen columns 059 renamed. Those two are the
-- complete list; the scan is recorded in STATE.md.
--
-- BOTH FUNCTIONS ARE REWRITTEN SHAPE-TOLERANT, not simply renamed. Production
-- has never had 059 and still carries platform_percent and total_ils, so a body
-- hardcoded to the new names would break there exactly as the current one
-- breaks here. Reading through to_jsonb(NEW) lets one definition serve both
-- schemas, which is the same approach 046 takes for the two wallet_accounts
-- shapes. It is not free - the row is serialised on every fire - but this is
-- one jsonb per order line, not per query.
--
-- Idempotent, forward-only. Replaces function bodies only; no table, column,
-- trigger or type is touched.

-- ---------------------------------------------------------------------------
-- 1. Percent columns became basis points, and the units changed with the name
--
--    Note the asymmetry: platform_percent held 30 and needed *100 to reach the
--    3000 bps the ledger wants, while platform_bp ALREADY holds 3000. Renaming
--    the reference without dropping the multiply would have recorded 300000
--    bps, i.e. a 3000 percent platform take, on every line.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_snapshot_commission_ledger()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_new          jsonb   := to_jsonb(NEW);
  v_platform_bps integer;
  v_cashback_bps integer;
BEGIN
  IF NEW.supplier_id IS NULL THEN
    RAISE EXCEPTION 'order item % requires supplier_id', NEW.id;
  END IF;

  IF v_new ? 'platform_bp' THEN
    v_platform_bps := coalesce((v_new->>'platform_bp')::integer, 0);
  ELSE
    v_platform_bps := round(coalesce((v_new->>'platform_percent')::numeric, 0) * 100)::integer;
  END IF;

  IF v_new ? 'cashback_bp' THEN
    v_cashback_bps := coalesce((v_new->>'cashback_bp')::integer, 0);
  ELSE
    v_cashback_bps := round(coalesce((v_new->>'cashback_percent')::numeric, 0) * 100)::integer;
  END IF;

  INSERT INTO public.commission_ledger (
    order_id,
    order_item_id,
    product_id,
    supplier_id,
    product_type,
    event,
    status,
    customer_pays_now_agorot,
    platform_percent_bps,
    platform_fee_agorot,
    supplier_due_agorot,
    cashback_percent_bps,
    cashback_amount_agorot,
    idempotency_key
  )
  VALUES (
    NEW.order_id,
    NEW.id,
    NEW.product_id,
    NEW.supplier_id,
    NEW.product_type,
    'accrual'::public.commission_ledger_event,
    'pending'::public.commission_ledger_status,
    NEW.customer_pays_now_agorot,
    v_platform_bps,
    NEW.platform_fee_agorot,
    NEW.supplier_due_agorot,
    v_cashback_bps,
    NEW.cashback_amount_agorot,
    'commission:accrual:' || NEW.id::text
  )
  ON CONFLICT (idempotency_key) DO NOTHING;

  RETURN NEW;
END;
$$;

-- ---------------------------------------------------------------------------
-- 2. The notification emitted when an order is paid
--
--    The payload key stays `total_ils` because notification templates already
--    read it and a rename here is a silently blank amount in a customer's
--    email. It is filled from whichever column this database actually has, and
--    `total_agorot` is added alongside so new templates can stop dividing.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.trg_orders_notification_events()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_new     jsonb := to_jsonb(NEW);
  v_agorot  integer;
  v_payload jsonb;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN
    RETURN NULL;
  END IF;

  IF v_new ? 'total_agorot' THEN
    v_agorot := (v_new->>'total_agorot')::integer;
  END IF;
  -- total_agorot is nullable; customer_pays_now_agorot is NOT NULL and is what
  -- the customer was actually charged, so it is the better fallback than 0.
  IF v_agorot IS NULL AND v_new ? 'customer_pays_now_agorot' THEN
    v_agorot := (v_new->>'customer_pays_now_agorot')::integer;
  END IF;
  IF v_agorot IS NULL AND v_new ? 'total_ils' THEN
    v_agorot := round(coalesce((v_new->>'total_ils')::numeric, 0) * 100)::integer;
  END IF;

  v_payload := jsonb_build_object(
    'order_id',     NEW.id,
    'total_ils',    round(coalesce(v_agorot, 0)::numeric / 100, 2),
    'total_agorot', coalesce(v_agorot, 0)
  );

  IF NEW.status = 'paid'::public.order_status THEN
    PERFORM public.fn_emit_notification_event(
      'order_paid:' || NEW.id::text,
      'order_paid', 'order', NEW.id, NEW.user_id,
      v_payload || jsonb_build_object('invoice_number', NEW.invoice_number));
  ELSIF NEW.status = 'refunded'::public.order_status THEN
    PERFORM public.fn_emit_notification_event(
      'order_refunded:' || NEW.id::text,
      'order_refunded', 'order', NEW.id, NEW.user_id,
      v_payload);
  END IF;

  RETURN NULL;
END;
$$;
