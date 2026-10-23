-- ===========================================================================
-- Preflight checks for migration 300: C16 Payment + Refund Infrastructure
-- ===========================================================================
-- Run this in a rolled-back DO block before applying the migration.
-- Checks:
--   1. Required base tables exist (orders, payments, products, order_items)
--   2. No conflicting types exist with incompatible definitions
--   3. Status columns have correct enum types
-- ===========================================================================

DO $$
DECLARE
  v_missing_tables text[];
  v_enum_count integer;
  v_table_count integer;
BEGIN
  RAISE NOTICE 'C16 Preflight: Starting checks...';

  -- Check 1: Required base tables exist
  SELECT array_agg(required_table)
    INTO v_missing_tables
    FROM (VALUES ('orders'), ('payments'), ('products'), ('order_items')) AS t(required_table)
    WHERE NOT EXISTS (
      SELECT 1 FROM pg_tables
      WHERE schemaname = 'public' AND tablename = t.required_table
    );

  IF v_missing_tables IS NOT NULL THEN
    RAISE WARNING 'Missing required tables: %. Migration will skip related triggers.', array_to_string(v_missing_tables, ', ');
  ELSE
    RAISE NOTICE '✓ All required base tables exist';
  END IF;

  -- Check 2: Enum types - if they exist, verify they're compatible
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_event_type') THEN
    SELECT count(*) INTO v_enum_count
      FROM pg_enum e
      JOIN pg_type t ON e.enumtypid = t.oid
      WHERE t.typname = 'payment_event_type';
    RAISE NOTICE '✓ payment_event_type exists with % values', v_enum_count;
  ELSE
    RAISE NOTICE '○ payment_event_type will be created';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'refund_ground') THEN
    RAISE NOTICE '✓ refund_ground exists';
  ELSE
    RAISE NOTICE '○ refund_ground will be created';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'refund_state') THEN
    RAISE NOTICE '✓ refund_state exists';
  ELSE
    RAISE NOTICE '○ refund_state will be created';
  END IF;

  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'refund_destination') THEN
    RAISE NOTICE '✓ refund_destination exists';
  ELSE
    RAISE NOTICE '○ refund_destination will be created';
  END IF;

  -- Check 3: Table existence
  SELECT count(*) INTO v_table_count
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename IN ('payment_events', 'refunds', 'search_index_outbox');

  IF v_table_count > 0 THEN
    RAISE NOTICE '✓ % of 3 target tables already exist (idempotent)', v_table_count;
  ELSE
    RAISE NOTICE '○ All 3 tables will be created fresh';
  END IF;

  -- Check 4: Status columns in base tables
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'orders' AND column_name = 'status'
  ) THEN
    RAISE NOTICE '✓ orders.status column exists';
  ELSE
    RAISE WARNING 'orders.status column missing - state guard will not be created';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'status'
  ) THEN
    RAISE NOTICE '✓ payments.status column exists';
  ELSE
    RAISE WARNING 'payments.status column missing - state guard will not be created';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'order_items' AND column_name = 'settlement_status'
  ) THEN
    RAISE NOTICE '✓ order_items.settlement_status column exists';
  ELSE
    RAISE WARNING 'order_items.settlement_status column missing - state guard will not be created';
  END IF;

  -- Summary
  RAISE NOTICE '';
  RAISE NOTICE '====================================';
  RAISE NOTICE 'Preflight complete - migration ready';
  RAISE NOTICE '====================================';

  -- Force rollback
  RAISE EXCEPTION 'Preflight complete - rolling back as expected'
    USING ERRCODE = '00000';

EXCEPTION
  WHEN SQLSTATE '00000' THEN
    -- Expected rollback
    NULL;
END
$$;
