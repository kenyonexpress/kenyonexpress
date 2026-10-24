-- Preflight for 295_subscriptions.sql
-- Verifies no conflicting tables exist

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name IN ('subscriptions', 'subscription_invoices')
  ) THEN
    RAISE EXCEPTION 'One or more tables from migration 295 already exist';
  END IF;
END $$;
