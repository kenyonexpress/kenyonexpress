-- Preflight for 299_payment_card_verifications_rls.sql
-- Read-only. Stops if RLS is already enabled or policies exist.

DO $$
BEGIN
  -- Check if RLS is already enabled
  IF (SELECT relrowsecurity FROM pg_class WHERE relname = 'payment_card_verifications' AND relnamespace = 'public'::regnamespace) THEN
    RAISE EXCEPTION 'RLS already enabled on payment_card_verifications (migration 299 may already be applied)';
  END IF;

  -- Check if any of the policies exist
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'payment_card_verifications'
      AND policyname IN (
        'payment_card_verifications_owner_select',
        'payment_card_verifications_admin_select'
      )
  ) THEN
    RAISE EXCEPTION 'payment_card_verifications policies from migration 299 already exist';
  END IF;
END $$;

-- Informational: current state of payment_card_verifications
SELECT 
  c.relrowsecurity AS rls_enabled,
  (SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'payment_card_verifications') AS policy_count
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'payment_card_verifications';

-- Show existing policies (should be empty before applying)
SELECT policyname, cmd, roles, qual
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'payment_card_verifications';
