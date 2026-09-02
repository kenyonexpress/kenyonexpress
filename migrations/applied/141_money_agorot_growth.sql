-- 141: affiliate and referral earnings — money to integer agorot, additive and reversible.
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
-- Both are cumulative earnings and never decrease, so both take the
non-negative check.
--
-- ROLLBACK
--
--   alter table public.affiliates drop column if exists total_earnings_ils_agorot;
--   alter table public.referrals drop column if exists bonus_paid_amount_ils_agorot;
--
-- NOT APPLIED. `migrations/pending/` is unapplied by definition. The route to
-- production is MCP `apply_migration` after a human approves this file.


-- public.affiliates.total_earnings_ils
do $$
begin
  if to_regclass('public.affiliates') is null then
    raise notice 'skipping affiliates, table not present'; return;
  end if;

  if exists (select 1
               from information_schema.columns
              where table_schema = 'public'
                and table_name   = 'affiliates'
                and column_name  = 'total_earnings_ils_agorot') then
    raise notice 'skipping affiliates.total_earnings_ils_agorot, column already present'; return;
  end if;

  alter table public.affiliates
    add column total_earnings_ils_agorot bigint
      generated always as (round(total_earnings_ils * 100)::bigint) stored;

  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.affiliates'::regclass
                   and conname = 'affiliates_total_earnings_ils_agorot_nonneg') then
    alter table public.affiliates
      add constraint affiliates_total_earnings_ils_agorot_nonneg check (total_earnings_ils_agorot is null or total_earnings_ils_agorot >= 0);
  end if;
end
$$;


-- public.referrals.bonus_paid_amount_ils
do $$
begin
  if to_regclass('public.referrals') is null then
    raise notice 'skipping referrals, table not present'; return;
  end if;

  if exists (select 1
               from information_schema.columns
              where table_schema = 'public'
                and table_name   = 'referrals'
                and column_name  = 'bonus_paid_amount_ils_agorot') then
    raise notice 'skipping referrals.bonus_paid_amount_ils_agorot, column already present'; return;
  end if;

  alter table public.referrals
    add column bonus_paid_amount_ils_agorot bigint
      generated always as (round(bonus_paid_amount_ils * 100)::bigint) stored;

  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.referrals'::regclass
                   and conname = 'referrals_bonus_paid_amount_ils_agorot_nonneg') then
    alter table public.referrals
      add constraint referrals_bonus_paid_amount_ils_agorot_nonneg check (bonus_paid_amount_ils_agorot is null or bonus_paid_amount_ils_agorot >= 0);
  end if;
end
$$;
