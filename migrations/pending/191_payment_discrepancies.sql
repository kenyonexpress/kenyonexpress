-- 191: the daily reconciliation finds discrepancies and keeps none of them.
--
-- SECTIONS 28 asks for "daily reconciliation Worker cron writing
-- payment_discrepancies". The cron exists and is thorough -- it pulls
-- ListTransactions per terminal, diffs it against `payments`, and enqueues an
-- admin notification when the critical count is non-zero. What it does not do
-- is write anything down. `payment_discrepancies` appears nowhere in this repo.
--
-- WHAT IS ACTUALLY LOST TODAY, measured by reading the route rather than
-- assumed:
--
--   1. THE ALERT IS CAPPED AT 20 ROWS, and the cap is right: an alert listing
--      two hundred rows is an alert nobody reads. But the other 180 exist only
--      in the HTTP response body, and the caller of a cron endpoint is a
--      scheduler that discards it.
--   2. THE LOG LINE CARRIES A COUNT, NOT THE ROWS. `reconcile.gaps_found` logs
--      `{ critical: n }`. So the count survives and the identity of the
--      transactions does not, which is the half that would let anyone act.
--   3. `missing_remotely` IS NEVER SURFACED AT ALL. It is deliberately outside
--      the critical set -- the terminal parser is unverified against a live
--      wire format, so "ours is missing there" is the bucket that a parser
--      mismatch lands in, and paging on it would page on our own uncertainty.
--      Not paging is right. Not recording is not: the first live run is exactly
--      the evidence that would confirm or refute the parser, and today it
--      evaporates.
--   4. THERE IS NO YESTERDAY. The window is 48 hours and runs overlap on
--      purpose, so the same discrepancy is found repeatedly. Nothing can answer
--      "is this the same one as yesterday's, and did it clear?" because there
--      is nothing to compare against.
--
-- THE KEY IS THE DISCREPANCY, NOT THE RUN. The obvious shape is one row per
-- finding per run, and it is wrong for the same reason the alert is keyed on
-- the day: the 48-hour window guarantees duplicates, and a table that grows a
-- row per run per finding turns one problem into a pile that has to be
-- de-duplicated by whoever reads it. So the unique key is the identity of the
-- discrepancy -- kind, terminal transaction, account -- and a re-find bumps
-- `last_seen_at` and `seen_count`.
--
-- That shape buys the thing a per-run table cannot: a discrepancy that STOPPED
-- being found is visible as a row whose `last_seen_at` is older than the last
-- run, which is what "it resolved itself" looks like. A per-run table shows the
-- absence of new rows, and an absence is also what a broken cron looks like.
--
-- NULLABLE ON BOTH SIDES, AND THAT IS THE POINT. `missing_locally` has no
-- payment id and no order id; `missing_remotely` has no terminal amount. A
-- NOT NULL on either side would make the two most interesting kinds
-- unrecordable, which is how a table ends up holding only the findings nobody
-- needed.
--
-- MONEY IS AGOROT, bigint, like every other money column in this schema. The
-- amounts written here come from `readAmountAgorot` and from
-- `terminalAmountToAgorot`, both of which have already done the conversion.
--
-- NO FOREIGN KEY TO `payments`. A `missing_locally` row is by definition about
-- a transaction we have no payment for, and a FK on `payment_id` would be fine
-- there (it is null) but would also mean a discrepancy about a payment row that
-- someone later deletes takes the evidence with it. The id is recorded as a
-- plain uuid so the finding outlives the row it is about.
--
-- SERVER-ONLY, in the shape 172 established. RLS on, one RESTRICTIVE deny-all
-- for anon and authenticated, and an admin SELECT so the panel can show it.
-- RESTRICTIVE and not permissive for 172's reason: Postgres ORs permissive
-- policies and ANDs restrictive ones over the result, so a permissive `false`
-- stops meaning anything the moment a second permissive policy lands, and a
-- restrictive `false` cannot be voted down.
--
-- IDEMPOTENT. Every statement is `if not exists` or guarded, so a re-run is a
-- no-op.

begin;

create table if not exists public.payment_discrepancies (
  id                  uuid primary key default gen_random_uuid(),
  kind                text not null,
  transaction_id      text not null,
  cardcom_account_id  text not null default 'platform',
  terminal_agorot     bigint,
  local_agorot        bigint,
  order_id            uuid,
  payment_id          uuid,
  first_seen_at       timestamptz not null default now(),
  last_seen_at        timestamptz not null default now(),
  seen_count          integer not null default 1,
  resolved_at         timestamptz,
  constraint payment_discrepancies_kind_known
    check (kind in ('missing_locally', 'amount_mismatch', 'missing_remotely')),
  constraint payment_discrepancies_seen_count_positive
    check (seen_count >= 1),
  -- Amounts are agorot: whole, and never negative on either side. A refund is
  -- carried as its own transaction with a positive sum, exactly as the terminal
  -- reports it, so a negative here is a conversion bug and not a credit.
  constraint payment_discrepancies_amounts_nonnegative
    check (
      (terminal_agorot is null or terminal_agorot >= 0)
      and (local_agorot is null or local_agorot >= 0)
    )
);

-- The identity of a finding, so a re-find updates rather than accumulates.
create unique index if not exists payment_discrepancies_identity
  on public.payment_discrepancies (kind, transaction_id, cardcom_account_id);

