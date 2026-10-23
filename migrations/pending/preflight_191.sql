-- Preflight for migration 191: payment card verifications and profiles.saved_payment_method
--
-- READ-ONLY. Run it through execute_sql BEFORE the migration; every row must
-- start with OK (or SKIP/NOTE, which say why the migration is partly a no-op).
-- Any row starting with STOP means do not apply.

SELECT CASE
  WHEN EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'profiles')
  THEN 'OK: public.profiles exists (required)'
  ELSE 'STOP: public.profiles is missing, this migration cannot apply'
END AS requires_profiles;
SELECT CASE
  WHEN EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'payment_tokens')
  THEN 'OK: public.payment_tokens exists (required)'
  ELSE 'STOP: public.payment_tokens is missing, this migration cannot apply'
END AS requires_payment_tokens;
SELECT CASE
  WHEN EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'payment_card_verifications')
  THEN 'SKIP: public.payment_card_verifications already exists'
  ELSE 'OK: can create public.payment_card_verifications'
END AS payment_card_verifications_check;
SELECT CASE
  WHEN EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'saved_payment_method')
  THEN 'SKIP: profiles.saved_payment_method already exists'
  ELSE 'OK: can add profiles.saved_payment_method'
END AS profiles_saved_payment_method_check;
