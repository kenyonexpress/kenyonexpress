-- preflight_277.sql
-- Preflight checks for migration 277 (fraud monitoring infrastructure)

-- Verify orders table exists and has the required columns
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'orders'
  ) THEN
    RAISE EXCEPTION 'orders table does not exist';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'profile_id'
  ) THEN
    RAISE EXCEPTION 'orders.profile_id column does not exist';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'created_at'
  ) THEN
    RAISE EXCEPTION 'orders.created_at column does not exist';
  END IF;
END
$$;

-- Verify payments table exists for IP tracking
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'payments'
  ) THEN
    RAISE EXCEPTION 'payments table does not exist';
  END IF;
END
$$;

-- Verify profiles table exists for RLS and foreign keys
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'profiles'
  ) THEN
    RAISE EXCEPTION 'profiles table does not exist';
  END IF;
END
$$;

-- Check that no existing fraud_signals, fraud_flags, or chargeback_history tables exist
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name IN ('fraud_signals', 'fraud_flags', 'chargeback_history')
  ) THEN
    RAISE EXCEPTION 'One or more fraud monitoring tables already exist. This migration cannot be applied.';
  END IF;
END
$$;

RAISE INFO 'preflight_277: All checks passed. Safe to apply migration 277.';
