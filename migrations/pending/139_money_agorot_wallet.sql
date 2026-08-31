-- 132: the wallet ledger and balances — money to integer agorot, additive and reversible.
--
-- WHY ADDITIVE RATHER THAN `ALTER TYPE`
--
-- Every column below has live readers. Converting in place changes the value a
-- reader gets from 18.00 to 1800 in the same query, with no code change, which
-- turns every price on the site into a hundred times itself the moment this is
-- applied. So this migration only ADDS: a new `<col>_agorot bigint`, backfilled
-- with `round(<col> * 100)`, constrained, and left alongside the original. The
-- old column keeps working and nothing breaks at apply time.
--
-- The cutover is three steps and only the first is here:
--   1. this file: add and backfill the agorot columns          <- you are here
--   2. rewrite the readers and writers to use them
--   3. a later migration drops the numeric columns
--
-- Applying this file alone is safe and is a no-op for the running application.
--
-- MEASURED BEFORE WRITING THIS: `wallet_accounts.balance_ils` has a minimum of
-1.80 over 13 rows. A `>= 0` constraint on it would fail at apply time. Balances
and ledger deltas are therefore SIGNED here and get no non-negative check. That
negative balance is itself worth a look; it is recorded in the launch readiness
doc rather than silently constrained away.
--
-- ROLLBACK
--
--   alter table public.wallet_accounts drop column if exists balance_ils_agorot;
--   alter table public.wallet_balances drop column if exists balance_ils_agorot;
--   alter table public.wallet_entries drop column if exists amount_ils_agorot;
--   alter table public.wallet_transactions drop column if exists amount_ils_agorot;
--   alter table public.wallet_transactions drop column if exists gross_amount_ils_agorot;
--   alter table public.profiles drop column if exists wallet_balance_agorot;
--
-- NOT APPLIED. `migrations/pending/` is unapplied by definition. The route to
-- production is MCP `apply_migration` after a human approves this file.


-- public.wallet_accounts.balance_ils   (SIGNED: no non-negative check)
do $$
begin
  if to_regclass('public.wallet_accounts') is null then
    raise notice 'skipping wallet_accounts, table not present'; return;
  end if;

  alter table public.wallet_accounts add column if not exists balance_ils_agorot bigint;

  update public.wallet_accounts
     set balance_ils_agorot = round(balance_ils * 100)
   where balance_ils is not null and balance_ils_agorot is distinct from round(balance_ils * 100);

end
$$;


-- public.wallet_balances.balance_ils   (SIGNED: no non-negative check)
do $$
begin
  if to_regclass('public.wallet_balances') is null then
    raise notice 'skipping wallet_balances, table not present'; return;
  end if;

  alter table public.wallet_balances add column if not exists balance_ils_agorot bigint;

  update public.wallet_balances
     set balance_ils_agorot = round(balance_ils * 100)
   where balance_ils is not null and balance_ils_agorot is distinct from round(balance_ils * 100);

end
$$;


-- public.wallet_entries.amount_ils   (SIGNED: no non-negative check)
do $$
begin
  if to_regclass('public.wallet_entries') is null then
    raise notice 'skipping wallet_entries, table not present'; return;
  end if;

  alter table public.wallet_entries add column if not exists amount_ils_agorot bigint;

  update public.wallet_entries
     set amount_ils_agorot = round(amount_ils * 100)
   where amount_ils is not null and amount_ils_agorot is distinct from round(amount_ils * 100);

end
$$;


-- public.wallet_transactions.amount_ils   (SIGNED: no non-negative check)
do $$
begin
  if to_regclass('public.wallet_transactions') is null then
    raise notice 'skipping wallet_transactions, table not present'; return;
  end if;

  alter table public.wallet_transactions add column if not exists amount_ils_agorot bigint;

  update public.wallet_transactions
     set amount_ils_agorot = round(amount_ils * 100)
   where amount_ils is not null and amount_ils_agorot is distinct from round(amount_ils * 100);

end
$$;


-- public.wallet_transactions.gross_amount_ils
do $$
begin
  if to_regclass('public.wallet_transactions') is null then
    raise notice 'skipping wallet_transactions, table not present'; return;
  end if;

  alter table public.wallet_transactions add column if not exists gross_amount_ils_agorot bigint;

  update public.wallet_transactions
     set gross_amount_ils_agorot = round(gross_amount_ils * 100)
   where gross_amount_ils is not null and gross_amount_ils_agorot is distinct from round(gross_amount_ils * 100);

  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.wallet_transactions'::regclass
                   and conname = 'wallet_transactions_gross_amount_ils_agorot_nonneg') then
    alter table public.wallet_transactions
      add constraint wallet_transactions_gross_amount_ils_agorot_nonneg check (gross_amount_ils_agorot is null or gross_amount_ils_agorot >= 0);
  end if;
end
$$;


-- public.profiles.wallet_balance   (SIGNED: no non-negative check)
do $$
begin
  if to_regclass('public.profiles') is null then
    raise notice 'skipping profiles, table not present'; return;
  end if;

  alter table public.profiles add column if not exists wallet_balance_agorot bigint;

  update public.profiles
     set wallet_balance_agorot = round(wallet_balance * 100)
   where wallet_balance is not null and wallet_balance_agorot is distinct from round(wallet_balance * 100);

end
$$;
