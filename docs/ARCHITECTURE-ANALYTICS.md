# ARCHITECTURE-ANALYTICS.md

KenyonExpress admin analytics architecture (complete binding spec).

Status: BINDING for worktree `/Users/ofir/kenyonexpress-web/ke-admin` · branch `arch/admin-supplier` (2026-07-29)
Scope: **docs only.** Zero `.ts` / `.tsx` / `.sql` files in this change. Table/view DDL below is **specification** for later MCP `apply_migration` only.
Companions: `docs/ARCHITECTURE-ADMIN.md`, `docs/ARCHITECTURE-CHECKOUT-CARDCOM.md`, `docs/ARCHITECTURE-COUPON-REDEMPTION.md`, `docs/ARCHITECTURE-SUPPLIER-PORTAL.md`, `docs/ARCHITECTURE-NOTIFICATIONS.md`, `docs/ARCHITECTURE-AI-AGENTS.md`, `docs/ARCHITECTURE-FULFILLMENT-SUPPLIER-WORKFLOW.md`.

Route: `/admin/analytics` (admin / super_admin full; support read **without** money or PII export).

---

## 0. Money and measurement rules

| Rule | Analytics implication |
|---|---|
| Agorot internally | All marts store **bigint agorot**; UI divides by 100 for ₪ |
| `platform_percent` snapshotted | Fees from `order_items` / `settlement_events`, never live `products.platform_percent` |
| Coupon | GMV online = sum `coupon_price` / `paid_on_site` for coupon lines; till remainder is **not** platform revenue |
| Physical | Platform fee = snapshotted commission; supplier due = residual |
| **No Escrow** | No escrow balance KPIs; do not chart “escrow released” |
| Behavioral vs finance | Funnel/events ≠ GMV. **Never** sum revenue from `analytics_events` |

`canSeeMoney(role)` = admin tier only. Support may see counts (orders, scans) but not fee/revenue columns or CSV money exports.

---

## 1. Dashboards (admin UI)

### 1.1 Sales overview

| Metric | Definition | Grain |
|---|---|---|
| Gross online revenue | `sum(paid_on_site_agorot)` for paid orders | day / week / month |
| Orders | count distinct `orders.id` with `status in ('paid','fulfilled',… paid family)` | same |
| AOV | revenue / orders | same |
| Platform fees | `sum(commission_agorot)` or `settlement_events.platform_fee_agorot` | same |
| Supplier due (physical) | `sum(supplier_due)` physical lines only | same |
| Coupon till (informational) | `sum(balance_due_agorot)` coupon lines; **not** KE cash | same |

Filters: date range (IL timezone), product_type, supplier_id, category_id.

### 1.2 Coupon funnel

```
purchased (voucher issued on paid)
  → scanned (status redeemed / success redemption)
  → expired_calendar (status expired without redeem)
  → cancelled / refunded
```

KPIs:

- Redemption rate = redeemed / issued (per supplier, per product, per period)
- Time-to-redeem median
- Already_redeemed / rate_limited / not_found attempt rates (ops)

Sources: `vouchers`, `voucher_redemptions` / `v_redemption_events`.

### 1.3 Supplier leaderboard

| Column | Source |
|---|---|
| Supplier name | `suppliers` |
| Online GMV (their lines) | `order_items.paid_on_site_agorot` |
| Platform fees collected | `commission_agorot` snapshot |
| Physical supplier due | residual |
| Refund rate | refunded line amount / paid line amount |
| Coupon redemption rate | vouchers redeemed / issued for supplier |
| Open unshipped physical | fulfillment statuses |

Sort: GMV or fees; admin only for money sorts.

### 1.4 Customer cohorts

| Cohort | Definition |
|---|---|
| New | first paid order in period |
| Returning | paid order with prior paid order before period |
| LTV | sum `paid_on_site` across life (customer JWT subject); **no** till amounts |
| Order count buckets | 1 / 2–4 / 5+ (aligns wallet 5th-order cashback ops) |

