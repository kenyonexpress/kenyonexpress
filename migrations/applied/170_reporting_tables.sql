-- 170: denormalized reporting tables, refreshed nightly by pg_cron, read
-- through admin-only RPCs.
--
-- ✅ APPLIED 2026-09-04 via MCP as `reporting_tables_170`, on the explicit
-- instruction of the /goal that requested it (same precedent as 169).
-- Validated first end-to-end against production inside a rolled-back
-- transaction (tables, functions, cron schedule, full refresh over real
-- orders), then applied; row counts, the cron job, and the 42501 deny path
-- for a non-admin caller were all verified after. The file stays here as the
-- record, like 122-147 and 169.
--
-- WHY DENORMALIZED TABLES AND NOT VIEWS
--
-- The admin dashboards need revenue-per-day, orders-per-day, top products and
-- cohort retention. Computing cohort retention live walks every paid order of
-- every user on every page view; a nightly snapshot walks it once. The tables
-- are tiny (one row per day / per rank / per cohort-month), rebuilt
-- wholesale inside one transaction, and each row carries the refreshed_at of
-- the rebuild so the UI can say how stale the numbers are.
--
-- MONEY IS INTEGER AGOROT ONLY (project rule). Every money column here is
-- bigint and every source read is a *_agorot generated column (138 lineage,
-- verified present in production on 2026-09-04: orders.subtotal_ils_agorot,
-- orders.discount_ils_agorot, orders.cashback_applied_ils_agorot,
-- orders.total_ils_agorot, order_items.total_price_ils_agorot). No numeric,
-- no float, anywhere in this file.
--
-- DAYS ARE ISRAEL DAYS. Same stance as
-- src/server/domain/reports/settlement-report.ts: a UTC-midnight bucket puts
-- the first three hours of every Israel day in yesterday's row. Every bucket
-- here is (ts AT TIME ZONE 'Asia/Jerusalem')::date.
--
-- WHAT COUNTS AS REVENUE. Orders with paid_at set, deleted_at null, and
-- status in (paid, partially_fulfilled, fulfilled, platform_settled),
-- bucketed by paid_at. Refunded and cancelled orders are excluded from the
-- revenue and top-product reports (conservative: the refund console owns
-- those numbers); they still appear in report_orders_daily as their own
-- counts, because that report is about order flow, not money.
--
-- ACCESS MODEL. RLS is enabled with ZERO policies on all four tables, the
-- same deliberate service-role-only lock settlement_events uses (measured
-- 2026-08-06, documented in src/server/queries/reports.ts). Clients never
-- read the tables directly; they call the admin_report_* RPCs, which are
-- SECURITY DEFINER and refuse before their first read unless
-- public.is_admin() (which reads auth.uid() from the JWT, not a parameter,
-- so it is not the definer-uid trap 143/145 cleaned up).
--
-- TABLE SHAPE DEVIATION, on purpose: these are rebuilt-nightly aggregates
-- with natural primary keys (day / window+rank / cohort+offset), so they do
-- not get the standard uuid id + created_at + updated_at columns. A synthetic
-- id on a row that is deleted and reinserted every night identifies nothing.
-- refreshed_at is the only timestamp that means anything here.
--
-- ROLLBACK
--   select cron.unschedule('report_tables_nightly');
--   drop function if exists public.admin_refresh_reports();
--   drop function if exists public.admin_report_revenue_daily(date, date);
--   drop function if exists public.admin_report_orders_daily(date, date);
--   drop function if exists public.admin_report_top_products(integer);
--   drop function if exists public.admin_report_cohort_retention();
--   drop function if exists public.refresh_report_tables();
--   drop table if exists public.report_revenue_daily;
--   drop table if exists public.report_orders_daily;
--   drop table if exists public.report_top_products;
--   drop table if exists public.report_cohort_retention;

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

create table if not exists public.report_revenue_daily (
  day                     date primary key,
  orders_count            integer not null default 0,
  gross_agorot            bigint  not null default 0,
  discount_agorot         bigint  not null default 0,
  cashback_applied_agorot bigint  not null default 0,
  net_agorot              bigint  not null default 0,
  refreshed_at            timestamptz not null default now()
);

create table if not exists public.report_orders_daily (
  day             date primary key,
  total_orders    integer not null default 0,
  pending_count   integer not null default 0,
  paid_count      integer not null default 0,
  cancelled_count integer not null default 0,
  refunded_count  integer not null default 0,
  refreshed_at    timestamptz not null default now()
);

create table if not exists public.report_top_products (
  window_days     integer not null,
  rank            integer not null,
  product_id      uuid    not null,
  product_name_he text,
  supplier_id     uuid,
  units_sold      bigint  not null default 0,
  revenue_agorot  bigint  not null default 0,
  refreshed_at    timestamptz not null default now(),
  primary key (window_days, rank),
  constraint report_top_products_window_check check (window_days in (7, 30, 90))
);

