-- 166: transition guard on public.vouchers.status.
--
-- WHY. Migration 137 guards orders, order_items and payments; it never covered
-- vouchers, and production carries no trigger on the table (pg_trigger,
-- checked 2026-09-01; VOUCHER-LIFECYCLE.md §1 records the gap). The lifecycle
-- is therefore an application contract only: the atomic
-- `UPDATE ... WHERE status = 'issued'` in redeem_voucher, the expiry cron, and
-- nothing the database refuses on your behalf. A service_role statement can
-- put a voucher into any state the enum carries -- including un-redeeming a
-- burned voucher, which would let it be scanned and collected twice.
--
-- THE MACHINE, from VOUCHER-LIFECYCLE.md §1 and measured against every writer:
--
--   issued -> redeemed   redeem_voucher (074/085), admin manual redeem
--                        (src/server/actions/admin/vouchers.ts)
--   issued -> expired    expire_vouchers sweep (068/088/125)
--   issued -> cancelled  owning order cancelled
--   issued -> refunded   refund of a still-unredeemed voucher
--                        (src/server/actions/payments/refund.ts)
--
-- Every non-issued state is terminal BY DESIGN: once a voucher leaves
-- `issued`, either the value was consumed at the business or the money went
-- back to the customer. There is no un-redeem and no reactivation; value
-- restored after a terminal state is a wallet credit, a different money
-- movement against a different table.
--
-- WHAT IS DELIBERATELY ALLOWED (same shape as 137):
--   * A no-op update: NEW.status = OLD.status must not raise, or every
--     unrelated write to the row (gift claim, email timestamps) fails.
--   * Any INSERT: the initial state is the writer's business.
--   * NULL on either side, which means the column is not participating.
--
-- ROLLBACK
--   DROP TRIGGER IF EXISTS tg_vouchers_status_guard ON public.vouchers;
--   DROP FUNCTION IF EXISTS public.fn_vouchers_status_guard();
--
-- NOT APPLIED. `migrations/pending/` is unapplied by definition.

CREATE OR REPLACE FUNCTION public.fn_vouchers_status_guard()
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
    ('issued','redeemed'),
    ('issued','expired'),
    ('issued','cancelled'),
    ('issued','refunded')
  ) THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'illegal vouchers.status transition: % -> %', OLD.status, NEW.status
    USING ERRCODE = '23514';
END
$$;

DROP TRIGGER IF EXISTS tg_vouchers_status_guard ON public.vouchers;
CREATE TRIGGER tg_vouchers_status_guard
  BEFORE UPDATE ON public.vouchers
  FOR EACH ROW EXECUTE FUNCTION public.fn_vouchers_status_guard();
