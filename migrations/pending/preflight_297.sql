-- Preflight for BOTH 297_*.sql files (they share a number):
--   297_order_items_purchase_count_rls.sql
--   297_user_verification_milestones.sql
-- Read-only. Stops if either migration's objects already exist.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'order_items'
      AND policyname IN ('anon_count_purchase_policy', 'user_view_own_order_items')
  ) THEN
    RAISE EXCEPTION 'order_items policy from migration 297 already exists';
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'user_verification_milestones'
  ) THEN
    RAISE EXCEPTION 'user_verification_milestones table from migration 297 already exists';
  END IF;
END $$;

-- Informational: order_items RLS state and the policies already on it.
SELECT c.relrowsecurity AS rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'order_items';

SELECT policyname, cmd, roles, qual
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'order_items';
