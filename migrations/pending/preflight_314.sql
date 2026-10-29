-- Preflight check for migration 314 (read-only)
select to_regclass('public.feature_flags') as feature_flags;
-- expect non-null (created by 286)
select key, bool_value from public.feature_flags where key = 'wa_otp_enabled';
-- expect 0 rows; the insert is on conflict do nothing, so an existing row is never changed
