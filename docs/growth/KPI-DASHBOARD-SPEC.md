# KPI dashboard spec

Status: DRAFT · docs only  
Audience: owners at `/admin` (not supplier portal).  
Timezone: `Asia/Jerusalem` for business days. Store `timestamptz` in UTC.  
Money: **integer agorot** in SQL and marts. UI converts to ₪ via `src/lib/money.ts`. Never `numeric`/`float` in a revenue sum.

Companions: `docs/ARCHITECTURE-ANALYTICS-KPI.md`, `docs/ARCHITECTURE-ANALYTICS.md`, `docs/support/ADMIN-RUNBOOK-HE.md`.

Sketches below are **read-only**. Column names must be checked on the live schema before creating views. Do not `db push`. Marts stay behind `is_admin()` / security invoker.

---

## 0. Source of truth

| Domain | Truth | Not truth |
|---|---|---|
| Orders | `orders.paid_at IS NOT NULL` | browser redirect, GA4 `purchase` alone |
| On-site GMV | sum of what CardCom charged (`charged_on_site_agorot` on lines, or `customer_pays_now_agorot` / `total_agorot` on the order if that is the charged total) | deal face value, balance at business |
| Platform revenue | **Coupon:** on-site coupon price kept by the platform (`charged_on_site_agorot` / `paid_on_site_agorot` on coupon lines). **Physical:** `commission_agorot` (or `platform_fee_agorot`) from the **snapshotted** `platform_percent` / `platform_bp` on `order_items` | live `products.platform_percent` after the sale; escrow; remainder collected at the till |
| Funnel | `analytics_events.event_name` | Meta ads |
| Redemption | `vouchers.status` | customer screenshot |
| Wallet | `wallet_entries.amount_agorot` / `v_wallet_ledger` | “cash” |

No escrow KPIs. Balance due at the business is operational copy, not platform GMV.

`purchase` events are idempotent on `order_id`.

---

## 1. Metric dictionary

### 1.1 Sales

| KPI | Definition | Unit |
|---|---|---|
| Orders | Count of paid orders in the window | count |
| GMV on-site | Sum charged on the site | agorot |
| Platform revenue | Coupon on-site take + physical commission | agorot |
| AOV | GMV on-site / Orders | agorot |
| Coupon order % | Paid orders with ≥1 coupon line / Orders | ratio |
| Physical GMV | Sum charged on physical lines | agorot |
| Supplier physical due | `supplier_due_agorot` / `supplier_immediate_agorot` on physical lines | agorot |
| Refunds | Count and sum of refund payments (site charge only) | count + agorot |
| Net GMV | GMV on-site minus refunded on-site agorot | agorot |
| Take rate | Platform revenue / GMV on-site | ratio (display %, compute from integers) |

### 1.2 Funnel (behavior, not money)

Events: `page_view`, `view_item`, `add_to_cart`, `begin_checkout`, `purchase`. Optional: `login`, `coupon_redeemed` (derived from vouchers).

| KPI | Formula |
|---|---|
| View→ATC | sessions or users with `add_to_cart` / `view_item` |
| ATC→Checkout | `begin_checkout` / `add_to_cart` |
| Checkout→Purchase | `purchase` / `begin_checkout` |
| Overall CVR | `purchase` / sessions (or users) with `page_view` |

Do not attach ₪ to `page_view`.

### 1.3 Catalog and ops

| KPI | Definition |
|---|---|
| Issued | `vouchers` created in window |
| Redeem rate | `redeemed` / `issued` in a cohort (issued in window, redeemed by report end) |
| Expiry rate | `expired` / `issued` (same cohort) |
| Time-to-redeem | median `redeemed_at - issued_at` for redeemed |
| Open liability | sum `coupon_price_agorot` of `issued` not expired (site take already collected; this is unredeemed count/value for ops) |
| Scan errors | failed lookup/redeem / attempts (from scan audit if present) |
| Search zero-results % | search events with empty hits / searches |

### 1.4 Growth

| KPI | Definition |
|---|---|
| New customers | distinct `user_id` whose **first** `paid_at` falls in the window |
| Returning rate | users with ≥2 paid orders ever, who also paid in the window / payers in window |
| Wallet outstanding | sum of current wallet balances (agorot) |
| Wallet spend | debits applied at checkout in window |
| Cashback credited | credits with cashback reason in window |

---

## 2. SQL sketches (agorot)

Helper: Israel calendar day.

```sql
-- sketch
CREATE OR REPLACE FUNCTION public.fn_il_date(p timestamptz)
RETURNS date
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT (p AT TIME ZONE 'Asia/Jerusalem')::date;
$$;
```

If `fn_il_date` already exists, reuse it. Do not add a second clock.

### 2.1 Daily sales mart

