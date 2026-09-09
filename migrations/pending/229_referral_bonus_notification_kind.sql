-- 229_referral_bonus_notification_kind.sql
--
-- One kind, added to one CHECK constraint, so a referral bonus can be mailed
-- about with a sentence that is true.
--
-- Measured against production `ixvwfbuvfxxsjiywhbbb` on 2026-09-10 before this
-- file was written.
--
-- =============================================================================
-- WHAT THIS IS FOR
-- =============================================================================
--
-- `fn_pay_referral` credits BOTH wallets and, until 2026-09-10, told nobody.
-- There was no code path that enqueued anything after a referral was paid, and
-- there was no kind in `notification_outbox_kind_check` that could have carried
-- one. `src/server/referrals/pay.ts` now enqueues
-- `referral_bonus_credited` after the ledger move; this constraint is what lets
-- the row in.
--
-- =============================================================================
-- WHY NOT REUSE `cashback_credited`, WHICH IS ALREADY ACCEPTED
-- =============================================================================
--
-- Because of what it says. `buildCashbackCreditedEmail` opens with
-- `נכנס לך קאשבק`. For the REFERRER that is false in an expensive way: they
-- bought nothing, their friend did, and the mail sends them looking through
-- their own order history for a purchase that earned it. This is the identical
-- trap `voucher_expiry_credited` was given its own kind to avoid, argued at
-- length in `buildVoucherExpiryCreditedEmail`. Saving a migration file by
-- shipping a false sentence about somebody's money is not a saving.
--
-- =============================================================================
-- THE LIVE CONSTRAINT ON 2026-09-10
-- =============================================================================
--
-- Sixteen kinds:
--   order_paid, supplier_sale, voucher_redeemed, voucher_issued,
--   voucher_gifted, voucher_expiring, cashback_credited, invoice_dead,
--   low_stock, reconciliation_gap, refund_completed, welcome,
--   account_deleted, order_shipped, price_drop, back_in_stock
--
-- Note what is NOT there and is referenced by shipped code:
-- `settlement_gap` (waiting on 214) and `voucher_expiry_credited` (waiting on
-- 227). This file adds only its own kind and deliberately does NOT fold those
-- in: each belongs to the migration that owns it, and quietly widening a
-- constraint on another migration's behalf is how two pending files start
-- disagreeing about what the constraint should say.
--
-- Until this is applied, every enqueue from `payReferralIfReady` fails with
-- 23514 and is logged with `kind_not_accepted: true`. The bonus is still PAID:
-- the money moves in `fn_pay_referral`, before any of this, and the mail is the
-- only thing that is lost. That ordering is deliberate and is why this file is
-- not urgent.
--
-- =============================================================================
-- IDEMPOTENCY
-- =============================================================================
--
-- DROP IF EXISTS then ADD, which is the only way to widen a CHECK. The window
-- between them is inside the transaction, so no row can be inserted against the
-- absent constraint from another session.
--
-- The new list is written out in full rather than assembled from the old one:
-- deriving it would make the file's effect depend on what the constraint
-- happened to say when it ran, and this file's whole job is to state what it
-- should say.

BEGIN;

ALTER TABLE public.notification_outbox
  DROP CONSTRAINT IF EXISTS notification_outbox_kind_check;

ALTER TABLE public.notification_outbox
  ADD CONSTRAINT notification_outbox_kind_check CHECK (
    kind = ANY (ARRAY[
      'order_paid'::text,
      'supplier_sale'::text,
      'voucher_redeemed'::text,
      'voucher_issued'::text,
      'voucher_gifted'::text,
      'voucher_expiring'::text,
      'cashback_credited'::text,
      'invoice_dead'::text,
      'low_stock'::text,
      'reconciliation_gap'::text,
      'refund_completed'::text,
      'welcome'::text,
      'account_deleted'::text,
      'order_shipped'::text,
      'price_drop'::text,
      'back_in_stock'::text,
      'referral_bonus_credited'::text
    ])
  );

COMMIT;

-- =============================================================================
-- WHAT TO CHECK AFTER APPLYING
-- =============================================================================
--
--   SELECT pg_get_constraintdef(c.oid)
--     FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid
--    WHERE t.relname = 'notification_outbox'
--      AND c.conname = 'notification_outbox_kind_check';
--
-- Expect seventeen kinds with `referral_bonus_credited` among them. Nothing
-- else changes: no row is rewritten, no existing kind is removed, and the
-- constraint only widens, so no currently valid row can become invalid.
--
-- Reversal: run the same two statements with the seventeenth entry removed.
-- Safe only while no `referral_bonus_credited` row exists in the table; after
-- one has been enqueued, the ADD would fail on it, which is the correct refusal.
