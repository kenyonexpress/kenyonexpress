-- 174: a customer cannot put money into their own wallet, and `payments` has
--      no shape that would let them.
--
-- NOT APPLIED. Drafted 2026-09-07 for closeout block 7. Rollback at the foot.
-- Preflight: preflight_174.sql, run first.
--
-- ----------------------------------------------------------------------------
-- WHY A NEW TABLE AND NOT A `payments` ROW
-- ----------------------------------------------------------------------------
--
-- Measured against production on 2026-09-07:
--
--   payments.order_id   uuid NOT NULL, FK -> orders(id)
--   payment_kind        enum with exactly two values: charge, refund
--
-- A top-up has no order. Recording one in `payments` therefore needs
-- `order_id` to become nullable, and that column being NOT NULL is an
-- invariant the whole money path reads through: `refundOrder` finds the charge
-- by `order_id`, reconciliation joins on it, the invoice queue keys off it.
-- Making it nullable would let a row with no order reach every one of those
-- readers, each of which would have to learn to skip it, and the first one that
-- did not would be found by a customer.
--
-- So the top-up gets its own table, `payments` keeps its invariant, and the two
-- meet only where they must: the Cardcom callback, which looks up the low
-- profile id in one table and then the other.
--
-- ----------------------------------------------------------------------------
-- WHAT IT DOES NOT DO
-- ----------------------------------------------------------------------------
--
-- It does not make the balance withdrawable. The terms say the wallet is site
-- credit that cannot be withdrawn, transferred or converted to cash
-- (`src/app/(legal)/_content/terms.ts`, pinned by `legal-pages.test.ts`), and
-- money that can be paid IN by card and never taken out is exactly what that
-- sentence describes. `wallet_accounts_user_balance_floor` keeps a user account
-- at or above zero and `fn_wallet_transfer` refuses a user debit past the
-- balance; neither changes here.
--
-- It grants no client write. RLS is on, the owner may SELECT their own rows,
-- and INSERT/UPDATE belong to the service role -- the same shape `refunds`
-- uses, and for the same reason: a row here is a claim about money.
--
-- ----------------------------------------------------------------------------
-- MONEY IS INTEGER AGOROT
-- ----------------------------------------------------------------------------
--
-- `amount_agorot bigint`, and no numeric shekel twin. The rest of the schema
-- carries `*_ils numeric` with a generated `*_agorot` twin because it predates
-- the rule; a table written today has no reason to inherit the halfway state.
-- `fn_wallet_transfer` takes `p_amount_ils numeric`, so the conversion happens
-- once, at that call, through `src/lib/commerce/money.ts`.

create table if not exists public.wallet_topups (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references public.profiles(id) on delete cascade,
  amount_agorot          bigint not null,
  status                 text not null default 'initiated',
  cardcom_low_profile_id text,
  cardcom_transaction_id text,
  cardcom_account_id     text,
  -- The key the wallet credit is made under, so a replayed callback credits
  -- once. Mirrors `refund:<order>:wallet` in shape: `topup:<id>`.
  idempotency_key        text unique,
  failure_message        text,
  created_at             timestamptz not null default now(),
  succeeded_at           timestamptz,
  failed_at              timestamptz,

  constraint wallet_topups_amount_positive check (amount_agorot > 0),
  -- Bounds, not preferences. The floor keeps a card fee from exceeding the
  -- top-up; the ceiling is what makes a stolen-card top-up a bounded loss and
  -- keeps the wallet from becoming a way to move large sums into store credit.
  -- Both are stated in agorot: 20 shekels and 5,000 shekels.
  constraint wallet_topups_amount_within_bounds check (amount_agorot between 2000 and 500000),
  constraint wallet_topups_status_known check (
    status in ('initiated', 'redirected', 'succeeded', 'failed')
  ),
  constraint wallet_topups_succeeded_has_transaction check (
    status <> 'succeeded'
    or (cardcom_transaction_id is not null and succeeded_at is not null)
  )
);

create index if not exists wallet_topups_user_id_idx on public.wallet_topups (user_id);
create index if not exists wallet_topups_low_profile_idx
  on public.wallet_topups (cardcom_low_profile_id)
  where cardcom_low_profile_id is not null;

alter table public.wallet_topups enable row level security;

-- Owner reads their own. No INSERT, UPDATE or DELETE policy exists for any
-- client role, which is the deny: RLS on with no permissive policy refuses
-- everyone who is not the service role.
drop policy if exists wallet_topups_owner_read on public.wallet_topups;
create policy wallet_topups_owner_read
  on public.wallet_topups
  for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists wallet_topups_staff_read on public.wallet_topups;
create policy wallet_topups_staff_read
  on public.wallet_topups
  for select
  to authenticated
  using (public.current_user_role() = any (array['admin', 'super_admin', 'support']::public.user_role[]));

-- Verify:
--   select count(*) from public.wallet_topups;                       -- 0
--   select relrowsecurity from pg_class where oid = 'public.wallet_topups'::regclass;  -- t
--   select policyname, cmd from pg_policies
--    where schemaname = 'public' and tablename = 'wallet_topups';    -- two SELECT rows
--
-- Rollback:
--   drop table if exists public.wallet_topups;
