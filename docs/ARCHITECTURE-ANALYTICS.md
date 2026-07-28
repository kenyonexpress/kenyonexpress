# ARCHITECTURE-ANALYTICS.md

KenyonExpress admin analytics architecture (complete binding spec).

Status: BINDING for worktree `/Users/ofir/kenyonexpress-web/ke-admin` · branch `arch/admin-supplier` (2026-07-28)
Scope: **docs only.** No `.ts` / `.tsx` / `.sql` files in this change. DDL below is documentation for future MCP `apply_migration` (next free ≥ 077), not applied here.
Companions: `docs/ARCHITECTURE-ADMIN.md`, `docs/ARCHITECTURE-ADMIN-DASHBOARD.md`, `docs/ARCHITECTURE-CHECKOUT-CARDCOM.md`, `docs/ARCHITECTURE-COUPON-REDEMPTION.md`, `docs/ARCHITECTURE-FULFILLMENT-SUPPLIER-WORKFLOW.md`, `docs/ARCHITECTURE-AI-AGENTS.md`, `docs/ARCHITECTURE-NOTIFICATIONS.md`.

Route: `/admin/analytics` (RBAC: support read **without PII export**; admin / super_admin full including CSV).

---

## 0. Money ground truth (non-negotiable)

| Rule | Analytics implication |
|---|---|
| Revenue / fees | **Only** from ledger: `orders`, `order_items`, `payments`, `settlement_events`, `payout_statement_lines`, `vouchers` / `voucher_redemptions` |
| Behavioral events | Funnel only; **never** sum GMV from clickstream |
| `platform_percent` | Use **snapshotted** columns; never join live `products.platform_percent` for historical KPIs |
| Coupon | Platform prepaid revenue ⊂ on-site `coupon_price` charge × snapshot rules; till remainder is **not** platform GMV and **not** supplier payout from KenyonExpress |
| Physical | Immediate split at settle; supplier due from snapshot residual |
| Escrow | **None**; no escrow_released metrics |
| Units | Integer **agorot** in views; UI formats ₪ |

If a chart and the ledger disagree, the chart is wrong.

---

## 1. Dashboard modules

### 1.1 Sales overview

| KPI | Definition |
|---|---|
| Gross merchandise (on-site) | `sum(payments.amount_agorot)` where succeeded, or sum line `paid_on_site_agorot` for paid orders |
| Platform fees collected | `sum(settlement_events.platform_fee_agorot)` where `event_type = 'payment_settled'` (prefer) or `sum(order_items.commission_agorot)` |
| Orders | count distinct paid `orders.id` |
| AOV | on-site GMV / orders |
| Grain | day / week / month (Israel timezone `Asia/Jerusalem`) |

Filters: product_type (`coupon`\|`physical`), supplier_id, category_id.

### 1.2 Coupon funnel

| Stage | Source |
|---|---|
| Purchased | vouchers issued (or coupon order_items on paid orders) |
| Scanned | `vouchers.status = 'redeemed'` / success rows in `voucher_redemptions` |
| Expired (calendar) | `vouchers.status = 'expired'` |
| Cancelled / refunded | terminal voucher statuses |
| Redemption rate | scanned / purchased (per supplier, per product, per period) |

Till amount collected at merchant is **informational** (`redeemed_amount_collected_agorot`); do not add it into platform revenue.

### 1.3 Supplier leaderboard

| Metric | Definition |
|---|---|
| On-site GMV (their lines) | sum `paid_on_site_agorot` for paid lines of `supplier_id` |
| Platform fees from their lines | sum snapshot `commission_agorot` / settlement `platform_fee_agorot` |
| Supplier due (physical) | sum residual eligible / paid via payout lines |
| Refund rate | refunded line amount / paid line amount |
| Redeem rate (coupon) | redeemed vouchers / issued for that supplier |

Sortable; export CSV admin-only.

### 1.4 Customer cohorts

| Metric | Definition |
|---|---|
| New vs returning | first paid order date vs subsequent |
| LTV | sum on-site paid_agorot per `user_id` lifetime (and trailing 90/180d) |
| Cohort grid | signup or first-purchase month × months since |

No email/phone in aggregate views. Support role: aggregates only; no user-level CSV.

---

## 2. Real-time events pipeline

### 2.1 Split: ledger vs behavior

