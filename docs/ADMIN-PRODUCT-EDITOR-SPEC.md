# מפרט עורך מוצר באדמין

מפרט UI ל-`ProductForm` ולדפי `/admin/products/new` | `/admin/products/[id]/edit`: שלושה מצבי סוג, ולידציות, RTL בעברית.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. מודל כסף: **No Escrow**; agorot integer; `platform_percent` **בלי default**.

מסמכים קשורים:

```
docs/ADMIN-PRODUCT-PAGE-SPEC.md
docs/ARCHITECTURE-ADMIN-PRODUCT-FIELDS.md
docs/ARCHITECTURE-PRICING-RULES.md
docs/SEED-SUPPLIERS-SPEC.md
docs/ARCHITECTURE-SUBSCRIPTIONS.md
```

---

## החלטה

| # | הכרעה |
|---|---|
| E1 | שלושה מצבים לפי `products.type`: **קופון / פיזי / מנוי**. |
| E2 | UI אדמין: עברית, `dir="rtl"`, לייבלים מימין. |
| E3 | `platform_percent` חובה לפרסום; **אין default**; ריק = שגיאה. |
| E4 | קופון: `coupon_price_ils` מוחלט; הנחה % נגזרת לתצוגה בלבד. |
| E5 | פיזי: `platform_percent` + `supplier_split_percent` מסתכמים ל-100. |
| E6 | מנוי: `recurring_amount_agorot` + `billing_interval=monthly`; אין שדות קופון/QR. |
| E7 | ספק: חובה לקופון/פיזי לפני publish; readiness לפי `SEED-SUPPLIERS-SPEC`. |
| E8 | כסף בטופס: קלט ב-₪; שמירה כ-**agorot integer** בשרת. |
| E9 | אין ניסוח Escrow / נאמן / held בטופס או בטולטיפים. |
| E10 | ולידציית שרת (zod ב-`upsertProduct`) היא מקור האמת; client = UX בלבד. |

### מבנה מסך (RTL)

```text
[ התראות שגיאה/הצלחה ]
[ זהות: שם עברית | slug | קטגוריה | סטטוס ]
[ סוג מוצר: ○ קופון  ○ פיזי  ○ מנוי ]   ← מחליף בלוקי מחיר
[ ספק + אזהרת readiness ]
[ בלוק מחיר לפי מצב ]
[ מלאי / וריאנטים (פיזי) ]
[ מדיה: ImageUploader ]
[ תוכן: תיאור, תנאי קופון ]
[ SEO ]
[ שמירה ]
```

### שדות לפי מצב

**קופון:** `kenyon_price`, `coupon_price_ils`, `coupon_expiry_days` (מינימום 120), `platform_percent`, `supplier_split_percent` (100/0 מומלץ), יתרה בעסק = face − coupon (תצוגה).

**פיזי:** `kenyon_price`, `platform_percent`, `supplier_split_percent`, וריאנטים אופציונליים, תצוגת פיצול חיה.

**מנוי:** `recurring_amount_agorot`, `billing_interval`, `max_billing_cycles`, `platform_percent` אם יש ספק; קישור למדיניות ביטול.

---

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| default 5% ל-`platform_percent` | E3: אין ברירת מחדל שקטה. |
| הנחה % כמקור לחיוב קופון | C4: מחיר קופון מוחלט בלבד. |
| Escrow / held בטולטיפ קופון | No Escrow; יתרה בעסק במזומן. |
| `dir=ltr` על כל הטופס | E2: RTL מלא; LTR רק ב-`<bdi>` לסכומים. |
| publish בלי ספק ready | E7: חסימה או draft בלבד. |
| שינוי סוג בלי אישור כשיש הזמנות | איפוס שדות לא רלוונטיים רק אחרי אישור. |

---

## סכמת DB

כתיבה/קריאה (קיים):

```text
products
  type, status, name_he, slug, category_id, supplier_id
  price_ils / kenyon_price, full_price
  platform_percent, supplier_split_percent, discount_percent
  coupon_price_ils, coupon_expiry_days
  stock_quantity, images, seo_*, redemption_instructions_he
  coupon_terms_he, has_variants, variant_axes

product_variants (פיזי)
  price_agorot, stock_quantity, option_values, sku

suppliers (readiness)
  name, contact_phone, address, city, logo_url, status
```

אין DDL חדש במסמך זה. פירוט כסף: `ADMIN-PRODUCT-PAGE-SPEC.md`.

---

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | `platform_percent` ריק ב-publish | שגיאה: "חובה לקבוע אחוז פלטפורמה (אין ברירת מחדל)" |
| CE2 | זוג אחוזים ≠ 100 | דחייה; לא "בוחרים מנצח" |
| CE3 | `coupon_price` > face | דחייה בעברית |
| CE4 | ספק חסר לוגו/טלפון/כתובת | באנר + חסימת publish |
| CE5 | מעבר קופון→פיזי עם הזמנות | אישור; שדות קופון מוסתרים, לא נמחקים מהיסטוריה |
| CE6 | מנוי: שדות QR/יתרה | מוסתרים לגמרי |
| CE7 | שמירת טיוטה | ולידציות רכות; publish = כל שערי §החלטה |
| CE8 | WP import: חסר percent | פילטר אדמין "חסר percent" (dashboard) |

---

## פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | `type=subscription` בפרוד | UI לפי E6; יישום מלא ב-`ARCHITECTURE-SUBSCRIPTIONS`. |
| O2 | אכיפת רצפת 120 יום ב-zod | CHECK בטיוטת 081; משימה 1.0 ב-`PRODUCT-PAGE-SPEC`. |
| O3 | `cashback_bp` בטופס | עמודה קיימת; שדה UI עתידי. |
| O4 | `cost_ils` / רווח גולמי | לא חוסם מכירה. |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-11 | rev A: UI 3 מצבים, RTL |
| 2026-08-12 | batch-2: BINDING 5 סעיפים; No Escrow; agorot |
