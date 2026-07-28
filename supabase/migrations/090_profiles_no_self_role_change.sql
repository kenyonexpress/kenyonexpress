-- 090_profiles_no_self_role_change.sql
--
-- Closes a privilege escalation on public.profiles.
--
-- The table carries TWO permissive UPDATE policies:
--
--   "profiles: owner update"        authenticated
--       USING      (id = auth.uid())
--       WITH CHECK ((id = auth.uid()) AND role = (sub-select of own role))
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
-- ensure_wallet_account exist), so RLS was the only defence and it was open.
--
-- ARCHITECTURE-ADMIN section 7 rule 4 states the invariant this restores:
-- "Users cannot UPDATE their own profiles.role or profiles.supplier_id."
--
-- WHY A TRIGGER AND NOT A POLICY
--
-- The obvious fix is to give the owner policy a WITH CHECK that pins the two
-- columns to their current values. That needs a sub-select on public.profiles
-- from inside a policy on public.profiles, which is the recursion this
-- repository has already been bitten by once: migration 077 exists solely to
-- undo that shape on public.orders. A BEFORE UPDATE trigger reads OLD directly,
-- needs no sub-select, and cannot recurse.
--
-- The trigger is also the stricter boundary: it holds for every write path,
-- including SECURITY DEFINER functions that run with RLS bypassed. Admin role
-- changes go through public.is_admin(), and the service role is exempt because
-- auth.uid() is NULL for it, which is how the admin server actions still work.
--
-- Applied to the hosted project 2026-07-28 via MCP apply_migration, and
-- verified after: public.profiles now carries exactly one UPDATE policy and the
-- trigger below. The escalation was live until then.
--
-- Idempotent: DROP POLICY / DROP TRIGGER IF EXISTS before each CREATE.
-- Rollback: drop the trigger and recreate the legacy policy. That reopens the
-- escalation, so it is deliberately not scripted here.

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- The unconstrained one. Its USING clause is fine; the missing WITH CHECK is
-- what makes it a hole, and a policy cannot be narrowed in place.
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

-- Restated without the sub-select, which the trigger below now covers.
DROP POLICY IF EXISTS "profiles: owner update" ON public.profiles;
CREATE POLICY "profiles: owner update" ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE OR REPLACE FUNCTION public.enforce_profile_privilege_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Service role and internal jobs: auth.uid() is NULL. The admin server
  -- actions run here, after their own requireSection gate.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.is_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION 'profiles.role may only be changed by an admin'
      USING ERRCODE = '42501';
  END IF;

  IF NEW.supplier_id IS DISTINCT FROM OLD.supplier_id THEN
    RAISE EXCEPTION 'profiles.supplier_id may only be changed by an admin'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_profile_privilege_columns ON public.profiles;
CREATE TRIGGER enforce_profile_privilege_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_profile_privilege_columns();

COMMENT ON FUNCTION public.enforce_profile_privilege_columns() IS
  'Blocks a user from changing their own role or supplier_id. A trigger rather than an RLS WITH CHECK because the check needs the OLD row, and a sub-select on profiles from a policy on profiles is the recursion migration 077 had to undo elsewhere (ARCHITECTURE-ADMIN section 7 rule 4).';
