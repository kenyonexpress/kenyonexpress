-- ============================================================================
-- PENDING: status transition guards + an audit_log that cannot be edited
-- ============================================================================
--
-- STATUS: NOT APPLIED. Apply only through MCP apply_migration, never db push.
-- Authoritative document: docs/ARCHITECTURE-ORDER-STATE-MACHINE.md section 7.
--
-- ----------------------------------------------------------------------------
-- WHAT THIS IS FOR, AND WHAT IT DELIBERATELY IS NOT
-- ----------------------------------------------------------------------------
--
-- The legal transitions live in TypeScript (`src/server/domain/orders/
-- state-machine.ts`, `src/server/domain/vouchers/state-machine.ts`) and every
-- write path already carries a `.eq('status', <from>)` predicate, which makes
-- each transition a compare-and-swap rather than a read-modify-write.
--
-- That is correct and it is not sufficient, for one reason: the service role
-- bypasses RLS and can write any value to any status column, and the service
-- role is what the webhook, the DLQ replay, every cron job and every future
-- one-off script run as. A typo in a repair script is a legal UPDATE today.
--
-- These triggers make the DATABASE refuse an illegal transition, so the rule
-- holds for a statement typed into the SQL editor at 3am as well as for the
-- code path that has a test.
--
-- THIS IS NOT A REPLACEMENT FOR THE TYPESCRIPT MACHINE. The TS module decides
-- what the application may attempt and produces the Hebrew message the admin
-- reads. This is a floor, not a front door. Keeping both in step is a real
-- cost, and it is paid deliberately: the tables below are the money path.
--
-- ----------------------------------------------------------------------------
-- WHAT IT DOES NOT GUARD, AND WHY
-- ----------------------------------------------------------------------------
--
-- * order_items.item_status is NOT guarded. Its physical half (shipped,
--   delivered) has no writer yet, so the legal set is not settled and a guard
--   would be encoding a guess. Guard it when the fulfilment flow lands.
-- * settlement_status is guarded only for the six states the TS machine knows.
--   escrow_held / escrow_released / platform_settled are accepted as a FROM
--   (legacy rows must remain unwindable) and refused as a TO (nothing may
--   enter them again).
-- * No trigger writes an audit row. Writing history from a trigger hides the
--   actor: auth.uid() is null under the service role, which is exactly when
--   these fire. History is written by the application, which knows who acted.
--
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 0. One helper. Every guard reports the same way.
-- ---------------------------------------------------------------------------

create or replace function public.raise_illegal_transition(
  p_table text, p_id uuid, p_column text, p_from text, p_to text
) returns void
language plpgsql
immutable
as $$
begin
  raise exception
    'illegal % transition on %.%: % -> %',
    p_column, p_table, coalesce(p_id::text, '?'), coalesce(p_from, 'null'), coalesce(p_to, 'null')
    using errcode = '23514',   -- check_violation: this IS a constraint, expressed as a trigger
          hint = 'See docs/ARCHITECTURE-ORDER-STATE-MACHINE.md section 8 for the legal set.';
end;
$$;

-- ---------------------------------------------------------------------------
-- 1. orders.status
--
--   pending -> paid | cancelled
--   paid    -> refunded | partially_fulfilled
--   partially_fulfilled -> fulfilled | refunded
--   fulfilled -> refunded
--   cancelled, refunded: terminal
--
-- partially_fulfilled and fulfilled have no writer today (section 1.5 of the
-- document). They are allowed here rather than refused, so that landing the
-- fulfilment flow does not require editing this guard first.
-- ---------------------------------------------------------------------------

create or replace function public.tg_orders_status_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  if not (
       (old.status = 'pending'             and new.status in ('paid', 'cancelled'))
    or (old.status = 'paid'                and new.status in ('refunded', 'partially_fulfilled'))
    or (old.status = 'partially_fulfilled' and new.status in ('fulfilled', 'refunded'))
    or (old.status = 'fulfilled'           and new.status in ('refunded'))
  ) then
    perform public.raise_illegal_transition(
      'orders', new.id, 'status', old.status::text, new.status::text);
  end if;

  return new;
end;
$$;

drop trigger if exists orders_status_guard on public.orders;
create trigger orders_status_guard
  before update of status on public.orders
  for each row execute function public.tg_orders_status_guard();

-- ---------------------------------------------------------------------------
-- 2. order_items.settlement_status
--
-- Mirrors TRANSITIONS in src/server/domain/orders/state-machine.ts exactly:
--   pending        -> paid | cancelled
--   paid           -> split_executed | refunded
--   split_executed -> refunded
--   redeemed, refunded, cancelled: terminal
--
-- Plus the legacy escape hatch: a row sitting in escrow_held, escrow_released
-- or platform_settled may still move to refunded or cancelled, because such a
-- row has to remain unwindable. Nothing may move INTO those three.
-- ---------------------------------------------------------------------------

create or replace function public.tg_order_items_settlement_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.settlement_status is not distinct from old.settlement_status then
    return new;
  end if;

  if new.settlement_status in ('escrow_held', 'escrow_released', 'platform_settled') then
    perform public.raise_illegal_transition(
      'order_items', new.id, 'settlement_status',
      old.settlement_status::text, new.settlement_status::text);
  end if;

  if not (
       (old.settlement_status = 'pending'        and new.settlement_status in ('paid', 'cancelled'))
    or (old.settlement_status = 'paid'           and new.settlement_status in ('split_executed', 'refunded'))
    or (old.settlement_status = 'split_executed' and new.settlement_status in ('refunded'))
    -- legacy states: exit only
    or (old.settlement_status in ('escrow_held', 'escrow_released', 'platform_settled')
        and new.settlement_status in ('refunded', 'cancelled'))
  ) then
    perform public.raise_illegal_transition(
      'order_items', new.id, 'settlement_status',
      old.settlement_status::text, new.settlement_status::text);
  end if;

  return new;
