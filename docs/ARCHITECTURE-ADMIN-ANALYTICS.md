# ארכיטקטורה: Admin Analytics

סקירת BINDING למסכי אנליטיקה באדמין. פירוט KPI/BI במסמכי analytics.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.  
מודל כסף: **No Escrow**; revenue מ-snapshot `order_items`.

מסמכים קשורים (מקור מלא):

```
docs/ARCHITECTURE-ANALYTICS.md
docs/ARCHITECTURE-ANALYTICS-BI.md
docs/ARCHITECTURE-ANALYTICS-KPI.md
docs/ARCHITECTURE-ADMIN-DASHBOARD.md
docs/ADMIN-ARCHITECTURE.md
```

קוד dump ישן (loaders, recharts): git history לפני 2026-08-12.

---

## החלטה

| # | הכרעה |
|---|---|
| AA1 | Route ראשי: `/admin/analytics` עם tabs: sales, coupons, suppliers, settlement. |
| AA2 | כסף: integer agorot פנימית; תצוגה ₪; לא sum על float `_ils`. |
| AA3 | Revenue מ-`order_items` snapshot; לא מ-`products.platform_percent` חי. |
| AA4 | קופון: platform revenue = paid_on_site; supplier due = 0 מ-prepaid. |
| AA5 | יום עסקים: `Asia/Jerusalem` (`israelDayKey`). |
| AA6 | Auth: `requireAdminPage()`; staff/content_uploader לא רואים כסף. |
| AA7 | CSV export: admin בלבד; BOM UTF-8; `Cache-Control: no-store`. |
| AA8 | Truncation: `MAX_LINES` 50K; אזהרה + SQL views בעתיד. |

---

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| ledger שני ל-analytics | AA3: אותן טבלאות orders/order_items. |
| GMV מ-PostHog בווידג'ט כסף | BI doc: משפך נפרד. |
| Escrow columns בחישוב קופון | AA4: No Escrow; treat held as 0. |
| recalc commission מ-percent חי | AA3: snapshot בלבד. |
| קוד dump 1900 שורות במסמך | BINDING pointer + git history. |

---

## סכמת DB

קריאה בלבד (קיים):

```text
order_items (snapshots, product_type, supplier_id)
orders (paid_at, status)
vouchers (issued_at, redeemed_at, status, paid_on_site_agorot)
payout_statement_lines → payout_statements
```

Indexes מתוכננים: `orders_paid_at`, `vouchers_redeemed_at`. אין DDL חדש כאן.

---

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | 50K+ שורות בטווח | truncated=true; צמצם טווח או SQL view. |
| CE2 | legacy `coupon_codes` + `vouchers` | קרא vouchers ראשון. |
| CE3 | escrow_release על שורת קופון | supplier due = 0; לא payout prepaid. |
| CE4 | staff ניגש ל-CSV | 403; RBAC nav. |
| CE5 | שינוי percent אחרי רכישה | גרף היסטורי לא משתנה. |
| CE6 | settlement tab: קופון בטעות | filter `product_type = physical` בלבד. |

---

## פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | SQL views `v_admin_*_agorot` | כש-truncation בפרוד. |
| O2 | מעבר `SaleLine` מ-`_ils` ל-agorot | יישום PR. |
| O3 | affiliate BI | `/admin/affiliates` נפרד. |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-07-30 | Admin analytics expansion (dump) |
| 2026-08-12 | batch-2: BINDING קצר; pointer ל-analytics docs |
