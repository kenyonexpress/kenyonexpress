-- 254_profiles_phone_verified_at.sql
--
-- One nullable column: when the customer proved the phone on their profile
-- (STEP 18, phone OTP inside the first-time signup, 01.10).
--
-- WHAT EXISTS. `profiles.phone` (text, nullable) holds whatever the customer
-- typed at signup or on the account page, unproven. `auth.users.phone` with
-- `phone_confirmed_at` is GoTrue's own record, written by the signup verify
-- action through `auth.admin.updateUserById(.., { phone, phone_confirm: true })`
-- (src/server/actions/signup-phone.ts). The application reads `profiles`,
-- not `auth.users`, so without a mirror here every screen that wants to know
-- "is this number verified" would need the service role.
--
-- WHAT THIS DOES. `ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS
-- phone_verified_at timestamptz`. No default, no backfill: every existing
-- row stays NULL, which is the truth (no number was ever proven before this
-- step). No trigger, no grant change (the column inherits the table's
-- existing SELECT/UPDATE grants and RLS: a customer updates their own row
-- and nobody else's; the signup verify writes through the service role).
-- No index: it is read per row by id, never scanned.
--
-- UNTIL APPLIED. The verify action's UPDATE raises 42703; the action
-- catches it, logs `db.optional_column_missing` once per process, and
-- retries with `phone` alone, so a signup completed before this lands still
-- records the verified number and loses only the timestamp.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS. Re-running is a no-op.
--
-- ROLLBACK:
--   alter table public.profiles drop column if exists phone_verified_at;

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone_verified_at timestamptz;

COMMENT ON COLUMN public.profiles.phone_verified_at IS
  'When the customer proved this phone by SMS code (signup step 2 or the account page). NULL = never proven. STEP 18, migration 254.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'profiles'
       AND column_name = 'phone_verified_at' AND data_type = 'timestamp with time zone'
  ) THEN
    RAISE EXCEPTION '254: profiles.phone_verified_at missing after ALTER';
  END IF;
  RAISE NOTICE '254: profiles.phone_verified_at present';
END $$;

COMMIT;
