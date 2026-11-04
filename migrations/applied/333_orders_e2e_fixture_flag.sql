-- 333_orders_e2e_fixture_flag.sql (C202)
--
-- Production holds 1032 orders, and on 2026-11-04 every one of them came from
-- the E2E suite: 714 from e2e-customer@test.kenyonexpress.local, 4 from
-- checkout-e2e@kenyonexpress.test, 314 from anonymous guest-checkout sessions
-- whose every line is an e2e-test-* product. They were inflating the admin
-- dashboards, the report_* tables, revenue_daily and the voucher KPIs.
--
-- This adds orders.is_e2e_fixture, sets it automatically for future fixture
-- orders (fixture account, or a line on an e2e-test-* product), and makes the
-- two report functions skip flagged rows. Nothing is deleted. The quarantine of
-- existing rows is 334.
--
-- Idempotent. Apply: supabase db query --linked -f migrations/applied/333_orders_e2e_fixture_flag.sql

begin;

alter table public.orders
  add column if not exists is_e2e_fixture boolean not null default false;

comment on column public.orders.is_e2e_fixture is
  'C202: order created by the E2E suite. Excluded from analytics, report_* tables, revenue_daily, voucher KPIs and admin dashboards.';

-- The fixture accounts e2e/auth-session.ts signs in with, plus the older
-- checkout-e2e and e2e-admin accounts. Matching the same patterns C202 used to
-- find them in production.
create or replace function public.fn_is_e2e_fixture_user(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from auth.users u
    where u.id = p_user
      and (u.email ilike '%@test.kenyonexpress.local'
           or u.email ilike '%e2e%@kenyonexpress.%')
  )
$$;

revoke execute on function public.fn_is_e2e_fixture_user(uuid) from public, anon, authenticated;

create or replace function public.tg_orders_flag_e2e_fixture()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if public.fn_is_e2e_fixture_user(new.user_id) then
    new.is_e2e_fixture := true;
  end if;
  return new;
end
$$;

drop trigger if exists tg_orders_flag_e2e_fixture on public.orders;
create trigger tg_orders_flag_e2e_fixture
  before insert on public.orders
  for each row execute function public.tg_orders_flag_e2e_fixture();

-- Guest checkout has no fixture account to match on, so the line decides: an
-- order that contains an e2e-test-* product is a fixture order. Flag only, the
-- status is left alone.
create or replace function public.tg_order_items_flag_e2e_fixture()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.products p
             where p.id = new.product_id and p.slug like 'e2e-test-%') then
    update public.orders set is_e2e_fixture = true
     where id = new.order_id and not is_e2e_fixture;
  end if;
  return new;
end
$$;

drop trigger if exists tg_order_items_flag_e2e_fixture on public.order_items;
create trigger tg_order_items_flag_e2e_fixture
  after insert on public.order_items
  for each row execute function public.tg_order_items_flag_e2e_fixture();

revoke execute on function public.tg_orders_flag_e2e_fixture() from public, anon, authenticated;
revoke execute on function public.tg_order_items_flag_e2e_fixture() from public, anon, authenticated;

-- Report functions: unchanged except "and not o.is_e2e_fixture" after every
-- "o.deleted_at is null" (1 in aggregate_daily_revenue, 4 in refresh_report_tables).
CREATE OR REPLACE FUNCTION public.aggregate_daily_revenue(p_day date)
 RETURNS revenue_daily
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    and o.deleted_at is null and not o.is_e2e_fixture
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
$function$;

CREATE OR REPLACE FUNCTION public.refresh_report_tables()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_now timestamptz := now();
begin
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
    and o.deleted_at is null and not o.is_e2e_fixture
    and o.status in ('paid'::public.order_status,
                     'partially_fulfilled'::public.order_status,
                     'fulfilled'::public.order_status,
                     'platform_settled'::public.order_status)
  group by 1;

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
  where o.deleted_at is null and not o.is_e2e_fixture
  group by 1;

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
      and o.deleted_at is null and not o.is_e2e_fixture
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

  delete from public.report_cohort_retention;
  insert into public.report_cohort_retention
    (cohort_month, month_offset, cohort_size, active_users, refreshed_at)
  with paid_user_months as (
    select
      o.user_id,
      (date_trunc('month', o.paid_at at time zone 'Asia/Jerusalem'))::date as order_month
    from public.orders o
    where o.paid_at is not null
      and o.deleted_at is null and not o.is_e2e_fixture
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
$function$;

commit;
