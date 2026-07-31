# ARCHITECTURE-SHIPPING-RETURNS.md

ארכיטקטורת **משלוחים והחזרות** למוצרים פיזיים (קופונים מחוץ להיקף משלוח).

Status: BINDING · worktree

```
/Users/ofir/kenyonexpress-web/ke-arch
```

branch:

```
arch/docs-queue
```

Date: 2026-07-31  
Scope: docs בלבד.  
Companions: fulfillment-supplier-workflow, legal, account-area, Go-Live.

---

## 0. היקף

| סוג | משלוח | החזרה |
|---|---|---|
| Physical | ספק שולח לכתובת הלקוח | לפי דין + מדיניות KE |
| Coupon | אין משלוח | ביטול/זיכוי לפני מימוש; אחרי סריקה: בדרך כלל לא |

פלטפורמה לא מחזיקה מלאי. הספק הוא הגורם המשלח.

---

## 1. כתובת

- נדרשת ב-checkout אם יש שורת physical.
- מקור: `user_addresses` (soft-delete).
- Snapshot כתובת להזמנה בזמן תשלום (אל תסתמך על עריכה מאוחרת לשינוי משלוח בלי תמיכה).

---

## 2. סטטוסי פריט פיזי

```
pending → packing → shipped → delivered
                 ↘ cancelled / refunded
```

ספק מעדכן בפורטל. לקוח רואה ב-`/account/orders/[id]`.  
התראה: `supplier.new_order_physical` ב-paid; אופציונלי shipped email ללקוח.

---

## 3. זמני אספקה

- מוצגים מ-`products.delivery_days` (או שדות קיימים) ב-PDP.
- לא הבטחת carrier ספציפי ביום 1 אלא אם סוכם עם ספק.

---

## 4. החזרות (returns)

| מצב | מדיניות יעד |
|---|---|
| Physical לפני שליחה | ביטול אפשרי דרך תמיכה; refund לכרטיס/ארנק לפי legal |
| Physical אחרי שליחה | לפי חוק הגנת הצרכן + תנאי הספק; תיאום דרך support |
| Coupon `issued` | refund אם כל הוואוצ'רים עדיין issued |
| Coupon `used` | אין refund prepaid בדרך כלל |

אין self-serve return portal חובה ב-soft-launch; ticket מספיק עם SLA.

---

## 5. כסף

- Refund פיזי: ledger + Cardcom refund path; עדכון `settlement_status`.
- עמלה מצולמת לא "מחושבת מחדש" ממחיר חי.
- קופון: אין payout לספק על prepaid גם בהחזרה.

---

## 6. טסטים

| # | תרחיש |
|---|---|
| SR1 | Checkout פיזי בלי כתובת נכשל |
| SR2 | ספק מעדכן shipped → לקוח רואה |
| SR3 | Refund קופון אחרי used נחסם |

---

## 7. Revision

| Date | Change |
|---|---|
| 2026-07-31 | Shipping/returns לphys (`arch/docs-queue`) |
