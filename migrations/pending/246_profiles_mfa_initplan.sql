-- 246_profiles_mfa_initplan.sql
--
-- The one `auth_rls_initplan` WARN that 209 §2 does not clear, measured.
--
-- =============================================================================
-- WHY THIS EXISTS WHEN 209 ALREADY REWRITES THE SAME POLICY
-- =============================================================================
--
-- 209 §2 rewrites `profiles_super_admin_mfa` as
--
--     COALESCE((SELECT auth.jwt() ->> 'aal'), 'aal1') = 'aal2'
--
-- Postgres stores that as `( SELECT (auth.jwt() ->> 'aal'::text))`, and the
-- advisor's lint (supabase/splinter 0003) accepts only the literal shape
-- `select auth.jwt()`: it tests `lower(qual) like '%select auth.jwt()%'`.
-- With a parenthesis between `SELECT` and `auth`, the test fails and the WARN
-- stays.
--
-- Rehearsed on production on 2026-09-25 inside BEGIN/ROLLBACK, running the
-- lint query itself inside the transaction: with 209's text applied the
-- lint still names `profiles_super_admin_mfa`; with the text below it does
-- not. The other five 209 §2 rewrites clear their WARNs as written.
--
-- This is the same relationship 220 has to 209 §1: additive, and 209 is not
-- edited because it is another session's file and its other statements are
-- right. Apply it AFTER 209; applied before, 209 simply overwrites it and the
-- WARN returns until this file is re-run.
--
-- =============================================================================
-- WHAT CHANGES AND WHAT DOES NOT
-- =============================================================================
--
-- The difference is where the InitPlan boundary sits: `(select auth.jwt())`
-- is evaluated once, and the `->> 'aal'` is applied to that constant. Same
-- value, same rows. THE SHAPE IS PRESERVED EXACTLY, including 209's
-- `COALESCE(..., 'aal1')`: a JWT with no `aal` claim reads as `aal1` and a
-- super_admin is refused; turning that into a null comparison would let the
-- update through.
--
-- Probed in the same rehearsal as three real identities (an admin and
-- customers) with `aal1`, `aal2` and no `aal` claim, before, after 209 and
-- after this file: the update outcome is identical in all three states for
-- every identity and claim.
--
-- ALTER POLICY and not DROP + CREATE: RESTRICTIVE policies gate every write,
-- and there must be no instant without it.

BEGIN;

ALTER POLICY profiles_super_admin_mfa ON public.profiles
  USING (
    ((select public.current_user_role())::text <> 'super_admin'::text)
    OR (COALESCE((select auth.jwt()) ->> 'aal', 'aal1'::text) = 'aal2'::text)
  );

COMMIT;

-- =============================================================================
-- VERIFY
-- =============================================================================
--
--   select qual from pg_policies
--    where tablename = 'profiles' and policyname = 'profiles_super_admin_mfa';
--   -- expect the text to contain:  ( SELECT auth.jwt() AS jwt) ->> 'aal'
--
-- and the advisor (or lint 0003 run by hand) must no longer list `profiles`.
