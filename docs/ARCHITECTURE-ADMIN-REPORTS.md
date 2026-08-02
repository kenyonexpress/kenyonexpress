# ARCHITECTURE: Admin Reports

דוחות אדמין: הכנסות יומיות, עמלת פלטפורמה לפי מוצר, התחשבנות ספקים, התחייבות קופונים (נמכרו ולא מומשו), ייצוא CSV.

Status: **BINDING** · Updated: 2026-08-03  
Scope: **docs only** · branch `arch/docs-queue`  
אין שינוי קוד. אין נגיעה ב-worktree הראשי.

Companions:

```
docs/ARCHITECTURE-SUPPLIER-ANALYTICS.md
docs/ARCHITECTURE-ANALYTICS.md
docs/ARCHITECTURE-REFUNDS-DISPUTES.md
docs/RUNBOOK-OPERATIONS.md
docs/ARCHITECTURE-WALLET-CASHBACK.md
```

---

## 0. הכרעות מחייבות

| # | הכרעה |
|---|---|
| AR1 | מקור אמת כספי: `orders` / `order_items` / `vouchers` / ledger. לא GA4. |
| AR2 | כל הסכומים בדוח: agorot בחישוב; תצוגה וייצוא ל-UI ב-₪ (שתי ספרות) + עמודת agorot אופציונלית. |
| AR3 | `platform_percent` ו-commission **רק מהסנאפשוט** בשורת הזמנה. |
| AR4 | Coupon liability = paid on-site על vouchers בסטטוס `issued` (עדיין לא redeemed/cancelled/expired לפי מדיניות). |
| AR5 | גישה: `is_admin()` בלבד. כל ייצוא ב-`audit_log`. |
| AR6 | אזור זמן דוחות: `Asia/Jerusalem`. |
| AR7 | CSV: UTF-8 עם BOM לתאימות Excel עברית. |

---

## 1. משטחי UI

```text
/admin/reports
  /admin/reports/daily-revenue
  /admin/reports/commission-by-product
  /admin/reports/supplier-settlements
  /admin/reports/coupon-liability
  /admin/reports/export  (actions)
```

פילטרים משותפים: תאריך מ–עד, ספק, סוג מוצר (coupon/physical), סטטוס הזמנה.

---

## 2. Daily revenue

| מדד | הגדרה |
|---|---|
| Gross on-site | סכום ששולם באתר להזמנות `paid` ביום (Jerusalem) |
| Refunds | סכום refunds `succeeded` ביום |
| Net on-site | Gross − Refunds |
| Platform commission | סכום `commission_agorot` משורות ביום (פיזי + חלק קופון לפי מודל) |
| Orders count | מספר הזמנות paid |
| Vouchers issued | מספר שוברים שהונפקו ביום |
| Vouchers redeemed | מספר מימושים ביום |

גרף: 14/30 יום. טבלה יומית לייצוא.

---

## 3. Platform commission per product

שורות:

| עמודה | מקור |
|---|---|
| product_id / name_he | products / snapshot |
| supplier_id / name | |
| product_type | coupon / physical |
| units_sold | |
| gross_paid_agorot | |
| platform_percent_snapshot | avg או per-line detail בפירוט |
| commission_agorot | sum |
| period | |

פירוט לחיצה: פיצול להזמנות. אסור לחשב מ-`products.platform_percent` החי.

---

## 4. Supplier settlements

| עמודה | משמעות |
|---|---|
| supplier_id | |
| period | |
| physical_due_agorot | יתרה לפיצול אחרי עמלה (מדיניות hold) |
| coupon_held_agorot | מקדמות held עד redeem |
| coupon_released_agorot | שוחרר אחרי redeem בתקופה |
| refunds_clawback_agorot | קיזוזים |
| payout_status | pending / paid / on_hold |
| payout_agorot | סכום להעברה בנקאית (אם בתקופה) |

התאמה למודל Escrow 2026-07-27: קופון לא מופיע כ-payout מיידי בעת מכירה.

---

## 5. Coupon liability (sold but unredeemed)

התחייבות / חשיפה תפעולית:

| מדד | הגדרה |
|---|---|
| Open vouchers | count `issued` |
| Liability face remaining | sum יתרה לתשלום בעסק על issued (אם נשמר) |
| Liability on-site held | sum חלק מקדמה ב-held / paid on-site לפי מדיניות דיווח |
| Aging | buckets: 0–7d, 8–30d, 31–90d, 90d+ עד expiry |
| Expiring 7d | issued עם `expires_at` ב-7 ימים |

דוח זה לניהול סיכון ותזרים; לא מחליף דוח רו״ח.

ייצוא CSV חובה לתאריך חתך.

---

## 6. Export to CSV

| דוח | שם קובץ לדוגמה |
|---|---|
| Daily revenue | `ke-daily-revenue-YYYYMMDD-YYYYMMDD.csv` |
| Commission by product | `ke-commission-by-product-….csv` |
| Settlements | `ke-supplier-settlements-….csv` |
| Coupon liability | `ke-coupon-liability-asof-YYYYMMDD.csv` |

כללים:

1. UTF-8 BOM
2. מפריד `,` או `#` לפי בחירת מוצר; עברית ב-headers
3. שורת מטא: generated_at, timezone, filters
4. מקסימום שורות / async job אם > N (יעד: הורדה דרך signed URL ב-R2)
5. `audit_log`: admin_id, report_type, filters, row_count

---

## 7. הרשאות ואבטחה

- רק admin
- אין CSV למייל אוטומטי עם PII בלי הצפנה
- Rate limit על export
- מספרי כרטיס: לעולם לא בדוח (last4 בלבד אם בכלל)

---

## 8. Acceptance

- [ ] ארבעת הדוחות מוגדרים עם נוסחאות snapshot
- [ ] Coupon liability על `issued`
- [ ] CSV UTF-8 + audit
- [ ] timezone ירושלים

---

## 9. Revision

| Date | Change |
|---|---|
| 2026-08-03 | מסמך ראשוני על arch/docs-queue |
