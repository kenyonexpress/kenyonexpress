# ARCHITECTURE: Cardcom Edge Cases

מקרי קצה בתשלום: כשלי 3DS, partial capture, סדר ו-retry של webhooks, idempotency לכפילויות, timeout ב-redirect, מטבע באגורות.

Status: **BINDING** · Updated: 2026-08-03  
Scope: **docs only** · branch `arch/docs-queue`  
אין שינוי קוד. אין נגיעה ב-worktree הראשי.

Companions:

```
docs/ARCHITECTURE-CHECKOUT-CARDCOM.md
docs/ARCHITECTURE-REFUNDS-DISPUTES.md
docs/ARCHITECTURE-FRAUD-PREVENTION.md
docs/RUNBOOK-INCIDENTS.md
docs/LAUNCH-DAY.md
```

---

## 0. הכרעות מחייבות

| # | הכרעה |
|---|---|
| C1 | מקור אמת לחיוב: Cardcom + רשומת `payments` אחרי verify. לא UI בלבד. |
| C2 | כל סכום ב-DB: integer **agorot**. המרה ל-API Cardcom מתועדת במקום אחד. |
| C3 | Webhook + return URL: **idempotent** על אותו deal/order. |
| C4 | אסור לסמן `paid` ידני ב-SQL כתחליף ל-verify. |
| C5 | כשל 3DS / ביטול משתמש ≠ חיוב; הזמנה נשארת unpaid/cancelled לפי מדיניות. |
| C6 | `CHECKOUT_ENABLED=false` אם מסלול הכסף שבורה באירוע. |

---

## 1. 3DS failures

| תוצאה | התנהגות מערכת | UX עברית (יעד) |
|---|---|---|
| משתמש ביטל 3DS | אין capture; order לא paid | "האימות בבנק בוטל. אפשר לנסות שוב." |
| בנק דחה | אין paid | "התשלום נדחה. נסו כרטיס אחר או פנו לבנק." |
| timeout ב-3DS | אין paid עד webhook חיובי | "לא השלמנו את האימות. בדקו את ההזמנה לפני ניסיון נוסף." |
| הצלחה אחרי challenge | finalize רגיל | הצלחה / קופון |

כללים:

- Return URL ו-webhook יכולים להגיע בכל סדר; רק verify חיובי מעביר ל-paid.
- Retry: משתמש מתחיל checkout חדש או resume מדיניות; לא כפל Low Profile לאותו idempotency בלי בדיקה.

---

## 2. Partial captures

יעד מוצר נוכחי: **capture מלא** של סכום ההזמנה on-site.

| מקרה | מדיניות |
|---|---|
| Cardcom מחזיר סכום חלקי | לא לסמן paid מלא; להעלות manual_review / failed |
| Refund חלקי אחרי paid | מסלול Refunds; ledger + voucher לפי סוג |
| Multi-item עתידי | כל capture מתועד ב-agorot מול order_id |

אסור להניח ש-UI "הצליח" = הסכום המלא נלכד בלי קריאת תוצאה.

---

## 3. Webhook retries and ordering

```text
Possible order:
  A) browser return → server verify → paid
  B) webhook → server verify → paid
  C) webhook first, return later (no-op)
  D) return first (pending), webhook confirms
```

| כלל | פירוט |
|---|---|
| Verify | תמיד מול Cardcom API / חתימה; לא לסמוך על query string לבד |
| Ordering | המעבר ל-paid פעם אחת; אירועים מאוחרים = no-op אם כבר paid |
| Retries | Cardcom יכול לשלוח שוב; אותה תשובה 200 אחרי טיפול |
| Out-of-order fail then success | success אחרי fail זמני: רק אם verify אומר approved ולא already voided |
| Late webhook אחרי cancel | לא להחיות הזמנה שבוטלה בלי מדיניות מפורשת + reconcile |

---

## 4. Duplicate webhook idempotency

מפתחות יציבים (אחד מהם UNIQUE בפועל):

```text
payment_events.provider_event_id
payments.cardcom_deal_id / low_profile_code
idempotency: order_id + operation (capture|refund)
```

אלגוריתם:

```text
1. Auth webhook password/signature → else 401
2. Parse deal / order reference
3. INSERT event ON CONFLICT DO NOTHING / check processed
4. If already paid for this order+deal → 200 OK, no side effects
5. Else verify with Cardcom → finalizeOrder / mark paid once
6. Enqueue notifications (dedupe_key)
```

כפל finalize לא יוצר כפל vouchers (DB constraints / ON CONFLICT).

---

## 5. Timeout during redirect

| מצב | פעולה |
|---|---|
| משתמש סגר דפדפן באמצע | Webhook עדיין יכול להשלים; `/account/orders` מציג סטטוס |
| Return URL timeout בשרת | לא paid; המתנה ל-webhook; UI "בודקים את התשלום" |
| כפל לחיצה על "שלם" | idempotency key על begin_checkout; לא שני deals פתוחים בלי מדיניות |
| רשת נפלה אחרי approve בבנק | reconcile job / תמיכה מול Cardcom; לא paid ידני |

UX יעד אחרי חזרה לא ברורה:

```text
בודקים את התשלום מול חברת האשראי. רעננו את העמוד בעוד רגע או בדקו את ההזמנות שלי.
```

---

## 6. Currency handling in agorot

| שכבה | כלל |
|---|---|
| DB / domain | integer agorot בלבד |
| UI | ₪ דרך `money.ts` / `formatAgorot` |
| Cardcom API | המרה מרוכזת (agorot → יחידות שה-API מצפה; לרוב שקלים עם 2 עשרונים כמחרוזת/מספר) במודול תשלומים אחד |
| השוואת סכומים | להשוות agorot אחרי parse; סטייה ≠ 0 → reject finalize |
| הנחות / ארנק | כל החישוב ב-agorot לפני קריאה ל-Cardcom |

אסור: `float` לחישוב מחירי קופה; המרות מפוזרות ב-UI.

---

## 7. Acceptance

- [ ] 3DS cancel לא יוצר paid
- [ ] Webhook כפול לא כופל vouchers
- [ ] Return/webhook בכל סדר מגיעים לאותו מצב סופי
- [ ] Timeout: מסלול reconcile בלי SQL paid ידני
- [ ] סכום Cardcom תואם agorot של ההזמנה

---

## 8. Revision

| Date | Change |
|---|---|
| 2026-08-03 | מסמך ראשוני על arch/docs-queue |
