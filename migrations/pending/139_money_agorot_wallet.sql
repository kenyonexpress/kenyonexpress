-- 139: the wallet ledger and balances — money to integer agorot, additive and reversible.
--
-- WHY ADDITIVE RATHER THAN `ALTER TYPE`
--
-- Every column below has live readers. Converting in place changes the value a
-- reader gets from 18.00 to 1800 in the same query, with no code change, which
-- turns every price on the site into a hundred times itself the moment this is
-- applied. So this migration only ADDS a `<col>_agorot bigint` alongside the
-- original. The old column keeps working and nothing breaks at apply time.
--
-- WHY GENERATED AND NOT BACKFILLED
--
-- The first draft of this file added a plain `bigint` and filled it once with
-- `update ... set <col>_agorot = round(<col> * 100)`. Nothing kept it in step
-- afterwards: no trigger, no default, no NOT NULL. The running application
-- writes the numeric column and does not know the new one exists, so **every
-- row inserted after this migration would have carried a NULL agorot column**,
-- and step 2 below — the whole reason this file exists — would then have read
-- NULL for every order placed since the apply. A customer who had just paid
-- would have been shown a total of 0.00, and the split would have settled a
-- commission of zero against it.
--
-- `generated always as (round(<col> * 100)::bigint) stored` cannot drift. It is
-- recomputed by Postgres on every insert and every update of the base column,
-- and Postgres refuses a write that names it (SQLSTATE 428C9), so no writer can
-- put the two out of step even by accident. Measured on the hosted project,
-- PostgreSQL 17.6: insert, update and NULL all track, and a write to the
-- generated column is refused with 428C9.
--
-- ONE CONSEQUENCE, STATED RATHER THAN HIDDEN: the non-negative CHECKs below are
-- no longer decorative. On a plain backfilled column nothing ever re-evaluated
-- them; on a generated column they are validated on every write, so they now
-- constrain the *numeric* column's sign at runtime. Measured before writing
-- this: no row in any checked column is negative today, so the apply validates.
-- The signed columns in the wallet are deliberately left without a check.
--
-- The cutover is three steps and only the first is here:
--   1. this file: add the generated agorot columns             <- you are here
--   2. rewrite the readers to use them
--   3. a later migration drops the numeric columns, at which point the agorot
--      columns must stop being generated and become plain written columns
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

  if exists (select 1
               from information_schema.columns
              where table_schema = 'public'
                and table_name   = 'wallet_accounts'
                and column_name  = 'balance_ils_agorot') then
    raise notice 'skipping wallet_accounts.balance_ils_agorot, column already present'; return;
  end if;

  alter table public.wallet_accounts
    add column balance_ils_agorot bigint
      generated always as (round(balance_ils * 100)::bigint) stored;

end
$$;


-- public.wallet_balances.balance_ils   (SIGNED: no non-negative check)
do $$
begin
  if to_regclass('public.wallet_balances') is null then
    raise notice 'skipping wallet_balances, table not present'; return;
  end if;

  if exists (select 1
               from information_schema.columns
              where table_schema = 'public'
                and table_name   = 'wallet_balances'
                and column_name  = 'balance_ils_agorot') then
    raise notice 'skipping wallet_balances.balance_ils_agorot, column already present'; return;
  end if;

  alter table public.wallet_balances
    add column balance_ils_agorot bigint
      generated always as (round(balance_ils * 100)::bigint) stored;

end
$$;


-- public.wallet_entries.amount_ils   (SIGNED: no non-negative check)
do $$
begin
  if to_regclass('public.wallet_entries') is null then
    raise notice 'skipping wallet_entries, table not present'; return;
  end if;

  if exists (select 1
               from information_schema.columns
              where table_schema = 'public'
                and table_name   = 'wallet_entries'
                and column_name  = 'amount_ils_agorot') then
    raise notice 'skipping wallet_entries.amount_ils_agorot, column already present'; return;
  end if;

  alter table public.wallet_entries
    add column amount_ils_agorot bigint
      generated always as (round(amount_ils * 100)::bigint) stored;

end
$$;


-- public.wallet_transactions.amount_ils   (SIGNED: no non-negative check)
do $$
begin
  if to_regclass('public.wallet_transactions') is null then
    raise notice 'skipping wallet_transactions, table not present'; return;
  end if;

  if exists (select 1
               from information_schema.columns
              where table_schema = 'public'
                and table_name   = 'wallet_transactions'
                and column_name  = 'amount_ils_agorot') then
    raise notice 'skipping wallet_transactions.amount_ils_agorot, column already present'; return;
  end if;

  alter table public.wallet_transactions
    add column amount_ils_agorot bigint
      generated always as (round(amount_ils * 100)::bigint) stored;

end
$$;


-- public.wallet_transactions.gross_amount_ils
do $$
begin
  if to_regclass('public.wallet_transactions') is null then
    raise notice 'skipping wallet_transactions, table not present'; return;
  end if;

  if exists (select 1
               from information_schema.columns
              where table_schema = 'public'
                and table_name   = 'wallet_transactions'
                and column_name  = 'gross_amount_ils_agorot') then
    raise notice 'skipping wallet_transactions.gross_amount_ils_agorot, column already present'; return;
  end if;

  alter table public.wallet_transactions
    add column gross_amount_ils_agorot bigint
      generated always as (round(gross_amount_ils * 100)::bigint) stored;

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

  if exists (select 1
               from information_schema.columns
              where table_schema = 'public'
                and table_name   = 'profiles'
                and column_name  = 'wallet_balance_agorot') then
    raise notice 'skipping profiles.wallet_balance_agorot, column already present'; return;
  end if;

  alter table public.profiles
    add column wallet_balance_agorot bigint
      generated always as (round(wallet_balance * 100)::bigint) stored;

end
$$;
