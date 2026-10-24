-- Preflight for migration 290: public.push_subscriptions (rc5 F14 browser push)
--
-- READ-ONLY. Run it through execute_sql BEFORE the migration; every row must
-- start with OK (or SKIP/NOTE, which say why the migration is partly a no-op).
-- Any row starting with STOP means do not apply.

SELECT CASE
  WHEN EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'auth' AND tablename = 'users')
  THEN 'OK: auth.users exists (required by the user_id foreign key)'
  ELSE 'STOP: auth.users is missing, push_subscriptions cannot be created'
END AS requires_auth_users;
SELECT CASE
  WHEN EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'push_subscriptions')
  THEN 'SKIP: public.push_subscriptions already exists (179 ran), the migration is idempotent'
  ELSE 'OK: public.push_subscriptions is absent and will be created'
END AS push_subscriptions_check;
SELECT CASE
  WHEN EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                WHERE n.nspname = 'public' AND p.proname = 'set_updated_at')
  THEN 'NOTE: public.set_updated_at exists, 290 replaces it with the same body; 177 pins its search_path'
  ELSE 'OK: public.set_updated_at is absent and will be created'
END AS set_updated_at_check;
