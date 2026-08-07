-- 082_fix_wallet_account_provisioning.sql
--
-- Signup is broken on any database that has both 026 and 055. Reproduced today
-- on the fully-migrated local stack: creating a user through the auth admin API
-- returns 500 with
--
--   23502  null value in column "owner_type" of relation "wallet_accounts"
--
-- The chain: inserting into auth.users fires handle_new_user, which inserts a
-- profile, which fires 055's ensure_wallet_account trigger, which runs
-- fn_ensure_wallet_account. That function inserts (user_id) and nothing else.
-- 026 declares wallet_accounts.owner_type NOT NULL with
-- CHECK ((owner_type = 'user') = (user_id IS NOT NULL)), so the insert violates
-- the NOT NULL, the trigger raises, and the whole auth.users transaction rolls
-- back. Nobody can register.
--
-- 046 already knew about this. Its comment names both shapes of the table -- the
-- slim one it creates for a live DB that stopped at 025, and 026's, which adds
-- owner_type -- and it branches on information_schema before inserting its own
-- platform rows for exactly this reason. 055 was written afterwards and did not
-- branch, in either its backfill or its trigger function.
--
-- This fixes the function the same way 046 fixed itself: detect the column and
-- supply 'user' when it is there. Both shapes stay supported, because both are
-- still deployed -- production stopped before 026 in the wallet area, and the
-- local and CI stacks are fully migrated.
--
-- handle_new_user is left alone. It already passes owner_type ('user', NEW.id)
-- and its ON CONFLICT (user_id) DO NOTHING makes the two paths agree: whichever
-- of the two fires first creates the row and the other one no-ops.
--
-- Idempotent, forward-only. Depends on 026 (or 046) for the table and 055 for
-- the trigger. Contains no DDL against wallet_accounts itself.

-- ---------------------------------------------------------------------------
-- 1. Provisioning trigger function
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.fn_ensure_wallet_account()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $fn$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'wallet_accounts'
      AND column_name  = 'owner_type'
  ) THEN
    INSERT INTO public.wallet_accounts (owner_type, user_id)
    VALUES ('user', NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
  ELSE
    INSERT INTO public.wallet_accounts (user_id)
    VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
  END IF;

  RETURN NEW;
END $fn$;

COMMENT ON FUNCTION public.fn_ensure_wallet_account() IS
  'Gives every new profile a wallet account. Supplies owner_type when the column exists (026 shape) and omits it when it does not (the slim 046 shape), because both are deployed. Without the branch this trigger raises 23502 and takes the whole signup transaction down with it.';

DROP TRIGGER IF EXISTS ensure_wallet_account ON public.profiles;
CREATE TRIGGER ensure_wallet_account
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.fn_ensure_wallet_account();

-- ---------------------------------------------------------------------------
-- 2. Backfill profiles that never got an account
-- ---------------------------------------------------------------------------
-- 055's backfill ran the same unqualified insert. On the 026 shape it raised,
-- so on a from-zero run it inserted nothing and every profile that existed at
-- the time is still missing its account.

DO $backfill$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'wallet_accounts'
      AND column_name  = 'owner_type'
  ) THEN
    INSERT INTO public.wallet_accounts (owner_type, user_id)
    SELECT 'user', p.id
    FROM public.profiles p
    LEFT JOIN public.wallet_accounts a ON a.user_id = p.id
    WHERE a.id IS NULL
    ON CONFLICT (user_id) DO NOTHING;
  ELSE
    INSERT INTO public.wallet_accounts (user_id)
    SELECT p.id
    FROM public.profiles p
    LEFT JOIN public.wallet_accounts a ON a.user_id = p.id
    WHERE a.id IS NULL
    ON CONFLICT (user_id) DO NOTHING;
  END IF;
END $backfill$;
