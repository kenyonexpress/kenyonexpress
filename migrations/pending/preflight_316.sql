-- Preflight check for migration 316 (read-only)
select to_regclass('public.notification_consents') as t;
