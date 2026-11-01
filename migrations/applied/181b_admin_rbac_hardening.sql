-- 181b: admin RBAC hardening: read_only's read surface, the admin-tier ladder,
-- super_admin MFA at the DB layer. The enum member itself is 181a, which must
-- be committed first -- see that file for why the pair is split.
--
-- WHY. Three findings, all measured against production via MCP on 2026-09-07:
--
--   (1) The panel has no observer tier. `user_role` holds exactly six values
--       (customer, content_uploader, vendor, admin, super_admin, support) and
--       every read surface below admin is support's curated operational list.
--       An auditor/accountant needs "see everything, change nothing", and the
--       only way to grant it today is a full admin role.
--   (2) The deployed role-change guard is 090's `enforce_profile_privilege_columns`,
--       NOT 035's `enforce_role_change_privilege` (pg_proc count for the 035
--       function: 0). 090 stops at `IF public.is_admin() THEN RETURN NEW`:
--       any admin may set any role on anyone, including granting super_admin
--       or demoting one, and may change their own role. The "only super_admin
--       grants admin roles" rule lives only in application code
--       (`canAssignRole`, `authorizeRoleChange`) on the service-role path.
--   (3) Nothing anywhere requires MFA of super_admin. A phished password is
--       the whole kingdom.
--
-- WHAT.
--   1. (moved to 181a) `ALTER TYPE user_role ADD VALUE 'read_only'`.
--   2. `is_support()` learns the new value, so read_only inherits support's
--      entire SELECT surface (14 policies in 053, 2 in 119) in one function
--      body. It appears in no write policy and no staff branch, so it is
--      read-only by construction at the DB layer. App-layer sections are
--      granted in `src/lib/admin/permissions.ts` (service-role reads).
--   3. `enforce_profile_privilege_columns()` gains the admin-tier ladder 035
--      never shipped, expressed against the deployed 090 body: no self role
--      change; admin-tier grants and revocations only by super_admin; and a
--      super_admin doing one must hold an aal2 (MFA-verified) JWT.
--   4. A RESTRICTIVE policy on profiles UPDATE: a super_admin session that is
--      not aal2 writes nothing through the user client. Defense in depth; the
--      admin actions use the service role and are gated by the app-layer MFA
--      redirect in `src/lib/admin/rbac.ts`.
--
-- The trigger/policy layer binds the user-client path. The service-role path
-- (auth.uid() IS NULL) stays trusted, exactly as 090 documents: the admin
-- server actions run there behind requireSection + the rbac.ts MFA gate.
--
-- ROLLBACK: PostgreSQL cannot drop an enum member (same caveat as 135), so
-- `read_only` stays; with the 053 `is_support()` body restored below it grants
-- nothing. Re-run `CREATE OR REPLACE` for the two functions with the bodies
-- quoted in the PREFLIGHT expectations (deployed 053 / 090 bodies), and
-- `DROP POLICY IF EXISTS profiles_super_admin_mfa ON public.profiles;`.
--
-- THE ONE THING THIS FILE DID NOT KNOW, measured 2026-09-09. Production holds
-- exactly ONE super_admin and it has NO verified MFA factor (zero rows in
-- `auth.mfa_factors` with `status = 'verified'` for that user; 9 customers,
-- likewise none). So the claim above that "a super_admin's session is aal2 in
-- practice" is not true today: it is aal1, because no factor exists at all.
--
-- That was checked for a deadlock and there is none. Enrolment runs entirely
-- through `supabase.auth.mfa.enroll/challenge/verify` (src/server/actions/mfa.ts,
-- SecurityClient.tsx) and writes to `auth.mfa_factors`, never to `profiles`, so
-- the RESTRICTIVE policy below cannot block the very ceremony that lifts it.
--
-- What it does mean, and the operator should know it: until that super_admin
-- enrols TOTP, they cannot UPDATE their own `profiles` row through the user
-- client -- `updateProfile` in src/server/actions/account.ts (full_name, phone)
-- is the only such path. The admin server actions are unaffected: they run on
-- the service role, where `auth.uid()` is NULL and RLS does not apply at all.
-- And the app already blocks that account from every admin page for the same
-- reason -- `enforceSuperAdminMfa` in src/lib/admin/rbac.ts redirects to
-- /admin-mfa?mode=enrol -- so this adds no lockout that is not already there.
--
-- NO RECURSION, checked rather than assumed. The RESTRICTIVE policy on
-- `profiles` calls `current_user_role()`, which selects FROM `profiles`. That
-- is the shape 077 had to undo. It is safe here only because the deployed
-- `current_user_role()` is SECURITY DEFINER (read off production 2026-09-09,
-- `prosecdef = true`), so its own read bypasses RLS and never re-enters the
-- policy. If anyone ever makes it INVOKER, this policy deadlocks every
-- authenticated profiles UPDATE.
--
-- THE HOLE THIS CLOSES IS REAL AND WAS READ OFF PRODUCTION, not inferred: the
-- deployed `enforce_profile_privilege_columns` body is literally
-- `IF public.is_admin() THEN RETURN NEW; END IF;` with nothing between, so any
-- admin can grant themselves or anyone else super_admin through the user
-- client today.
--
-- APPLIED 2026-09-09 via MCP as `admin_rbac_hardening_181b`, after 181a had
-- committed. All four preflight blocks returned exactly what the expectations
-- below predict.
--
-- PROVEN, not assumed, in a transaction that was then rolled back so
-- production kept no probe rows (`profiles` reads 9 customer + 1 super_admin
-- before and after, unchanged). Acting as the real super_admin with an aal1
-- claim -- which is that account's actual session shape today:
--
--   self role change            -> 'cannot change your own role'
--   grant admin from aal1       -> 'admin-tier role changes require an
--                                   MFA-verified session (aal2)'
--   service-role path (uid NULL) -> succeeded, and assigned 'read_only',
--                                   which also proves 181a's enum member is
--                                   usable
--
-- Read back after apply: is_support() names read_only, the guard body carries
-- both the ladder and the aal2 check, the trigger is attached, and
-- profiles_super_admin_mfa exists as RESTRICTIVE / UPDATE.

