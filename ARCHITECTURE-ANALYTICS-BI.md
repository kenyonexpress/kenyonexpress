# ארכיטקטורה: Analytics BI (מצביע BINDING)

סקירה קצרה ל-BI ודוחות כסף. פירוט ב-docs/.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.  
מודל כסף: **No Escrow**; GMV/עמלה מ-ledger בלבד.

**מקור קנוני:**

```
docs/ARCHITECTURE-ANALYTICS-BI.md
docs/ARCHITECTURE-ANALYTICS.md
docs/ARCHITECTURE-ANALYTICS-KPI.md
```

Dump ארוך: git history לפני 2026-08-12.

---

## החלטה

| # | הכרעה |
|---|---|
| B1 | מספרי כסף רק מ-ledger: orders, order_items, payments, redemptions. |
| B2 | דוח היסטורי: snapshot `platform_percent`; לא product חי. |
| B3 | קופון: הכנסת פלטפורמה = paid_on_site; יתרת עסק ≠ הכנסה. |
| B4 | redeem: ספירה רק outcome=success. |
| B5 | אין PII באירועים; דוחות כסף = RBAC אדמין. |
| B6 | משפך (ATC, CVR) נפרד מווידג'ט כסף. |

---

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| root mega dump | docs/ קנוני. |
| GMV מ-GA4/PostHog | B1: ledger בלבד. |
| Escrow / held ב-KPI קופון | No Escrow. |
| revenue = face * 0.05 | snapshot פר שורה. |
| BigQuery חובה ביום 1 | Postgres views מספיקים. |

---

## סכמת DB

```text
order_items (platform_percent, paid_on_site_agorot, commission_agorot)
orders, voucher_redemptions, settlement_events
analytics_events (משפך בלבד)
```

Views: `v_take_rate_monthly`, `v_revenue_daily`. אין DDL חדש.

---

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | percent change אחרי הזמנה | דוח לפי snapshot. |
| CE2 | redeem failed נספר ככסף | success בלבד. |
| CE3 | float ב-SQL | round ל-agorot. |
| CE4 | ספק רואה GMV גלובלי | RLS scope. |
| CE5 | purchase event לפני ledger | אסור. |

---

## פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | BI warehouse v2 | אחרי scale. |
| O2 | SQL view daily sales | 50K+ rows. |
| O3 | UTM attribution | MARKETING doc. |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-06 | dump root |
| 2026-08-12 | batch-2: BINDING מצביע |
