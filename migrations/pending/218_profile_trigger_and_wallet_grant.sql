-- 218_profile_trigger_and_wallet_grant.sql
--
-- A trigger that raises on every customer profile save, and the money column it
-- is accidentally the only guard on.
--
-- FOUND WHILE WRITING 217, NOT LOOKED FOR. 217 adds two columns to `profiles`,
-- so the question "can a customer write their own columns here" had to be
-- answered. The answer turned out to be about two other things.
--
-- ============================================================================
-- (1) `enforce_profile_privilege_columns` REFERENCES A COLUMN THAT DOES NOT
--     EXIST, AND THEREFORE FAILS EVERY NON-ADMIN UPDATE
-- ============================================================================
--
-- The trigger body ends with:
--
--   IF NEW.supplier_id IS DISTINCT FROM OLD.supplier_id THEN
--     RAISE EXCEPTION 'profiles.supplier_id may only be changed by an admin'
--
-- **`public.profiles` has no `supplier_id` column.** Thirteen columns, read
-- from `information_schema` on 2026-09-09: id, email, full_name, phone,
-- avatar_url, wallet_balance, total_purchases, role, created_at, updated_at,
-- affiliate_code, referral_code, wallet_balance_agorot.
--
-- PL/pgSQL resolves `NEW.supplier_id` at RUN TIME, so the function was created
-- without complaint and raises `42703 record "new" has no field "supplier_id"`
-- the first time it reaches that line. The admin branch returns before it and
-- the service-role branch returns before it, so the only callers that reach it
-- are ordinary signed-in customers updating their own row.
--
-- THIS IS LIVE AND CUSTOMER-FACING. `src/server/actions/account.ts` saves the
-- account details form with the REQUEST-SCOPED client:
--
--   supabase.from('profiles').update({ full_name, phone }).eq('id', userId)
--
-- so every customer who edits their name or phone gets 42703, and the action
-- turns it into `שמירת הפרטים נכשלה` -- a generic message that makes the cause
-- undiagnosable from the UI. Proven on production by impersonating a real
-- customer row (`set_config('request.jwt.claims', ...)` + `SET LOCAL ROLE
-- authenticated`) inside a transaction that was rolled back.
--
-- The fix is to drop the two lines. Nothing is lost: a column that does not
-- exist cannot be changed, so the check has never protected anything. If a
-- `supplier_id` is ever added to `profiles`, the guard comes back WITH it --
-- and this file is the record of why it is not here now.
--
-- ============================================================================
-- (2) THE TRIGGER IS ALSO, BY ACCIDENT, THE ONLY THING STOPPING A CUSTOMER
--     MINTING THEIR OWN STORE CREDIT
-- ============================================================================
--
-- THIS IS WHY THE TWO FIXES ARE IN ONE FILE AND MUST NOT BE SEPARATED.
-- Measured on production the same day:
--
--   * `profiles_update_unified` is `USING (id = auth.uid())` with the same
--     WITH CHECK. An RLS policy is a ROW filter and has no opinion about
--     columns.
--   * `authenticated` holds column-level UPDATE on thirteen columns of
--     `profiles`, and `wallet_balance` is one of them.
--   * `wallet_balance_agorot` is a GENERATED column and cannot be written
--     directly -- but it is generated FROM `wallet_balance`, which can.
--   * `enforce_profile_privilege_columns` guards `role` and, notionally,
--     `supplier_id`. It does not mention `wallet_balance`.
--
-- So the only reason a signed-in customer cannot set their own wallet balance
-- to nine thousand shekels today is that the trigger crashes with 42703 before
-- the UPDATE can land. **Fixing (1) alone would open (2).** That is measured,
-- not inferred: the wallet write was attempted as `authenticated` against a
-- real profile row and was refused by `42703` from the trigger, not by any
-- privilege or policy.
--
-- `role` needs no revoke here: the trigger's own check covers it and is
-- reached, once (1) is fixed. `wallet_balance` cannot be left to a trigger,
-- because a balance is not a preference and no client has any business writing
-- one -- the wallet is credited by the cashback and refund paths under the
-- service role.
--
-- ============================================================================
-- (3) AND A COLUMN-LEVEL REVOKE WOULD NOT HAVE WORKED, WHICH IS WHY THIS FILE
--     REVOKES THE TABLE GRANT AND RE-GRANTS TWO COLUMNS
-- ============================================================================
--
-- The first draft of this migration said:
--
--   REVOKE UPDATE (wallet_balance) ON public.profiles FROM authenticated;
--
-- It was probed against production and THE WALLET WRITE STILL SUCCEEDED --
-- balance 9999.00, as `authenticated`, with the trigger repaired. The reason is
-- in `pg_class.relacl`:
--
--   authenticated=arwdxtm/postgres        <- table-level, `w` is UPDATE
--   pg_attribute.attacl for profiles:     <- empty. No column grants at all.
--
-- **A column-level REVOKE cannot subtract from a table-level GRANT.** Postgres
-- keeps the two in different places and a table grant covers every column,
-- present and future. `information_schema.column_privileges` hides this
-- perfectly: it reports a table-wide grant expanded into one row per column, so
-- the "thirteen column grants" that made the first draft look correct were one
-- table grant wearing thirteen hats -- and after the revoke it reports thirteen
-- rows still, unchanged, with no error anywhere.
--
-- So the shape below is the only one that works: revoke UPDATE on the table,
-- then grant back exactly the columns a customer session legitimately writes.
--
-- THOSE COLUMNS ARE `full_name` AND `phone`, and that is measured rather than
-- chosen. `src/server/actions/account.ts:58` is the ONLY write to `profiles`
-- through a request-scoped client anywhere in `src`; every other writer
-- (`admin/users.ts`, the delete path, the OTP profile upsert) uses the service
-- role, which is not subject to these grants at all.
--
-- A table grant also covers columns that do not exist yet, which is the other
-- half of the trap: 217's two new verification columns would have been
-- customer-writable the moment they were created, whatever 217 said.
--
-- ROLLBACK:
--   grant update on public.profiles to authenticated;
--   -- and restore the previous function body from this file's git history.

