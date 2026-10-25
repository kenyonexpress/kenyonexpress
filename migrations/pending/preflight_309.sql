-- Preflight for migration 309: Signup bonus documentation
--
-- This migration is documentation-only and requires no schema changes.
-- Verification that wallet infrastructure is ready:

DO $$
BEGIN
  -- Verify platform:cashback_reserve account exists
  IF NOT EXISTS (
    SELECT 1 FROM wallet_accounts WHERE code = 'platform:cashback_reserve'
  ) THEN
    RAISE EXCEPTION 'platform:cashback_reserve wallet account not found';
  END IF;

  -- Verify fn_wallet_transfer function exists
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'fn_wallet_transfer'
  ) THEN
    RAISE EXCEPTION 'fn_wallet_transfer function not found';
  END IF;

  -- Verify wallet_reason enum includes referral_bonus
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'wallet_reason' AND e.enumlabel = 'referral_bonus'
  ) THEN
    RAISE EXCEPTION 'wallet_reason enum missing referral_bonus value';
  END IF;

  RAISE NOTICE 'Preflight 309: All wallet infrastructure verified OK';
END
$$;
