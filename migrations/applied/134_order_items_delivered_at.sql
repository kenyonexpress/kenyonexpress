-- ============================================================================
-- PENDING 124: order_items.delivered_at, so the cancellation window starts
--              where the law says it starts
-- ============================================================================
-- STATUS: DRAFT, NOT APPLIED. Requires Ofir's explicit approval and MCP
-- apply_migration. Never `db push`.
--
-- Requested by Ofir on 2026-08-19, off the gap named in
-- ARCHITECTURE-REFUNDS-CANCELLATIONS.md section 6 row 1.
--
-- ----------------------------------------------------------------------------
-- WHY THIS IS A COMPLIANCE FIX AND NOT A FEATURE
-- ----------------------------------------------------------------------------
--
-- Consumer Protection Law, distance selling: for GOODS the consumer may cancel
-- within 14 days from the day of the transaction OR from the day the goods
-- were received, WHICHEVER IS LATER.
--
-- This schema can express the first date and not the second. `orders.paid_at`
-- exists; nothing records when the customer actually got the goods. So the
-- window the application can compute today runs from `paid_at`, which is the
-- EARLIER of the two dates by definition.
--
-- The direction of that error is the whole point. Honouring a window that is
-- SHORTER than the one the law grants is a compliance failure, not a
-- conservative default. A customer whose parcel took nine days to arrive is
-- entitled to fourteen days from arrival and is currently offered five.
--
-- ----------------------------------------------------------------------------
-- WHY NOT REUSE fulfilled_at
-- ----------------------------------------------------------------------------
--
-- MEASURED (2026-08-19, src/types/database.ts, which describes production):
--   order_items.fulfilled_at   timestamptz, nullable   EXISTS
--   order_items.item_status    enum order_item_status
--                              (pending|issued|shipped|delivered|cancelled|refunded)
--   No column matching %deliver%, %ship%_at or %receiv% exists.
--
-- `fulfilled_at` is OUR side of the transaction: the moment the platform
-- considers the line discharged. For a coupon line it is stamped at issuance,
-- when nothing has been delivered to anybody. For a physical line it is
-- stamped when the supplier says they are done, which is the handover to the
-- carrier, not the handover to the customer.
--
-- The statute asks a different question: when did the CONSUMER receive the
-- goods. Overloading `fulfilled_at` with that meaning would make one column
-- answer two questions that differ by days, and the day count is the entire
-- legal effect. This is the same defect `compare_at_price` /
-- `compare_at_price_ils` exists to untangle: one fact, one column.
--
-- ----------------------------------------------------------------------------
-- WHY shipped_at COMES ALONG
-- ----------------------------------------------------------------------------
--
-- `item_status` already carries `shipped` and `delivered` as distinct states,
-- so the transitions exist and only their timestamps are missing. Adding one
-- without the other would leave the machine half-timestamped and would make
-- "how long does delivery take" unanswerable, which is the number that decides
-- whether a delivery-date estimate on the product page is honest.
--
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. The columns
-- ---------------------------------------------------------------------------

ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS shipped_at   timestamptz,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz;

COMMENT ON COLUMN public.order_items.delivered_at IS
  'When the CONSUMER received the goods. Starts the 14-day distance-selling cancellation window, which runs from the later of this and orders.paid_at. Not the same as fulfilled_at, which is when the platform considered the line discharged. NULL for coupon and service lines, which are never delivered.';
COMMENT ON COLUMN public.order_items.shipped_at IS
  'When the line left the supplier. Paired with delivered_at so item_status shipped/delivered are both timestamped and delivery duration is measurable.';

-- ---------------------------------------------------------------------------
-- 2. Constraints
--
-- DO blocks because ADD CONSTRAINT has no IF NOT EXISTS and this file must be
-- safe to re-run after a partial failure.
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  -- Delivery cannot precede dispatch. Both nullable, so this only bites when
  -- both are present; a line delivered without a recorded dispatch is untidy
  -- data, not wrong data, and refusing it would block a supplier who marks
  -- delivery from a paper note.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'order_items_delivered_after_shipped') THEN
    ALTER TABLE public.order_items ADD CONSTRAINT order_items_delivered_after_shipped
      CHECK (
        shipped_at IS NULL
        OR delivered_at IS NULL
        OR delivered_at >= shipped_at
      );
  END IF;

  -- A delivered_at on a line that is not, and never was, a delivery is a
  -- category error: it would start a goods cancellation window on a coupon,
  -- which has its own rules and its own clock (vouchers.expires_at).
  --
  -- NOT VALID on purpose. There are 4 orders in production and none of them
  -- can violate this, but a NOT VALID add takes no ACCESS EXCLUSIVE scan and
  -- the constraint still applies to every future row. Validate separately when
  -- the table is quiet:
  --   ALTER TABLE public.order_items
  --     VALIDATE CONSTRAINT order_items_delivery_is_physical_only;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint
                  WHERE conname = 'order_items_delivery_is_physical_only') THEN
    ALTER TABLE public.order_items ADD CONSTRAINT order_items_delivery_is_physical_only
      CHECK (
        (shipped_at IS NULL AND delivered_at IS NULL)
        OR product_type = 'physical'
      ) NOT VALID;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- 3. Index
-- ---------------------------------------------------------------------------

