-- 314: wa_otp_enabled flag (G111). OFF: the WhatsApp sign-in code routes answer 404.
-- Rollback: delete from public.feature_flags where key = 'wa_otp_enabled';

insert into public.feature_flags (key, bool_value)
values ('wa_otp_enabled', false)
on conflict (key) do nothing;
