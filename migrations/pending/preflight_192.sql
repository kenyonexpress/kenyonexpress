-- Preflight checks for migration 192: Notification history
--
-- Verifies that table doesn't already exist

-- Check if table already exists
SELECT CASE
  WHEN EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'notification_history')
  THEN 'SKIP: notification_history already exists'
  ELSE 'OK: Can create notification_history'
END AS notification_history_check;

-- All checks passed if this query runs without errors
