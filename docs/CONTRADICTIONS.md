# CONTRADICTIONS: הכרעות עסקיות סופיות

מסמך זה גובר על כל נוסח סותר בפרויקט. ברירות מחדל ישנות שלא מופיעות כאן אינן מחייבות.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.  
מודל כסף: **No Escrow**

מקורות קשורים:

```
docs/BUSINESS-MODEL.md
docs/ARCHITECTURE-MONEY.md
docs/ARCHITECTURE-PRICING-RULES.md
```

---

## 1. החלטה (מחייבת)

| # | הכרעה |
|---|---|
| C1 | **אין ברירת מחדל ל-`platform_percent`.** שדה חובה פר מוצר. `NOT NULL` בלי `DEFAULT`. |
| C2 | **עמודה אחת לפיצול:** `platform_percent`. `commission_percent` יוצא משימוש. |
| C3 | **No Escrow.** אין held לספק על מקדמת קופון. אין J5. אין נאמן חיצוני. |
| C4 | **מחיר קופון:** `coupon_price_ils` סכום מוחלט. ההנחה נגזרת לתצוגה, לא להיפך. |
| C5 | **עמלה על המקדמה בלבד** (מה שנגבה באתר), לא על face מלא. |
| C6 | **קופון שפג בלי מימוש:** זיכוי לארנק הלקוח (C6). לא חילוט לפלטפורמה. |
| C7 | **תוקף:** `coupon_expiry_days` (או `expiry_days`) פר מוצר. |
| C8 | **payout פיזי:** T+3 ימי עסקים, מינימום 100 ₪. מתחת לסף: גלגול. |
| C9 | **Cardcom + Vercel בלבד.** אין Stripe / Payoneer / Cloudways. |
| C10 | **Snapshot:** `platform_percent` + `supplier_split_percent` מצולמים ל-`order_items` בקנייה. |
| C11 | **קופון (No Escrow):** הלקוח משלם באתר את `coupon_price` **כולו לפלטפורמה**. `supplier_due = 0`. יתרה (`face − paid_on_site`) נגבית בבית העסק מחוץ לפלטפורמה. |
| C12 | **שני אחוזים נשמרים:** `platform_percent` + `supplier_split_percent`, CHECK `= 100`. שניהם ב-snapshot. |

### שלושת השדות שהאדמין מגדיר פר מוצר

| שדה | משמעות | חל על |
|---|---|---|
| `coupon_price_ils` | סכום מוחלט באתר | קופון |
| `platform_percent` | עמלת פלטפורמה, חובה, אין default | קופון + פיזי |
| `supplier_split_percent` | משלים ל-100, נשמר + snapshot | קופון + פיזי |

---

## 2. חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| Escrow / held פנימי לספק על מקדמת קופון | סותר C11 / No Escrow. היסטוריה 27.07 בוטלה. |
| `platform_percent = 5%` (או כל default) | מסתיר מוצר לא מוגדר. C1. |
| הספק מקבל 0 תמיד (גרסה ישנה של C11) | בוטלה 27.07. קופון: 0 מהפלטפורמה; פיזי: לפי split. |
| אחוז הספק נגזר בלבד בלי עמודה | נתונים קיימים ב-`supplier_split_percent`; snapshot דורש שני ערכים. |
| פקיעה = breakage לפלטפורמה | סותר C6. |
| Stripe / Payoneer | סותר C9. |
| מחיר קופון נגזר מאחוז | יוצר פער ציטוט/חיוב. C4. |

---

## 3. סכמת DB (קיים; אין DDL חדש במסמך זה)

| טבלה / enum | שדות / ערכים רלוונטיים |
|---|---|
| `products` | `platform_percent`, `supplier_split_percent`, `coupon_price_ils`, `coupon_expiry_days`, CHECK סכום 100 |
| `order_items` | snapshot אחוזים + agorot: `platform_fee`, `supplier_due`, `balance_due`, `paid_on_site` |
| `settlement_status` | `platform_settled` לקופון (071) |
| `vouchers` | QR, סטטוס, `platform_percent` בזמן הנפקה |
| `escrow_holds` / `escrow_held_agorot` | **legacy.** No Escrow: לא נכתב / תמיד 0 |

מיגרציות מפתח (קריאה בלבד):

```
supabase/migrations/050_*.sql
supabase/migrations/070_product_dynamic_split.sql
supabase/migrations/071_settlement_status_platform_settled.sql
```

---

## 4. מקרי קצה

| # | מצב | התנהגות מחייבת |
|---|---|---|
| E1 | מוצר בלי `platform_percent` | חסימת publish / checkout |
| E2 | `platform + supplier ≠ 100` | DB CHECK / validation |
| E3 | שינוי אחוז אחרי קנייה | snapshot ב-`order_items` לא משתנה |
| E4 | קופון נסרק | סטטוס redeemed; אין payout פלטפורמה→ספק |
| E5 | קופון פג | זיכוי ארנק (C6) |
| E6 | פיזי: החזר אחרי split | `supplier_debit` + יישוב payout (ראה PAYOUT-MECHANISM) |
| E7 | Cardcom הצליח, enum חסר | `platform_settled` חייב קיים (071) |
| E8 | מחיר קופון שונה בין UI לחיוב | שניהם מ-`coupon_price_ils` בלבד |

---

## 5. פתוחות

| # | פער | בעלות |
|---|---|---|
| O1 | מיגרציות 050/070/079/080/081 טרם הוחלו בפרוד | MCP apply (אישור אופיר) |
| O2 | מסך payout אדמין מול טבלאות חסרות | קוד + DDL (ראה GAPS) |
| O3 | `supplier_split_percent` בטופס: שמירה מלאה | server action |
| O4 | ניקוי אזכורי Escrow בקוד legacy | refactor |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | BINDING batch-2: No Escrow, חמש סעיפים, הסרת היסטוריית Escrow כמחייב |
| 2026-07-28 | היפוך 28.07 (No Escrow) |
| 2026-07-27 | הכרעה 27.07 (בוטלה) |
