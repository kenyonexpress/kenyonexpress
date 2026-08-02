# ARCHITECTURE: Supplier Analytics

דשבורד מכירות לספק ודוחות payout לפי `platform_percent` מצולם.

Status: **BINDING** · Updated: 2026-08-02  
Scope: docs only.  
Companions:

```
docs/ARCHITECTURE-SUPPLIER-PORTAL.md
docs/ARCHITECTURE-ANALYTICS-BI.md
docs/ARCHITECTURE-PERSONAL-AREA.md
```

קהל: `supplier_members` עם role `owner` או `manager` (scanner: סריקות בלבד, בלי כסף).  
כסף: integer **agorot** ב-DB; UI ב-₪. כל חישוב מסנאפשוט של `order_items`, לא מ-`products` החי.

---

## 0. הכרעות מחייבות

| # | הכרעה |
|---|---|
| S1 | ספק רואה רק את השורות שלו (`supplier_id`). |
| S2 | `platform_percent` בתצוגה = snapshot משורת ההזמנה, לא הערך החי במוצר. |
| S3 | קופון (Escrow 2026-07-27): מקדמה באתר; עמלה = `%` מהמקדמה; יתרת המקדמה ב-held עד מימוש; יתרת face נגבית בקופה. |
| S4 | פיזי: פיצול מיידי לפי snapshot; payout אחרי T+hold ומינימום. |
| S5 | אין לסכם כסף מ-`analytics_events`. כסף רק מ-orders/payments/ledger/vouchers. |
| S6 | אין ייצוא CSV עם PII לקוח (שם/טלפון/כתובת) ב-v1; רק ids פנימיים + סכומים. |

---

## 1. מפת מסכים (פורטל ספק)

| Route | תפקיד | Roles |
|---|---|---|
| `/supplier` | Overview: מכירות היום/7י/30י, מימושים, ממתין ל-payout | owner, manager |
| `/supplier/sales` | טבלת מכירות + פילטרים | owner, manager |
| `/supplier/redemptions` | לוג סריקות | owner, manager, scanner |
| `/supplier/payouts` | דוחות תשלום / הצהרות | owner, manager |
| `/supplier/payouts/[id]` | פירוט שורות payout | owner, manager |

Gate: `is_supplier_member(supplier_id)` + role. אין service role בדפדפן.

---

## 2. דשבורד מכירות

### 2.1 KPI cards (agorot → ₪)

| מדד | הגדרה |
|---|---|
| Gross sold (period) | סכום `paid_on_site_agorot` (או שקיל) לשורות הספק בהזמנות `paid` |
| Platform fee | סכום `commission_agorot` מהסנאפשוט |
| Supplier share (physical) | `supplier_immediate_agorot` / יתרה לפיצול |
| Escrow held (coupons) | חלק מקדמה מוחזק שטרם שוחרר במימוש |
| Redeemed count | מספר `vouchers` בסטטוס redeemed בתקופה |
| Till collected (informational) | סכום `remaining_due` / `collected` בסריקות (לא עובר ב-KE) |

טווחים: היום · 7 ימים · 30 ימים · חודש קלנדרי · custom.

### 2.2 טבלת מכירות

עמודות מחייבות:

| עמודה | מקור |
|---|---|
| תאריך | `orders.paid_at` |
| מזהה הזמנה קצר | `orders.id` (8 תווים) |
| מוצר | snapshot / `product_name_he` |
| סוג | `coupon` / `physical` |
| כמות | `quantity` |
| שולם באתר | `paid_on_site_agorot` |
| `platform_percent` | snapshot |
| עמלת פלטפורמה | `commission_agorot` |
| חלק ספק / held | לפי סוג מוצר |
| סטטוס שורה | paid / redeemed / refunded / … |

פילטרים: סוג מוצר, סטטוס, טווח תאריכים, מוצר.

### 2.3 שאילתות (עקרונות)

- Views מאובטחות (`security_invoker`) או Server Actions עם member check.
- אינדקסים על `(supplier_id, paid_at)` בנתיב הקריאה (דרך join ל-orders).
- אין N+1 מ-PDP חי לכל שורה.

---

## 3. דוחות payout לפי `platform_percent`

### 3.1 מה נכנס לדוח

| סוג שורה | נכנס ל-`payout_statement_lines`? | בסיס חישוב |
|---|---|---|
| פיזי ששולם | כן (אחרי hold + מינימום) | `paid_on_site - commission` מהסנאפשוט (`platform_percent`) |
| קופון ששולם ועדיין לא מומש | לא כ-payout מיידי; מוצג כ-held בדשבורד | held = מקדמה − עמלה |
| קופון שמומש | שחרור held ל-payout לפי מדיניות Escrow (ledger), לא המצאת אחוז חדש | אותם אחוזי snapshot |
| החזר | שורת adjustment שלילית / קיזוז | לפי refund finalize |

אסור לחשב מחדש `platform_percent` מהמוצר החי בזמן יצירת הדוח.

### 3.2 מחזור דוח

```text
generate_payout_statement(supplier_id, period)
  → אוסף שורות זכאיות
  → מסכם total_payout_agorot
  → אם מתחת ל-min_payout: rolled_over
  → draft → pending_approval → approved → paid
```

שדות דוח:

- תקופה, מספר הצהרה, סטטוס
- סה״כ ברוטו, סה״כ עמלות (לפי percent מצולם), סה״כ לתשלום
- צילום פרטי בנק (בלי לחשוף מלא ל-scanner)
- `payment_reference` אחרי תשלום

### 3.3 שקיפות אחוזים

בכל שורת דוח מציגים:

```
platform_percent (snapshot) · commission_agorot · supplier_due_agorot
```

עותק UI:

```
העמלה נקבעה במוצר בזמן הרכישה ואינה משתנה אחורה
גם אם האחוז במוצר עודכן מאז.
```

---

## 4. לוג מימושים (קישור לדשבורד)

| שדה | הערה |
|---|---|
| זמן סריקה | `redeemed_at` |
| קוד מקוצר | לא payload מלא |
| מוצר | שם |
| גבייה בקופה | `collected_agorot` |
| תוצאה | success / already_used / expired / … |
| חבר שסרק | `member_id` |

Scanner רואה את הטבלה הזו בלבד. בלי KPI כספיים של payout.

---

## 5. ייצוא ואדמין

- Export CSV ל-owner: שורות מכירה/payout **בלי** PII לקוח ב-v1.
- אדמין KE רואה את אותם מספרים ב-`/admin` לצורך reconciliation; מקור האמת זהה.
- Drift: אם `v_money_alarms` / ledger לא מתיישרים, הדשבורד מציג באנר "בבדיקה" ולא ממציא מספר.

---

## 6. Acceptance

- [ ] KPI וטבלה רק לשורות `supplier_id` של החבר
- [ ] `platform_percent` תמיד מהסנאפשוט
- [ ] דוח payout מסביר עמלה מול percent מצולם
- [ ] Scanner בלי מסכי כסף
- [ ] אין סיכום כסף מאירועי analytics

---

## 7. Revision

| Date | Change |
|---|---|
| 2026-08-02 | מסמך מחייב: דשבורד מכירות + דוחות payout לפי platform_percent (Escrow 2026-07-27) |
