# ארכיטקטורה: מנויים חוזרים (Recurring)

מוצר מנוי חודשי מול הלקוח: Cardcom Recurring Token, מחזורי חיוב, כשלי תשלום, וביטול.

Status: **BINDING (product-facing)** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/ARCHITECTURE-SUBSCRIPTIONS.md
docs/SUBSCRIPTIONS-BILLING-SPEC.md
docs/CARDCOM-ARCHITECTURE.md
docs/ARCHITECTURE-CHECKOUT-FLOW.md
docs/ARCHITECTURE-PRICING-RULES.md
docs/ARCHITECTURE-REFUNDS-DISPUTES.md
docs/ARCHITECTURE-NOTIFICATIONS.md
docs/CONTRADICTIONS.md
docs/GO-LIVE-CHECKLIST.md
```

**יחס ל-`ARCHITECTURE-SUBSCRIPTIONS.md`:**  
`ARCHITECTURE-SUBSCRIPTIONS.md` = מקור האמת הטכני (סכמה, cron, threat model, עו״ד).  
**המסמך הזה** = תצוגת מוצר/זרימה לצוות ולמסמכי לקוח פנימיים. אסור לסתור SU1-SU11. במקרה סתירה גובר
`ARCHITECTURE-SUBSCRIPTIONS.md`.

לא חלק מ-soft-open קופונים. **No Escrow.** אגורות integer.

---

## 0. הכרעות (מיושר ל-SU*)

| # | הכרעה |
|---|---|
| RS1 | `products.type = 'subscription'`; interval ראשון = `monthly`. |
| RS2 | חיוב ראשון: Low Profile `ChargeAndCreateToken` (או מקביל legacy). |
| RS3 | מחזורים הבאים: ChargeToken server-to-server; idempotency `(subscription_id, billing_period)`. |
| RS4 | משתמש מחובר חובה; לא אורח. |
| RS5 | `platform_percent` snapshot **פר מחזור** כמו commerce. |
| RS6 | אין held/J5/Escrow. מנוי ≠ מקדמת קופון למימוש בעסק. |
| RS7 | ביטול מאזור אישי; ניסוח ללקוח **[דורש עו״ד]**. |
| RS8 | Kill switch: `SUBSCRIPTIONS_ENABLED` נפרד מ-`CHECKOUT_ENABLED` (מומלץ). |

---

## 1. מה הלקוח רואה

```text
PDP מנוי
  → הרשמה / login
  → אישור מחיר חודשי (agorot→₪)
  → Cardcom (שמירת טוקן)
  → אישור הצטרפות + מייל RTL
  → בכל מחזור: חיוב שקט או מייל כשל + ניסיון חוזר
  → ביטול: תאריך סיום תקופה ששולמה
```

| שדה UI | מקור |
|---|---|
| מחיר לחודש | `recurring_amount_agorot` |
| תאריך חיוב הבא | `current_period_end` |
| סטטוס | active / past_due / cancelled / … |

---

## 2. מחזור חיוב

| שלב | פעולה |
|---|---|
| D0 | חיוב ראשון + יצירת `subscriptions` + invoice |
| Cron יומי | מצא מנויים עם `next_billing_at <= now()` ו-status active |
| Charge | Token charge; מפתח תקופה ייחודי |
| הצלחה | invoice paid; snapshot %; ledger אם יש ספק; הארכת period |
| כישלון | ראה §3 |

---

## 3. כשלי תשלום

| ניסיון | התנהגות |
|---|---|
| 1 | מייל `payment_failed`; status `past_due` |
| 2-N | backoff לפי SUBSCRIPTIONS (ימים קבועים) |
| אחרי max | `cancelled` או `paused` לפי מדיניות; גישה נחסמת |
| כרטיס עודכן | לקוח עובר LP ליצירת טוקן חדש; מחזור מתחדש |

אין ליצור חיוב כפול לאותה `billing_period`. אין לסמן paid בלי תשובת Cardcom מאומתת.

---

## 4. ביטול

```text
לקוח → /account/subscriptions → ביטול
  → status=cancel_at_period_end (או cancelled מיידי לפי דין/עו״ד)
  → אין ChargeToken נוסף אחרי נקודת הסיום
  → מייל אישור RTL
```

החזר על מחזור שכבר חויב: לפי
`docs/ARCHITECTURE-REFUNDS-DISPUTES.md`
+ דין מכר מרחוק **[דורש עו״ד]**.

---

## 5. Acceptance

- [ ] תואם SU* ב-ARCHITECTURE-SUBSCRIPTIONS  
- [ ] Token ראשון + ChargeToken מחזורים  
- [ ] Idempotency לתקופה  
- [ ] כשלי תשלום + ביטול מתועדים  
- [ ] No Escrow / agorot  

---

## 6. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | BINDING product-facing; מקור טכני = ARCHITECTURE-SUBSCRIPTIONS |
