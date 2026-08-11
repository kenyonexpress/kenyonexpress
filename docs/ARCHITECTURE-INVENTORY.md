# ארכיטקטורה: מלאי ומכסות

מכסות קופון פר דיל, מלאי פיזי בסיסי, reserve ב-pending, ו-reconcile בלי over-sell.

Status: **BINDING** · עודכן: 2026-08-12 · QA: PASS  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2` · batch #13/50  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/ARCHITECTURE-CHECKOUT-FLOW.md
docs/ARCHITECTURE-COUPON-LIFECYCLE.md
docs/ARCHITECTURE-GIFT-COUPONS.md
docs/ARCHITECTURE-PRICING-RULES.md
docs/ARCHITECTURE-FRAUD-PREVENTION.md
docs/CONTRADICTIONS.md
docs/BUSINESS-MODEL.md
```

מודל כסף: **No Escrow**. מכסה/מלאי מגבילים מכירה והנפקה; הם לא מחזיקים כסף לספק ולא יוצרים held.

---

## 0. הכרעות

| # | הכרעה |
|---|---|
| I1 | מכסת קופון נאכפת אטומית לפני/בתוך finalize (לא רק ב-UI). |
| I2 | כשל מכסה → אין Low Profile חדש / אין `paid` על יחידות עודפות. |
| I3 | מלאי פיזי: `stock_quantity` יורד ב-finalize; replay לא מוריד פעמיים. |
| I4 | קופון מתנה חולק מכסה עם מכירה רגילה (אותו product), אלא אם הוגדר אחרת במפורש. |
| I5 | Over-sell אסור. Reconcile מתקן תצוגה; לא יוצר vouchers יש מאין מעל המכסה. |
| I6 | הזמנת `pending` יכולה לשריין (reserve) עד `expires_at`; אחרי cancel/expiry השריון משתחרר. |
| I7 | מכסה = מספר יחידות דיל, לא סכום כסף ולא אחוז. |

---

## 1. מושגים

| מושג | משמעות |
|---|---|
| `quota` | תקרת יחידות לדיל קופון (admin) |
| `issued` | שוברים שכבר הונפקו אחרי `paid` |
| `reserved_pending` | יחידות בהזמנות `pending` שטרם שולמו / לא פקעו |
| `available` | `quota - issued - reserved_pending` |
| `stock_quantity` | מלאי פיזי (nullable = לא נמדד) |

```text
available >= 0 תמיד אחרי כל טרנזקציה אטומית
```

---

## 2. קופון: שריון → תשלום → הנפקה

```text
beginCheckout
  → בדוק available >= sum(qty) לכל דיל בעגלה
  → אם לא: cart_invalid / INSUFFICIENT_QUOTA; אין LP
  → צור order pending + (אופציונלי) reserve שורות
  → Low Profile

pending expiry / cancel
  → שחרור reserve
  → order → cancelled

finalize paid
  → CAS: issued + qty <= quota (או reserved מומר ל-issued)
  → mint vouchers × qty (idempotent לפי order_item)
  → item_status=issued, settlement_status=platform_settled
```

| כשל | התנהגות |
|---|---|
| שני checkouts במקביל על יחידה אחרונה | אחד מצליח; השני נכשל במכסה לפני LP או ב-finalize |
| Webhook replay | לא מנפיק מעל quantity; לא חוצה quota |
| paid בלי mint מלא | reconcile משלים עד min(qty, available); אלרט אם חסר |

---

## 3. פיזי: מלאי

```text
validateCart / beginCheckout
  → אם stock_quantity לא null: נדרש stock >= qty

finalize
  → UPDATE stock_quantity = max(0, stock - qty)
  → מוגן ב-split_executions UNIQUE(order_item_id) / guard דומה
```

אין החזרת מלאי אוטומטית ב-refund בלי מדיניות מפורשת (REFUNDS); ברירת מחדל אחרי refund מאושר: החזרת qty למלאי אם המוצר עדיין active.

---

## 4. תצוגה בקטלוג

| מצב | UI |
|---|---|
| `available == 0` | אזל / לא ניתן לרכישה |
| `available` נמוך | באדג' אופציונלי; לא מחיר |
| מלאי פיזי 0 | אותו שער |

המחיר וה-`platform_percent` לא נגזרים מהמכסה.

---

## 5. Admin

| פעולה | מי |
|---|---|
| קביעת quota / stock | admin |
| הגדלת מכסה | audit חובה |
| הקטנה מתחת ל-issued+reserved | נדחה או clamp עם אזהרה |
| ספק | קריאה בלבד (אם בכלל); לא משנה מכסה |

---

## 6. Acceptance

- [ ] נוסחת available מתועדת  
- [ ] אכיפה לפני LP וב-finalize  
- [ ] Race על יחידה אחרונה מוגדר  
- [ ] פיזי idempotent ב-finalize  
- [ ] מתנה חולקת מכסה (I4)  
- [ ] No Escrow מפורש  

---

## 7. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-06 | QA-PASS |
| 2026-08-12 | batch-2 #13 stub |
| 2026-08-12 | batch-2 #13 pass-2: reserve, races, admin, פיזי מלא |
