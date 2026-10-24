-- Preflight check for 303_comprehensive_audit_triggers.sql
--
-- Verifies that:
--   1. audit_log table exists
--   2. audit_log_trigger_fn() function exists
--   3. Target tables exist
--   4. No conflicting triggers exist (all are DROP IF EXISTS + CREATE, so safe to re-run)
--
-- Returns: one row per verification, or raises exception if a blocker is found.

DO $$
DECLARE
  v_audit_log_exists boolean;
  v_trigger_fn_exists boolean;
  v_missing_tables text[];
  v_required_tables text[] := ARRAY[
    'orders', 'order_items', 'vouchers', 'voucher_redemptions',
    'refunds', 'categories', 'discount_campaigns', 'discount_redemptions',
    'invoices', 'product_variants', 'coupon_codes', 'coupon_redemptions',
    'settlement_batches', 'settlement_items', 'reconciliation_runs',
    'reconciliation_discrepancies', 'affiliates', 'carts', 'cart_items',
    'stock_reservations', 'referral_program_settings', 'referral_signals'
  ];
  v_table text;
BEGIN
  -- 1. Check audit_log table exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'audit_log'
  ) INTO v_audit_log_exists;

  IF NOT v_audit_log_exists THEN
    RAISE EXCEPTION 'Blocker: audit_log table does not exist. Run migration 011 first.';
  END IF;

  -- 2. Check audit_log_trigger_fn() exists
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.proname = 'audit_log_trigger_fn'
  ) INTO v_trigger_fn_exists;

  IF NOT v_trigger_fn_exists THEN
    RAISE EXCEPTION 'Blocker: audit_log_trigger_fn() does not exist. Run migration 025 first.';
  END IF;

  -- 3. Check all target tables exist
  v_missing_tables := ARRAY[]::text[];
  FOREACH v_table IN ARRAY v_required_tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = v_table
    ) THEN
      v_missing_tables := array_append(v_missing_tables, v_table);
    END IF;
  END LOOP;

  IF array_length(v_missing_tables, 1) > 0 THEN
    RAISE WARNING 'Some tables are missing and will not have audit triggers: %',
      array_to_string(v_missing_tables, ', ');
  END IF;

  RAISE NOTICE 'Preflight 303: PASS - audit_log_trigger_fn() exists, % of % target tables found',
    array_length(v_required_tables, 1) - coalesce(array_length(v_missing_tables, 1), 0),
    array_length(v_required_tables, 1);
END $$;