PII: cohort charts use internal `user_id` hashes in exports for support; admin CSV may include email only with audit + `canSeeMoney` path (**Q-AN-PII**).

---

## 2. Real-time events pipeline

### 2.1 Two lanes

| Lane | Store | Use |
|---|---|---|
| **Finance ledger** | `orders`, `order_items`, `payments`, `settlement_events`, `vouchers`, `voucher_redemptions` | Revenue, fees, funnels that need money truth |
| **Behavioral events** | `analytics.analytics_events` (or `public.analytics_events`) | Page views, ATC, begin_checkout (funnel UX only) |

### 2.2 Ingest

```
Browser / app (consent gated)
  → edge ingest (anon key + bot filter)
  → analytics_events append-only
  → nightly / hourly rollup jobs → mart tables
```

Finance lane updates on Cardcom finalize and redeem RPC (already authoritative). Optional `NOTIFY` / trigger → refresh concurrent materialized views.

### 2.3 Materialized views vs tables

| Pattern | When |
|---|---|
| **Materialized view** | Pure rollup from ledger; refresh hourly (`sales_daily_mv`) |
| **Aggregation table** | Incremental upsert from cron (`mart_sales_daily`) for predictable PK and CSV |
| **Dedicated events table** | High-volume behavioral clickstream |

Binding default: **aggregation tables** for admin dashboards (stable, indexable); MVs optional for heavy ad-hoc.

---

## 3. Exact table / view definitions (specification)

> Apply later via Supabase MCP `apply_migration` only. **Do not** commit `.sql` files in this docs change. Ordinal = next free ≥ 077 (**Q-AN-MIG**).

### 3.1 Behavioral events

```sql
create schema if not exists analytics;

create table if not exists analytics.analytics_events (
  id              bigint generated always as identity primary key,
  occurred_at     timestamptz not null default now(),
  event_name      text not null,
  session_id      text,
  user_id         uuid,
  anon_id         text,
  path            text,
  product_id      uuid,
  supplier_id     uuid,
  props           jsonb not null default '{}'::jsonb,
  is_bot          boolean not null default false,
  is_internal     boolean not null default false
);

create index if not exists analytics_events_occurred_idx
  on analytics.analytics_events (occurred_at desc);
create index if not exists analytics_events_name_time_idx
  on analytics.analytics_events (event_name, occurred_at desc);
```

### 3.2 Sales daily mart

```sql
create table if not exists analytics.mart_sales_daily (
  day               date not null,
  product_type      text not null check (product_type in ('coupon', 'physical', 'service', 'all')),
  supplier_id       uuid,                 -- null = all suppliers rollup row
  orders_count      bigint not null default 0,
  paid_on_site_agorot bigint not null default 0,
  platform_fee_agorot bigint not null default 0,
  supplier_due_agorot bigint not null default 0,
  balance_due_agorot  bigint not null default 0,  -- coupon till (informational)
  aov_agorot        bigint not null default 0,
  primary key (day, product_type, supplier_id)
);

create index if not exists mart_sales_daily_day_idx
  on analytics.mart_sales_daily (day desc);
```

Rebuild sketch (job, not trigger-heavy):

```sql
-- SPEC: truncate+reload or upsert for [day]
insert into analytics.mart_sales_daily (
  day, product_type, supplier_id,
  orders_count, paid_on_site_agorot, platform_fee_agorot,
  supplier_due_agorot, balance_due_agorot, aov_agorot
)
select
  (o.paid_at at time zone 'Asia/Jerusalem')::date as day,
  oi.product_type,
  oi.supplier_id,
  count(distinct o.id),
  coalesce(sum(oi.paid_on_site_agorot), 0),
  coalesce(sum(oi.commission_agorot), 0),
  coalesce(sum(case when oi.product_type = 'physical'
    then oi.paid_on_site_agorot - oi.commission_agorot else 0 end), 0),
  coalesce(sum(oi.balance_due_agorot), 0),
  case when count(distinct o.id) = 0 then 0
       else coalesce(sum(oi.paid_on_site_agorot), 0) / count(distinct o.id) end
from public.orders o
join public.order_items oi on oi.order_id = o.id
where o.status in ('paid', 'fulfilled', 'partially_fulfilled')  -- adjust to live enum
  and o.paid_at is not null
group by 1, 2, 3
on conflict (day, product_type, supplier_id) do update set
  orders_count = excluded.orders_count,
  paid_on_site_agorot = excluded.paid_on_site_agorot,
  platform_fee_agorot = excluded.platform_fee_agorot,
  supplier_due_agorot = excluded.supplier_due_agorot,
  balance_due_agorot = excluded.balance_due_agorot,
  aov_agorot = excluded.aov_agorot;
```

