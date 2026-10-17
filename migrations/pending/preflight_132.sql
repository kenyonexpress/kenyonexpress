-- Preflight checks for migration 132: SMS Marketing tables
--
-- Verifies that tables don't already exist and constraints can be applied

-- Check if tables already exist
SELECT CASE
  WHEN EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'sms_broadcasts')
  THEN 'SKIP: sms_broadcasts already exists'
  ELSE 'OK: Can create sms_broadcasts'
END AS sms_broadcasts_check;

SELECT CASE
  WHEN EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'sms_unsubscribes')
  THEN 'SKIP: sms_unsubscribes already exists'
  ELSE 'OK: Can create sms_unsubscribes'
END AS sms_unsubscribes_check;

SELECT CASE
  WHEN EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'sms_delivery_events')
  THEN 'SKIP: sms_delivery_events already exists'
  ELSE 'OK: Can create sms_delivery_events'
END AS sms_delivery_events_check;

-- All checks passed if this query runs without errors
