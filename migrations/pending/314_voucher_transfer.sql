-- 314: voucher transfer between customers (G105).
-- A customer may hand an unused, unexpired coupon to another registered
-- customer by email. One atomic function: lock the row, re-check owner/status/
-- expiry, move ownership, write the audit row. No money moves.
--
-- Rollback:
--   drop function if exists public.transfer_voucher(uuid, uuid, uuid);
--   drop table if exists public.voucher_transfers;

create table if not exists public.voucher_transfers (
  id uuid primary key default gen_random_uuid(),
  voucher_id uuid not null references public.vouchers(id),
  from_user_id uuid not null,
  to_user_id uuid not null,
  created_at timestamptz not null default now(),
  constraint voucher_transfers_distinct_users check (from_user_id <> to_user_id)
);

create index if not exists voucher_transfers_voucher_idx on public.voucher_transfers (voucher_id);

alter table public.voucher_transfers enable row level security;

drop policy if exists voucher_transfers_party_read on public.voucher_transfers;
create policy voucher_transfers_party_read on public.voucher_transfers
  for select to authenticated
  using (auth.uid() = from_user_id or auth.uid() = to_user_id);

create or replace function public.transfer_voucher(p_voucher_id uuid, p_from uuid, p_to uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
begin
  if p_from = p_to then
    return 'same_user';
  end if;

  select id, user_id, status, expires_at into v
  from public.vouchers where id = p_voucher_id for update;

  if not found or v.user_id is distinct from p_from then
    return 'not_found';
  end if;
  if v.status <> 'issued' or v.expires_at <= now() then
    return 'not_transferable';
  end if;

  update public.vouchers set user_id = p_to where id = p_voucher_id;
  insert into public.voucher_transfers (voucher_id, from_user_id, to_user_id)
  values (p_voucher_id, p_from, p_to);
  return 'ok';
end;
$$;

revoke all on function public.transfer_voucher(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.transfer_voucher(uuid, uuid, uuid) to service_role;
