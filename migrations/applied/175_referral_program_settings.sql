-- 175: the referral engine is built, wired and switched off by an absent row.
--
-- NOT APPLIED. Drafted 2026-09-07 for closeout block 8. Rollback at the foot.
-- Preflight: preflight_175.sql, run first.
--
-- ----------------------------------------------------------------------------
-- WHAT IS ACTUALLY WRONG
-- ----------------------------------------------------------------------------
--
-- Nothing in the code. Measured against production on 2026-09-07:
--
--   referral_program_settings   0 rows
--   referrals                   0 rows
--   referral_signals            0 rows
--   profiles with a code        0
--
-- `fn_claim_referral` opens with `SELECT * INTO v_settings FROM
-- referral_program_settings WHERE id;` and then `IF NOT FOUND OR NOT
-- v_settings.is_active THEN RETURN 'program_inactive'`. With no row, EVERY
-- claim returns program_inactive, no referral is ever created, and
-- `fn_complete_referral` therefore never has one to complete. The whole
-- programme -- the code, the capture in the proxy, the claim at signup, the
-- fraud guard, the two wallet credits, the admin queue -- is inert behind one
-- missing row.
--
-- 098 left it that way ON PURPOSE: "the program stays off until a person enters
-- what it pays". `src/server/referrals/program.ts` reads the absence as a
-- first-class null and the account page says the programme is not running, so
-- no customer is promised a bonus that cannot arrive. That part is correct and
-- this migration does not change it.
--
-- ----------------------------------------------------------------------------
-- WHY THIS FILE CANNOT START PAYING ANYONE
-- ----------------------------------------------------------------------------
--
-- It inserts the row with `is_active = false`. Configured and off. The three
-- amounts below are NOT NULL with no default in the schema, which is the
-- schema saying they are a decision and not a setting -- so they have to be
-- written down before the switch exists to flip. Turning it on is the separate,
-- one-line UPDATE at the foot, and it is deliberately not part of this
-- migration: applying a file should never be the same act as starting to spend
-- money.
--
-- THE NUMBERS ARE A PROPOSAL, and the only part of this file that is. They are
-- Ofir's to change before approval:
--
--   referrer_bonus_agorot   2000   ₪20 to the person who invited
--   referred_bonus_agorot   2000   ₪20 to the person who joined
--   min_order_agorot       10000   ₪100 first order to qualify
--
-- The shape of the proposal: the pair is symmetric because an asymmetric one
-- invites the referrer to explain to their friend why they got less, and the
-- minimum is five times a single bonus so that a qualifying order is worth more
-- to the platform than the two bonuses it triggers. Both bonuses are wallet
-- credit, which is site credit that cannot be withdrawn, so the cash cost is
-- the margin on a future order rather than ₪40 out of the bank.
--
-- The caps and the window keep 098's defaults: 14 days to qualify, 5 completed
-- referrals per referrer per month, 30 per year, no manual approval step.
--
-- ONE THING MEASURED THAT IS NOT CHANGED HERE. `fn_pay_referral` debits
-- `platform:cashback_reserve` for both credits (read off pg_proc 2026-09-07).
-- That account exists, so the payout works, but it means the cost of the
-- referral programme and the cost of cashback land in one house account and a
-- report cannot tell them apart. Splitting them is a change to a live function
-- and belongs in its own migration with its own reasoning; it is recorded here
-- so that whoever reads the first month's numbers knows why the reserve moves
-- faster than cashback alone would explain.
--
-- Idempotent: `on conflict do nothing` on the singleton key, so a second run
-- changes nothing and cannot overwrite numbers somebody has since edited.

insert into public.referral_program_settings (
  id,
  referrer_bonus_agorot,
  referred_bonus_agorot,
  min_order_agorot,
  qualify_window_days,
  max_per_referrer_month,
  max_per_referrer_year,
  require_manual_approval,
  is_active
) values (
  true,
  2000,
  2000,
  10000,
  14,
  5,
  30,
  false,
  false      -- CONFIGURED AND OFF. See the foot of this file.
)
on conflict (id) do nothing;

-- Verify:
--   select * from public.referral_program_settings;
--   EXPECT one row, is_active = false.
--
-- TURNING IT ON is a separate act, run only when the numbers above are the ones
-- that were agreed:
--
--   update public.referral_program_settings set is_active = true where id;
--
-- After that, and only after that, `fn_claim_referral` starts creating
-- referrals and a first qualifying order starts crediting two wallets.
--
-- Rollback:
--   delete from public.referral_program_settings where id;