```
Ledger (authoritative money)
  orders / order_items / payments / settlement_events / vouchers / voucher_redemptions
        │
        │ triggers / finalize hooks
        ▼
  optional analytics_events (purchase, coupon_redeemed): denormalized timeline ONLY

Behavior (lossy)
  view_product, add_to_cart, begin_checkout (client → Edge Function → analytics_events)
```

### 2.2 Dedicated events table vs materialized views

| Store | Use |
|---|---|
| `analytics.analytics_events` (or `public.analytics_events`) | high-volume behavioral + server-emitted timeline |
| Materialized views / aggregate tables | sales_daily, coupon_funnel_daily, supplier_daily, cohort_monthly |
| Refresh | cron every 5–15 min for near-real-time admin; on-demand refresh after heavy admin jobs |

Prefer **aggregate tables maintained by SQL functions** over heavy matviews if concurrent refresh is painful; either is acceptable if documented.

### 2.3 Event envelope (behavioral)

```json
{
  "event_id": "uuid",
  "event_name": "view_product",
  "schema_version": 1,
  "occurred_at": "ISO-8601",
  "session_id": "opaque",
  "user_id": null,
  "consent": true,
  "props": { "product_id": "uuid", "product_type": "coupon" }
}
```

No PII in props. Money in events is copy-only with `order_id` reference.

---

## 3. Exact table / view definitions

Documentation DDL. Names use schema `analytics` to keep PostgREST surface explicit (expose only via service/admin).

```sql
-- Documentation only. MCP apply_migration later (ordinal ≥ 077, next free).

create schema if not exists analytics;

revoke all on schema analytics from public, anon, authenticated;
grant usage on schema analytics to service_role;

-- ---------------------------------------------------------------------------
-- 3.1 Raw behavioral + timeline events
-- ---------------------------------------------------------------------------

create table if not exists analytics.analytics_events (
  event_id       uuid primary key,
  event_name     text not null,
  schema_version int  not null default 1,
  occurred_at    timestamptz not null,
  ingested_at    timestamptz not null default now(),
  session_id     text,
  user_id        uuid,
  consent        boolean not null default false,
  app            text not null default 'web',
  page_path      text,
  referrer_host  text,
  props          jsonb not null default '{}'::jsonb
);

create index if not exists analytics_events_occurred_idx
  on analytics.analytics_events (occurred_at desc);
create index if not exists analytics_events_name_time_idx
  on analytics.analytics_events (event_name, occurred_at desc);
create index if not exists analytics_events_user_time_idx
  on analytics.analytics_events (user_id, occurred_at desc)
  where user_id is not null;

-- ---------------------------------------------------------------------------
-- 3.2 Daily sales aggregate (ledger-backed)
-- ---------------------------------------------------------------------------

create table if not exists analytics.sales_daily (
  day                    date not null,
  product_type           text not null check (product_type in ('coupon','physical','all')),
  supplier_id            uuid, -- null = all suppliers
  orders_count           bigint not null default 0,
  gmv_on_site_agorot     bigint not null default 0,
  platform_fee_agorot    bigint not null default 0,
  supplier_due_agorot    bigint not null default 0,
  refund_agorot          bigint not null default 0,
  primary key (day, product_type, supplier_id)
);

create index if not exists sales_daily_day_idx on analytics.sales_daily (day desc);

-- ---------------------------------------------------------------------------
-- 3.3 Coupon funnel daily
-- ---------------------------------------------------------------------------

create table if not exists analytics.coupon_funnel_daily (
  day                 date not null,
  supplier_id         uuid, -- null = platform-wide
  purchased_count     bigint not null default 0,
  scanned_count       bigint not null default 0,
  expired_count       bigint not null default 0,
  cancelled_count     bigint not null default 0,
  till_collected_agorot bigint not null default 0, -- informational
  primary key (day, supplier_id)
);

-- ---------------------------------------------------------------------------
-- 3.4 Supplier leaderboard daily
-- ---------------------------------------------------------------------------

create table if not exists analytics.supplier_daily (
  day                  date not null,
  supplier_id          uuid not null references public.suppliers(id),
  gmv_on_site_agorot   bigint not null default 0,
  platform_fee_agorot  bigint not null default 0,
  supplier_due_agorot  bigint not null default 0,
  refund_agorot        bigint not null default 0,
  vouchers_issued      bigint not null default 0,
  vouchers_redeemed    bigint not null default 0,
  primary key (day, supplier_id)
);

-- ---------------------------------------------------------------------------
-- 3.5 Customer cohort monthly
-- ---------------------------------------------------------------------------

create table if not exists analytics.customer_cohort_monthly (
  cohort_month         date not null, -- date_trunc('month', first_paid_at)::date
  months_since         int  not null check (months_since >= 0),
  customers_active     bigint not null default 0,
  gmv_on_site_agorot   bigint not null default 0,
  primary key (cohort_month, months_since)
);

-- ---------------------------------------------------------------------------
-- 3.6 Refresh helper (sketch)
-- ---------------------------------------------------------------------------

-- analytics.refresh_sales_daily(p_from date, p_to date)
--   DELETE/UPSERT from settlement_events / order_items for paid orders in range.
-- analytics.refresh_coupon_funnel_daily(...)
-- analytics.refresh_supplier_daily(...)
-- analytics.refresh_cohorts(...)
-- Scheduled via pg_cron or Vercel cron calling SECURITY DEFINER RPCs.
```

