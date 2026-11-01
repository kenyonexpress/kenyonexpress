-- 313: partner redeem (G107). 8-digit counter PIN, advisory-locked redeem, audit events.
-- Rollback:
--   drop function if exists public.redeem_voucher_locked(text, text, text, text, inet, text);
--   drop table if exists public.vouchers_redemption_events;
--   drop trigger if exists tg_vouchers_partner_pin on public.vouchers;
--   drop function if exists public.fn_vouchers_partner_pin();
--   drop index if exists public.vouchers_partner_pin_issued_uq;
--   alter table public.vouchers drop column if exists partner_pin;

alter table public.vouchers add column if not exists partner_pin text;
alter table public.vouchers drop constraint if exists vouchers_partner_pin_format;
alter table public.vouchers add constraint vouchers_partner_pin_format
  check (partner_pin is null or partner_pin ~ '^[0-9]{8}$');

-- Unique per supplier among live vouchers only; a spent voucher frees its PIN.
create unique index if not exists vouchers_partner_pin_issued_uq
  on public.vouchers (supplier_id, partner_pin)
  where status = 'issued' and partner_pin is not null;

create or replace function public.fn_vouchers_partner_pin()
returns trigger language plpgsql set search_path to '' as $$
declare
  candidate text;
  tries int := 0;
begin
  if new.partner_pin is not null or new.status <> 'issued' then return new; end if;
  loop
    candidate := lpad(((('x' || encode(extensions.gen_random_bytes(4), 'hex'))::bit(32)::bigint) % 100000000)::text, 8, '0');
    exit when not exists (
      select 1 from public.vouchers
      where supplier_id = new.supplier_id and partner_pin = candidate and status = 'issued');
    tries := tries + 1;
    if tries > 20 then raise exception 'partner_pin space exhausted'; end if;
  end loop;
  new.partner_pin := candidate;
  return new;
end $$;

drop trigger if exists tg_vouchers_partner_pin on public.vouchers;
create trigger tg_vouchers_partner_pin
  before insert or update on public.vouchers
  for each row execute function public.fn_vouchers_partner_pin();

-- Backfill live vouchers: the no-op update fires the trigger.
update public.vouchers set partner_pin = null where status = 'issued' and partner_pin is null;

-- Audit: one row per attempt that reached the lock, whatever the outcome.
create table if not exists public.vouchers_redemption_events (
  id uuid primary key default gen_random_uuid(),
  voucher_id uuid references public.vouchers(id),
  supplier_id uuid references public.suppliers(id),
  actor_user_id uuid,
  code text not null,
  input_kind text not null check (input_kind in ('qr', 'code', 'pin')),
  scan_method text,
  outcome text not null,
  replayed boolean not null default false,
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists vouchers_redemption_events_voucher_idx
  on public.vouchers_redemption_events (voucher_id, created_at desc);
alter table public.vouchers_redemption_events enable row level security;
revoke all on public.vouchers_redemption_events from anon, authenticated;

-- Serialises concurrent scans of one code, then delegates to redeem_voucher.
-- auth.uid() is a session setting, so redeem_voucher still sees the caller.
create or replace function public.redeem_voucher_locked(
  p_code text,
  p_input_kind text,
  p_scan_method text,
  p_idempotency_key text,
  p_ip inet,
  p_user_agent text
) returns jsonb
language plpgsql security definer set search_path to '' as $$
declare
  v_result jsonb;
  v_voucher public.vouchers%rowtype;
begin
  perform pg_advisory_xact_lock(hashtextextended('voucher-redeem:' || p_code, 0));

  v_result := public.redeem_voucher(p_code, p_scan_method, p_idempotency_key, p_ip, p_user_agent);

  select * into v_voucher from public.vouchers where code = p_code;
  insert into public.vouchers_redemption_events
    (voucher_id, supplier_id, actor_user_id, code, input_kind, scan_method, outcome, replayed, ip_address, user_agent)
  values
    (v_voucher.id, v_voucher.supplier_id, auth.uid(), p_code, p_input_kind, p_scan_method,
     coalesce(v_result->>'outcome', 'unknown'), coalesce((v_result->>'replayed')::boolean, false),
     p_ip, p_user_agent);
  return v_result;
end $$;

revoke all on function public.redeem_voucher_locked(text, text, text, text, inet, text) from public, anon;
grant execute on function public.redeem_voucher_locked(text, text, text, text, inet, text) to authenticated;
