# ARCHITECTURE-ANALYTICS.md

KenyonExpress analytics architecture (binding spec).

Status: BINDING for worktree `/Users/ofir/kenyonexpress-web/ke-arch` · branch `arch/admin-supplier` (2026-07-29)
Scope: **docs only.** Architecture and query shapes as specification. No application code in this change. Schema/apply later via Supabase MCP `apply_migration` only (never `db push`).
Companions: `docs/ARCHITECTURE-ADMIN.md`, `docs/ARCHITECTURE-CHECKOUT-CARDCOM.md`, `docs/ARCHITECTURE-COUPON-REDEMPTION.md`, `docs/ARCHITECTURE-SUPPLIER-PORTAL.md`, `docs/ARCHITECTURE-NOTIFICATIONS.md`.

Admin UI: `/admin/analytics` (Hebrew RTL). Money visibility: admin / super_admin only.

---

## 0. Money rules (every KPI)

| Rule | Analytics implication |
|---|---|
| Platform, never supplier | Seller is supplier; platform fee is snapshotted `platform_percent` |
| `platform_percent` | Dynamic per product, admin-set, **no default**. Fees from `order_items` / `settlement_events` snapshots only |
| Coupon | Online GMV = sum of `coupon_price` / `paid_on_site` on coupon lines. Till remainder (`balance_due`) is **not** platform revenue |
| Physical | Immediate split at settle; platform fee vs supplier residual from snapshot |
| **No Escrow** | No escrow KPIs |
| Agorot | Store **bigint agorot**; UI shows ₪ / 100 |
| Behavioral ≠ finance | Never sum revenue from clickstream events |

---

## 1. Goals (what we measure)

| Goal | Question | Primary sources |
|---|---|---|
| **Product browsing** | Which PDPs / categories get views, unique sessions, bounce from PDP | `analytics_events` (`product_view`, `category_view`) |
| **Conversion by product** | view → ATC → checkout → paid for each `product_id` | events + `order_items` |
| **Conversion by category** | same rolled to `category_id` | events + products + orders |
| **Conversion by supplier** | same rolled to snapshotted / live `supplier_id` | events + `order_items.supplier_id` |
| **Coupon ROI** | prepaid collected vs redemptions vs calendar expiry; marketing cost later | `vouchers`, `voucher_redemptions`, settlement snapshots |
| **Retention** | return purchase rate, cohort LTV (online only), days-to-second-order | paid `orders` by `user_id` |

Out of scope for v1 dashboards: third-party ad pixel ROI (unless cost table lands), supplier-facing BI (portal gets ops lists, not this admin mart).

---

## 2. Layered architecture

```
Client / app (consent gated, no PII in payload)
        │
        ▼
  ingest edge (anon, rate limit, bot filter)
        │
        ▼
  analytics_events          ← append-only fact table (Supabase)
        │
        ├──────────────────────────────┐
        ▼                              ▼
  aggregation queries / jobs     finance ledger (authoritative money)
  (hourly / nightly marts)       orders, order_items, payments,
        │                        settlement_events, vouchers
        ▼                              │
  mart_* tables / views  ◄─────────────┘  (joins for conversion + ROI)
        │
        ▼
  /admin/analytics dashboard (RTL Hebrew)
```

| Layer | Responsibility |
|---|---|
| **Events** | High-volume UX facts: view, search, add_to_cart, begin_checkout. No emails, phones, names, full addresses |
| **Supabase table** | `analytics.analytics_events` (or `public.analytics_events`) append-only; RLS: insert via edge/service; select staff only |
| **Aggregation** | SQL jobs / SECURITY DEFINER functions upsert `mart_product_daily`, `mart_funnel_daily`, `mart_coupon_roi`, `mart_retention_cohort` |
| **Dashboard** | RSC + charts reading **marts** (not raw events) for p95 latency; optional live count widgets from marts with short revalidate |

Finance truth always comes from ledger tables after Cardcom `payment_settled` and redeem RPC. Events only explain **behavior** leading to money.

---

## 3. Event catalogue (browse + funnel)

| `event_name` | When | Required props (ids only) |
|---|---|---|
| `product_view` | PDP paint | `product_id`, `supplier_id`, `category_id`, `product_type` |
| `category_view` | category archive | `category_id` |
| `search` | search submit | `q_hash` (hash of query, not raw string if sensitive), `result_count` |
| `add_to_cart` | ATC success | `product_id`, `qty` |
| `begin_checkout` | checkout entered | `cart_id` / item count |
| `purchase` | optional mirror of paid (prefer ledger for money) | `order_id` only as uuid |

Common envelope (all events):

- `event_id` (uuid, idempotent)
- `occurred_at` (client + server receive time)
- `session_id` (opaque random; rotate; not user email)
- `anonymous_id` (cookie) and/or `user_id` **uuid only when logged in**
- `path`, `referrer_host` (no full query with tokens)
- `is_bot`, `is_internal` flags

Consent: respect `ke_consent`; if denied, no behavioral ingest (finance still works).

