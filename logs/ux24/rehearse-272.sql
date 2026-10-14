BEGIN;
-- 272_profiles_terms_acceptance.sql
--
-- Two nullable columns: when the customer accepted the site terms at
-- registration, and which version (UX24, the register stepper, 15.10).
--
-- WHAT EXISTS. Since UX24 every registration passes the acceptance to
-- `auth.signUp` as user metadata (`terms_accepted_at`, `terms_version`,
-- `privacy_version`; src/server/auth/terms-record.ts), so the record rides
-- the same INSERT that creates the account and lives in
-- `auth.users.raw_user_meta_data`. The application reads `profiles`, not
-- `auth.users`, so without a mirror here every screen that wants to know
-- "did this customer accept, and which text" needs the service role.
-- `orders.accepted_terms_at` is the checkout's own record of the same
-- kind and is untouched.
--
-- WHAT THIS DOES.
--   1. `ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS
--      terms_accepted_at timestamptz, terms_version text`. No default: an
--      existing row with nothing in its metadata stays NULL, which is the
--      truth (nobody was asked before UX24).
--   2. A SECOND trigger on `auth.users`, `on_auth_user_created_terms`,
--      AFTER INSERT, that copies the two fields from the metadata onto the
--      profile row `handle_new_user` just created. A second trigger and not
--      an edit of `handle_new_user`: production's copy of that function is
--      not the one in supabase/migrations/ (docs/BRANCH-AUDIT.md, the
--      pre-059 lineage), and rewriting it blind could drop whatever it does
--      there today. Same event, same table: Postgres fires triggers in
--      name order, and `on_auth_user_created` sorts first.
--   3. A backfill from the metadata for rows registered between UX24's
--      deploy and this file's apply.
--
-- No grant change: the columns inherit the table's SELECT/UPDATE grants and
-- RLS (a customer reads their own row). The trigger function is SECURITY
-- DEFINER with a pinned search_path, like `handle_new_user`, because the
-- auth schema's trigger runs as supabase_auth_admin, which owns no profile
-- row. EXECUTE is revoked from PUBLIC/anon/authenticated: a trigger function
-- is called by the trigger, never by a role.
--
-- UNTIL APPLIED. Nothing in the app reads the columns yet; the record is
-- in the metadata and nothing is lost. No 42703 path to handle.
--
-- Idempotent: ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE, DROP TRIGGER IF
-- EXISTS before CREATE, and the backfill only fills NULLs.
--
-- ROLLBACK:
--   drop trigger if exists on_auth_user_created_terms on auth.users;
--   drop function if exists public.handle_new_user_terms();
--   alter table public.profiles drop column if exists terms_version;
--   alter table public.profiles drop column if exists terms_accepted_at;


ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS terms_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS terms_version text;

COMMENT ON COLUMN public.profiles.terms_accepted_at IS
  'When the customer ticked the terms box at registration (UX24). Mirrors auth.users.raw_user_meta_data->>terms_accepted_at. NULL = registered before UX24 or through a path that did not ask. Migration 272.';
COMMENT ON COLUMN public.profiles.terms_version IS
  'The version of the תקנון in force when terms_accepted_at was stamped (src/app/(legal)/_content/terms.ts). Migration 272.';

CREATE OR REPLACE FUNCTION public.handle_new_user_terms()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_temp AS $$
BEGIN
  IF NEW.raw_user_meta_data ? 'terms_accepted_at' THEN
    UPDATE public.profiles
       SET terms_accepted_at = NULLIF(NEW.raw_user_meta_data->>'terms_accepted_at', '')::timestamptz,
           terms_version     = NULLIF(NEW.raw_user_meta_data->>'terms_version', '')
     WHERE id = NEW.id
       AND terms_accepted_at IS NULL;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- A malformed timestamp in metadata must never fail the account's INSERT.
  RAISE WARNING 'handle_new_user_terms: % (user %)', SQLERRM, NEW.id;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.handle_new_user_terms() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS on_auth_user_created_terms ON auth.users;
CREATE TRIGGER on_auth_user_created_terms
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user_terms();

-- Backfill: accounts created by UX24's code before this file was applied.
UPDATE public.profiles p
   SET terms_accepted_at = NULLIF(u.raw_user_meta_data->>'terms_accepted_at', '')::timestamptz,
       terms_version     = NULLIF(u.raw_user_meta_data->>'terms_version', '')
  FROM auth.users u
 WHERE u.id = p.id
   AND p.terms_accepted_at IS NULL
   AND u.raw_user_meta_data ? 'terms_accepted_at'
   AND (u.raw_user_meta_data->>'terms_accepted_at') ~ '^\d{4}-\d{2}-\d{2}T';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'terms_accepted_at'
  ) THEN
    RAISE EXCEPTION '272: profiles.terms_accepted_at missing after ALTER';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created_terms' AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION '272: trigger on_auth_user_created_terms missing';
  END IF;
END $$;

DO $p$
DECLARE cols int; trg text; backfilled int; own int; anon_rows int; uid uuid;
BEGIN
  SELECT count(*) INTO cols FROM information_schema.columns WHERE table_schema='public' AND table_name='profiles' AND column_name IN ('terms_accepted_at','terms_version');
  SELECT string_agg(tgname, ',' ORDER BY tgname) INTO trg FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='auth' AND c.relname='users' AND NOT t.tgisinternal;
  SELECT count(*) INTO backfilled FROM public.profiles WHERE terms_accepted_at IS NOT NULL;
  SELECT id INTO uid FROM public.profiles ORDER BY created_at LIMIT 1;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
  PERFORM set_config('role', 'authenticated', true);
  SELECT count(*) INTO own FROM public.profiles WHERE id = uid AND terms_accepted_at IS NULL;
  PERFORM set_config('role', 'anon', true);
  SELECT count(*) INTO anon_rows FROM public.profiles;
  RESET role;
  RAISE EXCEPTION 'PROBE cols=% triggers=% backfilled=% own_row_visible_as_authenticated=% anon_rows=%', cols, trg, backfilled, own, anon_rows;
END $p$;
ROLLBACK;
