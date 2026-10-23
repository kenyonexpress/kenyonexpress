-- migration 130: platform_percent_snapshot on order_items
--
-- CONTEXT
--   products.platform_percent exists (migration 027) as the admin-editable field
--   order_items.platform_percent exists (migration 026) but the name doesn't
--   signal that it's a snapshot taken at order time and should never change.
--   Migration 062 added fn_order_items_snapshot_lock() but only guards the _bp
--   (basis-point) columns, not platform_percent.
--
-- CHANGE
--   1. Rename order_items.platform_percent → platform_percent_snapshot
--   2. Update fn_order_items_snapshot_lock() to guard platform_percent_snapshot
--      against UPDATE on paid orders (enforces immutability at the DB level)
--
-- IMMUTABILITY
--   The snapshot is written once when the order is finalized. No UPDATE is
--   permitted: settlement depends on the percent that was agreed at purchase,
--   and changing it after-the-fact rewrites financial history. The trigger
--   raises an exception if any UPDATE attempts to change the value on a paid order.
--
-- SAFE
--   Column rename is a metadata-only DDL; no data moves. The trigger recreation
--   is conditional on the column existing (same pattern as 062). The NOT NULL
--   constraint is not added here because older rows may be NULL (docs/
--   CONTRADICTIONS.md C1: no default exists). Finalize fails loud on NULL.

-- 1. Rename the column --------------------------------------------------------

ALTER TABLE public.order_items
  RENAME COLUMN platform_percent TO platform_percent_snapshot;

COMMENT ON COLUMN public.order_items.platform_percent_snapshot IS
  'Platform share (%) snapshotted from products.platform_percent at order time. '
  'IMMUTABLE: never edited after finalize (enforced by trg_order_items_snapshot_lock). '
  'Settlement and supplier-payout logic keys off this value, so retroactive changes '
  'would rewrite financial history. NULL is refused by finalize (no default exists, C1), '
  'but older rows may have it.';

-- 2. Update the immutability trigger ------------------------------------------
--
-- Migration 062 created fn_order_items_snapshot_lock() to block percent changes
-- on paid orders. It only guards the _bp (basis-point integer) columns. We now
-- add platform_percent_snapshot to the guarded set.
--
-- The function is recreated unconditionally: the column we just renamed must
-- exist if this migration is running, and the trigger already exists from 062.

CREATE OR REPLACE FUNCTION public.fn_order_items_snapshot_lock()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = OLD.order_id AND o.paid_at IS NOT NULL
  ) THEN
    -- Guard the basis-point integer columns (from 062)
    IF NEW.platform_bp IS DISTINCT FROM OLD.platform_bp
       OR NEW.commission_bp IS DISTINCT FROM OLD.commission_bp
       OR NEW.upfront_bp IS DISTINCT FROM OLD.upfront_bp
       OR NEW.cashback_bp IS DISTINCT FROM OLD.cashback_bp
       -- Guard the percent snapshot (from 130)
       OR NEW.platform_percent_snapshot IS DISTINCT FROM OLD.platform_percent_snapshot
    THEN
      RAISE EXCEPTION 'order item % belongs to a paid order; percent snapshots are frozen', OLD.id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- The trigger itself was created by 062 and does not need to be recreated,
-- but we drop and recreate it anyway to ensure it points to the updated function.
DROP TRIGGER IF EXISTS trg_order_items_snapshot_lock ON public.order_items;
CREATE TRIGGER trg_order_items_snapshot_lock
  BEFORE UPDATE ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.fn_order_items_snapshot_lock();
