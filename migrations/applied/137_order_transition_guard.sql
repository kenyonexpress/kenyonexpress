-- 137: guards that forbid a status from moving somewhere no code can send it.
--
-- THE VERSION THIS REPLACES WOULD HAVE BROKEN PRODUCTION ON THE FIRST SCAN.
--
-- It passed DDL and then rejected moves the enums allow and the business
-- requires. Measured against the live database and the code that writes these
-- columns, not against the architecture docs:
--
--   * `redeemed` is a real `settlement_status` value and
--     `markOrderItemRedeemed` writes it from `platform_settled`, `paid` and
--     `split_executed` (REDEEMABLE_SETTLEMENT_STATUSES). The old guard had no
--     rule reaching `redeemed` at all, so EVERY voucher scan would have raised
--     23514 after the customer had already been charged.
--   * `orders.status` carries `platform_settled`; the guard omitted it.
--   * `payments.status` carries `platform_settled`; succeeded -> platform_settled
--     was omitted, and `terminal-reconciliation.ts` already treats the two as
--     the same outcome.
--   * Two `order_items` rows sit in `escrow_held` right now. The old guard
--     rejected it as a destination, which would have frozen those two rows.
--
-- WHY THIS IS A SUPERSET OF `src/server/domain/orders/state-machine.ts`.
--
-- That module deliberately does not admit `escrow_held`, `escrow_released` or
-- `platform_settled`: it describes what NEW code may write under the no-escrow
-- rule. A database guard has a different job. It runs against rows written
-- years ago by rules that no longer apply, and its purpose is to forbid
-- nonsense, not to re-litigate the business model. A guard that refuses to let
-- a legacy row move is not enforcing the rule, it is stranding the row.
--
-- WHAT IS DELIBERATELY ALLOWED
--
--   * A no-op update. `UPDATE ... SET some_other_column = x` leaves the status
--     equal to itself, and that must not raise, or every unrelated write to the
--     table fails.
--   * Any INSERT. These are AFTER-shaped BEFORE UPDATE triggers only: the
--     initial state is the writer's business, the moves are this guard's.
--   * NULL on either side, which means the column is not participating.
--
-- WHAT IS FORBIDDEN
--
--   Everything else, with 23514 and a message naming both ends, so the failure
--   says which move was attempted rather than only that one was.
--
-- ROLLBACK
--   DROP TRIGGER IF EXISTS tg_orders_status_guard ON public.orders;
--   DROP FUNCTION IF EXISTS public.fn_orders_status_guard();
--   DROP TRIGGER IF EXISTS tg_order_items_settlement_status_guard ON public.order_items;
--   DROP FUNCTION IF EXISTS public.fn_order_items_settlement_status_guard();
--   DROP TRIGGER IF EXISTS tg_payments_status_guard ON public.payments;
--   DROP FUNCTION IF EXISTS public.fn_payments_status_guard();
--
-- NOT APPLIED. `migrations/pending/` is unapplied by definition.



-- ---------------------------------------------------------------------------
-- public.orders.status
--
-- Derived from src/lib/checkout/state-machine.ts orderMachine, plus platform_settled which the enum carries and the machine does not.
-- Terminal states, which no rule leaves: cancelled, refunded.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_orders_status_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  -- Not participating, or not moving. Either way this trigger has no opinion.
  IF NEW.status IS NULL OR OLD.status IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF (OLD.status::text, NEW.status::text) IN (
    ('fulfilled','platform_settled'),
    ('fulfilled','refunded'),
    ('paid','fulfilled'),
    ('paid','partially_fulfilled'),
    ('paid','platform_settled'),
    ('paid','refunded'),
    ('partially_fulfilled','fulfilled'),
    ('partially_fulfilled','refunded'),
    ('pending','cancelled'),
    ('pending','paid'),
    ('platform_settled','refunded')
  ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'illegal orders.status transition: % -> %', OLD.status, NEW.status
    USING ERRCODE = '23514';
END
$$;

DROP TRIGGER IF EXISTS tg_orders_status_guard ON public.orders;
CREATE TRIGGER tg_orders_status_guard
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.fn_orders_status_guard();


-- ---------------------------------------------------------------------------
-- public.order_items.settlement_status
--
-- Derived from the five writers named in the header, not the domain machine, which deliberately admits fewer states than production holds.
-- Terminal states, which no rule leaves: cancelled, redeemed, refunded.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_order_items_settlement_status_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  -- Not participating, or not moving. Either way this trigger has no opinion.
  IF NEW.settlement_status IS NULL OR OLD.settlement_status IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.settlement_status = OLD.settlement_status THEN
    RETURN NEW;
  END IF;

  IF (OLD.settlement_status::text, NEW.settlement_status::text) IN (
    ('escrow_held','escrow_released'),
    ('escrow_held','redeemed'),
    ('escrow_held','refunded'),
    ('escrow_released','redeemed'),
    ('escrow_released','refunded'),
    ('paid','cancelled'),
    ('paid','platform_settled'),
    ('paid','redeemed'),
    ('paid','refunded'),
    ('paid','split_executed'),
    ('pending','cancelled'),
    ('pending','paid'),
    ('pending','refunded'),
    ('pending','split_executed'),
    ('platform_settled','redeemed'),
    ('platform_settled','refunded'),
    ('split_executed','redeemed'),
    ('split_executed','refunded')
  ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'illegal order_items.settlement_status transition: % -> %', OLD.settlement_status, NEW.settlement_status
    USING ERRCODE = '23514';
END
$$;

DROP TRIGGER IF EXISTS tg_order_items_settlement_status_guard ON public.order_items;
CREATE TRIGGER tg_order_items_settlement_status_guard
  BEFORE UPDATE ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.fn_order_items_settlement_status_guard();


-- ---------------------------------------------------------------------------
-- public.payments.status
--
-- Derived from src/lib/checkout/state-machine.ts paymentMachine, plus platform_settled which terminal-reconciliation.ts already treats as succeeded.
-- Terminal states, which no rule leaves: failed, refunded.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_payments_status_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO ''
AS $$
BEGIN
  -- Not participating, or not moving. Either way this trigger has no opinion.
  IF NEW.status IS NULL OR OLD.status IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  IF (OLD.status::text, NEW.status::text) IN (
    ('initiated','failed'),
    ('initiated','redirected'),
    ('initiated','succeeded'),
    ('platform_settled','refunded'),
    ('redirected','failed'),
    ('redirected','succeeded'),
    ('succeeded','platform_settled'),
    ('succeeded','refunded')
  ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'illegal payments.status transition: % -> %', OLD.status, NEW.status
    USING ERRCODE = '23514';
END
$$;

DROP TRIGGER IF EXISTS tg_payments_status_guard ON public.payments;
CREATE TRIGGER tg_payments_status_guard
  BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.fn_payments_status_guard();
