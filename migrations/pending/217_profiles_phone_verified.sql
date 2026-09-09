-- 217_profiles_phone_verified.sql
--
-- One column, and the distinction it exists to make.
--
-- `profiles.phone` ALREADY EXISTS AND MEANS NOTHING ABOUT POSSESSION. It holds
-- whatever the signup form was given: a customer types a number into a
-- registration field and it is stored, unchecked. It may be a typo, somebody
-- else's number, or deliberate. Every one of those is a string in that column
-- and none of them is evidence that the person holding the account holds the
-- handset.
--
-- `phone_verified_at` is that evidence and nothing else: the moment an SMS code
-- sent to that number was entered correctly.
--
-- WHY IT IS A TIMESTAMP AND NOT A BOOLEAN. Three things a boolean cannot say
-- and all three get asked:
--
--   WHEN. A number verified two years ago and one verified this morning are
--   different facts to a fraud review, and to anybody deciding whether to send
--   a coupon code to it.
--   WHICH NUMBER. It is set beside `phone_verified_e164`, so changing `phone`
--   without re-verifying leaves a verified flag pointing at a number nobody
--   proved. A bare boolean would silently transfer the proof to the new number.
--   NOTHING. NULL is "never verified", which is different from false and is the
--   state every existing row is in.
--
-- WHY THE VERIFIED NUMBER IS STORED SEPARATELY AND NORMALISED. `profiles.phone`
-- is free text in whatever spelling the customer used ("050-123-4567",
-- "+972 50 123 4567"). The verified one is E.164 and is CHECKed to be an
-- Israeli mobile, because it is the only one anything is allowed to act on.
-- Comparing the two is how a change of `phone` becomes visible instead of
-- inherited.
--
-- NO UNIQUE CONSTRAINT ON `phone_verified_e164`, DELIBERATELY. Uniqueness for
-- a phone number already lives where it belongs: `auth.users.phone` is unique
-- and the OTP attach path relies on that constraint failing. A second unique
-- index here would be a second source of truth that can disagree with the
-- first, and the disagreement would surface as a login that cannot complete.
--
-- ROLLBACK:
--   alter table public.profiles drop column phone_verified_at;
--   alter table public.profiles drop column phone_verified_e164;

BEGIN;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone_verified_at timestamptz;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS phone_verified_e164 text;

-- Added separately from the column so re-running the file does not fail on a
-- constraint that already exists.
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_phone_verified_e164_check;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_phone_verified_e164_check
  CHECK (phone_verified_e164 IS NULL OR phone_verified_e164 ~ '^\+9725\d{8}$');

-- Both or neither. A timestamp with no number is a proof about nothing, and a
-- number with no timestamp is a column that looks verified.
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_phone_verification_is_complete;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_phone_verification_is_complete
  CHECK ((phone_verified_at IS NULL) = (phone_verified_e164 IS NULL));

-- The question a sender asks: is this number proven for this account. Partial,
-- because an unverified profile is the overwhelming majority and is never what
-- this index is opened for.
CREATE INDEX IF NOT EXISTS profiles_phone_verified_idx
  ON public.profiles (phone_verified_e164)
  WHERE phone_verified_at IS NOT NULL;

-- WHY THIS FILE ISSUES NO GRANT OF ITS OWN, AND DEPENDS ON 218 INSTEAD
--
-- Measured on production, 2026-09-09, because 217 could not be written without
-- knowing the answer:
--
--   profiles_update_unified  UPDATE  USING (id = auth.uid())
--                                    WITH CHECK (id = auth.uid())
--
-- **An RLS policy is a ROW filter and has no opinion about columns.** So that
-- policy says "you may update your own row" and means every column of it the
-- role holds UPDATE on -- which, per `pg_class.relacl`, is the whole table:
-- `authenticated=arwdxtm/postgres`. A TABLE grant covers every column, INCLUDING
-- COLUMNS THAT DO NOT EXIST YET.
--
-- That last clause is what decides this file. The two columns below would be
-- customer-writable the moment they were created: a `phone_verified_at` whose
-- entire claim is "an SMS to this number was answered", writable with one
-- PostgREST call by the person it is a claim about. That is not a weaker
-- version of the property, it is the absence of it wearing a column name that
-- says otherwise.
--
-- THE OBVIOUS FIX DOES NOT WORK, AND WAS TRIED. This file's first draft said
-- `REVOKE UPDATE (phone_verified_at) ON public.profiles FROM authenticated`.
-- A column-level REVOKE CANNOT SUBTRACT FROM A TABLE-LEVEL GRANT: Postgres
-- keeps them in different catalogs and the table grant simply continues to
-- apply. The revoke succeeds, reports nothing, and changes nothing. The same
-- draft's verification passed, because
-- `information_schema.column_privileges` reports a table-wide grant expanded
-- into one row per column and cannot tell the two apart. Probed on production:
-- with the column revoke in place, a customer still wrote their own
-- `wallet_balance`.
--
-- So the grant is fixed once, properly, in
-- `218_profile_trigger_and_wallet_grant.sql`: the table-level UPDATE is
-- revoked and exactly `(full_name, phone)` are granted back. That is the only
-- shape that works, it protects these two columns automatically, and it
-- protects every column added after them.
--
-- APPLY 218 BEFORE THIS FILE. The block below refuses otherwise, rather than
-- creating a verification column anybody can forge.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'profiles'
       AND column_name = 'phone_verified_at'
  ) THEN
    RAISE EXCEPTION 'phone_verified_at was not created';
  END IF;

  -- `has_column_privilege` and NOT information_schema: the view cannot
  -- distinguish a table grant from a column grant, which is exactly how the
  -- first draft of this file passed while protecting nothing.
  IF has_column_privilege('authenticated', 'public.profiles', 'phone_verified_at', 'UPDATE')
     OR has_column_privilege('authenticated', 'public.profiles', 'phone_verified_e164', 'UPDATE')
  THEN
    RAISE EXCEPTION
      'a customer can write the verification columns, so they would prove nothing. Apply 218_profile_trigger_and_wallet_grant.sql first: it revokes the TABLE-level UPDATE and grants back only (full_name, phone). A column-level REVOKE here would be a silent no-op.';
  END IF;
END $$;

COMMIT;