---

## 4. Real-time sync vs lag

| Path | Latency target | Mechanism |
|---|---|---|
| Event ingest | seconds | Edge write to `analytics_events`; fire-and-forget from browser |
| Ops counters (views today) | 1–5 min | Incremental mart upsert every 1–5 min **or** dashboard query with `revalidate` 60–300s on a thin daily mart |
| Conversion / ROI / retention | 15–60 min (hourly OK) | Cron rollup into marts |
| Finance GMV / fees | **near real-time on settle** | Written in payment finalize TX; dashboard reads ledger or settlement mart refreshed on settle + hourly backfill |

Rules:

1. Do **not** block checkout or PDP on analytics ingest failure.
2. Do **not** claim “live GMV” from events; GMV = paid ledger.
3. Mark every dashboard tile with data freshness (`as_of` timestamp from mart job).
4. Backfill: re-run aggregation for a date range idempotently (`ON CONFLICT` upsert by grain keys).

---

## 5. Privacy (no PII tracking)

| Allowed | Forbidden in events / marts exports for support |
|---|---|
| UUIDs (`user_id`, `product_id`, `order_id`) | email, phone, name, street address |
| Coarse geo (optional country/`il` only) | precise lat/lng, full IP in long retention (**Q-AN-IP**: store truncated / hashed IP ≤ 30d then drop) |
| `q_hash` for search | raw search strings that may contain personal data |
| Aggregate counts | row-level “this person bought X” in support CSV |

RLS:

- `anon` / `authenticated`: **no** select on raw events (ingest service role / edge only).
- Admin: select marts + aggregates; money columns gated by `canSeeMoney`.
- Support: counts and funnels without fee/revenue and without email export.

Retention: raw events default **90 days** (configurable); marts keep longer (e.g. 24 months) as aggregates only.

---

## 6. RTL admin dashboard

- `/admin/analytics`: `dir="rtl"` `lang="he"`.
- Labels, filters, empty states in Hebrew.
- Logical CSS (`ps`/`pe`/`start`/`end`); charts with RTL-friendly legends.
- Currency: `₪` with `he-IL` formatting; values from agorot.
- Touch targets ≥ 44px on filter controls.
- Every tile shows: title, range, **as_of**, definition tooltip (Hebrew).

Sections (v1):

1. גלישות מוצרים (top products / categories by views)
2. המרות (product / category / supplier)
3. ROI קופונים
4. Retention / cohorts
5. (Admin only) מכירות ועומס פלטפורמה from ledger

---

## 7. Mart grains (aggregation targets)

| Mart | Grain | Contents |
|---|---|---|
| `mart_product_daily` | day × product_id | views, unique sessions, ATC, paid qty, paid_on_site_agorot |
| `mart_category_daily` | day × category_id | same rolled up |
| `mart_supplier_daily` | day × supplier_id | views (if tagged), paid lines, fees, residual |
| `mart_funnel_daily` | day × dimension | counts per funnel step |
| `mart_coupon_roi_daily` | day × product_id / supplier_id | issued, redeemed, expired, prepaid_agorot, till_agorot (info) |
| `mart_retention_cohort` | cohort_week × age_week | users, retained users, LTV online agorot |

---

## 8. Example primary queries (specification shapes)

Illustrative SQL against intended tables. Not applied in this docs change.

### 8.1 Product views (browse)

```sql
-- Top PDP views last 7 days (Asia/Jerusalem calendar day)
select
  (e.props->>'product_id')::uuid as product_id,
  count(*) as views,
  count(distinct e.session_id) as sessions
from analytics.analytics_events e
where e.event_name = 'product_view'
  and e.occurred_at >= (timezone('Asia/Jerusalem', now())::date - 7)
  and e.is_bot = false
group by 1
order by views desc
limit 50;
```

### 8.2 Conversion by product (view → paid)

```sql
-- CR = paid orders containing product / unique sessions that viewed it
with views as (
  select
    (props->>'product_id')::uuid as product_id,
    count(distinct session_id) as view_sessions
  from analytics.analytics_events
  where event_name = 'product_view'
    and occurred_at >= :from_ts
    and is_bot = false
  group by 1
),
paid as (
  select
    oi.product_id,
    count(distinct oi.order_id) as paid_orders,
    sum(oi.paid_on_site_agorot)::bigint as gmv_agorot
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where o.status in ('paid', 'completed', 'fulfilled')
    and o.paid_at >= :from_ts
  group by 1
)
select
  v.product_id,
  v.view_sessions,
  coalesce(p.paid_orders, 0) as paid_orders,
  case when v.view_sessions > 0
    then coalesce(p.paid_orders, 0)::numeric / v.view_sessions
    else 0 end as conversion_rate,
  coalesce(p.gmv_agorot, 0) as gmv_agorot
from views v
left join paid p using (product_id)
order by conversion_rate desc nulls last;
```

Same pattern for **category** (join `products.category_id`) and **supplier** (`order_items.supplier_id` + event prop `supplier_id`).