create table if not exists public.report_cohort_retention (
  cohort_month  date    not null,
  month_offset  integer not null,
  cohort_size   integer not null default 0,
  active_users  integer not null default 0,
  refreshed_at  timestamptz not null default now(),
  primary key (cohort_month, month_offset),
  constraint report_cohort_offset_check check (month_offset >= 0)
);

-- RLS on, zero policies: nothing reads these but the definer RPCs below.
alter table public.report_revenue_daily    enable row level security;
alter table public.report_orders_daily     enable row level security;
alter table public.report_top_products     enable row level security;
alter table public.report_cohort_retention enable row level security;

revoke all on public.report_revenue_daily    from anon, authenticated;
revoke all on public.report_orders_daily     from anon, authenticated;
revoke all on public.report_top_products     from anon, authenticated;
revoke all on public.report_cohort_retention from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. The refresh: one transaction, wholesale rebuild
-- ---------------------------------------------------------------------------

create or replace function public.refresh_report_tables()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := now();
begin
  -- Revenue per Israel day of payment.
  delete from public.report_revenue_daily;
  insert into public.report_revenue_daily
    (day, orders_count, gross_agorot, discount_agorot, cashback_applied_agorot,
     net_agorot, refreshed_at)
  select
    (o.paid_at at time zone 'Asia/Jerusalem')::date,
    count(*)::integer,
    coalesce(sum(o.subtotal_ils_agorot), 0),
    coalesce(sum(o.discount_ils_agorot), 0),
    coalesce(sum(o.cashback_applied_ils_agorot), 0),
    coalesce(sum(o.total_ils_agorot), 0),
    v_now
  from public.orders o
  where o.paid_at is not null
    and o.deleted_at is null
    and o.status in ('paid'::public.order_status,
                     'partially_fulfilled'::public.order_status,
                     'fulfilled'::public.order_status,
                     'platform_settled'::public.order_status)
  group by 1;

  -- Order flow per Israel day of creation, every status counted somewhere.
  delete from public.report_orders_daily;
  insert into public.report_orders_daily
    (day, total_orders, pending_count, paid_count, cancelled_count,
     refunded_count, refreshed_at)
  select
    (o.created_at at time zone 'Asia/Jerusalem')::date,
    count(*)::integer,
    (count(*) filter (where o.status = 'pending'::public.order_status))::integer,
    (count(*) filter (where o.status in ('paid'::public.order_status,
                                         'partially_fulfilled'::public.order_status,
                                         'fulfilled'::public.order_status,
                                         'platform_settled'::public.order_status)))::integer,
    (count(*) filter (where o.status = 'cancelled'::public.order_status))::integer,
    (count(*) filter (where o.status = 'refunded'::public.order_status))::integer,
    v_now
  from public.orders o
  where o.deleted_at is null
  group by 1;

  -- Top 20 products by item revenue over trailing 7 / 30 / 90 days.
  -- Item-level exclusions on top of the order-level ones: a cancelled or
  -- refunded line inside an otherwise-paid order is not revenue.
  delete from public.report_top_products;
  insert into public.report_top_products
    (window_days, rank, product_id, product_name_he, supplier_id, units_sold,
     revenue_agorot, refreshed_at)
  select
    w.window_days, ranked.rank, ranked.product_id, ranked.name_he,
    ranked.supplier_id, ranked.units, ranked.revenue, v_now
  from (values (7), (30), (90)) as w(window_days)
  cross join lateral (
    select
      oi.product_id,
      p.name_he,
      p.supplier_id,
      coalesce(sum(oi.quantity), 0)::bigint as units,
      coalesce(sum(oi.total_price_ils_agorot), 0)::bigint as revenue,
      row_number() over (
        order by coalesce(sum(oi.total_price_ils_agorot), 0) desc,
                 coalesce(sum(oi.quantity), 0) desc,
                 oi.product_id
      )::integer as rank
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    join public.products p on p.id = oi.product_id
    where o.paid_at is not null
      and o.paid_at >= v_now - make_interval(days => w.window_days)
      and o.deleted_at is null
      and oi.deleted_at is null
      and o.status in ('paid'::public.order_status,
                       'partially_fulfilled'::public.order_status,
                       'fulfilled'::public.order_status,
                       'platform_settled'::public.order_status)
      and oi.item_status not in ('cancelled'::public.order_item_status,
                                 'refunded'::public.order_item_status)
    group by oi.product_id, p.name_he, p.supplier_id
    order by revenue desc, units desc, oi.product_id
    limit 20
  ) ranked;

  -- Cohort retention: cohort = Israel month of the user's first paid order,
  -- active = at least one paid order in cohort_month + month_offset.
  -- month_offset 0 is the cohort month itself, so every cohort has an
  -- offset-0 row with active_users = cohort_size.
  delete from public.report_cohort_retention;
  insert into public.report_cohort_retention
    (cohort_month, month_offset, cohort_size, active_users, refreshed_at)
  with paid_user_months as (
    select
      o.user_id,
      (date_trunc('month', o.paid_at at time zone 'Asia/Jerusalem'))::date as order_month
    from public.orders o
    where o.paid_at is not null
      and o.deleted_at is null
      and o.user_id is not null
      and o.status in ('paid'::public.order_status,
                       'partially_fulfilled'::public.order_status,
                       'fulfilled'::public.order_status,
                       'platform_settled'::public.order_status)
    group by o.user_id, 2
  ),
  firsts as (
    select user_id, min(order_month) as cohort_month
    from paid_user_months
    group by user_id
  ),
  cohort_sizes as (
    select cohort_month, count(*)::integer as cohort_size
    from firsts
    group by cohort_month
  )
  select
    f.cohort_month,
    ((extract(year from pum.order_month) - extract(year from f.cohort_month)) * 12
      + (extract(month from pum.order_month) - extract(month from f.cohort_month)))::integer
      as month_offset,
    cs.cohort_size,
    count(distinct pum.user_id)::integer as active_users,
    v_now
  from paid_user_months pum
  join firsts f on f.user_id = pum.user_id
  join cohort_sizes cs on cs.cohort_month = f.cohort_month
  group by f.cohort_month, month_offset, cs.cohort_size;