```sql
-- sketch: v_kpi_daily_sales
-- Verify charged column: prefer SUM(oi.charged_on_site_agorot)
-- Fallback: o.customer_pays_now_agorot or o.total_agorot (must match CardCom).

SELECT
  public.fn_il_date(o.paid_at) AS day_il,
  count(DISTINCT o.id) AS orders,
  coalesce(sum(oi.charged_on_site_agorot), 0) AS gmv_agorot,
  coalesce(sum(
    CASE
      WHEN oi.product_type = 'coupon'
        THEN oi.charged_on_site_agorot
      WHEN oi.product_type = 'physical'
        THEN coalesce(oi.commission_agorot, oi.platform_fee_agorot, 0)
      ELSE 0
    END
  ), 0) AS platform_revenue_agorot,
  coalesce(sum(oi.charged_on_site_agorot) FILTER (
    WHERE oi.product_type = 'coupon'
  ), 0) AS coupon_gmv_agorot,
  coalesce(sum(oi.charged_on_site_agorot) FILTER (
    WHERE oi.product_type = 'physical'
  ), 0) AS physical_gmv_agorot
FROM public.orders o
JOIN public.order_items oi ON oi.order_id = o.id
WHERE o.paid_at IS NOT NULL
GROUP BY 1;
```

AOV in the app: `gmv_agorot / orders` (integer division for display after ₪ conversion, or exact ratio in UI from two integers).

### 2.2 Orders and AOV (order grain)

```sql
-- sketch
SELECT
  public.fn_il_date(o.paid_at) AS day_il,
  count(*) AS orders,
  coalesce(sum(o.total_agorot), 0) AS gmv_order_total_agorot,
  coalesce(sum(o.wallet_applied_agorot), 0) AS wallet_applied_agorot
FROM public.orders o
WHERE o.paid_at IS NOT NULL
GROUP BY 1;
```

Reconcile `sum(order_items.charged_on_site_agorot)` vs `orders.total_agorot` weekly. Mismatch = bug, not a third metric.

### 2.3 Refunds

```sql
-- sketch: refund rows on payments (refund_of_payment_id IS NOT NULL)
-- amount column: amount_agorot (confirm on information_schema).

SELECT
  public.fn_il_date(p.created_at) AS day_il,
  count(*) AS refund_rows,
  coalesce(sum(p.amount_agorot), 0) AS refunded_agorot
FROM public.payments p
WHERE p.refund_of_payment_id IS NOT NULL
GROUP BY 1;
```

Net GMV = daily GMV minus `refunded_agorot` (same day or by original `paid_at`: pick one and keep it; weekly report uses **refund posted day** plus a footnote).

### 2.4 Funnel daily

```sql
-- sketch: v_kpi_funnel_daily
-- analytics_events: event_name, occurred_at, session_id, user_id, is_bot
SELECT
  public.fn_il_date(ae.occurred_at) AS day_il,
  count(*) FILTER (WHERE ae.event_name = 'page_view') AS page_views,
  count(*) FILTER (WHERE ae.event_name = 'view_item') AS view_item,
  count(*) FILTER (WHERE ae.event_name = 'add_to_cart') AS add_to_cart,
  count(*) FILTER (WHERE ae.event_name = 'begin_checkout') AS begin_checkout,
  count(*) FILTER (WHERE ae.event_name = 'purchase') AS purchase
FROM public.analytics_events ae
WHERE ae.is_bot IS NOT TRUE
GROUP BY 1;
```

Better CVR: distinct `session_id` (or `user_id`) per step, not raw event counts.

```sql
-- sketch: unique sessions per step
SELECT
  public.fn_il_date(occurred_at) AS day_il,
  event_name,
  count(DISTINCT session_id) AS sessions
FROM public.analytics_events
WHERE event_name IN (
  'page_view', 'view_item', 'add_to_cart', 'begin_checkout', 'purchase'
)
  AND is_bot IS NOT TRUE
  AND session_id IS NOT NULL
GROUP BY 1, 2;
```

### 2.5 Product performance

```sql
-- sketch: v_kpi_product_perf
SELECT
  oi.product_id,
  count(DISTINCT o.id) AS paid_orders,
  coalesce(sum(oi.charged_on_site_agorot), 0) AS gmv_agorot,
  coalesce(sum(
    CASE WHEN oi.product_type = 'coupon'
         THEN oi.charged_on_site_agorot
         ELSE coalesce(oi.commission_agorot, 0)
    END
  ), 0) AS platform_revenue_agorot
FROM public.order_items oi
JOIN public.orders o ON o.id = oi.order_id
WHERE o.paid_at IS NOT NULL
GROUP BY 1;
```

Views/ATC: join `analytics_events.props->>'item_id'` (confirm key) to `product_id`. If the key is missing, show sales without view counts rather than guessing.

### 2.6 Vouchers

