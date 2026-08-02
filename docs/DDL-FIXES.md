# DDL-FIXES

תיקוני DDL קריטיים לנתיב קופון / settlement, וסדר החלה בטוח של 027+054.

Status: **ops runbook** · Updated: 2026-08-02  
Scope: docs only. לא מריץ מיגרציות במסמך הזה.

פרויקט hosted:

```
ixvwfbuvfxxsjiywhbbb
```

משמעת החלה בפרויקט:

1. רק Supabase MCP `apply_migration` (name + query).
2. **אסור** `supabase db push` לייצור.
3. קובץ אחד = טרנזקציה אחת.
4. אחרי ADD VALUE ל-enum: **לא** להשתמש בלייבל החדש באותה טרנזקציה (השוואה כ-`::text` אם חייבים).
5. אחרי החלה: לסנכרן `src/types/database.ts`.

Companion:

```
docs/PRODUCTION-CHANGES-2026-07-27.md
docs/CONTRADICTIONS.md
supabase/migrations/071_settlement_status_platform_settled.sql
supabase/migrations/072_027subset_supplier_members.sql
supabase/migrations/073_vouchers_escrow_model.sql
```

---

## 0. מצב hosted (נכון ל-2026-07-27)

| MCP migration name | קובץ ב-repo | סטטוס |
|---|---|---|
| `071_settlement_status_platform_settled` | `071_settlement_status_platform_settled.sql` | **הוחל** |
| `054_section2_product_coupon_price_fields` | `054_section2_product_coupon_price_fields.sql` | **הוחל** |
| `027_subset_supplier_members_for_vouchers` | `072_027subset_supplier_members.sql` | **הוחל** (subset בלבד) |
| `054_vouchers_tables_escrow_model` | `073_vouchers_escrow_model.sql` | **הוחל** (adapted, בלי RPCs סריקה) |
| Full `027_suppliers.sql` | `027_suppliers.sql` | **לא** להחיל verbatim |
| Full `054_voucher_redemption.sql` | `054_voucher_redemption.sql` | **לא** להחיל verbatim |
| `066_coupon_layer_types.sql` | כולל גם `platform_settled` | **לא** הוחל (לכן נוצר 071) |

על DB שכבר עבר את הרשימה למעלה: שלבי 1 עד 4 למטה הם no-op אידמפוטנטיים. המסמך מיועד ל-rebuild, סביבה חדשה, או אישור חוזר לפני החלה.

---

## 1. Fix: `settlement_status` → `platform_settled`

### 1.1 למה

```
src/server/payments/finalize.ts
```

כותב בנתיב קופון:

```
settlement_status = 'platform_settled'
```

ה-enum החי מ-047 הכיל שמונה ערכים בלי התווית הזו. התוצאה לפני התיקון: Postgres `22P02` **אחרי** ש-Cardcom כבר חייב את הלקוח (כסף נלקח, הזמנה לא נסגרה).

### 1.2 SQL (אידמפוטנטי, לא הפיך כ-DROP VALUE)

```sql
ALTER TYPE public.settlement_status
  ADD VALUE IF NOT EXISTS 'platform_settled';
```

קובץ:

```
supabase/migrations/071_settlement_status_platform_settled.sql
```

תלוי ב: קיום הטיפוס `public.settlement_status` (047 / commerce stack).

### 1.3 MCP (מוכן לאישור)

Supabase MCP:

```
apply_migration
  name:  071_settlement_status_platform_settled
  query:
ALTER TYPE public.settlement_status ADD VALUE IF NOT EXISTS 'platform_settled';
```

אימות אחרי החלה (Supabase > SQL Editor):

```sql
SELECT enumlabel
FROM pg_enum e
JOIN pg_type t ON t.oid = e.enumtypid
WHERE t.typname = 'settlement_status'
ORDER BY enumsortorder;
```

חייב להופיע: `platform_settled`.

---

## 2. למה לא 027+054 המלאים

### 2.1 Full `027_suppliers.sql`

מחזיר `product_platform_percent()` ל-

```
COALESCE(..., 10)
```

וזה בדיוק העמלה הקבועה שאסורה ב-CONTRADICTIONS C1 / מיגרציה 070.  
גם דורס הערות/מודל על `products.platform_percent`.

מה שצריך מ-027 לסגירת קופון: `supplier_members` + `is_supplier_member` בלבד → **072**.

### 2.2 Full `054_voucher_redemption.sql`

נכתב תחת מודל "כל המקדמה לפלטפורמה". תחת Escrow 2026-07-27 (C11b) שני חלקים שוברים הנפקה:

1. `CHECK (platform_percent = 100)` דוחה את כל המוצרים החיים (15/25/30%).
2. `DEFAULT 100` על `platform_percent` = ברירת מחדל מומצאת (אסור).