end;
$$;

revoke all on function public.refresh_report_tables() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. Admin RPCs: the only read path
--
-- SECURITY DEFINER + an is_admin() gate on the first line. is_admin() reads
-- auth.uid() from the request JWT; there is no caller-supplied uid parameter
-- anywhere here.
-- ---------------------------------------------------------------------------

create or replace function public.admin_report_revenue_daily(
  p_from date default null,
  p_to   date default null
)
returns setof public.report_revenue_daily
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    select * from public.report_revenue_daily r
    where (p_from is null or r.day >= p_from)
      and (p_to   is null or r.day <= p_to)
    order by r.day desc
    limit 400;
end;
$$;

create or replace function public.admin_report_orders_daily(
  p_from date default null,
  p_to   date default null
)
returns setof public.report_orders_daily
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    select * from public.report_orders_daily r
    where (p_from is null or r.day >= p_from)
      and (p_to   is null or r.day <= p_to)
    order by r.day desc
    limit 400;
end;
$$;

create or replace function public.admin_report_top_products(
  p_window_days integer default 30
)
returns setof public.report_top_products
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  if p_window_days not in (7, 30, 90) then
    raise exception 'window_days must be 7, 30 or 90' using errcode = '22023';
  end if;
  return query
    select * from public.report_top_products r
    where r.window_days = p_window_days
    order by r.rank;
end;
$$;

create or replace function public.admin_report_cohort_retention()
returns setof public.report_cohort_retention
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  return query
    select * from public.report_cohort_retention r
    order by r.cohort_month desc, r.month_offset;
end;
$$;

-- Manual refresh from the admin UI, for "the numbers look stale" moments.
-- Returns the new refreshed_at so the caller can show it.
create or replace function public.admin_refresh_reports()
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;
  perform public.refresh_report_tables();
  return (select max(refreshed_at) from public.report_revenue_daily);
end;
$$;

revoke all on function public.admin_report_revenue_daily(date, date) from public, anon;
revoke all on function public.admin_report_orders_daily(date, date)  from public, anon;
revoke all on function public.admin_report_top_products(integer)     from public, anon;
revoke all on function public.admin_report_cohort_retention()        from public, anon;
revoke all on function public.admin_refresh_reports()                from public, anon;

grant execute on function public.admin_report_revenue_daily(date, date) to authenticated;
grant execute on function public.admin_report_orders_daily(date, date)  to authenticated;
grant execute on function public.admin_report_top_products(integer)     to authenticated;
grant execute on function public.admin_report_cohort_retention()        to authenticated;
grant execute on function public.admin_refresh_reports()                to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Nightly schedule. pg_cron 1.6.4 is installed in production (verified
-- 2026-09-04); the guard keeps this file loadable on a database without it.
-- 01:30 UTC is 03:30 IST / 04:30 IDT: after the trading day, before anyone
-- reads a dashboard. cron.job was empty before this file, so the jobname
-- cannot collide with anything; the unschedule guard keeps a re-run clean.
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (select 1 from cron.job where jobname = 'report_tables_nightly') then
      perform cron.unschedule('report_tables_nightly');
    end if;
    perform cron.schedule(
      'report_tables_nightly',
      '30 1 * * *',
      'select public.refresh_report_tables()'
    );
  end if;
end;
$$;

-- First population, so the tables are never empty between apply and the first
-- nightly run.
select public.refresh_report_tables();
