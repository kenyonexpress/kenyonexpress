-- 134: affiliate and referral earnings — money to integer agorot, additive and reversible.
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

  alter table public.affiliates add column if not exists total_earnings_ils_agorot bigint;

  update public.affiliates
     set total_earnings_ils_agorot = round(total_earnings_ils * 100)
   where total_earnings_ils is not null and total_earnings_ils_agorot is distinct from round(total_earnings_ils * 100);

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

  alter table public.referrals add column if not exists bonus_paid_amount_ils_agorot bigint;

  update public.referrals
     set bonus_paid_amount_ils_agorot = round(bonus_paid_amount_ils * 100)
   where bonus_paid_amount_ils is not null and bonus_paid_amount_ils_agorot is distinct from round(bonus_paid_amount_ils * 100);

  if not exists (select 1 from pg_constraint
                 where conrelid = 'public.referrals'::regclass
                   and conname = 'referrals_bonus_paid_amount_ils_agorot_nonneg') then
    alter table public.referrals
      add constraint referrals_bonus_paid_amount_ils_agorot_nonneg check (bonus_paid_amount_ils_agorot is null or bonus_paid_amount_ils_agorot >= 0);
  end if;
end
$$;