### 3.3 Coupon funnel daily mart

```sql
create table if not exists analytics.mart_coupon_funnel_daily (
  day                 date not null,
  supplier_id         uuid,
  product_id          uuid,
  issued_count        bigint not null default 0,
  redeemed_count      bigint not null default 0,
  expired_count       bigint not null default 0,
  cancelled_count     bigint not null default 0,
  refunded_count      bigint not null default 0,
  redemption_rate_bps int not null default 0,  -- redeemed/issued * 10000
  primary key (day, supplier_id, product_id)
);
```

View for UI:

```sql
create or replace view analytics.v_coupon_redemption_rate as
select
  supplier_id,
  sum(issued_count) as issued_count,
  sum(redeemed_count) as redeemed_count,
  case when sum(issued_count) = 0 then 0
       else (sum(redeemed_count) * 10000 / sum(issued_count)) end as redemption_rate_bps
from analytics.mart_coupon_funnel_daily
group by supplier_id;
```

### 3.4 Supplier leaderboard view

```sql
create or replace view analytics.v_supplier_leaderboard as
select
  s.id as supplier_id,
  s.name as supplier_name,
  coalesce(sum(m.paid_on_site_agorot), 0) as gmv_agorot,
  coalesce(sum(m.platform_fee_agorot), 0) as platform_fee_agorot,
  coalesce(sum(m.supplier_due_agorot), 0) as supplier_due_agorot,
  coalesce(sum(m.orders_count), 0) as orders_count
from public.suppliers s
left join analytics.mart_sales_daily m
  on m.supplier_id = s.id
 and m.product_type = 'all'
group by s.id, s.name;
```

(Alternatively precompute `mart_supplier_leaderboard` for period windows.)

### 3.5 Customer cohort mart

```sql
create table if not exists analytics.mart_customer_cohort_monthly (
  month               date not null,  -- first day of month
  cohort_month        date not null,  -- month of first paid order
  customers_count     bigint not null default 0,
  orders_count        bigint not null default 0,
  revenue_agorot      bigint not null default 0,
  primary key (month, cohort_month)
);
```

### 3.6 Redemption ops view (name bridge)

```sql
create or replace view public.v_redemption_events as
select
  r.id,
  r.created_at,
  r.voucher_id,
  r.code_entered,
  r.supplier_id,
  r.scanned_by,
  r.scan_method,
  r.outcome,
  r.idempotency_key,
  r.amount_collected_agorot,
  r.ip_address,
  r.user_agent,
  r.metadata
from public.voucher_redemptions r;
```

### 3.7 Optional settlement-backed fee check

```sql
create or replace view analytics.v_settlement_fee_daily as
select
  (e.created_at at time zone 'Asia/Jerusalem')::date as day,
  e.supplier_id,
  e.product_type,
  sum(e.paid_on_site_agorot) as paid_on_site_agorot,
  sum(e.platform_fee_agorot) as platform_fee_agorot,
  sum(e.supplier_due_agorot) as supplier_due_agorot
from public.settlement_events e
where e.event_type = 'payment_settled'
group by 1, 2, 3;
```

Reconcile marts vs this view in validation job (diff = 0 within rounding).

---

## 4. Query performance strategy

