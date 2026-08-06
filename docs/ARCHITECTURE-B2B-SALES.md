# ארכיטקטורה: מכירות B2B

מכירת קופונים בכמות לחברות וועדי עובדים.

Status: **BINDING** · עודכן: 2026-08-06 · QA: PASS  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/ARCHITECTURE-ADMIN-DASHBOARD.md
docs/ARCHITECTURE-INVENTORY.md
docs/ARCHITECTURE-PRICING-RULES.md
docs/ARCHITECTURE-GIFT-COUPONS.md
docs/ARCHITECTURE-LEGAL-COMPLIANCE.md
docs/ARCHITECTURE-SUPPLIER-ONBOARDING.md
docs/BUSINESS-MODEL.md
docs/CONTRADICTIONS.md
```

---

## 0. הכרעות

| # | הכרעה |
|---|---|
| B1 | B2B = הזמנת כמות (bulk) של קופונים לאותו דיל או סל דילים. |
| B2 | תשלום: העברה בנקאית / חשבונית מס + Cardcom לפי הסכם; לא חובה checkout קמעונאי. |
| B3 | מחיר B2B יכול להיות מוזל מול `coupon_price` הקמעונאי; נשמר בהסכם + snapshot. |
| B4 | `platform_percent` / תנאי הספק נקבעים בהסכם; אין default גלובלי. |
| B5 | הנפקה: אצווה של vouchers `issued`; חלוקה במיילים / קודי claim / פורטל ועד. |
| B6 | מלאי/מכסה: בודקים `quota` לפני אישור האצווה. |
| B7 | No Escrow: כל תשלום הקופון לפלטפורמה; יתרה בעסק על המקבל בזמן מימוש. |

---

## 1. ישויות

```text
b2b_accounts (
  id, company_name_he, business_id, billing_email,
  contact_name, contact_phone, status active|suspended
)
b2b_orders (
  id, b2b_account_id, status draft|invoiced|paid|issued|cancelled,
  total_agorot, payment_method wire|cardcom|invoice,
  contract_ref, created_by_admin_id
)
b2b_order_lines (
  id, b2b_order_id, product_id, qty,
  unit_price_agorot,      -- snapshot
  platform_percent,       -- snapshot אם רלוונטי
)
b2b_allocations (
  id, b2b_order_line_id, voucher_id,
  employee_email null, claimed_at null
)
```

---

## 2. זרימה

```text
אדמין / נציג B2B
  → יצירת b2b_account (ועד עובדים / חברה)
  → הזמנת כמות + מחיר מוסכם
  → חשבונית / תשלום
  → אחרי paid: הנפקת vouchers באצווה
  → חלוקה:
       א. קובץ קודי claim לעוד
       ב. שליחת מייל לכל עובד
       ג. פורטל ועד שמקצה לעובדים
  → מימוש אצל ספק כרגיל
```

---

## 3. ועדי עובדים

| יכולת | פירוט |
|---|---|
| אנשי קשר | בעל תפקיד ב-`b2b_accounts` |
| הקצאה | שיוך voucher לעובד לפני/אחרי הנפקה |
| דוח | כמה הונפקו / נתבעו / מומשו / פגו |
| הגבלה | דומיין אימייל ארגוני אופציונלי |

אין לאפשר לוועד לראות פרטי כרטיס אשראי של עובדים (לא רלוונטי אם משלם הארגון).

---

## 4. כסף וחשבוניות

- מחיר יחידה באגורות ב-snapshot על השורה.  
- מע"מ לפי דין; חשבונית מס מחוץ/בתוך מערכת לפי ספק חשבוניות.  
- Refunds B2B: ידני לפי חוזה; לא אותו מנוע 14 יום צרכני אוטומטי בהכרח (תיעוד LEGAL לכל הסכם).  

---

## 5. Acceptance

- [ ] הזמנת כמות עם snapshot מחיר  
- [ ] אכיפת מכסה לפני הנפקה  
- [ ] הקצאה לוועד/עובדים  
- [ ] Redeem רגיל אחרי הקצאה  
- [ ] Audit על מחיר B2B  

---

## 6. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-06 | B2B bulk + ועדי עובדים |
| 2026-08-06 | QA: קישור ONBOARDING; No Escrow + `platform_percent` |
| 2026-08-07 | QA re-pass: קישור CONTRADICTIONS (No Escrow + platform_percent) |
