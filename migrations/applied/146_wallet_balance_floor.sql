-- 136: a non-negative floor on wallet balances, scoped to accounts that belong
-- to a person. House accounts are allowed to go negative, because that is what
-- funds cashback.
--
-- WHY THIS IS NOT `balance_ils >= 0`
--
-- MEASURED on production 2026-09-01:
--
--   user accounts with a negative balance  : 0
--   house accounts with a negative balance : 1   (-1.80)
--   house accounts total                   : 3
--   sum of every balance                   : 0.00
--   sum of every ledger entry              : 1.80
--
-- A blanket `>= 0` fails at apply time on that one row, and constraining it
-- away would be wrong, because the negative is correct. `fn_wallet_transfer`
-- skips the overdraft guard deliberately when the debit account has no user:
--
--   IF v_debit.user_id IS NOT NULL AND v_debit.balance_ils < p_amount_ils THEN
--     RAISE EXCEPTION 'insufficient wallet balance';
--   END IF;
--
-- An account with `user_id IS NULL` is a house account: the platform side of a
-- double-entry pair. `02148d50` sits at -1.80 because two `order_cashback`
-- entries of 0.90 each debited it and credited a real customer. Its balance is
-- not a debt, it is the running total of cashback the platform has paid. That
-- every balance sums to exactly 0.00 is the proof the ledger is intact.
--
-- So the constraint says what the function already enforces, at the level where
-- it cannot be bypassed by a future writer that forgets to call the function.
--
-- ROLLBACK
--
--   alter table public.wallet_accounts drop constraint if exists wallet_accounts_user_balance_floor;
--
-- NOT APPLIED. `migrations/pending/` is unapplied by definition.

do $$
declare
  v_bad int;
begin
  if to_regclass('public.wallet_accounts') is null then
    raise notice 'skipping, wallet_accounts not present'; return;
  end if;

  -- Refuse rather than constrain bad data into place.
  select count(*) into v_bad
    from public.wallet_accounts
   where user_id is not null and balance_ils < 0;

  if v_bad > 0 then
    raise exception
      'wallet_accounts: % user-owned account(s) hold a negative balance; investigate before constraining',
      v_bad;
  end if;

  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.wallet_accounts'::regclass
       and conname = 'wallet_accounts_user_balance_floor'
  ) then
    alter table public.wallet_accounts
      add constraint wallet_accounts_user_balance_floor
      check (user_id is null or balance_ils >= 0);
  end if;
end
$$;

comment on constraint wallet_accounts_user_balance_floor on public.wallet_accounts is
  'A customer wallet may not go negative. A house account (user_id is null) may, because it is the funding side of every cashback pair.';
