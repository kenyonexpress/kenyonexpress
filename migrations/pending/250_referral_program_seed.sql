-- 250_referral_program_seed.sql
--
-- Turns the referral programme on at the terms STEP 13 names: ₪20 of
-- cashback to the referrer for every successful referral (STEP 13, 01.10).
--
-- MEASURED BEFORE WRITING. `referral_program_settings` (098, applied) holds
-- ZERO rows on production (measured 2026-08-31, restated in
-- src/server/referrals/program.ts and its test). 098 seeds none on purpose:
-- "the program stays off until a person enters what it pays". STEP 13 is
-- that person entering it. Until this row exists, /account/referrals shows
-- "the programme is not active yet", `fn_claim_referral` answers
-- `program_inactive`, and nothing here has ever paid anyone.
--
-- WHAT THE ROW SAYS AND WHY EACH NUMBER.
--   referrer_bonus_agorot   2000   ₪20, the figure the step names, integer
--                                  agorot like every other money column.
--   referred_bonus_agorot   0      The step names one reward, the referrer's.
--                                  A second one is not invented here; the
--                                  referrals page hides the friend's clause
--                                  when this is zero instead of printing ₪0.
--   min_order_agorot        5000   NOT NULL with no default, so it has to be
--                                  chosen. ₪50: the friend's first order must
--                                  bring in more cash than the bonus costs,
--                                  and the cheapest item in the catalogue is
--                                  not the price of ₪20 (098's own warning).
--                                  `fn_complete_referral` compares it against
--                                  what was charged on the site, net of
--                                  wallet credit (src/server/referrals/complete.ts).
--   qualify_window_days     14     098's default; not restated.
--   max_per_referrer_month  5      098's default; the anti-farming cap.
--   max_per_referrer_year   30     098's default.
--   require_manual_approval false  Every completion still runs the fraud
--                                  guard, and a matched device, card or IP
--                                  lands in /admin/referrals as `flagged`
--                                  rather than paying. Only clean
--                                  completions pay without a human.
--   is_active               true   The programme is on.
--
-- ON CONFLICT DO NOTHING, NOT UPSERT. If someone has already entered terms,
-- theirs stand: a migration that silently overwrites a human's numbers is
-- the failure 098's comment exists to prevent. The self-check below reports
-- what the row actually says either way.
--
-- THE BONUS IS CASHBACK AND EXPIRES LIKE CASHBACK. `fn_complete_referral`
-- (098) pays with `fn_wallet_transfer` FROM `platform:cashback_reserve`
-- under reason `referral_bonus`. `fn_cashback_expire` (215, applied) sweeps
-- every credit whose debit side is that reserve, keyed on the account and
-- not on the reason, so the twelve-month rule already covers this bonus.
-- Nothing about expiry is added here; the TypeScript mirror
-- (src/lib/cashback/tracker.ts CASHBACK_CREDIT_REASONS) is what had to
-- learn the reason, and src/lib/referrals/terms.test.ts pins all three
-- files to each other.
--
-- ROLLBACK (turns the programme off; keeps the row so the history of the
-- terms is not lost):
--   update public.referral_program_settings set is_active = false, updated_at = now() where id;
-- Full reversal (only if nothing was ever claimed under these terms):
--   delete from public.referral_program_settings where id;

DO $$
BEGIN
  IF to_regclass('public.referral_program_settings') IS NULL THEN
    RAISE EXCEPTION '250 requires referral_program_settings (098); apply 098 first';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname = 'public' AND p.proname = 'fn_complete_referral') THEN
    RAISE EXCEPTION '250 requires fn_complete_referral (098); apply 098 first';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.wallet_accounts WHERE code = 'platform:cashback_reserve') THEN
    -- Not fatal: 177 creates the reserve on the first cashback award and
    -- fn_complete_referral answers no_reserve_account until then. Said out
    -- loud so an operator applying this on an empty database knows why the
    -- first referral would not pay.
    RAISE NOTICE '250: platform:cashback_reserve does not exist yet; referral payouts wait for the first cashback award (177)';
  END IF;
END $$;

INSERT INTO public.referral_program_settings
  (id, referrer_bonus_agorot, referred_bonus_agorot, min_order_agorot,
   require_manual_approval, is_active)
VALUES
  (true, 2000, 0, 5000, false, true)
ON CONFLICT (id) DO NOTHING;

-- Self-check: exactly one row, the programme is on, and the referrer's
-- reward is a positive whole number of agorot. Reports the live terms so a
-- pre-existing human-entered row is visible in the apply log.
DO $$
DECLARE
  v public.referral_program_settings%rowtype;
  v_count integer;
BEGIN
  SELECT count(*) INTO v_count FROM public.referral_program_settings;
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'referral_program_settings must hold exactly one row (has %)', v_count;
  END IF;
  SELECT * INTO v FROM public.referral_program_settings WHERE id;
  IF NOT v.is_active THEN
    RAISE EXCEPTION 'referral programme is still inactive after 250';
  END IF;
  IF v.referrer_bonus_agorot <= 0 THEN
    RAISE EXCEPTION 'referrer bonus must be positive agorot (is %)', v.referrer_bonus_agorot;
  END IF;
  RAISE NOTICE '250: referral programme active: referrer % agorot, referred % agorot, min order % agorot, window % days, manual approval %',
    v.referrer_bonus_agorot, v.referred_bonus_agorot, v.min_order_agorot,
    v.qualify_window_days, v.require_manual_approval;
END $$;
