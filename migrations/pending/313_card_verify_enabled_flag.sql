-- 313: card_verify_enabled flag (C91, F07).
-- Gates the 1 ILS card verification (authorize via the payment adapter, store
-- the token on profiles.saved_payment_method, void the charge). Seeded OFF.
-- FLAG_CARD_VERIFY_ENABLED=1 overrides.
--
-- Rollback:
--   delete from public.feature_flags where key = 'card_verify_enabled';

insert into public.feature_flags (key, bool_value)
values ('card_verify_enabled', false)
on conflict (key) do nothing;
