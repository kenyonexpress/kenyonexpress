-- 246_orders_delivery_slot.sql
--
-- The shopper's preferred delivery slot, as two columns on orders (STEP 10, 01.10).
--
-- MEASURED BEFORE WRITING. Production `orders` has `notes` (text, nullable)
-- and nothing about when the parcel should arrive; `grep -ri "delivery_slot\|
-- delivery_window\|preferred_delivery" src supabase migrations` found nothing
-- on 2026-10-01. The checkout now offers a slot (lib/checkout/delivery-slots.ts:
-- Sunday to Thursday, morning or afternoon, from tomorrow, within 30 days) and
-- writes it in two places: as a Hebrew line in `orders.notes`, which is what
-- the admin order page and the supplier read TODAY, and into the two columns
-- below in a separate UPDATE that fails harmlessly with 42703 until this file
-- is applied (the same pattern 236 uses for `shipping_method`).
--
-- WHY COLUMNS AT ALL WHEN THE NOTE ALREADY CARRIES IT. A line of Hebrew inside
-- free text cannot be filtered on. "Every order that asked for Sunday morning"
-- is a supplier's picking list, and the day the operations view wants it, the
-- data has to be a date and not a substring. Written from day one so that the
-- rows exist when the view is built, rather than backfilled from prose.
--
-- WHY A PREFERENCE AND NOT A BOOKING. No supplier here runs a timed fleet and
-- the shipping registry promises 3-7 business days. The columns record what
-- the shopper asked for; nothing in the schema promises it was met. There is
-- deliberately no NOT NULL and no default: most orders will carry no
-- preference, and null is the honest value for "did not say".
--
-- CONSTRAINTS. The window is one of two named values; a third window is a code
-- change and a migration together, never a free string. The date must be a
-- delivery day (Sunday..Thursday, `extract(dow)` 0..4): the application
-- refuses Friday and Saturday too, and the CHECK keeps a future writer that
-- skips the application honest.
--
-- ROLLBACK
--   ALTER TABLE public.orders DROP COLUMN IF EXISTS delivery_slot_window;
--   ALTER TABLE public.orders DROP COLUMN IF EXISTS delivery_slot_date;
--   DROP INDEX IF EXISTS public.orders_delivery_slot_date_idx;

BEGIN;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS delivery_slot_date date,
  ADD COLUMN IF NOT EXISTS delivery_slot_window text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_delivery_slot_window_check'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_delivery_slot_window_check
      CHECK (delivery_slot_window IS NULL OR delivery_slot_window IN ('morning', 'afternoon'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_delivery_slot_day_check'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_delivery_slot_day_check
      CHECK (delivery_slot_date IS NULL OR extract(dow FROM delivery_slot_date) BETWEEN 0 AND 4);
  END IF;

  -- Both or neither: a window without a day, or a day without a window, is
  -- half a preference and the application never writes one.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'orders_delivery_slot_pair_check'
      AND conrelid = 'public.orders'::regclass
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_delivery_slot_pair_check
      CHECK ((delivery_slot_date IS NULL) = (delivery_slot_window IS NULL));
  END IF;
END $$;

-- Partial: the picking-list query is "orders for this day", and the rows with
-- no preference (the majority) have no business in the index.
CREATE INDEX IF NOT EXISTS orders_delivery_slot_date_idx
  ON public.orders (delivery_slot_date)
  WHERE delivery_slot_date IS NOT NULL;

COMMENT ON COLUMN public.orders.delivery_slot_date IS
  'Shopper-preferred delivery day (Asia/Jerusalem calendar date, Sun..Thu). A preference, not a booking. Null when none was given.';
COMMENT ON COLUMN public.orders.delivery_slot_window IS
  'Shopper-preferred window on delivery_slot_date: morning (09:00-13:00) or afternoon (13:00-17:00).';

COMMIT;