### 8.3 Coupon ROI

```sql
-- Prepaid collected vs redemption outcomes (snapshot money only)
select
  v.product_id,
  v.supplier_id,
  count(*) filter (where v.status in ('issued','redeemed','expired','cancelled','refunded')) as vouchers,
  count(*) filter (where v.status = 'redeemed') as redeemed,
  count(*) filter (where v.status = 'expired') as expired_calendar,
  sum(v.coupon_price_agorot)::bigint as prepaid_agorot,
  sum(v.remaining_amount_due_agorot)::bigint as till_agorot_info,
  case when count(*) > 0
    then count(*) filter (where v.status = 'redeemed')::numeric / count(*)
    else 0 end as redemption_rate
from public.vouchers v
where v.created_at >= :from_ts
group by 1, 2
order by prepaid_agorot desc;
```

ROI definition (v1, no ad spend table):

```
redemption_rate = redeemed / issued
platform_prepaid_fee ≈ sum(round_once(coupon_price * platform_percent / 100)) from snapshots
till_agorot is informational only (not KE revenue)
```

When marketing cost lands later: `roi = (platform_prepaid_fee - campaign_cost) / nullif(campaign_cost, 0)`.

### 8.4 Retention

```sql
-- Users with a first paid order in cohort week and a second paid within 30 days
with first_orders as (
  select
    user_id,
    min(paid_at) as first_paid_at
  from public.orders
  where status in ('paid', 'completed', 'fulfilled')
    and user_id is not null
  group by 1
),
cohort as (
  select
    user_id,
    date_trunc('week', timezone('Asia/Jerusalem', first_paid_at)) as cohort_week,
    first_paid_at
  from first_orders
  where first_paid_at >= :from_ts
)
select
  c.cohort_week,
  count(*) as new_buyers,
  count(*) filter (
    where exists (
      select 1 from public.orders o
      where o.user_id = c.user_id
        and o.status in ('paid', 'completed', 'fulfilled')
        and o.paid_at > c.first_paid_at
        and o.paid_at < c.first_paid_at + interval '30 days'
    )
  ) as retained_30d,
  count(*) filter (
    where exists (
      select 1 from public.orders o
      where o.user_id = c.user_id
        and o.status in ('paid', 'completed', 'fulfilled')
        and o.paid_at > c.first_paid_at
        and o.paid_at < c.first_paid_at + interval '30 days'
    )
  )::numeric / nullif(count(*), 0) as retention_rate_30d
from cohort c
group by 1
order by 1;
```

LTV online (no till):

```sql
select
  user_id,
  sum(total_paid_on_site_agorot)::bigint as ltv_online_agorot,
  count(*) as paid_orders
from public.orders
where status in ('paid', 'completed', 'fulfilled')
  and user_id is not null
group by 1;
```

---

## 9. Indexes (intent)

| Table | Index intent |
|---|---|
| `analytics_events` | `(event_name, occurred_at desc)`, `(session_id, occurred_at)`, gin/json path on `props->>'product_id'` or generated columns |
| `order_items` | `(product_id)`, `(supplier_id)`, `(order_id)` |
| `orders` | `(paid_at)`, `(user_id, paid_at)` |
| `vouchers` | `(status, created_at)`, `(product_id)`, `(supplier_id)` |
| marts | PK on grain (`day`, dimension id) |

---

## 10. Migrations (077+, MCP only)

Never `supabase db push`. Next free ordinal from hosted `schema_migrations` (**Q-AN-MIG**).

| Object | Purpose |
|---|---|
| `analytics` schema + `analytics_events` | append-only events |
| mart tables listed in §7 | dashboard reads |
| Rollup function + cron schedule | lag vs freshness §4 |
| RLS policies | no public select on raw events |

---

## 11. Acceptance checklist

- [ ] Product / category / supplier conversion tiles driven by events + ledger join, not events alone for money
- [ ] Coupon ROI separates prepaid (platform) from till (info)
- [ ] Retention cohorts use `user_id` uuid only; no email in event stream
- [ ] Dashboard RTL Hebrew with `as_of` on every tile
- [ ] Ingest failure never blocks checkout
- [ ] Support role cannot export PII or fee columns

---

## 12. Open questions

| ID | Question |
|---|---|
| Q-AN-MIG | First free migration ordinal |
| Q-AN-IP | Store truncated IP at all? |
| Q-AN-LIVE | 1 min vs 5 min mart refresh for “today” views |
| Q-AN-COST | When to add campaign cost for true ROI |

---

## 13. Related

| Doc | Role |
|---|---|
| `ARCHITECTURE-CHECKOUT-CARDCOM.md` | `payment_settled` money truth |
| `ARCHITECTURE-COUPON-REDEMPTION.md` | redeem funnel |
| `ARCHITECTURE-ADMIN.md` | `/admin/analytics` RBAC |
| `ARCHITECTURE-SUPPLIER-PORTAL.md` | supplier dimension |
