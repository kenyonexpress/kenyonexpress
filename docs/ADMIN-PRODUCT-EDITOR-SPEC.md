# ADMIN-PRODUCT-EDITOR-SPEC.md
# מפרט עורך מוצר באדמין (UI מלא)

מפרט ל-
`ProductForm`
ולדפי
`/admin/products/new`
|
`/admin/products/[id]/edit`
: שלושה מצבי סוג, ולידציות, RTL בעברית.

Status: **SPEC** · עודכן: 2026-08-11  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`

מסמכים קשורים:

```
docs/PRODUCT-FIELDS-RESEARCH.md
docs/ARCHITECTURE-PRICING-RULES.md
docs/BUSINESS-MODEL.md
docs/ARCHITECTURE-SUBSCRIPTIONS.md
docs/SEED-SUPPLIERS-SPEC.md
docs/ADMIN-USER-GUIDE.md
docs/CONTRADICTIONS.md
```

יישום נוכחי (קוד): בעיקר `coupon` | `physical`. מצב `subscription` = יעד UI לפי מסמך זה (טרם חובה בפרוד).

---

## 0. הכרעות

| # | הכרעה |
|---|---|
| E1 | שלושה מצבים לפי `products.type`: **קופון / פיזי / מנוי**. |
| E2 | UI אדמין: עברית, `dir="rtl"`, לייבלים מימין. |
| E3 | `platform_percent` חובה לפרסום; **אין default**. |
| E4 | קופון: `coupon_price` מוחלט; הנחה % נגזרת לתצוגה בלבד. |
| E5 | פיזי: `platform_percent` + `supplier_split_percent` מסתכמים ל-100. |
| E6 | מנוי: `recurring_amount` + `billing_interval=monthly`; לא מציג שדות קופון. |
| E7 | ספק: חובה לקופון/פיזי לפני publish; readiness לפי SEED-SUPPLIERS. |
| E8 | כסף בטופס: קלט ב-₪; שמירה לפי הסכמה החיה (ILS או agorot אחרי cutover). |
| E9 | אין שפת Escrow / נאמן / held בטופס או בטולטיפים. |

---

## 1. מבנה מסך (RTL)

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

כיוון: `dir="rtl"` על הטופס; מספרי כסף ב-`<bdi dir="ltr">` אם צריך; שגיאות מעל השדה.

---

## 2. שלושת המצבים

### 2.1 קופון (`type=coupon`)

| שדה | חובה | ולידציה |
|---|---|---|
| `kenyon_price` / face (שווי דיל) | כן | > 0 |
| `coupon_price_ils` (מחיר באתר) | כן | > 0 ו-`≤ face` |
| `coupon_expiry_days` | כן | ≥ מינימום מדיניות (למשל 120) |
| `platform_percent` | כן | 0–100; בלי default ריק |
| `supplier_split_percent` | כן | משלים ל-100 עם platform |
| `discount_percent` | לא (נגזר) | read-only בתצוגה |
| יתרה בעסק | מחושב | face − coupon; מוצג בעברית |
| וריאנטים | לא | מוסתרים או מושבתים |

טולטיפ חובה:

> הלקוח משלם באתר את מחיר הקופון. היתרה משולמת בעסק. אין העברת מקדמה לספק.

### 2.2 פיזי (`type=physical`)

| שדה | חובה | ולידציה |
|---|---|---|
| מחיר מחירון / `kenyon_price` | כן | > 0 |
| `platform_percent` | כן | 0–100 |
| `supplier_split_percent` | כן | סכום הזוג = 100 (±0.01) |
| `coupon_price_*` | לא | מוסתר |
| וריאנטים | אופציונלי | מחיר/מלאי לכל וריאנט |
| משלוח / הערות | אופציונלי | |

תצוגת פיצול חיה: "פלטפורמה ₪X · ספק ₪Y" לפי אחוזים על המחיר.

### 2.3 מנוי (`type=subscription`)

| שדה | חובה | ולידציה |
|---|---|---|
| `recurring_amount` (₪/חודש) | כן | > 0 |
| `billing_interval` | כן | `monthly` בלבד ב-MVP |
| `max_billing_cycles` | לא | null = ללא הגבלה; או ≥ 1 |
| `platform_percent` | כן | כמו פיזי אם יש ספק |
| שדות קופון / QR | לא | מוסתרים |
| קישור למדיניות ביטול | כן (UI) | לינק ל-REFUNDS / LEGAL |

טולטיפ: חיוב חוזר Cardcom; ביטול מאזור אישי. פירוט: `ARCHITECTURE-SUBSCRIPTIONS.md`.

---

## 3. ולידציות (שרת + לקוח)

| כלל | הודעת שגיאה (עברית) |
|---|---|
| שם ריק | יש להזין שם מוצר |
| slug לא חוקי | slug באנגלית/מקפים בלבד |
| platform ריק | חובה לקבוע אחוז פלטפורמה (אין ברירת מחדל) |
| זוג אחוזים ≠ 100 | אחוז פלטפורמה + אחוז ספק חייבים להסתכם ל-100 |
| coupon > face | מחיר הקופון לא יכול לעלות על שווי הדיל |
| ספק חסר ב-publish | יש לבחור ספק מוכן (טלפון, כתובת, לוגו) |
| ספק לא ready | הצג רשימת חוסרים מ-`supplierReadiness` |
| מנוי בלי סכום | יש להזין סכום חיוב חודשי |

ולידציית שרת (zod ב-`upsertProduct`) היא מקור האמת; client = UX בלבד.

---

## 4. ספק ו-readiness

- Select ספקים פעילים.  
- אם נבחר ספק חסר לוגו/טלפון/כתובת: באנר אזהרה + קישור ל-
  `/admin/suppliers/[id]`
  .  
- Publish ל-`status=published` נחסם עד readiness (או אישור מפורש ל-draft בלבד).

---

## 5. מדיה, תוכן, SEO

| בלוק | כללים |
|---|---|
| תמונות | ImageUploader; לפחות תמונה אחת לפני publish |
| תיאור עברית | RTL; בלי Escrow |
| `coupon_terms_he` | רק במצב קופון |
| SEO title/description | אופציונלי; מציגים תצוגה מקדימה |

---

## 6. נגישות ו-RTL

- לייבלים מקושרים ל-`htmlFor` / `id`.  
- שגיאות `role="alert"`.  
- פוקוס נראה על שדות ושגיאות.  
- סדר tab הגיוני מימין לשמאל.  
- אל תשתמש ב-`dir=ltr` על כל הטופס.

---

## 7. מצבי שמירה

| פעולה | תוצאה |
|---|---|
| שמירת טיוטה | `draft`; ולידציות רכות יותר |
| פרסום | כל שערי §3 + ספק ready |
| שינוי סוג מוצר | אישור אם יש הזמנות קיימות; אחרת איפוס שדות לא רלוונטיים |

---

## 8. Acceptance

- [ ] מעבר בין 3 מצבים מחליף שדות בלי שדות "רפאים"  
- [ ] platform_percent ריק → שגיאה בעברית  
- [ ] קופון: יתרה בעסק מוצגת נכון  
- [ ] פיזי: סכום אחוזים = 100  
- [ ] מנוי: אין שדות QR/יתרה בעסק  
- [ ] RTL תקין ב-Chrome + Safari  
- [ ] אין ניסוח Escrow  

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-11 | מפרט UI אדמין: 3 מצבים, ולידציות, RTL |
