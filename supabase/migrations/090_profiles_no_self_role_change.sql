-- 090_profiles_no_self_role_change.sql
--
-- Closes a privilege escalation on public.profiles.
--
-- The table carries TWO permissive UPDATE policies:
--
--   "profiles: owner update"        authenticated
--       USING      (id = auth.uid())
--       WITH CHECK ((id = auth.uid()) AND role = (current role of auth.uid()))
--
--   "Users can update own profile"  public
--       USING      (auth.uid() = id)
--       WITH CHECK  -- ABSENT
--
-- Permissive policies are OR'd, and a policy with no WITH CHECK constrains
-- nothing about the NEW row. The second policy therefore lets any signed-in
-- user set their own profiles.role to 'admin' or 'super_admin', and their own
-- profiles.supplier_id to any supplier, defeating the first policy entirely.
-- Measured against the hosted project 2026-07-28: both policies present, and no
-- trigger on profiles guards the role column (only audit_profiles and
-- ensure_wallet_account exist), so RLS is the only defence and it is open.
--
-- ARCHITECTURE-ADMIN section 7 rule 4 states the invariant this restores:
-- "Users cannot UPDATE their own profiles.role or profiles.supplier_id."
--
-- The fix drops the unconstrained legacy policy and restates the owner policy
-- so it also pins supplier_id, which the original checked only for role. Role
-- and supplier assignment stay where they belong: the admin server actions,
-- which run through the service client after requireSection.
--
-- Idempotent: DROP POLICY IF EXISTS before every CREATE POLICY.
-- Rollback: recreate "Users can update own profile" with the same USING clause.
-- Doing so reopens the escalation, so it is deliberately not scripted here.
--
-- NOT APPLIED to the hosted project. Draft only.

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- The unconstrained one. Its USING clause is fine; the missing WITH CHECK is
-- what makes it a hole, and a policy cannot be narrowed in place.
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

-- Restated so the row a user writes must keep BOTH the role and the supplier
-- they already had. Comparing against a sub-select of their own row means the
-- check reads the pre-update value, so any attempt to change either column
-- fails the check rather than silently succeeding.
DROP POLICY IF EXISTS "profiles: owner update" ON public.profiles;
CREATE POLICY "profiles: owner update" ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (
    id = auth.uid()
    AND role = (SELECT p.role FROM public.profiles p WHERE p.id = auth.uid())
    AND supplier_id IS NOT DISTINCT FROM
        (SELECT p.supplier_id FROM public.profiles p WHERE p.id = auth.uid())
  );

COMMENT ON POLICY "profiles: owner update" ON public.profiles IS
  'Self-service profile edits. role and supplier_id are pinned to their current values: changing either is an admin action through the service client, never a client write (ARCHITECTURE-ADMIN section 7 rule 4).';
