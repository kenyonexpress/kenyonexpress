# ארכיטקטורה: Analytics KPI

מדדי מכירות, conversion, ודוחות לבעלים ב-`/admin`.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.  
מודל כסף: **No Escrow**; KPI כספי מ-DB, לא מ-Meta/GA.

מסמכים קשורים:

```
docs/ARCHITECTURE-ANALYTICS.md
docs/ARCHITECTURE-ANALYTICS-BI.md
docs/ARCHITECTURE-ADMIN-ANALYTICS.md
docs/ARCHITECTURE-ADMIN-DASHBOARD.md
```

---

## החלטה

| # | הכרעה |
|---|---|
| K1 | מקור אמת להזמנות: `orders.paid_at IS NOT NULL` (לא redirect דפדפן). |
| K2 | Platform revenue: קופון = `paid_on_site`; פיזי = `commission_agorot` snapshot. |
| K3 | Funnel: `view_product` → `add_to_cart` → `begin_checkout` → `purchase` → `redeem`. |
| K4 | `purchase` נפלט מהשרת אחרי finalize; idempotency על `order_id`. |
| K5 | שעון עסקים: `Asia/Jerusalem` ליום נחתך. |
| K6 | קהל: בעלים/אדמין ב-`/admin`; ספק רואה scorecard עצמי בלבד. |
| K7 | Daily pulse: GMV, platform revenue, orders, CVR, קופונים, ops alerts. |
| K8 | אין PII ב-dashboards מיוצאים; CSV = admin בלבד. |

---

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| KPI כספי מ-GA4 בלבד | K1: DB ledger. |
| ספירת מקדמת קופון כ-payout לספק | No Escrow; הכנסת פלטפורמה. |
| `purchase` מ-client בלבד | K4: server after paid. |
| Attribution רב-ערוצי מלא ב-v1 | O1: שלב מאוחר. |
| Zapier להתראות KPI | Ntfy + cron פנימי. |

---

## סכמת DB

```text
analytics_events (event_name, session_id, user_id, props jsonb, created_at)
orders (paid_at, total_agorot, platform_revenue_agorot)
order_items (snapshots)
vouchers (issued_at, redeemed_at, status)
```

Views מתוכננים:

```text
v_kpi_daily_sales, v_kpi_funnel_daily, v_kpi_product_perf
```

אין DDL חדש במסמך זה.

---

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | הזמנת קופון | platform revenue += paid_on_site בלבד. |
| CE2 | הזמנה פיזית | revenue = commission snapshot, לא percent חי. |
| CE3 | duplicate `purchase` event | dedup / ignore על `order_id`. |
| CE4 | ספק מנסה GMV גלובלי | RLS; 403 / empty. |
| CE5 | יום נחתך UTC vs IL | K5: Asia/Jerusalem. |
| CE6 | webhook fail spike | ops KPI; לא משפיע על GMV DB. |

---

## פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | Attribution מלא (UTM window) | MARKETING. |
| O2 | BigQuery export | v2. |
| O3 | server-side GA4 purchase | יישום. |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-07-31 | KPI + owner daily report |
| 2026-08-12 | batch-2: BINDING 5 סעיפים |
