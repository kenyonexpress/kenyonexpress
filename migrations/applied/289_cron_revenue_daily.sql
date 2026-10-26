-- 289_cron_revenue_daily.sql (idempotent)
--
-- NOT APPLIED. Pending approval; route to production is MCP `apply_migration`
-- after preflight_289.sql passes. Never `db push`.
--
-- WHAT THIS SCHEDULES, AND WHAT IT DELIBERATELY DOES NOT
--
--   1. Voucher expiry runner -- NOT scheduled here. It already exists in
--      162_cron_schedule.sql as `ke-expire-vouchers` ('15 23 * * *', HTTP
--      POST to /api/cron/expire-vouchers). Scheduling it again would only
--      upsert the same name; it is referenced here, not duplicated.
--
--   2. Daily revenue aggregation -- `ke-revenue-daily`. Pure SQL, no HTTP, no
--      vault secret: pg_cron calls public.aggregate_daily_revenue() directly.
--
--   3. Search index refresh -- NOT scheduled here, on purpose. Measured in the
--      repo before writing: the drain for public.search_index_outbox (132) is
--      drainSearchOutbox() in src/lib/search/outbox-drain.ts, and its ONLY
--      caller is src/app/api/cron/health/route.ts, which runs it on every
--      health tick. 162 already schedules that route as `ke-health`
--      ('*/5 * * * *'). There is no dedicated search drain route under
--      src/app/api/cron/, so a `ke-search-index-refresh` job has nothing real
--      to call. Pointing a second 5-minute job at /api/cron/health would
--      double the health probes (and their ntfy pages) without draining
--      anything faster. Nothing is invented: once 162 is applied, the outbox
--      drains every five minutes through ke-health. Because no HTTP job is
--      added, this file needs no CRON_SECRET / APP_BASE_URL vault guard.
--
-- MONEY: integer agorot only. Every money column is bigint and named
-- *_ils_agorot; it sums the orders.*_ils_agorot twins (138/147), never the
-- numeric shekel columns. A paid order whose total_ils_agorot is NULL is
-- counted in missing_agorot_count instead of being silently treated as zero.
--
-- WHICH ORDERS COUNT: orders.paid_at is the paid marker -- finalize stamps it
-- exactly once (src/server/payments/finalize.ts) when the order moves
-- pending -> paid, and it survives the later moves to partially_fulfilled,
-- fulfilled, platform_settled, refunded and cancelled. So a "paid order of day
-- D" is `paid_at` inside the Israel-local calendar day D and deleted_at IS
-- NULL, whatever its status is now. Gross counts all of them; the ones now in
-- 'refunded' or 'cancelled' are broken out so net = gross - refunded. This is
-- the same paid_at windowing src/server/analytics/queries.ts uses.
--
-- DAY BOUNDARY AND DST: `day` is an Asia/Jerusalem calendar day, computed in
-- the function with AT TIME ZONE, so the 23-hour and 25-hour days at the DST
-- switches are handled by Postgres, not by the schedule. pg_cron itself runs
-- in UTC. Israel midnight is 22:00 UTC in winter (IST, UTC+2) and 21:00 UTC in
-- summer (IDT, UTC+3). The job runs at 22:30 UTC = 00:30 IST / 01:30 IDT, so
-- it always fires after local midnight and "yesterday" is always a finished
-- day. It does not shift with DST and does not need to.
--
-- IDEMPOTENT: CREATE ... IF NOT EXISTS, CREATE OR REPLACE FUNCTION, guarded
-- CREATE POLICY, ON CONFLICT (day) DO UPDATE in the function, and
-- cron.schedule(jobname, ...) which upserts by name in pg_cron >= 1.4.
-- Re-running the function for any past day recomputes that row from scratch.
--
-- ROLLBACK (whole file):
--   select cron.unschedule('ke-revenue-daily')
--     where exists (select 1 from cron.job where jobname = 'ke-revenue-daily');
--   drop function if exists public.aggregate_daily_revenue(date);
--   drop table    if exists public.revenue_daily;

do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise exception '289: pg_cron is not installed; apply 161 first';
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- The table. Server-only: written by the definer function, read by admin
-- server code on the service key (which bypasses RLS).
-- ---------------------------------------------------------------------------
create table if not exists public.revenue_daily (
  day                         date primary key,
  orders_count                integer not null default 0,
  gross_ils_agorot            bigint  not null default 0,
  subtotal_ils_agorot         bigint  not null default 0,
  discount_ils_agorot         bigint  not null default 0,
  cashback_applied_ils_agorot bigint  not null default 0,
  refunded_orders_count       integer not null default 0,
  refunded_ils_agorot         bigint  not null default 0,
  net_ils_agorot              bigint  not null default 0,
  missing_agorot_count        integer not null default 0,
  computed_at                 timestamptz not null default now(),
  constraint revenue_daily_counts_nonneg check (
    orders_count >= 0 and refunded_orders_count >= 0 and missing_agorot_count >= 0
    and refunded_orders_count <= orders_count
  ),
  constraint revenue_daily_money_nonneg check (
    gross_ils_agorot >= 0 and subtotal_ils_agorot >= 0 and discount_ils_agorot >= 0
    and cashback_applied_ils_agorot >= 0 and refunded_ils_agorot >= 0
  )
);

