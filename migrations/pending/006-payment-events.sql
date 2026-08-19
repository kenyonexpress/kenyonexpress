-- ============================================================================
-- PENDING: payment_events -- append-only journal for the money path
-- ============================================================================
--
-- STATUS: NOT APPLIED. Apply only through MCP apply_migration, never db push.
-- Authoritative document: docs/ARCHITECTURE-CHECKOUT-CARDCOM-E2E.md section 11.
--
-- ----------------------------------------------------------------------------
-- WHY THIS EXISTS BESIDE payment_webhook_events, AND DOES NOT REPLACE IT
-- ----------------------------------------------------------------------------
--
-- `payment_webhook_events` answers exactly one question: what did Cardcom say,
-- and did we already see this callback. It is keyed on
-- (provider, external_event_id), which is the dedup, and it is the right table
-- for that job. It stays.
--
-- It cannot answer the other question, because it has no row to answer it on:
--
--   * A GetLpResult that CONTRADICTS a callback is our finding, not Cardcom's
--     statement. Today it lives only in a Sentry alarm.
--   * An amount mismatch is written to `audit_log` with
--     `alarm: 'cardcom_amount_mismatch'` in `metadata`, alongside logins and
--     permission changes. Reading the money history means filtering a table
--     that is not about money.
--   * A callback for a Low Profile id with NO payment row (F13) has nothing to
--     hang off. `payment_webhook_events.payment_id` stays null, which is
--     correct, and the finding disappears.
--   * `finalizeOrder` failing AFTER a verified charge -- the worst state in the
--     system -- leaves `processed_at` null and nothing that says which step
--     threw.
--   * A refund, a token charge, a reconciliation discrepancy: none of them are
--     webhooks at all.
--
-- So: `payment_webhook_events` = what the provider said.
--     `payment_events`         = what WE did, in order, and why.
--
-- ----------------------------------------------------------------------------
-- FOUR DESIGN DECISIONS, EACH WITH ITS REASON
-- ----------------------------------------------------------------------------
--
-- 1. NO FOREIGN KEY TO payments.
--    An event about a payment that has no row is precisely the event that most
--    needs recording (F13: Cardcom is telling us about a hosted page we
--    created, whose payment row is not here, for a customer who may have been
--    charged). An FK would reject that insert. The column stays uuid and the
--    join is a LEFT JOIN. `order_id` is the same, for the same reason.
--
-- 2. APPEND-ONLY IS ENFORCED, NOT DOCUMENTED.
--    A trigger raises on UPDATE and on DELETE. A journal that a later statement
--    can rewrite is not evidence. The only party that may remove rows is a
--    retention job running as a role this trigger does not exempt -- there is
--    no such role, which is deliberate: decide retention when there is data to
--    measure, not now.
--
-- 3. MONEY IS bigint AGOROT.
--    Project rule, no exceptions on the money path. `amount_agorot` is
--    nullable because most events carry no amount; a CHECK forbids negatives
--    and a refund is recorded by `event_type`, not by a negative number.
--
-- 4. event_type IS A TEXT COLUMN WITH A CHECK, NOT AN ENUM.
--    Adding a value to a Postgres enum needs a migration and, before PG12,
--    could not run in a transaction with other DDL. This table's whole purpose
--    is to absorb new failure shapes as they are discovered. A CHECK list is
--    edited by one ALTER; the cost is that the list is not visible in the
--    generated TypeScript types, which is why it is duplicated in
--    `src/lib/payments/events.ts` when that file is written.
--
-- ----------------------------------------------------------------------------
-- WHAT THIS MIGRATION DOES NOT DO
-- ----------------------------------------------------------------------------
--
-- It creates the table only. Nothing writes to it until application code does,
-- and that code is NOT part of this change (this branch is docs only). Applying
-- this file alone is therefore safe and inert: an empty table, one index, one
-- trigger, RLS denying everything to every non-service role.
--
-- ============================================================================

begin;

-- ---------------------------------------------------------------------------
-- 1. The table
-- ---------------------------------------------------------------------------

create table if not exists public.payment_events (
  id            uuid primary key default gen_random_uuid(),

  -- Correlation. All three nullable on purpose: see decision (1) above.
  payment_id    uuid,
  order_id      uuid,
  provider      text not null default 'cardcom',

  -- What happened.
  event_type    text not null,
  stage         text,          -- mirrors capturePaymentAlarm's `stage`, for joining logs to rows

  -- Money, when the event has any. Integer agorot, never a float, never ILS.
  amount_agorot bigint,

  -- The provider's identifiers, when known. Not unique: several of our events
  -- can legitimately reference one deal (verify, finalize, refund).
  low_profile_id     text,
  transaction_id     text,
  external_event_id  text,     -- ties back to payment_webhook_events when there was a callback

  -- Free-form detail. Whatever the alarm carried, plus the raw provider body
  -- when there is one. Never used for control flow.
  detail        jsonb not null default '{}'::jsonb,

  -- Who caused it. null = the system (webhook, cron, DLQ replay).
  actor_id      uuid,
  actor_role    text,

  created_at    timestamptz not null default now(),

  constraint payment_events_amount_nonneg
    check (amount_agorot is null or amount_agorot >= 0),

  constraint payment_events_type_known check (event_type in (
    -- checkout, before the provider is involved
    'checkout_started',
    'order_created',
    'stock_reserved',
    'stock_reservation_failed',
    -- hosted page
    'low_profile_created',
    'low_profile_create_failed',
    'redirected',
    -- callback
    'callback_received',
    'callback_replay',
    'callback_unauthenticated',
    'callback_unknown_payment',
    'callback_provider_failure',
    -- server-to-server verification: OUR finding, not the provider's statement
    'verify_requested',
    'verify_succeeded',
    'verify_contradicted_callback',
    'amount_mismatch',
    'amount_unreadable',
    -- closing the order
    'finalize_started',
    'finalize_succeeded',
    'finalize_replay',
    'finalize_failed',
    'voucher_issued',
    'voucher_issue_refused',
    -- token charges (saved card), no hosted page
    'token_charge_requested',
    'token_charge_succeeded',
    'token_charge_declined',
    -- money going back out
    'refund_requested',
    'refund_succeeded',
    'refund_failed',
    'cancellation_fee_applied',
    'wallet_credited',
    -- out-of-band findings
    'dlq_replay_attempted',
    'reconciliation_missing_locally',
    'reconciliation_missing_remotely',
    'reconciliation_amount_differs',
    'manual_intervention'
  ))
);

