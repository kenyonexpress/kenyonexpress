# ארכיטקטורה: אנליטיקה לספק

דשבורד מכירות לספק ודוחות payout לפי `platform_percent` מצולם. **No Escrow**: אין held/Escrow בדשבורד.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מודל כסף: **No Escrow**. מקדמת קופון = הכנסת פלטפורמה; `supplier_due` מהפלטפורמה = 0; יתרה נגבית בעסק.

מסמכים קשורים:

```
docs/ARCHITECTURE-SUPPLIER-PORTAL.md
docs/ARCHITECTURE-ANALYTICS-BI.md
docs/ARCHITECTURE-PERSONAL-AREA.md
docs/ARCHITECTURE-PAYOUT-MECHANISM.md
docs/ARCHITECTURE-PRICING-RULES.md
```

קהל: `supplier_members` עם role `owner` או `manager` (scanner: סריקות בלבד, בלי כסף).  
כסף: integer **agorot** ב-DB; UI ב-₪. כל חישוב מסנאפשוט של `order_items`, לא מ-`products` החי.

---

## 0. החלטה (מחייבת)

| # | הכרעה |
|---|---|
| SA1 | ספק רואה רק את השורות שלו (`supplier_id`). |
| SA2 | `platform_percent` בתצוגה = snapshot משורת ההזמנה, לא הערך החי במוצר. |
| SA3 | קופון (No Escrow): מקדמה באתר = 100% הכנסת פלטפורמה; אין held/Escrow בדשבורד. |
| SA4 | פיזי: פיצול מיידי לפי snapshot; payout אחרי T+hold ומינימום (PAYOUT-MECHANISM). |
| SA5 | אין לסכם כסף מ-`analytics_events`. כסף רק מ-orders/payments/ledger/vouchers. |
| SA6 | אין ייצוא CSV עם PII לקוח (שם/טלפון/כתובת) ב-v1; רק ids פנימיים + סכומים. |
| SA7 | Scanner לא רואה KPI כספיים או payout. |
| SA8 | קופון: אין שורות payout בדוח; רק מידע על מימושים וגבייה בעסק (informational). |

---

## 1. חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| Escrow held בדשבורד עד redeem | סותר No Escrow; מציג כסף שלא קיים ב-ledger. |
| payout record על redeem קופון | קופון: supplier_due מהפלטפורמה = 0; אין payout. |
| חישוב `platform_percent` מ-`products` החי | משנה היסטוריה; snapshot בלבד. |
| analytics_events כמקור כסף | לא authoritative; drift מול ledger. |
| CSV עם PII לקוח | GDPR / אבטחה; v1 נדחה. |
| scanner רואה payout | RBAC; scanner = סריקה בלבד. |

---

## 2. סכמת DB (קיים; אין DDL חדש)

| ישות | שדות / שימוש |
|---|---|
| `order_items` | snapshot: `platform_percent`, `paid_on_site_agorot`, `commission_agorot`, `supplier_due`, `balance_due_agorot` |
| `orders` | `paid_at`, `status`; join לפי `supplier_id` |
| `vouchers` | `status`, `redeemed_at`; ספירת מימושים |
| `voucher_redemptions` | לוג סריקות; `collected_agorot` (informational) |
| `settlement_events` | payout eligibility; לא ל-KPI יומי ישיר |
| `payout_batches` / statements | דוחות payout לספק |
| views (`security_invoker`) | אופציונלי לסיכומים מאובטחים |

אין DDL חדש במסמך זה.

---

## 3. מפת מסכים (פורטל ספק)

| Route | תפקיד | Roles |
|---|---|---|
| `/supplier` | Overview: מכירות היום/7י/30י, מימושים, ממתין ל-payout | owner, manager |
| `/supplier/sales` | טבלת מכירות + פילטרים | owner, manager |
| `/supplier/redemptions` | לוג סריקות | owner, manager, scanner |
| `/supplier/payouts` | דוחות תשלום / הצהרות | owner, manager |
| `/supplier/payouts/[id]` | פירוט שורות payout | owner, manager |

Gate: `is_supplier_member(supplier_id)` + role. אין service role בדפדפן.

---

## 4. דשבורד מכירות

### 4.1 KPI cards (agorot → ₪)

| מדד | הגדרה |
|---|---|
| Gross sold (period) | סכום `paid_on_site_agorot` לשורות הספק בהזמנות `paid` |
| Platform fee | סכום `commission_agorot` מהסנאפשוט (פיזי) |
| Supplier share (physical) | `supplier_immediate_agorot` / יתרה לפיצול |
| Redeemed count | מספר `vouchers` בסטטוס redeemed בתקופה |
| Till collected (informational) | סכום שנגבה בעסק בסריקות; לא עובר ב-KE |

**אין** KPI `Escrow held` או `held until redeem`.

טווחים: היום · 7 ימים · 30 ימים · חודש קלנדרי · custom.

### 4.2 טבלת מכירות

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
| חלק ספק / יתרה בעסק | פיזי: supplier_due; קופון: balance_due (informational) |
| סטטוס שורה | paid / redeemed / refunded / … |

---

## 5. דוחות payout (פיזי בלבד)

| סוג שורה | נכנס ל-payout? | בסיס |
|---|---|---|
| פיזי ששולם | כן (אחרי hold + מינימום) | snapshot `paid_on_site - commission` |
| קופון | **לא** | supplier_due מהפלטפורמה = 0 |
| החזר | adjustment / קיזוז | refund finalize |

אסור לחשב מחדש `platform_percent` מהמוצר החי.

---

## 6. מקרי קצה

| מקרה | התנהגות |
|---|---|
| שינוי `platform_percent` במוצר אחרי paid | דשבורד מציג snapshot; לא מתעדכן |
| refund חלקי | שורה adjusted; KPI מתעדכן לפי settlement |
| ספק חבר בשני suppliers | RLS מפריד; אין דליפה בין ספקים |
| ledger drift (`v_money_alarms`) | באנר "בבדיקה"; לא ממציא מספר |
| redeem ללא collected_agorot | informational null; לא payout |
| rolled_over מתחת ל-min | מוצג "מגלגל"; לא כ-paid |
| scanner ניגש ל-`/supplier/payouts` | 403 / redirect |
| N+1 על PDP חי | views / batch query; לא live product per row |
| timezone Asia/Jerusalem | תקופות KPI לפי TZ זה |

---

## 7. Acceptance

- [ ] KPI וטבלה רק לשורות `supplier_id` של החבר
- [ ] `platform_percent` תמיד מהסנאפשוט
- [ ] אין Escrow/held KPI
- [ ] Scanner בלי מסכי כסף
- [ ] אין סיכום כסף מאירועי analytics
- [ ] קופון: 0 שורות payout

---

## 8. פתוחות

| ID | שאלה | ברירת מחדל |
|---|---|---|
| Q-SA-EXPORT | CSV export v2 עם PII מסונן? | v1: ids בלבד |
| Q-SA-VIEW | materialized view ל-KPI? | Server Action + index |

---

## 9. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-02 | דשבורד מכירות + payout לפי platform_percent |
| 2026-08-12 | batch-2: BINDING template; הסרת Escrow; No Escrow מפורש |
