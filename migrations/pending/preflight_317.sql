-- Preflight check for migration 317 (read-only)
select to_regclass('public.user_phone_verifications') as t;
-- expect null before apply
