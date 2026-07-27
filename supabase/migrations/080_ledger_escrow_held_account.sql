-- 080_ledger_escrow_held_account.sql
--
-- ⛔ CANCELLED 2026-07-28, NEVER APPLIED. DO NOT APPLY.
-- This file implements C11 version (b), the escrow model that the operator
-- instruction of 28.07 reversed: the coupon prepayment is now platform revenue
-- in full at payment time, so there is no held balance for this account to
-- carry. See the flip section at the top of docs/CONTRADICTIONS.md.
-- It is kept, not deleted, because it is the ready-made way back if the escrow
-- model returns. Reviving it means C11 goes back to (b) FIRST, in
-- docs/CONTRADICTIONS.md, and commission.ts/finalize.ts follow.
-- The rationale below describes the cancelled model and is preserved as-is.
--
-- The ledger had no way to say "held" (docs/CONTRADICTIONS.md C3, C11 b).
--
-- 058 seeded five account kinds and none of them expresses the supplier's share
-- of a coupon prepayment between purchase and redemption. Booking it to
-- supplier_payable at purchase would claim we owe the supplier money for a
-- voucher that may still expire back to the customer wallet (C6); leaving it
-- out entirely would leave the cardcom_clearing debit without a matching credit
-- and no journal would balance. This adds the missing liability account:
--
--   purchase   D cardcom_clearing   C platform_revenue + vat_output + escrow_held
--   redemption D escrow_held        C supplier_payable        (now genuinely owed)
--   expiry     D escrow_held + platform_revenue + vat_output
--                                   C customer_wallet         (C6, nobody keeps it)
--
-- It is per supplier, like supplier_payable: "how much of our Cardcom balance is
-- earmarked for this supplier and not yet theirs" is a question asked per
-- supplier, and a single global pot could not answer it during a dispute.
--
-- The CHECK compares kind::text rather than an enum literal, for the reason
-- already recorded as DECISIONS.md D8: Postgres refuses to use an enum value in
-- the same transaction that added it, and splitting this into two order-dependent
-- files buys nothing. The comparison is exhaustive either way.
--
-- Idempotent, forward-only. Depends on 058_ledger_core.

DO $$
BEGIN
  IF to_regclass('public.ledger_accounts') IS NULL THEN
    RAISE EXCEPTION '080 requires 058_ledger_core (ledger_accounts missing)';
  END IF;
END $$;

ALTER TYPE public.ledger_account_kind ADD VALUE IF NOT EXISTS 'escrow_held';

-- ---------------------------------------------------------------------------
-- Ownership rule: escrow_held is a per-supplier account
-- ---------------------------------------------------------------------------
ALTER TABLE public.ledger_accounts
  DROP CONSTRAINT IF EXISTS ledger_accounts_owner_by_kind;

ALTER TABLE public.ledger_accounts
  ADD CONSTRAINT ledger_accounts_owner_by_kind CHECK (
    (kind::text IN ('platform_revenue', 'cardcom_clearing', 'vat_output')
       AND supplier_id IS NULL AND user_id IS NULL)
    OR (kind::text IN ('supplier_payable', 'escrow_held')
       AND supplier_id IS NOT NULL AND user_id IS NULL)
    OR (kind::text = 'customer_wallet'
       AND user_id IS NOT NULL AND supplier_id IS NULL)
  );

COMMENT ON TYPE public.ledger_account_kind IS
  'Ledger account kinds. escrow_held (2026-07-27, C11 b) is the supplier share of a coupon prepayment that we are holding: already collected from the customer, not yet the supplier''s. It is released to supplier_payable on redemption and reversed to the customer wallet on expiry. Per supplier, like supplier_payable.';
