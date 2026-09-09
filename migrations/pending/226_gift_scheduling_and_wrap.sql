-- 226_gift_scheduling_and_wrap.sql
--
-- The two halves of SECTIONS 33 that 108 did not build: a gift that is sent on
-- a chosen DATE, and an optional wrapping FEE. Measured against production
-- 2026-09-10 before a line was written; additive only, safe to re-run.
--
-- =============================================================================
-- WHAT WAS ALREADY THERE, AND WHY THIS IS NOT 108 AGAIN
-- =============================================================================
--
-- 108 IS APPLIED. Measured, not assumed: `information_schema` returns all
-- twelve of its columns on the hosted project -- three on `orders`, nine on
-- `vouchers` -- and `notification_outbox_kind_check` lists `voucher_gifted`
-- among its sixteen kinds. Recipient name, recipient email, greeting, the claim
-- token and the claim flow all exist and all work.
--
-- So this migration adds exactly the three columns 108 has no answer for, and
-- touches nothing it already decided.
--
-- =============================================================================
-- THERE IS NO `gift_scheduled_outbox` TABLE, ON PURPOSE
-- =============================================================================
--
-- "Scheduled delivery date" reads like it wants a queue. It does not, because
-- one already exists and already has the column: `notification_outbox` carries
-- `next_attempt_at timestamptz NOT NULL DEFAULT now()`, and the drain in
-- `/api/cron/notifications` selects on
-- `and(status.eq.pending,next_attempt_at.lte.<now>)`. A row whose
-- `next_attempt_at` is three weeks out is invisible to every run of the drain
-- until that moment and then goes out on the next one.
--
-- That column was built as retry backoff. Using it as a send-at is not a reuse
-- of convenience: the drain's question is "is this row due", and "due later
-- because it failed" and "due later because the buyer said so" are the same
-- question with the same answer. A second scheduling mechanism next to it would
-- be a second thing that can disagree about whether an email has gone out.
--
-- WHAT THIS DOES MEAN, AND IT IS THE REAL COST: the schedule is only as
-- punctual as the cron. A gift set for the 3rd goes out on the first drain run
-- after midnight of the 3rd, not at 00:00:00. The date is a date, and the
-- customer is promised a date.
--
-- `vouchers.gift_deliver_at` is therefore NOT the mechanism. It is the RECORD:
-- what the buyer asked for, kept on the row the buyer can see, so their account
-- page can say "יישלח ב-3.10" without reading an outbox row that is service-role
-- only and that the buyer must never be shown (it holds the raw claim token).
--
-- =============================================================================
-- THE FEE IS AGOROT, AND IT IS SNAPSHOT
-- =============================================================================
--
-- `gift_wrap_fee_agorot bigint NOT NULL DEFAULT 0`, under the standing rule
-- that money is an integer number of agorot and never a float. It is the amount
-- CHARGED on this order, not a pointer to today's price, for the same reason
-- `order_items` snapshots `platform_percent`: the price of wrapping will change
-- and every order already placed must keep saying what it actually took.
--
-- NOT NULL DEFAULT 0 rather than nullable: every existing order charged no fee,
-- and that is a fact about them rather than an absence. A nullable column would
-- make `SUM(gift_wrap_fee_agorot)` over any historical range return NULL and
-- quietly wrong any revenue report that touched it.
--
-- The CHECK is not decoration. This value is added to the card charge; a
-- negative one would be a discount nobody authorised, funded from the
-- platform's share, reachable from a checkout field.
--
-- WHOSE MONEY IT IS: the platform's, entirely. The supplier did not wrap
-- anything and is owed nothing out of it, so `calculateSettlement` adds it to
-- `cardCharge` and to `platformNet` and leaves every per-line split and
-- `supplierDue` byte for byte as they were. It is deliberately not part of
-- `faceValue` either: the face value of a coupon is what the business honours
-- at the counter, and a wrapping fee is not redeemable there.

-- ---------------------------------------------------------------------------
-- 1. orders: what the buyer asked for and what they were charged for it
-- ---------------------------------------------------------------------------

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS gift_deliver_at      timestamptz,
  ADD COLUMN IF NOT EXISTS gift_wrap_fee_agorot bigint NOT NULL DEFAULT 0;

-- Separate statement: ADD CONSTRAINT has no IF NOT EXISTS in Postgres 17, so
-- re-running the file would raise 42710 and abort everything after it.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.orders'::regclass
       AND conname  = 'orders_gift_wrap_fee_agorot_nonneg'
  ) THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT orders_gift_wrap_fee_agorot_nonneg
      CHECK (gift_wrap_fee_agorot >= 0);
  END IF;
END
$$;

COMMENT ON COLUMN public.orders.gift_deliver_at IS
  'When the buyer asked for the gift email to go out. NULL means immediately, which is what every order before 226 did. The actual scheduling lives on notification_outbox.next_attempt_at; this column is the record the buyer is shown.';

COMMENT ON COLUMN public.orders.gift_wrap_fee_agorot IS
  'Integer agorot, snapshot at checkout. Platform revenue in full: it is added to cardCharge and platformNet and changes no supplier split. Not part of faceValue - a wrapping fee is not redeemable at the counter.';

-- ---------------------------------------------------------------------------
-- 2. vouchers: the same date, on the row the buyer can actually read
-- ---------------------------------------------------------------------------
--
-- No fee column here. The fee is one charge per ORDER, and an order can issue
-- several vouchers; splitting it across them would invent a per-voucher number
-- that no screen asks for and that would have to round.

ALTER TABLE public.vouchers
  ADD COLUMN IF NOT EXISTS gift_deliver_at timestamptz;

COMMENT ON COLUMN public.vouchers.gift_deliver_at IS
  'Copied from the order at finalize. NULL means the gift email was queued to go out at once. Set means it is parked on notification_outbox.next_attempt_at until then, and gift_sent_at records that it was QUEUED, not that it has arrived.';

-- `gift_sent_at` predates the schedule and its name now under-describes it.
-- Re-commented rather than renamed: it is the guard in the one UPDATE that
-- mints a claim token (`.is('gift_sent_at', null)`), and renaming a column that
-- a running finalize depends on to be idempotent is not worth a better noun.
COMMENT ON COLUMN public.vouchers.gift_sent_at IS
  'When the gift was QUEUED: the claim token was minted and the outbox row written. Not when the email arrived - that is notification_outbox.sent_at, and with 226 the two can be weeks apart. This column is the idempotency guard finalize replays against, which is why it is stamped at queue time and not at delivery.';

-- ---------------------------------------------------------------------------
-- 3. the partial index behind "which gifts are still waiting to go out"
-- ---------------------------------------------------------------------------
--
-- Partial, and small by construction: only scheduled gifts are in it. An admin
-- asking what is queued for the coming week, and any future job that needs to
-- reconcile a parked outbox row against its voucher, both scan this rather than
-- the whole voucher table.

CREATE INDEX IF NOT EXISTS idx_vouchers_gift_deliver_at
  ON public.vouchers (gift_deliver_at)
  WHERE gift_deliver_at IS NOT NULL;