comment on table public.payment_events is
  'Append-only journal of what WE did on the money path, and why. '
  'payment_webhook_events records what Cardcom said; this records our findings '
  'and actions, including the ones that have no callback to hang off. '
  'UPDATE and DELETE are blocked by trigger. See '
  'docs/ARCHITECTURE-CHECKOUT-CARDCOM-E2E.md section 11.';

comment on column public.payment_events.payment_id is
  'No FK, deliberately: a callback for a payment row that does not exist is the '
  'event that most needs recording.';

comment on column public.payment_events.amount_agorot is
  'Integer agorot. Never ILS, never a float. A refund is identified by '
  'event_type, never by a negative amount.';

-- ---------------------------------------------------------------------------
-- 2. Indexes
--
-- Three reads this table exists to serve, and nothing else:
--   a. "everything about this order, in order"        -> (order_id, created_at)
--   b. "everything about this payment, in order"      -> (payment_id, created_at)
--   c. "every unresolved critical event, newest first"-> partial on event_type
--
-- (c) is partial rather than a plain index on event_type: the critical types
-- are a small minority of rows, and a full index on a low-cardinality column
-- that is 95% 'callback_received' earns nothing.
-- ---------------------------------------------------------------------------

create index if not exists payment_events_order_created_idx
  on public.payment_events (order_id, created_at desc)
  where order_id is not null;

create index if not exists payment_events_payment_created_idx
  on public.payment_events (payment_id, created_at desc)
  where payment_id is not null;

create index if not exists payment_events_critical_idx
  on public.payment_events (created_at desc)
  where event_type in (
    'callback_unknown_payment',
    'callback_unauthenticated',
    'verify_contradicted_callback',
    'amount_mismatch',
    'amount_unreadable',
    'finalize_failed',
    'voucher_issue_refused',
    'refund_failed',
    'reconciliation_amount_differs',
    'manual_intervention'
  );

create index if not exists payment_events_low_profile_idx
  on public.payment_events (low_profile_id)
  where low_profile_id is not null;

-- ---------------------------------------------------------------------------
-- 3. Append-only, enforced
-- ---------------------------------------------------------------------------

create or replace function public.tg_payment_events_append_only()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception
    'payment_events is append-only: % is not permitted on this table', tg_op
    using errcode = '42501';
  return null;
end;
$$;

drop trigger if exists payment_events_no_update on public.payment_events;
create trigger payment_events_no_update
  before update on public.payment_events
  for each row execute function public.tg_payment_events_append_only();

drop trigger if exists payment_events_no_delete on public.payment_events;
create trigger payment_events_no_delete
  before delete on public.payment_events
  for each row execute function public.tg_payment_events_append_only();

-- ---------------------------------------------------------------------------
-- 4. RLS: nobody reads this but the service role and an admin
--
-- There is no customer-facing view of this table. A customer's own history is
-- `orders` / `order_items` / `vouchers`, which is what they are entitled to.
-- This table carries provider bodies and our internal findings, so it is
-- closed by default and opened only to `is_admin()`.
--
-- The service role bypasses RLS entirely, which is how the webhook writes.
-- ---------------------------------------------------------------------------

alter table public.payment_events enable row level security;
alter table public.payment_events force row level security;

drop policy if exists payment_events_admin_read on public.payment_events;
create policy payment_events_admin_read
  on public.payment_events
  for select
  to authenticated
  using (public.is_admin());

-- No INSERT / UPDATE / DELETE policy for any role. Writes come from the
-- service role only. An admin who can read cannot forge an entry, which is the
-- point of a journal.

revoke all on public.payment_events from anon;
revoke all on public.payment_events from authenticated;
grant select on public.payment_events to authenticated;

commit;

-- ============================================================================
-- ROLLBACK
-- ============================================================================
--
-- begin;
--   drop trigger if exists payment_events_no_delete on public.payment_events;
--   drop trigger if exists payment_events_no_update on public.payment_events;
--   drop function if exists public.tg_payment_events_append_only();
--   drop table if exists public.payment_events;
-- commit;
--
-- Safe while nothing writes to it. Once the application writes here, dropping
-- the table destroys the only record of every finding that has no callback,
-- so from that point the rollback is "stop writing", not "drop".
-- ============================================================================