end;
$$;

drop trigger if exists order_items_settlement_guard on public.order_items;
create trigger order_items_settlement_guard
  before update of settlement_status on public.order_items
  for each row execute function public.tg_order_items_settlement_guard();

-- ---------------------------------------------------------------------------
-- 3. payments.status
--
--   initiated  -> redirected | succeeded | failed
--   redirected -> succeeded | failed
--   succeeded  -> refunded
--   failed, refunded: terminal
--
-- initiated -> succeeded is legal because the saved-card path
-- (chargeWithToken) never creates a hosted page and so never passes through
-- redirected.
-- ---------------------------------------------------------------------------

create or replace function public.tg_payments_status_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  if not (
       (old.status = 'initiated'  and new.status in ('redirected', 'succeeded', 'failed'))
    or (old.status = 'redirected' and new.status in ('succeeded', 'failed'))
    or (old.status = 'succeeded'  and new.status in ('refunded'))
  ) then
    perform public.raise_illegal_transition(
      'payments', new.id, 'status', old.status::text, new.status::text);
  end if;

  return new;
end;
$$;

drop trigger if exists payments_status_guard on public.payments;
create trigger payments_status_guard
  before update of status on public.payments
  for each row execute function public.tg_payments_status_guard();

-- ---------------------------------------------------------------------------
-- 4. vouchers.status
--
-- The simplest and the strictest: issued is the only non-terminal state.
--   issued -> redeemed | expired | cancelled | refunded
--   everything else: terminal, no exceptions.
--
-- This is the guard that matters most. A voucher moved back to `issued` by any
-- means is a voucher that can be redeemed twice, and the money for the second
-- redemption comes out of a business that already gave the goods.
-- ---------------------------------------------------------------------------

create or replace function public.tg_vouchers_status_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  if old.status <> 'issued' then
    perform public.raise_illegal_transition(
      'vouchers', new.id, 'status', old.status::text, new.status::text);
  end if;

  if new.status not in ('redeemed', 'expired', 'cancelled', 'refunded') then
    perform public.raise_illegal_transition(
      'vouchers', new.id, 'status', old.status::text, new.status::text);
  end if;

  return new;
end;
$$;

drop trigger if exists vouchers_status_guard on public.vouchers;
create trigger vouchers_status_guard
  before update of status on public.vouchers
  for each row execute function public.tg_vouchers_status_guard();

-- ---------------------------------------------------------------------------
-- 5. audit_log: append-only, enforced
--
-- A log a later statement can rewrite is not evidence. There is no legitimate
-- UPDATE of an audit row and no legitimate DELETE of one; a retention policy,
-- when there is enough data to justify one, is a partitioned drop and is a
-- different migration that will have to disable this deliberately.
-- ---------------------------------------------------------------------------

create or replace function public.tg_audit_log_append_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'audit_log is append-only: % is not permitted', tg_op
    using errcode = '42501';
  return null;
end;
$$;

drop trigger if exists audit_log_no_update on public.audit_log;
create trigger audit_log_no_update
  before update on public.audit_log
  for each row execute function public.tg_audit_log_append_only();

drop trigger if exists audit_log_no_delete on public.audit_log;
create trigger audit_log_no_delete
  before delete on public.audit_log
  for each row execute function public.tg_audit_log_append_only();

commit;

-- ============================================================================
-- BEFORE APPLYING: run this and read the answer
-- ============================================================================
--
-- The guards refuse illegal transitions from now on. They say nothing about
-- rows that are ALREADY in a shape the guard would not have produced, and such
-- rows are not hypothetical -- escrow_held and platform_settled were written by
-- a model that has since been abolished. Count them first:
--
--   select settlement_status, count(*)
--   from public.order_items
--   group by 1 order by 2 desc;
--
--   select status, count(*) from public.orders  group by 1;
--   select status, count(*) from public.payments group by 1;
--   select status, count(*) from public.vouchers group by 1;
--
-- Every legacy value must still be able to reach `refunded`, which section 2
-- allows on purpose. If a count is non-zero for a state this file does not
-- name at all, STOP: the enum has a member the state machine has never heard
-- of, and that is a finding, not a migration.
--
-- ============================================================================
-- ROLLBACK
-- ============================================================================
--
-- begin;
--   drop trigger if exists audit_log_no_delete          on public.audit_log;
--   drop trigger if exists audit_log_no_update          on public.audit_log;
--   drop trigger if exists vouchers_status_guard        on public.vouchers;
--   drop trigger if exists payments_status_guard        on public.payments;
--   drop trigger if exists order_items_settlement_guard on public.order_items;
--   drop trigger if exists orders_status_guard          on public.orders;
--   drop function if exists public.tg_audit_log_append_only();
--   drop function if exists public.tg_vouchers_status_guard();
--   drop function if exists public.tg_payments_status_guard();
--   drop function if exists public.tg_order_items_settlement_guard();
--   drop function if exists public.tg_orders_status_guard();
--   drop function if exists public.raise_illegal_transition(text, uuid, text, text, text);
-- commit;
--
-- Fully reversible: these triggers write nothing, so dropping them loses no
-- data. That is the argument for applying them early rather than late.
-- ============================================================================
