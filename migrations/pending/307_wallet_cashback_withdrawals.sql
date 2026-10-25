-- 307: Cashback credit on paid orders + customer wallet withdrawals
--
-- NOT APPLIED. Created 2026-10-25 for F58 wallet feature.
-- Preflight: preflight_307.sql, run first.
--
-- ----------------------------------------------------------------------------
-- CUSTOMER WALLET WITHDRAWALS
-- ----------------------------------------------------------------------------
--
-- Allows customers to request withdrawal of their wallet balance.
-- Admin reviews and processes through manual bank transfer or Cardcom refund.
--
-- `payout_method`: 'bank_transfer' or 'cardcom_refund'
-- `bank_details`: JSON with {account_number, branch_code, reference_id} for bank
-- `cardcom_token_id`: reference to saved_payment_methods for Cardcom refunds
-- `status`: pending, approved, rejected, completed
--

create table if not exists public.customer_wallet_payouts (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles(id) on delete cascade,
  amount_agorot     bigint not null,
  payout_method     text not null,
  bank_details      jsonb,
  cardcom_token_id  uuid references public.saved_payment_methods(id) on delete set null,
  status            text not null default 'pending',
  admin_note        text,
  requested_at      timestamptz not null default now(),
  reviewed_at       timestamptz,
  reviewed_by       uuid references public.profiles(id) on delete set null,
  completed_at      timestamptz,
  rejection_reason  text,
  wallet_debit_entry_id uuid, -- FK to wallet_entries when processed

  constraint customer_wallet_payouts_amount_min check (amount_agorot >= 5000), -- min 50 ILS
  constraint customer_wallet_payouts_method_known check (
    payout_method in ('bank_transfer', 'cardcom_refund')
  ),
  constraint customer_wallet_payouts_status_known check (
    status in ('pending', 'approved', 'rejected', 'completed')
  ),
  constraint customer_wallet_payouts_bank_has_details check (
    payout_method <> 'bank_transfer' or bank_details is not null
  ),
  constraint customer_wallet_payouts_cardcom_has_token check (
    payout_method <> 'cardcom_refund' or cardcom_token_id is not null
  ),
  constraint customer_wallet_payouts_rejected_has_reason check (
    status <> 'rejected' or rejection_reason is not null
  )
);

create index if not exists customer_wallet_payouts_user_id_idx
  on public.customer_wallet_payouts (user_id, requested_at desc);
create index if not exists customer_wallet_payouts_status_idx
  on public.customer_wallet_payouts (status, requested_at)
  where status in ('pending', 'approved');

alter table public.customer_wallet_payouts enable row level security;

drop policy if exists customer_wallet_payouts_owner_read on public.customer_wallet_payouts;
create policy customer_wallet_payouts_owner_read
  on public.customer_wallet_payouts
  for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists customer_wallet_payouts_staff_all on public.customer_wallet_payouts;
create policy customer_wallet_payouts_staff_all
  on public.customer_wallet_payouts
  for all
  to authenticated
  using (public.current_user_role() = any (array['admin', 'super_admin']::public.user_role[]));

-- ----------------------------------------------------------------------------
-- CASHBACK CREDIT FUNCTION
-- ----------------------------------------------------------------------------
--
-- Credits cashback to customer wallet when order is paid.
-- Called by trigger on orders table when status transitions to 'paid'.
--
-- Uses existing fn_wallet_transfer to credit user's wallet account.
-- Platform account debits, user account credits.
--

create or replace function public.fn_credit_order_cashback()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cashback_ils numeric;
  v_user_wallet_id uuid;
  v_platform_wallet_id uuid;
begin
  -- Only process when order transitions to paid
  if NEW.status <> 'paid' or NEW.paid_at is null then
    return NEW;
  end if;

  -- Skip if already processed
  if NEW.cashback_applied_ils_agorot is not null and NEW.cashback_applied_ils_agorot > 0 then
    return NEW;
  end if;

  -- Calculate total cashback from order items (in ILS)
  select coalesce(sum(
    ((oi.price_at_purchase_agorot * oi.quantity * p.cashback_percent / 100.0) / 100.0)
  ), 0)
  into v_cashback_ils
  from public.order_items oi
  inner join public.products p on p.id = oi.product_id
  where oi.order_id = NEW.id
    and p.cashback_enabled = true
    and p.cashback_percent > 0;

  -- If no cashback, we're done
  if v_cashback_ils = 0 then
    return NEW;
  end if;

  -- Get user's wallet account
  select id into v_user_wallet_id
  from public.wallet_accounts
  where user_id = NEW.user_id
  limit 1;

  if v_user_wallet_id is null then
    raise exception 'User wallet account not found for user %', NEW.user_id;
  end if;

  -- Get platform wallet account
  select id into v_platform_wallet_id
  from public.wallet_accounts
  where owner_type = 'platform'
  limit 1;

  if v_platform_wallet_id is null then
    raise exception 'Platform wallet account not found';
  end if;

  -- Transfer from platform to user
  perform public.fn_wallet_transfer(
    p_debit_account := v_platform_wallet_id,
    p_credit_account := v_user_wallet_id,
    p_amount_ils := v_cashback_ils,
    p_reason := 'order_cashback',
    p_idempotency := 'cashback:' || NEW.id::text,
    p_order_id := NEW.id
  );

  -- Update order to mark cashback as applied
  NEW.cashback_applied_ils := v_cashback_ils;
  NEW.cashback_applied_ils_agorot := round(v_cashback_ils * 100)::bigint;

  return NEW;
end;
$$;

-- Trigger to credit cashback on order payment
drop trigger if exists trigger_credit_cashback_on_payment on public.orders;
create trigger trigger_credit_cashback_on_payment
  before update on public.orders
  for each row
  when (OLD.status is distinct from NEW.status or OLD.paid_at is distinct from NEW.paid_at)
  execute function public.fn_credit_order_cashback();

-- Verify:
--   select count(*) from public.customer_wallet_payouts;              -- 0
--   select relrowsecurity from pg_class where oid = 'public.customer_wallet_payouts'::regclass;  -- t
--   select policyname, cmd from pg_policies
--    where schemaname = 'public' and tablename = 'customer_wallet_payouts';  -- two rows
--
-- Rollback:
--   drop trigger if exists trigger_credit_cashback_on_payment on public.orders;
--   drop function if exists public.fn_credit_order_cashback();
--   drop table if exists public.customer_wallet_payouts;
