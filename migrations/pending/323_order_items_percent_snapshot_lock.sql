-- migration 323: freeze order_items percent snapshots once the order is paid (C141)
--
-- WHY
--   291 (rename platform_percent -> platform_percent_snapshot + lock trigger) sits
--   in migrations/applied/ but never reached the hosted project: commit b188ef775
--   bulk-moved 162-300 without running it. Live order_items still has
--   platform_percent, 329/329 rows populated, and no snapshot lock. 291 is also
--   unrunnable as written: its trigger references platform_bp/commission_bp/
--   upfront_bp/cashback_bp, none of which exist on live order_items, so every
--   UPDATE of a paid line would raise "record new has no field platform_bp".
--
--   The rename is NOT redone. checkout inserts platform_percent and
--   generate_payout_statement() reads oi.platform_percent; the app now aliases
--   `platform_percent_snapshot:platform_percent` where it reads. This migration
--   adds only the missing guarantee: the snapshot cannot move after payment.
--
-- SAFE
--   Additive. No app path updates these columns (they only touch
--   settlement_status / item_status / shipping stamps), so the trigger cannot
--   reject current traffic.

CREATE OR REPLACE FUNCTION public.fn_order_items_percent_snapshot_lock()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.platform_percent IS DISTINCT FROM OLD.platform_percent
      OR NEW.supplier_split_percent IS DISTINCT FROM OLD.supplier_split_percent
      OR NEW.commission_percent_snapshot IS DISTINCT FROM OLD.commission_percent_snapshot)
     AND EXISTS (
       SELECT 1 FROM public.orders o
       WHERE o.id = OLD.order_id AND o.paid_at IS NOT NULL
     )
  THEN
    RAISE EXCEPTION 'order item % belongs to a paid order; percent snapshots are frozen', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

COMMENT ON COLUMN public.order_items.platform_percent IS
  'Platform share (%) snapshotted from products.platform_percent at purchase. '
  'IMMUTABLE once orders.paid_at is set (trg_order_items_percent_snapshot_lock).';

DROP TRIGGER IF EXISTS trg_order_items_percent_snapshot_lock ON public.order_items;
CREATE TRIGGER trg_order_items_percent_snapshot_lock
  BEFORE UPDATE ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.fn_order_items_percent_snapshot_lock();
