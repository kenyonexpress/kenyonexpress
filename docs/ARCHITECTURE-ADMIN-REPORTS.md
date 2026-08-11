# ארכיטקטורה: דוחות אדמין

דוחות אדמין: הכנסות יומיות, עמלת פלטפורמה לפי מוצר, התחשבנות ספקים, התחייבות קופונים (נמכרו ולא מומשו), ייצוא CSV.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד.

מודל כסף: **No Escrow**. קופון: on-site = הכנסת פלטפורמה; אין held / payout לספק על מקדמה. פיזי: payout לפי settlement.

מסמכים קשורים:

```
docs/ARCHITECTURE-SUPPLIER-ANALYTICS.md
docs/ARCHITECTURE-ANALYTICS.md
docs/ARCHITECTURE-REFUNDS-DISPUTES.md
docs/RUNBOOK-OPERATIONS.md
docs/ARCHITECTURE-WALLET-CASHBACK.md
docs/CONTRADICTIONS.md
```

---

## החלטה

| # | הכרעה |
|---|---|
| AR1 | מקור אמת כספי: `orders` / `order_items` / `vouchers` / ledger. **לא** GA4. |
| AR2 | חישוב באגורות; תצוגה ו-CSV ב-₪ (2 ספרות) + עמודת agorot אופציונלית. |
| AR3 | `platform_percent` ו-commission **רק מה-snapshot** בשורת הזמנה. |
| AR4 | Coupon liability = paid on-site על vouchers `issued` (לא redeemed/cancelled/expired). |
| AR5 | גישה: `is_admin()` בלבד. כל ייצוא ב-`audit_log`. |
| AR6 | אזור זמן: `Asia/Jerusalem`. |
| AR7 | CSV: UTF-8 עם BOM ל-Excel עברית. |
| AR8 | **No Escrow:** אין עמודות `coupon_held` / `escrow_held` פעילות בדוחות. |

### משטחי UI

```text
/admin/reports
  /admin/reports/daily-revenue
  /admin/reports/commission-by-product
  /admin/reports/supplier-settlements
  /admin/reports/coupon-liability
  /admin/reports/export
```

### דוחות (תמצית)

| דוח | מדדים עיקריים |
|---|---|
| Daily revenue | Gross/Net on-site, refunds, platform commission, orders, vouchers issued/redeemed |
| Commission by product | units, gross, **platform_percent_snapshot**, commission_agorot |
| Supplier settlements | physical_due, payout_status (פיזי בלבד); **לא** coupon held |
| Coupon liability | open `issued`, on-site paid, aging, expiring 7d |

---

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| Escrow / `coupon_held_agorot` בדוח settlements | AR8: No Escrow; קופון לא payout/held. |
| commission מ-`products.platform_percent` החי | AR3: snapshot בלבד. |
| GA4 כמקור הכנסה | AR1: ledger. |
| CSV בלי BOM | AR7: Excel עברית. |
| export בלי audit | AR5: חובה audit_log. |
| timezone UTC בדוחות יומיים | AR6: Jerusalem. |

---

## סכמת DB

**אין DDL חדש.** קריאה מטבלאות קיימות.

| טבלה | שימוש בדוח |
|---|---|
| `orders` | paid_at, status, timezone bucket |
| `order_items` | snapshots, commission_agorot, product_type |
| `vouchers` | issued/redeemed/expired; liability |
| `settlement_events` / ledger | supplier settlements (פיזי) |
| `audit_log` | export actions |

ייצוא async: signed URL ב-R2 אם > N שורות (יעד).

---

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | refund באותו יום כ-paid | Net = Gross − Refunds (Jerusalem day) |
| CE2 | voucher issued אחרי חצות | bucket לפי `issued_at` Jerusalem |
| CE3 | export גדול | async job + signed URL |
| CE4 | admin לא super_admin | read OK; money-out actions נפרד |
| CE5 | שורת קופון ב-settlement payout | **לא** מופיעה (No Escrow) |
| CE6 | PAN בדוח | **לעולם לא** (last4 בלבד אם בכלל) |

---

## פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | סף N ל-async export | RUNBOOK |
| O2 | פורמט headers CSV (`,` vs `#`) | product decision |
| O3 | coupon liability vs רו"ח | disclaimer ב-UI |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-03 | מסמך ראשוני |
| 2026-08-12 | batch-2: BINDING; הסרת Escrow מ-settlements; 5 סעיפים |