BEGIN;

-- (2) FIRST, ON PURPOSE. Between these statements the trigger is still broken
-- and still refusing every customer update, so the window in which the wallet
-- is unguarded is zero. The other order leaves a gap the width of one statement
-- in which a customer can write their own balance.
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (full_name, phone) ON public.profiles TO authenticated;

-- (1) The same function, with the two lines that name a column that does not
-- exist removed. Everything else is byte for byte what production carries,
-- read with `pg_get_functiondef` on 2026-09-09 rather than reconstructed:
-- the self-role guard, the super_admin requirement, the aal2 requirement and
-- the non-admin role freeze all stay exactly as they are.
CREATE OR REPLACE FUNCTION public.enforce_profile_privilege_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Service role and internal jobs: auth.uid() is NULL. The admin server
  -- actions run here, after their own requireSection gate.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF public.is_admin() THEN
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      IF NEW.id = auth.uid() THEN
        RAISE EXCEPTION 'cannot change your own role'
          USING ERRCODE = '42501';
      END IF;

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

  -- The `supplier_id` guard that was here is GONE, and its absence is the point
  -- of this migration. `public.profiles` has no such column, so PL/pgSQL raised
  -- 42703 here on every non-admin UPDATE -- which is every customer saving
  -- their own name or phone. Restore it the day the column exists, not before.

  RETURN NEW;
END;
$function$;

DO $$
DECLARE v_writable int;
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'profiles'
       AND column_name = 'supplier_id'
  ) THEN
    RAISE EXCEPTION
      'profiles.supplier_id EXISTS on this database, so removing its guard would be a real removal rather than a repair. Do not apply this file here.';
  END IF;

  -- `has_column_privilege` and NOT information_schema, deliberately. The view
  -- reports a table-wide grant expanded per column and cannot tell the two
  -- apart, which is exactly how the first draft of this file passed its own
  -- check while changing nothing.
  IF has_column_privilege('authenticated', 'public.profiles', 'wallet_balance', 'UPDATE') THEN
    RAISE EXCEPTION 'a customer can still write their own wallet balance';
  END IF;
  IF has_column_privilege('authenticated', 'public.profiles', 'role', 'UPDATE') THEN
    RAISE EXCEPTION 'a customer can still write their own role at the grant level';
  END IF;

  -- And the two that must survive, or the account details form breaks in a
  -- different way than it was broken before.
  IF NOT has_column_privilege('authenticated', 'public.profiles', 'full_name', 'UPDATE')
     OR NOT has_column_privilege('authenticated', 'public.profiles', 'phone', 'UPDATE') THEN
    RAISE EXCEPTION 'the account details form can no longer save';
  END IF;

  v_writable := 0;

  -- The `role` guard has to survive this file, because the whole risk of
  -- rewriting a function is rewriting away the part that was working.
  IF pg_get_functiondef('public.enforce_profile_privilege_columns'::regproc)
       NOT LIKE '%profiles.role may only be changed by an admin%' THEN
    RAISE EXCEPTION 'the role guard did not survive the rewrite';
  END IF;
END $$;

COMMIT;