### 3.7 Read models (views)

```sql
-- Platform sales last 30 days (admin UI default)
create or replace view analytics.v_sales_overview_30d
with (security_invoker = true)
as
select
  day,
  sum(orders_count) filter (where product_type = 'all') as orders_count,
  sum(gmv_on_site_agorot) filter (where product_type = 'all') as gmv_on_site_agorot,
  sum(platform_fee_agorot) filter (where product_type = 'all') as platform_fee_agorot,
  case when sum(orders_count) filter (where product_type = 'all') > 0
    then (sum(gmv_on_site_agorot) filter (where product_type = 'all'))
         / (sum(orders_count) filter (where product_type = 'all'))
    else 0 end as aov_agorot
from analytics.sales_daily
where day >= (timezone('Asia/Jerusalem', now())::date - 30)
  and supplier_id is null
group by day
order by day;

-- Coupon funnel rates by supplier (30d)
create or replace view analytics.v_coupon_funnel_30d
with (security_invoker = true)
as
select
  supplier_id,
  sum(purchased_count) as purchased_count,
  sum(scanned_count) as scanned_count,
  sum(expired_count) as expired_count,
  case when sum(purchased_count) > 0
    then sum(scanned_count)::numeric / sum(purchased_count)
    else 0 end as redemption_rate
from analytics.coupon_funnel_daily
where day >= (timezone('Asia/Jerusalem', now())::date - 30)
group by supplier_id;

-- Supplier leaderboard 30d
create or replace view analytics.v_supplier_leaderboard_30d
with (security_invoker = true)
as
select
  s.id as supplier_id,
  s.name as supplier_name,
  sum(d.gmv_on_site_agorot) as gmv_on_site_agorot,
  sum(d.platform_fee_agorot) as platform_fee_agorot,
  sum(d.supplier_due_agorot) as supplier_due_agorot,
  sum(d.refund_agorot) as refund_agorot,
  case when sum(d.gmv_on_site_agorot) > 0
    then sum(d.refund_agorot)::numeric / sum(d.gmv_on_site_agorot)
    else 0 end as refund_rate,
  case when sum(d.vouchers_issued) > 0
    then sum(d.vouchers_redeemed)::numeric / sum(d.vouchers_issued)
    else null end as coupon_redemption_rate
from analytics.supplier_daily d
join public.suppliers s on s.id = d.supplier_id
where d.day >= (timezone('Asia/Jerusalem', now())::date - 30)
group by s.id, s.name
order by gmv_on_site_agorot desc;

-- Ledger-correct platform fee from settlement (sanity check vs aggregates)
create or replace view analytics.v_settlement_fees_daily
with (security_invoker = true)
as
select
  (timezone('Asia/Jerusalem', se.created_at))::date as day,
  se.product_type,
  se.supplier_id,
  sum(se.platform_fee_agorot) as platform_fee_agorot,
  sum(se.paid_on_site_agorot) as paid_on_site_agorot,
  sum(se.supplier_due_agorot) as supplier_due_agorot
from public.settlement_events se
where se.event_type = 'payment_settled'
group by 1, 2, 3;
```

If `settlement_events` is not yet migrated, temporary fallback: `order_items.commission_agorot` on paid orders only, with a dashboard banner “pre-settlement_events”.

### 3.8 Rebuild sales_daily from ledger (reference query)

