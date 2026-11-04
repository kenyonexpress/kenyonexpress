-- 253_order_items_split_amount_lock.sql
--
-- S09 (2026-11-04): freeze the money split of a paid order line, not only its
-- rates.
--
-- WHAT ALREADY EXISTS AND IS NOT CHANGED (measured on production 04.11):
--
--   Checkout (src/server/actions/payments/checkout.ts) copies the split from
--   the product into order_items at purchase time, through
--   buildOrderItemMoneyRow (src/lib/commerce/order-money-columns.ts):
--
--     task name         hosted column                  meaning
--     platform_percent  platform_percent               product rate, copied
--     platform_amount   commission_agorot              integer agorot
--     supplier_amount   supplier_immediate_agorot      integer agorot
--                       (+ supplier_payout_ils, the shekel twin)
--
--   No new columns are added. A second `platform_amount` column beside
--   `commission_agorot` would be two sources for one number, and the table
--   already carries one such hybrid (070). 947 paid lines, 0 with a null in
--   any of the three, and on all of them platform + supplier = paid on site.
--
--   trg_order_items_percent_snapshot_lock (live, never in the repo) refuses an
--   UPDATE of platform_percent / supplier_split_percent /
--   commission_percent_snapshot once orders.paid_at is set.
--
-- WHAT THIS FILE ADDS, and only this:
--
--   The same function, now also refusing a change to the AMOUNTS of a paid
--   line: face value, paid on site, platform amount, supplier amount (both
--   generations' names where they exist here), the shekel price twins, the
--   remaining commission/upfront rates, and quantity.
--   Before this, rewriting commission_agorot on a paid line succeeded, so the
--   rate stayed 30% while the money said something else.
--
--   product_id is NOT locked: its FK is ON DELETE SET NULL, and locking it
--   would make every product with a paid sale undeletable. supplier_id is
--   ON DELETE RESTRICT, so it cannot move by cascade, and the supplier_name /
--   phone / address snapshot columns are what the order displays anyway.
--
--   Escrow columns, statuses and timestamps are NOT locked: settlement,
--   shipping, redemption and refund move those after payment by design
--   (finalize.ts, refund.ts, shipping actions). None of those writers touches
--   a locked column; grep and pg_proc were both checked 04.11.
--
--   CREATE OR REPLACE keeps the function's identity, so no grant is reset.
--   The trigger is re-declared with CREATE OR REPLACE so a database built
--   from this file gets it too; on production it is the same definition.
--
-- Reversal: re-run the pre-253 body (only the three percent columns), quoted
-- in docs/S09-split.md.

CREATE OR REPLACE FUNCTION public.fn_order_items_percent_snapshot_lock()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path = public, pg_temp
AS $function$
BEGIN
  IF (NEW.platform_percent IS DISTINCT FROM OLD.platform_percent
      OR NEW.supplier_split_percent IS DISTINCT FROM OLD.supplier_split_percent
      OR NEW.commission_percent_snapshot IS DISTINCT FROM OLD.commission_percent_snapshot
      OR NEW.commission_percent IS DISTINCT FROM OLD.commission_percent
      OR NEW.upfront_percent IS DISTINCT FROM OLD.upfront_percent
      OR NEW.commission_agorot IS DISTINCT FROM OLD.commission_agorot
      OR NEW.supplier_immediate_agorot IS DISTINCT FROM OLD.supplier_immediate_agorot
      OR NEW.supplier_payout_ils IS DISTINCT FROM OLD.supplier_payout_ils
      OR NEW.paid_on_site_agorot IS DISTINCT FROM OLD.paid_on_site_agorot
      OR NEW.face_value_agorot IS DISTINCT FROM OLD.face_value_agorot
      OR NEW.balance_due_agorot IS DISTINCT FROM OLD.balance_due_agorot
      OR NEW.unit_price_ils IS DISTINCT FROM OLD.unit_price_ils
      OR NEW.total_price_ils IS DISTINCT FROM OLD.total_price_ils
      OR NEW.quantity IS DISTINCT FROM OLD.quantity)
     AND EXISTS (
       SELECT 1 FROM public.orders o
       WHERE o.id = OLD.order_id AND o.paid_at IS NOT NULL
     )
  THEN
    RAISE EXCEPTION 'order item % belongs to a paid order; split snapshot is frozen', OLD.id
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE TRIGGER trg_order_items_percent_snapshot_lock
  BEFORE UPDATE ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.fn_order_items_percent_snapshot_lock();