-- The two reads the admin screen makes: what is open, and what happened lately.
create index if not exists payment_discrepancies_open
  on public.payment_discrepancies (last_seen_at desc)
  where resolved_at is null;

alter table public.payment_discrepancies enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'payment_discrepancies'
      and p.polname = 'deny_all_client_roles'
  ) then
    execute 'create policy deny_all_client_roles on public.payment_discrepancies'
         || ' as restrictive to anon, authenticated using (false) with check (false)';
  end if;

  if not exists (
    select 1 from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'payment_discrepancies'
      and p.polname = 'payment_discrepancies_admin_read'
  ) then
    execute 'create policy payment_discrepancies_admin_read on public.payment_discrepancies'
         || ' for select to authenticated using (public.is_admin())';
  end if;
end $$;

-- Grants, spelled out rather than left to the default. A fresh CREATE TABLE
-- does not grant anything to anon or authenticated, but this file may be run
-- against a database where an earlier attempt did, and REVOKE on a role that
-- holds nothing is a no-op.
revoke all on public.payment_discrepancies from anon, authenticated;
grant select on public.payment_discrepancies to authenticated;
grant all on public.payment_discrepancies to service_role;

-- ── the writer ───────────────────────────────────────────────────────────────
--
-- WHY A FUNCTION AND NOT A POSTGREST UPSERT. PostgREST's `upsert` compiles to
-- `ON CONFLICT DO UPDATE` over EVERY column in the payload, and two of the
-- columns here must not be written that way:
--
--   first_seen_at   would be reset to now() on every re-find, which is the one
--                   value that makes "how long has this been open" answerable.
--                   A finding open for three weeks would report as new daily.
--   seen_count      cannot be expressed at all. The client would have to read
--                   the current value and write value+1, and two overlapping
--                   runs would then both read 4 and both write 5.
--
-- `excluded` says both correctly in one statement, and the whole batch is one
-- round trip rather than one per finding.
--
-- SECURITY INVOKER, not DEFINER. The only caller is the cron route holding the
-- service role, which already has every right this function needs, so DEFINER
-- would hand out an authority nobody requires. `search_path` is pinned anyway:
-- an invoker function inherits the CALLER's search_path, which is the hole 188
-- is about.
--
-- RE-FINDING CLEARS `resolved_at`. A discrepancy that was marked resolved and
-- then shows up again is open again, and leaving the timestamp would hide it
-- from the partial index that the admin screen reads.

create or replace function public.fn_record_payment_discrepancies(p_rows jsonb)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $fn$
declare
  v_count integer;
begin
  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    return 0;
  end if;

  with incoming as (
    select
      row_value ->> 'kind'                          as kind,
      row_value ->> 'transaction_id'                as transaction_id,
      coalesce(row_value ->> 'cardcom_account_id', 'platform') as cardcom_account_id,
      (row_value ->> 'terminal_agorot')::bigint     as terminal_agorot,
      (row_value ->> 'local_agorot')::bigint        as local_agorot,
      (row_value ->> 'order_id')::uuid              as order_id,
      (row_value ->> 'payment_id')::uuid            as payment_id
    from jsonb_array_elements(p_rows) as row_value
  ), deduped as (
    -- One statement cannot hit the same conflict target twice ("ON CONFLICT DO
    -- UPDATE command cannot affect row a second time"), and a single run CAN
    -- legitimately produce two findings with the same key: the terminal may
    -- report the same deal number twice. Last one wins.
    select distinct on (kind, transaction_id, cardcom_account_id) *
    from incoming
    where kind is not null and transaction_id is not null
    order by kind, transaction_id, cardcom_account_id
  ), written as (
    insert into public.payment_discrepancies as d (
      kind, transaction_id, cardcom_account_id,
      terminal_agorot, local_agorot, order_id, payment_id
    )
    select
      kind, transaction_id, cardcom_account_id,
      terminal_agorot, local_agorot, order_id, payment_id
    from deduped
    on conflict (kind, transaction_id, cardcom_account_id) do update set
      terminal_agorot = excluded.terminal_agorot,
      local_agorot    = excluded.local_agorot,
      -- coalesce and not excluded: a later run that could not resolve the order
      -- must not erase an id an earlier one did resolve.
      order_id        = coalesce(excluded.order_id, d.order_id),
      payment_id      = coalesce(excluded.payment_id, d.payment_id),
      last_seen_at    = now(),
      seen_count      = d.seen_count + 1,
      resolved_at     = null
    returning 1
  )
  select count(*)::integer into v_count from written;

  return v_count;
end;
$fn$;

revoke all on function public.fn_record_payment_discrepancies(jsonb) from public, anon, authenticated;
grant execute on function public.fn_record_payment_discrepancies(jsonb) to service_role;

comment on function public.fn_record_payment_discrepancies(jsonb) is
  'Batch upsert of reconciliation findings keyed on (kind, transaction_id, '
  'cardcom_account_id). Returns the number of rows written. Bumps seen_count '
  'and last_seen_at on a re-find, preserves first_seen_at, and reopens a row '
  'that had been resolved.';

comment on table public.payment_discrepancies is
  'One row per open discrepancy between a Cardcom terminal report and `payments`, '
  'keyed on (kind, transaction_id, cardcom_account_id). Written by '
  '/api/cron/reconcile; re-finding bumps last_seen_at and seen_count rather '
  'than inserting again. A row whose last_seen_at predates the last run is one '
  'that stopped being found.';

commit;
