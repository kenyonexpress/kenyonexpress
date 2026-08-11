# ארכיטקטורה: Analytics BI

שאילתות BI ודשבורדים כספיים מ-snapshots ב-ledger, לא מאחוז חי במוצר ולא מאירועי משפך.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.  
מודל כסף: **No Escrow**; GMV/עמלה מ-ledger בלבד.

מסמכים קשורים:

```
docs/ARCHITECTURE-ANALYTICS.md
docs/ARCHITECTURE-ANALYTICS-KPI.md
docs/ARCHITECTURE-PRICING-RULES.md
docs/ARCHITECTURE-WALLET-LEDGER.md
docs/CONTRADICTIONS.md
```

---

## החלטה

| # | הכרעה |
|---|---|
| B1 | מספרי כסף **רק** מ-ledger: `orders`, `order_items`, `payments`, `voucher_redemptions`, `settlement_events`, wallet. |
| B2 | אירועי `purchase`/`redeem` = timeline בלבד; אמת = `order_id` / `voucher_id`. |
| B3 | דוח היסטורי: `order_items.platform_percent` snapshot; לא `products.platform_percent` חי. |
| B4 | קופון: הכנסת פלטפורמה = `paid_on_site_agorot`; יתרת עסק ≠ הכנסה. |
| B5 | פיזי: `platform_revenue = paid_on_site * snapshot_percent / 100` (integer agorot). |
| B6 | redeem: ספירה רק `outcome = success` ב-`voucher_redemptions`. |
| B7 | אין PII באירועים; דוחות כסף = RBAC אדמין. |
| B8 | משפך (ATC, CVR) נפרד מווידג'ט כסף; לא לערבב שכבות. |

---

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| GMV מ-GA4/PostHog | B1: ledger בלבד. |
| `revenue = face * 0.05` / `0.10` | אחוז קבוע; snapshot פר שורה. |
| Escrow / held ב-KPI קופון | B4: No Escrow. |
| `products.platform_percent` על הזמנות ישנות | B3: snapshot בלבד. |
| BigQuery חובה ביום 1 | Postgres views מספיקים לשיגור. |

---

## סכמת DB

מקורות BI (קיים):

```text
order_items (platform_percent, paid_on_site_agorot, commission_agorot, product_type)
orders (paid_at, status, total_agorot)
voucher_redemptions (voucher_id, outcome, amount_collected_agorot)
settlement_events, payout_statement_lines
analytics_events (משפך בלבד, לא כסף)
```

Views מתוכננים: `v_take_rate_monthly`, `v_revenue_daily`, `v_coupon_funnel_monthly`.  
אין DDL חדש במסמך זה.

---

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | שינוי `platform_percent` אחרי הזמנה | דוח היסטורי לפי snapshot. |
| CE2 | redeem failed נספר ככסף | CE6: סנן success בלבד. |
| CE3 | float ב-SQL aggregation | round ל-agorot; אין sum על `_ils`. |
| CE4 | ספק רואה GMV גלובלי | RLS scope לספק שלו בלבד. |
| CE5 | purchase event לפני ledger write | אסור; server after paid. |
| CE6 | legacy `coupon_codes` + `vouchers` | קרא `vouchers` ראשון. |

---

## פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | BI warehouse (BigQuery/Snowflake) | v2 אחרי 10K הזמנות/חודש. |
| O2 | `v_admin_sales_daily_agorot` SQL view | כש-TS aggregation חותך ב-50K שורות. |
| O3 | UTM attribution window | MARKETING doc. |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-06 | QA: הסרת 10/90 שגוי |
| 2026-08-07 | voucher_redemptions + agorot |
| 2026-08-12 | batch-2: BINDING 5 סעיפים מלאים |