comment on table public.revenue_daily is
  'One row per Asia/Jerusalem calendar day of paid orders (orders.paid_at), money in integer agorot. Written only by aggregate_daily_revenue(); server-only.';
comment on column public.revenue_daily.missing_agorot_count is
  'Paid orders of the day whose total_ils_agorot is NULL. Nonzero means the agorot backfill missed rows and gross is understated.';

alter table public.revenue_daily enable row level security;

-- Explicit deny-all, same shape as 122: restrictive, both client roles, both
-- directions. The service role bypasses RLS and is unaffected.
do $$
begin
  if not exists (
    select 1 from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'revenue_daily'
      and p.polname = 'deny_all_client_roles'
  ) then
    create policy deny_all_client_roles on public.revenue_daily
      as restrictive to anon, authenticated
      using (false) with check (false);
  end if;
end
$$;

revoke all on public.revenue_daily from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The aggregation. Recomputes one day in full and upserts it.
-- ---------------------------------------------------------------------------
create or replace function public.aggregate_daily_revenue(p_day date)
returns public.revenue_daily
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_from timestamptz;
  v_to   timestamptz;
  v_row  public.revenue_daily;
begin
  if p_day is null then
    raise exception 'aggregate_daily_revenue: p_day is required';
  end if;

  -- Local midnight to local midnight; AT TIME ZONE on a timestamp without
  -- time zone yields the instant of that wall-clock time in Israel.
  v_from := (p_day::timestamp)     at time zone 'Asia/Jerusalem';
  v_to   := ((p_day + 1)::timestamp) at time zone 'Asia/Jerusalem';

  insert into public.revenue_daily as r (
    day, orders_count, gross_ils_agorot, subtotal_ils_agorot,
    discount_ils_agorot, cashback_applied_ils_agorot,
    refunded_orders_count, refunded_ils_agorot, net_ils_agorot,
    missing_agorot_count, computed_at
  )
  select
    p_day,
    count(*)::integer,
    coalesce(sum(o.total_ils_agorot), 0)::bigint,
    coalesce(sum(o.subtotal_ils_agorot), 0)::bigint,
    coalesce(sum(o.discount_ils_agorot), 0)::bigint,
    coalesce(sum(o.cashback_applied_ils_agorot), 0)::bigint,
    (count(*) filter (where o.status in ('refunded', 'cancelled')))::integer,
    coalesce(sum(o.total_ils_agorot) filter (where o.status in ('refunded', 'cancelled')), 0)::bigint,
    (coalesce(sum(o.total_ils_agorot), 0)
      - coalesce(sum(o.total_ils_agorot) filter (where o.status in ('refunded', 'cancelled')), 0))::bigint,
    (count(*) filter (where o.total_ils_agorot is null))::integer,
    now()
  from public.orders o
  where o.paid_at >= v_from
    and o.paid_at <  v_to
    and o.deleted_at is null
  on conflict (day) do update set
    orders_count                = excluded.orders_count,
    gross_ils_agorot            = excluded.gross_ils_agorot,
    subtotal_ils_agorot         = excluded.subtotal_ils_agorot,
    discount_ils_agorot         = excluded.discount_ils_agorot,
    cashback_applied_ils_agorot = excluded.cashback_applied_ils_agorot,
    refunded_orders_count       = excluded.refunded_orders_count,
    refunded_ils_agorot         = excluded.refunded_ils_agorot,
    net_ils_agorot              = excluded.net_ils_agorot,
    missing_agorot_count        = excluded.missing_agorot_count,
    computed_at                 = excluded.computed_at
  returning r.* into v_row;

  return v_row;
end
$$;

comment on function public.aggregate_daily_revenue(date) is
  'Recomputes and upserts public.revenue_daily for one Asia/Jerusalem day from orders.paid_at. Idempotent. Called by pg_cron job ke-revenue-daily; service role only.';

revoke all on function public.aggregate_daily_revenue(date) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- The schedule. 22:30 UTC = 00:30 Israel winter / 01:30 Israel summer.
-- "Yesterday" is evaluated in Israel time at run time, not in UTC.
-- ---------------------------------------------------------------------------
select cron.schedule(
  'ke-revenue-daily',
  '30 22 * * *',
  $cmd$select public.aggregate_daily_revenue(((now() at time zone 'Asia/Jerusalem')::date - 1));$cmd$
);

-- ============================================================================
-- VERIFICATION (after applying)
-- ============================================================================
-- 1. Job is registered once:
--      select jobname, schedule, command from cron.job where jobname = 'ke-revenue-daily';
-- 2. A manual run returns a row and re-running returns the same numbers:
--      select * from public.aggregate_daily_revenue(current_date - 1);
--      select * from public.aggregate_daily_revenue(current_date - 1);
-- 3. Clients are shut out (expect 42501 or zero rows as anon/authenticated):
--      set role anon; select * from public.revenue_daily; reset role;
-- 4. After the first scheduled night:
--      select status, return_message from cron.job_run_details d
--        join cron.job j on j.jobid = d.jobid
--       where j.jobname = 'ke-revenue-daily' order by d.start_time desc limit 3;
-- ============================================================================