מה שהוחל: טבלאות vouchers מותאמות ב-**073** (טווח 0..100, בלי default מומצא).  
מה שלא נכלל ב-073 (בכוונה): `redeem_voucher`, `log_voucher_scan`, sweeps של 054 sections 5 עד 7. דורשים סקירה נפרדת מול מודל ה-Escrow.

### 2.3 Section 2 של 054 (עצמאי)

עמודות מוצר בלבד, בלי תלות ב-027:

- `products.coupon_price_ils`
- `products.offer_valid_until`
- check + index

קובץ:

```
supabase/migrations/054_section2_product_coupon_price_fields.sql
```

---

## 3. סדר החלה מחייב (027+054 הנכון)

לסביבה שחסר בה נתיב קופון מלא עד הנפקה:

```text
0. settlement_status type קיים (047)
1. 071          ADD VALUE platform_settled
2. 054_section2 coupon_price_ils (+ offer_valid_until)
3. 072          subset of 027: supplier_members + is_supplier_member
4. 073          adapted vouchers tables (Escrow model)
5. (later)      redeem RPCs from 054, reviewed against Escrow
6. (later)      rest of 027 (payouts/disputes) only after C1-safe rewrite
```

תלויות:

```text
071 → needs settlement_status
054_section2 → needs products (עצמאי מ-027)
072 → needs suppliers, auth.users
073 → needs orders, order_items, products, suppliers, is_supplier_member (072), is_admin
```

---

## 4. MCP apply_migration: בלוקים מוכנים לאישור

להריץ **רק אחרי אישור מפורש** על פרויקט היעד.  
ב-Cursor: כלי MCP של Supabase בשם `apply_migration` עם השדות `name` ו-`query`.

### 4.1 Enum

```
name: 071_settlement_status_platform_settled
```

```sql
ALTER TYPE public.settlement_status ADD VALUE IF NOT EXISTS 'platform_settled';
```

### 4.2 Product coupon fields (section 2)

```
name: 054_section2_product_coupon_price_fields
```

```sql
-- גוף מלא מ:
-- supabase/migrations/054_section2_product_coupon_price_fields.sql
```

(להדביק את הקובץ המלא ל-`query`. אל תשלב עם 071 באותה קריאה.)

### 4.3 Subset of 027

```
name: 027_subset_supplier_members_for_vouchers
```

```sql
-- גוף מלא מ:
-- supabase/migrations/072_027subset_supplier_members.sql
```

### 4.4 Adapted 054 voucher tables

```
name: 054_vouchers_tables_escrow_model
```

```sql
-- גוף מלא מ:
-- supabase/migrations/073_vouchers_escrow_model.sql
```

### 4.5 אחרי כל החלה

1. לרשום ב-`docs/PRODUCTION-CHANGES-*.md` / STATE אם זה פרוד.
2. לסנכרן טיפוסים:

```
generate_typescript_types  (MCP)
→ עדכון src/types/database.ts
```

3. בדיקת עשן: create order → finalize קופון בלי `22P02` → שורת `vouchers` + `settlement_status = platform_settled` (או הערך שהקוד כותב במודל החי).

---

## 5. אסור להגיש לאישור (בלי rewrite)

| קובץ | סיבה |
|---|---|
| `027_suppliers.sql` מלא | מחזיר עמלה קבועה 10% / דורס 070 |
| `054_voucher_redemption.sql` מלא | `platform_percent = 100` + DEFAULT 100 שוברים Escrow |
| `066_coupon_layer_types.sql` כתחליף ל-071 בלבד | מוסיף גם `subscription` ל-`product_type`; לא הוחל; 071 מספיק ל-enum |

---

## 6. Rollback notes

| שינוי | Rollback |
|---|---|
| 071 ADD VALUE | **אין** `DROP VALUE`. הפיכה דורשת recreate של הטיפוס + rewrite עמודות. בטוח כי אדטיבי. |
| 054_section2 | DROP columns/index/check + מחיקת שורת journal (מתועד ב-PRODUCTION-CHANGES) |
| 072 / 073 | DROP טבלאות/פונקציות חדשות רק אם אין תלות נתונים; בפועל אחרי הנפקת vouchers זה destructive |

---

## 7. Checklist לאישור

- [ ] מאשרים שאנחנו על הפרויקט הנכון (`ixvwfbuvfxxsjiywhbbb` או staging)
- [ ] מאשרים סדר: 071 → 054_section2 → 072 → 073
- [ ] מאשרים ש-**לא** מחילים 027/054 המלאים
- [ ] גיבוי / נקודת restore זמינה לפני פרוד
- [ ] אחרי החלה: אימות enum + עמודות + `supplier_members` + `vouchers`
- [ ] סנכרון `database.ts` + smoke finalize

---

## 8. Revision

| Date | Change |
|---|---|
| 2026-08-02 | Runbook: `platform_settled`, סדר 027/054 הבטוח, בלוקי MCP apply_migration לאישור |
