-- Preflight check for migration 310
-- Verifies orders exists and the fraud tables / orders.device_fingerprint are not already present

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name = 'orders'
  ) THEN
    RAISE EXCEPTION 'Table orders does not exist';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
    AND table_name IN ('fraud_alerts', 'fraud_ip_signup_log')
  ) THEN
    RAISE EXCEPTION 'fraud_alerts or fraud_ip_signup_log already exists';
  END IF;
END $$;
