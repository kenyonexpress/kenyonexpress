# מודל עסקי KenyonExpress

תקציר BINDING לשלושת סוגי המוצר, תזרים כסף, ופרטי ספק. פירוט טכני:

```
docs/ARCHITECTURE-PRODUCT-TYPES.md
docs/ARCHITECTURE-PRICING-RULES.md
docs/ARCHITECTURE-COMMERCE.md
```

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.  
מודל כסף: **No Escrow**; `platform_percent` פר מוצר בלי default; אגורות integer.

---

## החלטה

| # | הכרעה |
|---|---|
| BM1 | שלושה סוגי מוצר: **קופון**, **פיזי**, **מנוי** (חיוב חוזר). |
| BM2 | קופון: הלקוח משלם באתר רק `coupon_price` (מוחלט פר מוצר); **100% מהתשלום באתר נשאר בפלטפורמה**; יתרה נגבית בבית העסק; **אין payout לספק על קופון**. |
| BM3 | פיזי: הלקוח משלם 100% באתר; פיצול לפי `platform_percent` **חובה פר מוצר**, snapshot ב-`order_items`; payout לספק לפי `ARCHITECTURE-PAYOUT-MECHANISM.md`. |
| BM4 | מנוי: חיוב חוזר Cardcom Token; פיצול כמו פיזי **פר חיוב**; ביטול מאזור אישי. |
| BM5 | `platform_percent` **אין default** (לא DB, לא קוד, לא ברמת ספק). |
| BM6 | כסף: **אגורות** בלבד; חישוב דרך `src/lib/money.ts`. |
| BM7 | פרטי ספק חובה בכל PDP: שם, כתובת, Waze, טלפון, WhatsApp, שעות, עיר, lat/lng. |
| BM8 | Geo: מיון לפי מרחק; ברירת מחדל כל הארץ; "קרוב אליי" אופציונלי. |

---

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| Escrow / held לספק עד מימוש קופון | No Escrow (C11א); ספק גובה יתרה בעסק; אין נאמן. |
| `platform_percent` גלובלי 5%/10% | C1: אין ברירת מחדל; admin קובע פר מוצר. |
| `coupon_price` כאחוז מהערך הנקוב | C4: מחיר מוחלט פר מוצר. |
| payout אוטומטי לספק על קופון | BM2: כל תשלום הקופון לפלטפורמה. |

---

## סכמת DB

שדות מרכזיים (קיים; אין DDL חדש):

```text
products: product_type, coupon_price_agorot, price_agorot, platform_percent,
          supplier_split_percent, supplier_id, billing_interval, recurring_amount_agorot
order_items: platform_percent (snapshot), platform_amount_agorot, supplier_amount_agorot,
             paid_on_site_agorot, settlement_status
suppliers: name, address, phone, whatsapp, lat, lng, opening_hours
vouchers: status (issued → redeemed)
```

מיגרציות: 050 (percent NOT NULL בלי DEFAULT), commerce core.

---

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | מוצר בלי `platform_percent` | חסום מפרסום. |
| CE2 | `coupon_price` > מחיר דיל | validation חוסם. |
| CE3 | קופון פג לפני מימוש | wallet credit / מדיניות ביטול (LEGAL). |
| CE4 | מימוש כפול QR | redeem idempotent; voucher `redeemed`. |
| CE5 | שינוי percent אחרי publish | הזמנות חדשות בלבד; snapshot ישן נשמר. |
| CE6 | מנוי: כרטיס נדחה בחיוב חוזר | retry + התראה; לא chargeback אוטומטי לספק. |

---

## פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | מנוי: מספר חיובים מקסימלי vs ללא הגבלה | `ARCHITECTURE-RECURRING-SUBSCRIPTIONS.md`. |
| O2 | פיזי: go-live לפני payout engine מלא | G1; ספקי קופון בלבד OK. |
| O3 | B2B percent שונה | `ARCHITECTURE-B2B-SALES.md`. |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | batch-2: BINDING 5 סעיפים; קיצור + הפניות |
