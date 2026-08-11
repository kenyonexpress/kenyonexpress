# ארכיטקטורה: Admin Dashboard Spec

מפרט מסכי אדמין מסך-אחר-מסך: טבלאות, פילטרים, פעולות, RBAC.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.  
מודל כסף: **No Escrow**; שדות כסף דינמיים לפי סוג מוצר.

מסמכים קשורים:

```
docs/ARCHITECTURE-ADMIN.md
docs/ARCHITECTURE-ADMIN-DASHBOARD.md
docs/ADMIN-PRODUCT-PAGE-SPEC.md
docs/ARCHITECTURE-ANALYTICS-KPI.md
docs/ARCHITECTURE-CUSTOMER-SUPPORT.md
```

---

## החלטה

| # | הכרעה |
|---|---|
| D1 | כל מסך: עברית RTL, Heebo; כסף ₪ בתצוגה, agorot במקור. |
| D2 | טבלאות: מיון בכותרת; 50 שורות; פילטרים ב-query string. |
| D3 | `/admin` overview: KPI יום/7י + 10 הזמנות אחרונות + ops alerts. |
| D4 | `/admin/products`: פילטר "חסר percent" / "חסר coupon_price" אחרי WP import. |
| D5 | type=coupon: `coupon_price_ils`, expiry, הוראות; type=physical: `platform_percent` חובה. |
| D6 | `/admin/orders`: פילטר "חריגים" (webhook כפול, paid בלי voucher). |
| D7 | `/admin/redemptions`: כולל כשלי סריקה; לא רק success. |
| D8 | `/admin/settlements`: פיזי בלבד; draft→approved→paid דו-שלבי; אין עריכת סכום ידנית. |
| D9 | RBAC בשרת; לא הסתרת כפתורים בלבד. |

---

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| סכום refund חופשי בידי נציג | D8: מחושב מהשורה. |
| settlements על קופון prepaid | No Escrow; לא התחייבות לספק. |
| מחיקה פיזית של הזמנות | סטטוסים + audit בלבד. |
| percent גלובלי בטופס | ADMIN: פר מוצר. |
| עמוד לבן בטבלה ריקה | D1: הסבר + CTA. |

---

## סכמת DB

מסכים קוראים (קיים):

```text
products, categories, suppliers, orders, order_items
vouchers, coupon_scan_events / voucher_redemptions
payments, payment_events
payout_statements, payout_statement_lines
audit_log, support_tickets
```

אין DDL חדש.

---

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | publish bulk: חלק נכשל | סיבה פר מוצר; לא fail כללי. |
| CE2 | supplier suspend | unpublish all + block scan. |
| CE3 | order "חריג" webhook כפול | סימון אדום; reconciliation. |
| CE4 | refund: support role | בקשה בלבד; לא ביצוע. |
| CE5 | settlement: קופון ב-SQL | filter physical; סכום 0 לקופון. |
| CE6 | redemption fail rate >20% | באנר אזהרה ב-log. |

---

## פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | `/admin/analytics` מפורט | ANALYTICS-KPI. |
| O2 | באנרים שיווקיים | out of scope v1. |
| O3 | finance vs owner role split | RBAC matrix live. |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-02 | rev A: מסך-אחר-מסך |
| 2026-08-12 | batch-2: BINDING 5 סעיפים |