-- The only query this column exists for: "which lines are inside their
-- cancellation window". Partial, because a delivered line is a small and
-- slowly growing minority of a table dominated by coupon lines that will never
-- carry a delivery date at all.
CREATE INDEX IF NOT EXISTS order_items_delivered_at_idx
  ON public.order_items (delivered_at DESC)
  WHERE delivered_at IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 4. The window, as a function, so one definition serves every caller
-- ---------------------------------------------------------------------------
--
-- Written here rather than in TypeScript because three callers need the same
-- answer and must not disagree: the account area's cancel control, the admin
-- refund screen, and any report on refunds served late. The application still
-- owns the DECISION; this owns the DATE.
--
-- STABLE, not IMMUTABLE: it reads no clock itself, but it depends on table
-- data, which is exactly what STABLE means.

CREATE OR REPLACE FUNCTION public.order_item_cancellation_deadline(p_order_item_id uuid)
RETURNS timestamptz
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT
    CASE
      -- Goods: 14 days from the LATER of payment and receipt. GREATEST returns
      -- NULL if any argument is NULL in some engines; Postgres ignores NULLs
      -- here, but delivered_at being NULL genuinely means "not yet received",
      -- and an undelivered parcel has not started its clock at all. So the
      -- window stays open, which is the direction that cannot underpay a
      -- consumer.
      WHEN oi.product_type = 'physical' AND oi.delivered_at IS NULL
        THEN NULL                                   -- open: not yet received
      WHEN oi.product_type = 'physical'
        THEN GREATEST(o.paid_at, oi.delivered_at) + interval '14 days'
      -- Coupon and service: 14 days from the transaction. The extra 2-day and
      -- 7-day pre-service cuts need a booked date, which no column carries yet
      -- (ARCHITECTURE-REFUNDS-CANCELLATIONS.md section 6 row 2). Until it
      -- exists this returns the 14-day date and the application must not
      -- present it as the whole rule for a dated service.
      ELSE o.paid_at + interval '14 days'
    END
  FROM public.order_items oi
  JOIN public.orders o ON o.id = oi.order_id
  WHERE oi.id = p_order_item_id;
$$;

COMMENT ON FUNCTION public.order_item_cancellation_deadline(uuid) IS
  'Statutory cancellation deadline for one line. NULL means the clock has not started (physical, not yet delivered), which is an OPEN window, never a closed one. Does not cover the 2-day/7-day pre-service cuts: no booked-date column exists.';

REVOKE ALL ON FUNCTION public.order_item_cancellation_deadline(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.order_item_cancellation_deadline(uuid) TO authenticated;

-- ============================================================================
-- WHAT THIS FILE DOES NOT DO
-- ============================================================================
--
--  * NO BACKFILL. Not one delivery date is written. There is no record of when
--    any past order arrived, and inventing one would fabricate the start of a
--    statutory clock -- in a column whose entire purpose is to be legally
--    relied upon. Existing lines keep delivered_at NULL, which the function
--    above reads as "window still open", which is the safe reading.
--  * No change to fulfilled_at, which keeps its own meaning.
--  * No change to item_status or to any transition. Stamping these columns is
--    an application change on the supplier's ship/deliver actions, and it
--    belongs in a code branch, not here.
--  * No RLS change. order_items already has its policies and a delivery date
--    is no more sensitive than the address it was delivered to.
--
-- ============================================================================
-- VERIFICATION (after applying, inside rolled-back DO blocks)
-- ============================================================================
-- 1. The columns exist and nothing was backfilled (expect 0, 0):
--
--      SELECT count(*) FILTER (WHERE delivered_at IS NOT NULL) AS delivered,
--             count(*) FILTER (WHERE shipped_at   IS NOT NULL) AS shipped
--        FROM public.order_items;
--
-- 2. Delivery before dispatch is refused (expect 23514):
--
--      DO $$ BEGIN
--        UPDATE public.order_items
--           SET shipped_at = now(), delivered_at = now() - interval '1 day'
--         WHERE id = (SELECT id FROM public.order_items LIMIT 1);
--        RAISE EXCEPTION 'rollback: the ordering constraint did not fire';
--      END $$;
--
-- 3. A coupon line cannot be delivered (expect 23514):
--
--      DO $$ BEGIN
--        UPDATE public.order_items SET delivered_at = now()
--         WHERE id = (SELECT id FROM public.order_items
--                      WHERE product_type = 'coupon' LIMIT 1);
--        RAISE EXCEPTION 'rollback: the product_type constraint did not fire';
--      END $$;
--
--    NOTE: this one only bites once the NOT VALID constraint is validated for
--    existing rows, or on a row inserted after this migration. That is the
--    cost of the NOT VALID add, and it is stated rather than hidden.
--
-- 4. An undelivered physical line has an OPEN window (expect NULL, not a past
--    date):
--
--      SELECT public.order_item_cancellation_deadline(id)
--        FROM public.order_items
--       WHERE product_type = 'physical' AND delivered_at IS NULL
--       LIMIT 1;
--
-- ROLLBACK
--   DROP FUNCTION IF EXISTS public.order_item_cancellation_deadline(uuid);
--   DROP INDEX IF EXISTS public.order_items_delivered_at_idx;
--   ALTER TABLE public.order_items
--     DROP CONSTRAINT IF EXISTS order_items_delivery_is_physical_only,
--     DROP CONSTRAINT IF EXISTS order_items_delivered_after_shipped,
--     DROP COLUMN IF EXISTS delivered_at,
--     DROP COLUMN IF EXISTS shipped_at;
-- ============================================================================