```sql
-- sketch
SELECT
  public.fn_il_date(v.issued_at) AS issued_day_il,
  count(*) AS issued,
  count(*) FILTER (WHERE v.status = 'redeemed') AS redeemed,
  count(*) FILTER (WHERE v.status = 'expired') AS expired,
  count(*) FILTER (WHERE v.status = 'refunded') AS refunded,
  percentile_cont(0.5) WITHIN GROUP (
    ORDER BY extract(epoch FROM (v.redeemed_at - v.issued_at))
  ) FILTER (WHERE v.status = 'redeemed') AS median_seconds_to_redeem
FROM public.vouchers v
GROUP BY 1;
```

Redeem rate for the weekly pack: issued in the week / redeemed by report time (open issued stay in the denominator).

### 2.7 New vs returning

```sql
-- sketch
WITH first_paid AS (
  SELECT user_id, min(paid_at) AS first_paid_at
  FROM public.orders
  WHERE paid_at IS NOT NULL
    AND user_id IS NOT NULL
  GROUP BY 1
)
SELECT
  public.fn_il_date(o.paid_at) AS day_il,
  count(DISTINCT o.user_id) FILTER (
    WHERE public.fn_il_date(o.paid_at) = public.fn_il_date(f.first_paid_at)
  ) AS new_payers,
  count(DISTINCT o.user_id) FILTER (
    WHERE public.fn_il_date(o.paid_at) > public.fn_il_date(f.first_paid_at)
  ) AS returning_payers
FROM public.orders o
JOIN first_paid f ON f.user_id = o.user_id
WHERE o.paid_at IS NOT NULL
GROUP BY 1;
```

### 2.8 Wallet

```sql
-- sketch: outstanding = sum of signed amounts per user (credit +, debit -)
-- Read v_wallet_ledger.amount_agorot / direction; confirm view columns.

SELECT
  coalesce(sum(
    CASE WHEN direction = 'credit' THEN amount_agorot ELSE -amount_agorot END
  ), 0) AS wallet_outstanding_agorot
FROM public.v_wallet_ledger;
```

Spend in window: debits with checkout reason and `created_at` in range.

---

## 3. Weekly report layout (owners)

Clock: week starting **Sunday 00:00 Asia/Jerusalem**, ending Saturday 23:59:59. Export CSV admin-only, no emails of customers.

Title: `KenyonExpress KPI · {from} – {to}` plus git/tag if known.

### Block A. Pulse (cards)

1. Orders (wow% vs previous week)  
2. GMV on-site ₪ (from agorot)  
3. Platform revenue ₪  
4. AOV ₪  
5. Checkout→Purchase CVR  
6. Refunds: count + ₪  
7. Vouchers issued / redeemed / expired  
8. Open `issued` count  

### Block B. Mix

Table: coupon vs physical share of GMV and of platform revenue. Soft-launch: physical should be ~0. If not, flag.

### Block C. Funnel

Horizontal bars: `view_item` → `add_to_cart` → `begin_checkout` → `purchase` (unique sessions). Drop-off % on each step. Source `analytics_events`.

### Block D. Top products

Top 10 by `gmv_agorot`. Columns: name_he, type, orders, GMV, platform revenue, redeem rate (coupon only).

### Block E. Ops exceptions

- Paid orders with zero voucher issued (coupon)  
- Scan failures if audit table exists  
- Upload drafts pending (`content_uploader`)  
- Refund tickets still open (ops, not SQL)

### Block F. Growth

New payers, returning rate, wallet outstanding ₪, cashback credited ₪.

### Block G. Notes (human)

3 bullets: what moved, what broke, what not to tell suppliers (no global GMV).

UI: `/admin` RTL, Heebo, export CTA `#fed700`. Ranges: today, 7d, 30d, custom. Charts: `SalesChart`, `FunnelBars` (existing admin components). Not a generic purple SaaS theme.

---

## 4. Alerts (ops, not the weekly PDF)

| Condition | Channel |
|---|---|
| `purchase` = 0 for N business hours while `page_view` > 0 | ntfy |
| Checkout→Purchase down >X% vs trailing 7 days | ntfy |
| Webhook / payment fail spike | ntfy + `docs/RUNBOOK-OPS.md` |

Do not page on GA4 alone.

---

## 5. Tests (dashboard contract)

| # | Expect |
|---|---|
| K1 | Coupon paid order increases platform revenue by on-site charge, not face value |
| K2 | Physical paid order increases platform revenue by snapshotted commission only |
| K3 | Unpaid checkout draft is absent from all money KPIs |
| K4 | Refund reduces net GMV by site amount only |
| K5 | `purchase` event does not double-count the same `order_id` |
| K6 | Display ₪ matches integer agorot (19900 → ₪199) |

---

## 6. RBAC

| Role | Sees |
|---|---|
| admin / super_admin | all blocks, CSV |
| support | tickets, not global GMV (optional limited) |
| content_uploader | catalog queues, not revenue |
| vendor | own scorecard only |
| anon | nothing |
