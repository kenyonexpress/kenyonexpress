# מפרט דף מוצר באדמין (כסף דינמי)

ארבעת שדות הכסף הדינמיים, שדות ספק חובה, snapshot ל-`order_items`, וכללי validation.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. מודל כסף: **No Escrow**; agorot integer; `platform_percent` **בלי default**.

היררכיה: `docs/CONTRADICTIONS.md` גובר. מודל 28.07: קופון = תשלום מלא בפלטפורמה; פיזי = פיצול מיידי.

מסמכים קשורים:

```
docs/ADMIN-PRODUCT-EDITOR-SPEC.md
docs/ARCHITECTURE-PRICING-RULES.md
docs/ARCHITECTURE-MONEY.md
docs/PRODUCT-PAGE-SPEC.md
```

---

## החלטה

| # | הכרעה |
|---|---|
| M1 | **אין עמלה קבועה** ו**אין DEFAULT** על ארבעת מפתחי הכסף. |
| M2 | ערך חסר נשאר חסר; אסור לכפות 0 בשקט (0 = "ספק לא מקבל כלום"). |
| M3 | עמלת פלטפורמה מעוגלת **פעם אחת** על בסיס on-site; פיזי: חלק ספק = `base − platformFee`. |
| M4 | ברכישה: מפתחי כסף + זהות ספק **מצולמים** ל-`order_items` (C10). |
| M5 | publish מדווח **כל** סיבת כשל בבת אחת. |
| M6 | קופון 28.07: כל המקדמה = `platform_settled`; ספק = **0 מהפלטפורמה**; יתרה בעסק במזומן. |
| M7 | זוג `platform_percent` + `supplier_split_percent` חייב לסכום 100 (±0.01). |
| M8 | `coupon_price_ils`: מוחלט; `0 < coupon ≤ price_ils`; לא נגזר מ-`discount_percent`. |
| M9 | `discount_percent`: פיזי = מחיר on-site; קופון = תג תצוגה בלבד, מסונכרן ל-`deriveDiscountPercent`. |

### ארבעת שדות הכסף

| עמודה | משמעות | קופון | פיזי |
|---|---|---|---|
| `platform_percent` | חלק פלטפורמה מ-on-site | חובה, 100/0 מומלץ | חובה |
| `supplier_split_percent` | חלק ספק (דיווח) | משלים ל-100 | משלים ל-100 |
| `discount_percent` | הנחה מ-sticker | תצוגה בלבד | מחיר on-site |
| `coupon_price_ils` | תשלום באתר | חובה | NULL |

### תצוגה on-site (preview)

```text
coupon:
  paidOnline          = coupon_price_ils (agorot)
  balanceAtBusiness   = price_ils − coupon_price_ils
  platformKeeps       = paidOnline
  supplierFromPlatform = 0

physical:
  paidOnline          = price_ils × (1 − discount_percent/100)
  platformFee         = percentageOf(base, platform_percent)
  supplierImmediate   = base − platformFee
```

### שדות ספק (publish gate)

`supplier_id`, `name`, `contact_phone`, `address`, `city`, `logo_url`, `status=active`. הודעות חסימה בעברית לפי שדה חסר.

---

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| `commission_percent` DEFAULT 5 | M1: אין default. |
| Escrow / `escrow_holds` על קופון | No Escrow; 28.07. |
| קריאת `suppliers.commission_percent` בקופה | prefill בלבד; לא ב-checkout. |
| נגזור `coupon_price` מ-`discount_percent` | M8: מחיר מוחלט. |
| JOIN ל-`products` בעבר הזמנה | snapshot בלבד (C10). |
| payout קופון מהפלטפורמה | M6: יתרה בעסק. |

---

## סכמת DB

```text
products
  platform_percent numeric(5,2)   -- NO DEFAULT
  supplier_split_percent numeric(5,2)
  discount_percent numeric(5,2)
  coupon_price_ils numeric(12,2)
  price_ils, coupon_expiry_days, type, supplier_id

order_items (snapshot ברכישה)
  platform_percent, supplier_split_percent, discount_percent
  coupon_price_ils (NULL פיזי)
  supplier_id, supplier_name, supplier_phone, supplier_address, supplier_logo_url
  paid_on_site_agorot, commission_agorot, supplier_payout_ils
  settlement_status  -- coupon: platform_settled

CHECKs (070):
  products_split_pair_sums_to_100
  products_coupon_price_within_price
  order_items_split_pair_sums_to_100
```

אין DDL חדש. מיגרציה: `070_product_dynamic_split.sql`. יישום: `src/lib/commerce/product-money.ts`.

---

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | רק `platform_percent` בטופס | `completeSplitPair` ממלא supplier = 100−platform |
| CE2 | שני חצאים שסכומם ≠ 100 | דחייה; לא בוחרים מנצח |
| CE3 | publish קופון בלי `coupon_price_ils` | חסימה: "חובה להגדיר מחיר קופון. אין ברירת מחדל." |
| CE4 | `discount_percent` לא תואם derive | דחייה על קופון |
| CE5 | checkout: מוצר בלי split | כשל; לא substitute defaults |
| CE6 | שינוי percent אחרי רכישה | `order_items` לא משתנה |
| CE7 | WP import: שורות חסרות percent | אינדקס `products_needs_pricing_idx` |
| CE8 | קופון עם supplier_split ≠ 0 | snapshot נשמר; settlement עדיין 0 לספק |

---

## פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | החלת CHECKs על שורות pre-070 | `NOT VALID` היסטורי. |
| O2 | backfill 61 מוצרים חיים בלי percent | משימה 0.3 ב-`PRODUCT-PAGE-SPEC`. |
| O3 | UI preview "ספק מהפלטפורמה: ₪0" על קופון | חובה בטופס; וידוא visual QA. |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-07-29 | rev A: ארבעה שדות דינמיים |
| 2026-08-12 | batch-2: BINDING 5 סעיפים; No Escrow; agorot |
