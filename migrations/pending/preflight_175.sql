-- preflight_175.sql -- run each block through MCP execute_sql BEFORE 175.
--
-- Run against production 2026-09-07; answers recorded under EXPECT.

-- (1) The table is empty, which is the whole premise.
--     EXPECT: zero rows. A row already here means somebody configured the
--     programme and 175 must not run: its `on conflict do nothing` would be a
--     silent no-op, which is safe, but the file would then be describing a
--     state that is not the state.
select * from public.referral_program_settings;

-- (2) Nothing has been claimed or paid, so turning the programme on later
--     starts from zero rather than resuming something half-run.
--     EXPECT (07.09): 0, 0, 0.
select (select count(*) from public.referrals)                         as referrals,
       (select count(*) from public.referral_signals)                  as signals,
       (select count(*) from public.profiles where referral_code is not null) as coded_profiles;

-- (3) The columns 175 writes are the columns that exist, and the three amounts
--     really are NOT NULL with no default.
--     EXPECT: referrer_bonus_agorot, referred_bonus_agorot and min_order_agorot
--     all NO / null default; is_active default false.
select column_name, data_type, is_nullable, column_default
  from information_schema.columns
 where table_schema='public' and table_name='referral_program_settings'
 order by ordinal_position;

-- (4) The reader that decides whether a claim is possible.
--     EXPECT: the body still opens on referral_program_settings and returns
--     'program_inactive' when the row is absent or inactive. If that changed,
--     re-read 175 before applying it.
select position('program_inactive' in pg_get_functiondef(p.oid)) > 0 as refuses_when_off,
       position('referral_program_settings' in pg_get_functiondef(p.oid)) > 0 as reads_settings
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname='public' and p.proname='fn_claim_referral';

-- (5) The wallet side is ready to receive the two credits.
--     EXPECT: fn_pay_referral exists and writes reason 'referral_bonus'; the
--     house account it debits exists. A missing house account would turn an
--     approved referral into a failed transfer at the worst moment.
select p.proname::text as fn,
       position('referral_bonus' in pg_get_functiondef(p.oid)) > 0 as writes_reason
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
 where n.nspname='public' and p.proname = 'fn_pay_referral';

select code, balance_ils from public.wallet_accounts where user_id is null order by code;
