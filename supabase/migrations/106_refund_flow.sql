-- 106_refund_flow.sql
--
-- What [48] needs from the schema, measured against production on 2026-08-06
-- rather than read off the migration files. Additive only, safe to re-run.
--
-- WHY THIS EXISTS WHEN 026 ALREADY DECLARES THE COLUMN
--
-- `026_commerce.sql:131` declares `refund_of_payment_id` inside a
-- `CREATE TABLE IF NOT EXISTS public.payments (...)`. The hosted project
-- already had a `payments` table when 026 ran, so the whole statement was
-- skipped and not one of its columns was added. Measured:
--
--   select column_name from information_schema.columns
--    where table_schema='public' and table_name='payments'
--   -> 18 columns, and `refund_of_payment_id` is not among them
--      (neither is `token_id`, which nothing on the money path writes).
--
-- This is the same divergence `lib/payments/payment-money-columns.ts` already
-- documents for `amount_ils` vs `amount_agorot`: the file chain does not
-- describe this database. `IF NOT EXISTS` on a table is not `IF NOT EXISTS` on
-- its columns, and that difference is silent.
--
-- WHAT IT COST, BEFORE THIS MIGRATION
--
-- A column Postgres does not have does not fail partially. It raises 42703 and
-- takes down the whole statement. `server/actions/payments/refund.ts` named
-- `refund_of_payment_id` in its refund INSERT, so **every refund in production
-- failed after Cardcom had already moved the money back** - the card was
-- credited, and the row recording it was never written. The order stayed
-- `paid`, and a second click would have credited the card again.
--
-- WHY supplier_debit IS A settlement_events KIND AND NOT A NEW TABLE
--
-- The settlement state machine has always carried this sentence: "REFUND from
-- split_executed covers physical returns inside the legal window (money
-- recovery from the supplier happens via payout adjustments)". Until now it
-- described nothing. A refunded physical line moved to `refunded` and the
-- supplier kept the share that was released at split time, so the platform paid
-- the supplier's cut twice: once to the supplier, once back to the customer.
--
-- There is no payouts table in production to adjust - `information_schema`
-- returns `settlement_events` and `v_wallet_ledger` and nothing matching
-- `%payout%`. `settlement_events` is the money journal 094 built for exactly
-- this: append-only, per line, carrying the split it was computed under. A
-- debit is an event, not a balance, so it belongs here and the payout report
-- ([54]) sums it rather than reading a column somebody has to keep correct.
--
-- The amount is stored POSITIVE in `supplier_due_agorot`, because 094's CHECK
-- refuses negatives on all four money columns and widening that check to allow
-- them would let any event carry a negative by accident. The sign lives in the
-- `kind`, which is the column that is already constrained to a known set.

-- ---------------------------------------------------------------------------
-- 1. payments.refund_of_payment_id
-- ---------------------------------------------------------------------------

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS refund_of_payment_id uuid;

-- ON DELETE RESTRICT, matching 026: a charge that has been refunded is the
-- reason the refund row exists, and deleting it would leave the credit
-- unattributable. `ADD CONSTRAINT IF NOT EXISTS` does not exist for foreign
-- keys, hence the catalogue check.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.payments'::regclass
       AND conname  = 'payments_refund_of_payment_id_fkey'
  ) THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT payments_refund_of_payment_id_fkey
      FOREIGN KEY (refund_of_payment_id)
      REFERENCES public.payments(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- Partial: the column is null on every charge row and set only on refunds, and
-- "which refunds reverse this charge" is the only question asked of it.
CREATE INDEX IF NOT EXISTS idx_payments_refund_of
  ON public.payments (refund_of_payment_id)
  WHERE refund_of_payment_id IS NOT NULL;

COMMENT ON COLUMN public.payments.refund_of_payment_id IS
  'The charge this refund reverses. Null on charge rows. Declared in 026 but never created here, because 026''s CREATE TABLE IF NOT EXISTS found the table already present.';

-- ---------------------------------------------------------------------------
-- 2. settlement_events kind: supplier_debit
-- ---------------------------------------------------------------------------

-- The existing constraint is replaced rather than amended - a CHECK is a whole
-- expression - and it is dropped and recreated in one statement pair so no
-- window exists where settlement_events accepts an unknown kind.
ALTER TABLE public.settlement_events
  DROP CONSTRAINT IF EXISTS settlement_events_kind_known;

ALTER TABLE public.settlement_events
  ADD CONSTRAINT settlement_events_kind_known CHECK (
    kind = ANY (ARRAY[
      'charge_settled'::text,
      'voucher_redeemed'::text,
      'voucher_expired'::text,
      'refund_issued'::text,
      'discount_funded'::text,
      'payout_settled'::text,
      'supplier_debit'::text
    ])
  );

COMMENT ON CONSTRAINT settlement_events_kind_known ON public.settlement_events IS
  'supplier_debit added in 106: a supplier share already released and clawed back by a refund. Amount is positive in supplier_due_agorot; the sign is the kind, because 094''s amount CHECK refuses negatives on purpose.';