| Technique | Application |
|---|---|
| Indexes | `orders(paid_at)`, `order_items(supplier_id, product_type)`, `vouchers(supplier_id, status)`, `voucher_redemptions(created_at)`, events `(event_name, occurred_at)` |
| Aggregation tables | Dashboard reads **only** marts for default ranges |
| Partitioning | Consider monthly partition on `analytics_events` when &gt; 50M rows |
| Concurrent refresh | If MV used: `REFRESH MATERIALIZED VIEW CONCURRENTLY` + unique index |
| Timeout | Admin API statement timeout 10s; fall back to pre-agg |
| Cache | RSC/`unstable_cache` 60–300s for overview cards; tag `analytics` |
| Avoid | Sequential scans on raw `order_items` for 90d UI; no `select *` events in browser |

Rollup cron: hourly for “today”, nightly full rebuild for last 90 days (**Q-AN-CRON**).

---

## 5. Export to CSV

| Export | Who | Columns |
|---|---|---|
| Sales daily | admin+ | day, type, gmv ILS, fees ILS, orders, AOV |
| Coupon funnel | admin+ | day, supplier, issued, redeemed, rate |
| Supplier leaderboard | admin+ | supplier, gmv, fees, due, orders |
| Support counts-only | support | orders count, redeem count (no ILS, no email) |

Rules:

1. Server-side stream; cap 100k rows; async job + download link if larger.
2. Every export writes `audit_log` (`analytics_export`, actor, filter hash).
3. Money CSV requires `canSeeMoney`.
4. Timestamps in `Asia/Jerusalem`.
5. Amounts exported as ILS with 2 decimals **derived from agorot** (document conversion in header row).

---

## 6. RBAC matrix

| Role | Overview counts | Money KPIs | CSV money | PII cohort export |
|---|---|---|---|---|
| content_uploader | no | no | no | no |
| support | yes | no | no | no |
| admin | yes | yes | yes | audited yes |
| super_admin | yes | yes | yes | audited yes |

---

## 7. Real-time freshness SLOs

| Tile | Freshness |
|---|---|
| Sales today | ≤ 15 min lag |
| Coupon funnel today | ≤ 15 min (redeem is live; mart ≤ 15) |
| Leaderboard 30d | ≤ 1 hour |
| Cohorts | nightly |

Admin banner if rollup `heartbeat_at` older than SLO.

---

## 8. Failure modes

| Failure | Handling |
|---|---|
| Mart job fail | Keep last good; alert ntfy; show stale badge |
| Ledger vs settlement drift | Validation report; block fee CSV until resolved |
| Event spam bots | `is_bot` filter; never affect finance marts |
| Support sees fees via bug | RLS + API field strip; test in CI |

---

## 9. Acceptance checklist

- [ ] Sales tiles use marts/ledger, not `analytics_events` sums
- [ ] Coupon funnel uses vouchers/redemptions; till not counted as KE revenue
- [ ] Leaderboard fees from snapshots / settlement
- [ ] Cohorts LTV = online paid only
- [ ] CSV audited; support cannot money-export
- [ ] No Escrow metrics
- [ ] DDL applied only via MCP when implemented

---

## 10. Open questions

| ID | Question |
|---|---|
| Q-AN-MIG | First free migration ordinal for `analytics` schema |
| Q-AN-CRON | Hourly vs 15-min rollup |
| Q-AN-PII | Allow email on admin cohort CSV? |
| Q-AN-ENUM | Exact paid-status enum set on live DB |

---

## 11. Related

| Doc | Role |
|---|---|
| `ARCHITECTURE-ADMIN.md` | `/admin/analytics` RBAC |
| `ARCHITECTURE-CHECKOUT-CARDCOM.md` | `settlement_events` |
| `ARCHITECTURE-COUPON-REDEMPTION.md` | redeem funnel / fraud inputs |
| `ARCHITECTURE-AI-AGENTS.md` | pricing/fraud consume marts |
| `ARCHITECTURE-NOTIFICATIONS.md` | ntfy on job failure |
