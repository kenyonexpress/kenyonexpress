-- 234_gift_cards.sql
--
-- Gift cards as a stored-value instrument, additive only.
--
-- THE MODEL. A gift card is bought like any product (a product row flagged
-- `is_gift_card`), issued at finalize exactly like a gift voucher (hashed
-- bearer code, raw code only in the outbox email), and redeemed IN FULL into
-- the holder's wallet through `fn_wallet_transfer`. Spending then rides the
-- existing wallet path at checkout (`apply_wallet_ils` -> `spendWallet`), so
-- there is no second stored-value spend path and no new settlement column.
-- The card itself is therefore binary - issued or redeemed - and the "balance"
-- of a card is its face value while active, zero after. Partial spend belongs
-- to the wallet, which already does it.
--
-- THE LEDGER SIDE. Redemption debits `platform:revenue` and credits the user
-- account, with idempotency key `gift_card:<id>:redeem`. The purchase already
-- put the face value into platform revenue via the order (a gift-card product
-- carries platform_percent 100 and no supplier), so the debit converts revenue
-- into customer credit - a liability - rather than minting money. House
-- accounts may go negative (146's floor is user-accounts only), so a revenue
-- account that has not yet been reconciled cannot block a redemption.
--
-- EXPIRY. `expires_at` is stamped at issuance (five years, the Israeli
-- consumer-protection floor for stored-value certificates) and judged at
-- redemption time. No cron: an expired card refuses redemption, nothing else
-- has to happen on the day it expires.
--
-- ROLLBACK
--   drop trigger if exists audit_gift_cards on public.gift_cards;
--   drop trigger if exists set_updated_at on public.gift_cards;
--   drop function if exists public.redeem_gift_card(text, uuid);
--   drop table if exists public.gift_cards;
--   alter table public.products drop column if exists is_gift_card;
--   alter table public.notification_outbox drop constraint if exists notification_outbox_kind_check;
--   -- then re-add the constraint without 'gift_card_issued' (list in 231's state)

-- 1. The product flag. Existing selects name their columns, so an added column
--    changes nothing until a row opts in.
alter table public.products
  add column if not exists is_gift_card boolean not null default false;

-- 2. The instrument.
create table if not exists public.gift_cards (
  id uuid primary key default gen_random_uuid(),
  -- sha256 hex of the normalized code. The raw code exists only in the outbox
  -- email payload, same rule as vouchers.gift_claim_token_hash (108).
  code_hash text not null unique,
  -- For support conversations: "the card ending in 7K2M".
  code_last4 text not null,
  -- Face value. Integer agorot, positive, immutable once issued.
  amount_agorot bigint not null check (amount_agorot > 0),
  status text not null default 'issued'
    check (status in ('issued', 'redeemed', 'cancelled')),
  purchaser_user_id uuid references public.profiles(id) on delete set null,
  order_id uuid references public.orders(id) on delete set null,
  order_item_id uuid references public.order_items(id) on delete set null,
  -- 1..quantity within its order item; the issuance dedupe below keys on it.
  unit_index integer not null default 1 check (unit_index >= 1),
  recipient_name text,
  recipient_email text,
  gift_message text,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  redeemed_at timestamptz,
  redeemed_by_user_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- A redeemed card always names its redeemer and moment; an unredeemed one never does.
  constraint gift_cards_redeemed_shape check (
    (status = 'redeemed') = (redeemed_at is not null and redeemed_by_user_id is not null)
  )
);

-- Replay-safe issuance: finalize can run twice for one order, and the second
-- pass must find the card already minted rather than mint a sibling.
create unique index if not exists gift_cards_issue_dedupe
  on public.gift_cards (order_item_id, unit_index)
  where order_item_id is not null;
create index if not exists gift_cards_purchaser_idx
  on public.gift_cards (purchaser_user_id);
create index if not exists gift_cards_redeemer_idx
  on public.gift_cards (redeemed_by_user_id);

-- Defensive, per the 005+ convention: 001 is not idempotent and may never have
-- defined it on a fresh database. Create only if missing (the 183 lesson: do
-- not restate the live body).
do $$
begin
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'set_updated_at'
  ) then
    create function public.set_updated_at() returns trigger
    language plpgsql as 'begin new.updated_at = now(); return new; end';
  end if;
end $$;

drop trigger if exists set_updated_at on public.gift_cards;
create trigger set_updated_at before update on public.gift_cards
  for each row execute function public.set_updated_at();

-- 3. RLS. Clients may read their own cards (bought or redeemed) and write
--    nothing: issuance and redemption are service-role paths. The balance
--    check by code goes through the server action, which holds the hash, so
--    no anon surface exists at all.
alter table public.gift_cards enable row level security;

revoke all on public.gift_cards from anon;
revoke all on public.gift_cards from authenticated;
grant select on public.gift_cards to authenticated;

drop policy if exists "gift_cards_select_own" on public.gift_cards;
create policy "gift_cards_select_own" on public.gift_cards
  for select to authenticated
  using (
    purchaser_user_id = (select auth.uid())
    or redeemed_by_user_id = (select auth.uid())
  );

-- 4. The outbox learns the new kind. Same allow-list, one member longer.
alter table public.notification_outbox
  drop constraint if exists notification_outbox_kind_check;
alter table public.notification_outbox
  add constraint notification_outbox_kind_check check (kind = any (array[
    'order_paid'::text, 'supplier_sale'::text, 'voucher_redeemed'::text,
    'voucher_issued'::text, 'voucher_gifted'::text, 'voucher_expiring'::text,
    'cashback_credited'::text, 'invoice_dead'::text, 'low_stock'::text,
    'reconciliation_gap'::text, 'refund_completed'::text, 'welcome'::text,
    'account_deleted'::text, 'order_shipped'::text, 'price_drop'::text,
    'back_in_stock'::text, 'gift_card_issued'::text
  ]));

-- 5. Redemption, atomic under the card's row lock. Returns a refusal token or
--    NULL for success, the claim_order_discount convention. Idempotent for the
--    same user: re-running a redemption that already happened is success, not
--    'redeemed' - the retry of a request that worked must not read as theft.
create or replace function public.redeem_gift_card(p_code_hash text, p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_card public.gift_cards%rowtype;
  v_user_account uuid;
  v_revenue_account uuid;
begin
  if p_code_hash is null or btrim(p_code_hash) = '' or p_user_id is null then
    return 'not_found';
  end if;

  select * into v_card
    from public.gift_cards
   where code_hash = p_code_hash
   for update;
  if not found then return 'not_found'; end if;

  if v_card.status = 'cancelled' then return 'cancelled'; end if;
  if v_card.status = 'redeemed' then
    if v_card.redeemed_by_user_id = p_user_id then return null; end if;
    return 'redeemed';
  end if;
  if v_card.expires_at <= now() then return 'expired'; end if;

  -- The wallet account may not exist yet for a user who never earned cashback.
  insert into public.wallet_accounts (user_id)
  values (p_user_id)
  on conflict (user_id) do nothing;

  select id into v_user_account
    from public.wallet_accounts where user_id = p_user_id;
  select id into v_revenue_account
    from public.wallet_accounts where code = 'platform:revenue';
  if v_user_account is null or v_revenue_account is null then
    return 'wallet_missing';
  end if;

  -- Shekels at the boundary, exactly like every other caller of
  -- fn_wallet_transfer; agorot/100 is exact in numeric. The idempotency key
  -- makes a double-submit a no-op inside the transfer itself.
  perform public.fn_wallet_transfer(
    v_revenue_account,
    v_user_account,
    v_card.amount_agorot::numeric / 100,
    'gift_card_redeem',
    'gift_card:' || v_card.id || ':redeem',
    null
  );

  update public.gift_cards
     set status = 'redeemed',
         redeemed_at = now(),
         redeemed_by_user_id = p_user_id
   where id = v_card.id;

  return null;
end;
$$;

revoke all on function public.redeem_gift_card(text, uuid) from public;
revoke all on function public.redeem_gift_card(text, uuid) from anon;
revoke all on function public.redeem_gift_card(text, uuid) from authenticated;
grant execute on function public.redeem_gift_card(text, uuid) to service_role;

-- 6. The audit trail, same trigger 169 attached to every money table.
drop trigger if exists audit_gift_cards on public.gift_cards;
create trigger audit_gift_cards
  after insert or update or delete on public.gift_cards
  for each row execute function public.audit_log_trigger_fn();
