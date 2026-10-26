-- 299: Enable RLS on payment_card_verifications table
--
-- CONTEXT: C72 RLS coverage audit found payment_card_verifications without RLS enabled.
-- This table stores card verification attempts for supplier card validation.
-- Contains sensitive payment data and must be protected.
--
-- SECURITY:
-- - Users can only read their own verifications
-- - Admins can read all verifications
-- - No client writes (service-key only, from server actions)
-- - Anon has no access

-- Enable RLS
ALTER TABLE public.payment_card_verifications ENABLE ROW LEVEL SECURITY;

-- Owner read policy: users can read their own verifications
CREATE POLICY payment_card_verifications_owner_select ON public.payment_card_verifications
  FOR SELECT TO authenticated
  USING (profile_id = (SELECT auth.uid()));

-- Admin read policy: admin/super_admin can read all verifications
CREATE POLICY payment_card_verifications_admin_select ON public.payment_card_verifications
  FOR SELECT TO authenticated
  USING (is_admin());

-- No INSERT/UPDATE/DELETE policies for authenticated users.
-- All writes are service-key only from server-side code.

-- Revoke all from anon
REVOKE ALL ON public.payment_card_verifications FROM anon;

-- Grant SELECT to authenticated (enforced by RLS policies above)
GRANT SELECT ON public.payment_card_verifications TO authenticated;

-- ============================================================================
-- VERIFICATION (run after applying, inside a rolled-back DO block)
-- ============================================================================
--
-- DO $$
-- DECLARE
--   v_anon_blocked boolean;
--   v_owner_count integer;
--   v_other_count integer;
-- BEGIN
--   -- 1. Verify RLS is enabled
--   IF NOT (SELECT relrowsecurity FROM pg_class WHERE relname = 'payment_card_verifications') THEN
--     RAISE EXCEPTION 'RLS not enabled on payment_card_verifications';
--   END IF;
--
--   -- 2. Test anon cannot read
--   SET LOCAL ROLE anon;
--   BEGIN
--     SELECT COUNT(*) FROM payment_card_verifications INTO v_owner_count;
--     RAISE EXCEPTION 'anon should not be able to read payment_card_verifications';
--   EXCEPTION
--     WHEN insufficient_privilege THEN
--       -- Expected
--       NULL;
--   END;
--
--   -- 3. Test authenticated user can only see their own rows
--   -- (This test requires test data with different profile_ids)
--   RESET ROLE;
--   SET LOCAL ROLE authenticated;
--   SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000001"}'::json;
--
--   -- Insert test row for this user
--   INSERT INTO payment_card_verifications (
--     id, profile_id, status, amount_agorot
--   ) VALUES (
--     'test-user-1-verification'::uuid,
--     '00000000-0000-0000-0000-000000000001'::uuid,
--     'pending',
--     100
--   );
--
--   -- Insert test row for another user (using service key)
--   RESET ROLE;
--   INSERT INTO payment_card_verifications (
--     id, profile_id, status, amount_agorot
--   ) VALUES (
--     'test-user-2-verification'::uuid,
--     '00000000-0000-0000-0000-000000000002'::uuid,
--     'pending',
--     100
--   );
--
--   -- User 1 should only see their own row
--   SET LOCAL ROLE authenticated;
--   SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000001"}'::json;
--   SELECT COUNT(*) FROM payment_card_verifications INTO v_owner_count;
--   IF v_owner_count != 1 THEN
--     RAISE EXCEPTION 'User should see exactly 1 verification (theirs), saw %', v_owner_count;
--   END IF;
--
--   -- User 2 should only see their own row
--   SET LOCAL request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000002"}'::json;
--   SELECT COUNT(*) FROM payment_card_verifications INTO v_other_count;
--   IF v_other_count != 1 THEN
--     RAISE EXCEPTION 'User 2 should see exactly 1 verification (theirs), saw %', v_other_count;
--   END IF;
--
--   RAISE NOTICE 'payment_card_verifications RLS verification passed';
-- END $$;
