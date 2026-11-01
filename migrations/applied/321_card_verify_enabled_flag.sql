-- 321: card_verify_enabled flag (C91). OFF: supplier applications skip the 1 ILS card verification.
-- Rollback: delete from public.feature_flags where key = 'card_verify_enabled';

insert into public.feature_flags (key, bool_value)
values ('card_verify_enabled', false)
on conflict (key) do nothing;