-- PREFLIGHT (inline; this branch keeps one file per pending change).
-- Run each block through MCP execute_sql BEFORE applying:
--
-- -- (1) user_role is exactly the six deployed values, read_only absent.
-- --     EXPECT: {customer,content_uploader,vendor,admin,super_admin,support}
-- select array_agg(enumlabel order by enumsortorder)
--   from pg_enum e join pg_type t on t.oid = e.enumtypid
--  where t.typname = 'user_role';
--
-- -- (2) is_support() is the 053 body (three-name IN list, role::text).
-- --     EXPECT: true. If false, compare bodies before replacing.
-- select position('''support'', ''admin'', ''super_admin''' in
--          pg_get_functiondef(p.oid)) > 0
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--  where n.nspname = 'public' and p.proname = 'is_support';
--
-- -- (3) The deployed profiles guard is 090's, 035's is absent, and the
-- --     trigger is attached. EXPECT: guard_090 = 1, guard_035 = 0, trg = 1.
-- select
--   (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--     where n.nspname = 'public' and p.proname = 'enforce_profile_privilege_columns') as guard_090,
--   (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--     where n.nspname = 'public' and p.proname = 'enforce_role_change_privilege') as guard_035,
--   (select count(*) from pg_trigger where tgname = 'enforce_profile_privilege_columns') as trg;
--
-- -- (4) The audit trail on profiles is live (audit_profiles ->
-- --     audit_log_trigger_fn), so every role change this migration newly
-- --     permits or denies is already recorded. EXPECT: 1.
-- select count(*) from pg_trigger where tgname = 'audit_profiles';

-- ---------------------------------------------------------------------------
-- 1. read_only enum value: MOVED TO 181a. Apply that file, and let it commit,
--    before this one.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 2. is_support(): support's read surface now includes read_only.
--
-- Same body as 053 plus one name. The comparison stays on role::text, NOT on
-- enum literals: an enum value added by ALTER TYPE ... ADD VALUE cannot be
-- referenced inside the same transaction, and this migration runs as one
-- (053 documents the identical trick for 'support').
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_support()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role::text IN ('support', 'read_only', 'admin', 'super_admin')
  );
$$;

COMMENT ON FUNCTION public.is_support() IS
  'Operational read tier: support, read_only, and the admin tier. read_only (181) deliberately shares support''s SELECT surface and appears in no write policy.';

-- ---------------------------------------------------------------------------
-- 3. enforce_profile_privilege_columns(): the admin-tier ladder, on the
--    deployed 090 body. Order of checks preserved; everything new sits in the
--    is_admin() branch that used to be an unconditional RETURN NEW.
-- ---------------------------------------------------------------------------

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
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      -- Self-demotion locks the account out; self-promotion is escalation.
      -- Either way the actor and the subject must differ (035's rule,
      -- shipped here because 035's function never reached production).
      IF NEW.id = auth.uid() THEN
        RAISE EXCEPTION 'cannot change your own role'
          USING ERRCODE = '42501';
      END IF;

      -- Granting or revoking an admin-tier role is super_admin territory,
      -- and a super_admin doing it must be MFA-verified (aal2). The aal
      -- claim is stamped by GoTrue and absent from pre-MFA sessions, so a
      -- missing claim reads as aal1, which fails closed.
      IF NEW.role::text IN ('admin', 'super_admin')
         OR OLD.role::text IN ('admin', 'super_admin') THEN
        IF public.current_user_role()::text <> 'super_admin' THEN
          RAISE EXCEPTION 'only super_admin may grant or revoke admin roles'
            USING ERRCODE = '42501';
        END IF;
        IF COALESCE(auth.jwt() ->> 'aal', 'aal1') <> 'aal2' THEN
          RAISE EXCEPTION 'admin-tier role changes require an MFA-verified session (aal2)'
            USING ERRCODE = '42501';
        END IF;
      END IF;
    END IF;
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

-- The trigger is already attached in production (preflight 3); re-attach
-- idempotently so a fresh database gets it from this file alone.
DROP TRIGGER IF EXISTS enforce_profile_privilege_columns ON public.profiles;
CREATE TRIGGER enforce_profile_privilege_columns
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_profile_privilege_columns();

COMMENT ON FUNCTION public.enforce_profile_privilege_columns() IS
  'Blocks a user from changing their own role or supplier_id; within the admin tier, blocks self role changes, reserves admin-tier grants/revocations to super_admin, and requires an aal2 (MFA) JWT for them (181). A trigger rather than an RLS WITH CHECK because the check needs the OLD row (see 090).';

-- ---------------------------------------------------------------------------
-- 4. A super_admin session without MFA writes nothing to profiles through the
--    user client. RESTRICTIVE, so it ANDs with the permissive policies from
--    089/119 instead of widening them.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS profiles_super_admin_mfa ON public.profiles;
CREATE POLICY profiles_super_admin_mfa ON public.profiles
  AS RESTRICTIVE FOR UPDATE TO authenticated
  USING (
    public.current_user_role()::text <> 'super_admin'
    OR COALESCE((SELECT auth.jwt() ->> 'aal'), 'aal1') = 'aal2'
  );