```sql
-- Reference UPSERT body for analytics.refresh_sales_daily (documentation)
with paid as (
  select o.id as order_id, o.paid_at
  from public.orders o
  where o.status = 'paid'
    and o.paid_at >= $1 and o.paid_at < $2
),
lines as (
  select
    (timezone('Asia/Jerusalem', p.paid_at))::date as day,
    oi.product_type::text as product_type,
    oi.supplier_id,
    oi.order_id,
    oi.paid_on_site_agorot,
    oi.commission_agorot as platform_fee_agorot,
    greatest(oi.paid_on_site_agorot - oi.commission_agorot, 0) as supplier_due_agorot
  from public.order_items oi
  join paid p on p.order_id = oi.order_id
)
select day, product_type, supplier_id,
       count(distinct order_id) as orders_count,
       sum(paid_on_site_agorot) as gmv_on_site_agorot,
       sum(platform_fee_agorot) as platform_fee_agorot,
       sum(supplier_due_agorot) as supplier_due_agorot
from lines
group by 1, 2, 3;
-- Also insert product_type = 'all' and supplier_id null rollups in the function.
```

---

## 4. Query performance strategy

| Technique | Application |
|---|---|
| Indexes | `orders (status, paid_at)`, `order_items (supplier_id, order_id)`, `settlement_events (created_at, supplier_id)`, `vouchers (supplier_id, status)`, `voucher_redemptions (created_at, supplier_id, outcome)` |
| Aggregation tables | §3; UI reads `analytics.*_daily` not raw scans |
| Partitioning | optional later on `analytics_events` by month |
| Timezone | compute buckets in `Asia/Jerusalem` once at refresh |
| Concurrency | refresh functions `SECURITY DEFINER`, single-flight advisory lock |
| Caching | RSC admin pages `revalidate` 60–300s; manual refresh button for admin |

Explain budgets: any interactive query &gt; 500ms on warm cache is a bug; fix with aggregates.

---

## 5. Export to CSV

| Export | Who | Columns |
|---|---|---|
| Sales daily | admin+ | day, gmv, fees, orders, aov (ILS formatted in export layer) |
| Coupon funnel | admin+ | supplier, purchased, scanned, rate |
| Supplier leaderboard | admin+ | metrics in §1.3 |
| User-level LTV | **super_admin only** | user_id uuid only + aggregates; no email in file unless separate identity export with legal basis |

Rules:

- Support role: **no CSV** (UI read-only aggregates).
- All money columns exported as integer agorot **and** a parallel ILS column with 2 decimals.
- Watermark filename with timestamp + actor user id in `audit_log`.
- Cap rows (e.g. 100k) or stream; never block HTTP 60s+.

---

## 6. UI wiring (admin)

- `/admin/analytics`: tabs Sales | Coupons | Suppliers | Cohorts.
- Hebrew RTL; numbers `he-IL`.
- Empty states when refresh never ran.
- Cross-check widget: `sum(platform_fee)` from `v_settlement_fees_daily` vs `sales_daily` (diff alert if &gt; 0.5%).

Out of scope for Admin Core MVP polish: full BI warehouse, Hashavshevet sync (**Q-ADMIN-5**).

---

## 7. Privacy

- No full IP in analytics_events (hash or drop); redemption fraud IPs stay in `voucher_redemptions` under security retention, not open analytics CSV.
- Consent: behavioral client events require `ke_consent`; ledger metrics do not need marketing consent.
- RLS: `analytics` schema not granted to `anon`/`authenticated`; admin UI uses service role **after** `requireSection('analytics', read|write)`.

---

## 8. Acceptance checklist

- [ ] GMV/fees match ledger within tolerance
- [ ] Coupon till not counted as platform revenue
- [ ] Snapshots only for historical percent
- [ ] Funnel purchased → scanned → expired per supplier
- [ ] Leaderboard + cohorts from aggregates
- [ ] CSV gated by role; support cannot export PII
- [ ] Refresh job + indexes documented; no Escrow metrics

---

## 9. Open questions

| ID | Question |
|---|---|
| Q-AN-SCHEMA | `analytics` schema vs `public` prefix `analytics_` |
| Q-AN-REFRESH | 5 vs 15 min cron |
| Q-AN-MATVIEW | matview vs upsert tables |
| Q-AN-MIG | first free ordinal ≥ 077 |

---

## 10. Related

`ARCHITECTURE-ADMIN-DASHBOARD.md` § analytics, `ARCHITECTURE-AI-AGENTS.md` (stats tools), `ARCHITECTURE-CHECKOUT-CARDCOM.md` (`settlement_events`), `ARCHITECTURE-COUPON-REDEMPTION.md` (funnel scanned).
