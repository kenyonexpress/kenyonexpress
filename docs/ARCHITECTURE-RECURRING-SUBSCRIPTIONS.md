# ארכיטקטורה: מנויים חוזרים (Recurring)

מוצר מנוי חודשי: Cardcom Recurring Token, מחזורי חיוב, כשלי תשלום, וביטול.

Status: **BINDING (product-facing)** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.  
מודל כסף: **No Escrow**. אגורות integer.

מסמכים קשורים:

```
docs/DOCS-TEMPLATE-BINDING.md
docs/ARCHITECTURE-SUBSCRIPTIONS.md
docs/SUBSCRIPTIONS-BILLING-SPEC.md
docs/CARDCOM-ARCHITECTURE.md
docs/ARCHITECTURE-CHECKOUT-FLOW.md
docs/CONTRADICTIONS.md
```

**יחס ל-`ARCHITECTURE-SUBSCRIPTIONS.md`:** מקור טכני (סכמה, cron, threat model).  
**מסמך זה:** תצוגת מוצר/זרימה. במקרה סתירה גובר `ARCHITECTURE-SUBSCRIPTIONS.md`.  
לא חלק מ-soft-open קופונים.

---

## 0. החלטה (RS1 עד RS8)

| # | הכרעה |
|---|---|
| RS1 | `products.type = 'subscription'`; interval ראשון = `monthly`. |
| RS2 | חיוב ראשון: Low Profile `ChargeAndCreateToken`. |
| RS3 | מחזורים: ChargeToken server-to-server; idempotency `(subscription_id, billing_period)`. |
| RS4 | משתמש מחובר חובה; לא אורח. |
| RS5 | `platform_percent` snapshot **פר מחזור** כמו commerce. |
| RS6 | אין held/J5/Escrow. מנוי ≠ מקדמת קופון. |
| RS7 | ביטול מאזור אישי; ניסוח **[דורש עו״ד]**. |
| RS8 | Kill switch: `SUBSCRIPTIONS_ENABLED` נפרד מ-`CHECKOUT_ENABLED`. |

---

## 1. חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| חיוב ידני כל חודש (invoice link) | churn; RS2 token |
| subscription כקופון עם יתרה בעסק | RS6; מודל שונה |
| אורח checkout למנוי | RS4; token binding |
| retry unlimited על כשל | chargeback risk |
| Escrow לספק על מנוי | RS6; No Escrow |

---

## 2. סכמת DB

**אין DDL חדש במסמך זה.** ראה `ARCHITECTURE-SUBSCRIPTIONS.md`:

| טבלה | שימוש |
|---|---|
| `subscriptions` | status, `current_period_end`, token ref |
| `subscription_invoices` | per billing period, agorot |
| `payment_tokens` | Cardcom token (server only) |
| `orders` / `order_items` | snapshot % per cycle |

---

## 3. זרימת לקוח ומחזור

```text
PDP מנוי → login → Cardcom (token) → אישור + מייל RTL
  → cron יומי: next_billing_at
  → ChargeToken + idempotency
  → הצלחה: invoice paid; כישלון: past_due + retry backoff
  → ביטול: cancel_at_period_end
```

| ניסיון כשל | התנהגות |
|---|---|
| 1 | מייל `payment_failed`; `past_due` |
| 2-N | backoff לפי SUBSCRIPTIONS |
| אחרי max | `cancelled` / `paused` |
| כרטיס חדש | LP token replace |

---

## 4. מקרי קצה

| # | מצב | התנהגות |
|---|---|---|
| RS-E1 | double ChargeToken same period | idempotency no-op |
| RS-E2 | webhook late after cancel | reject charge; audit |
| RS-E3 | token expired mid-cycle | past_due + user action |
| RS-E4 | partial month (pro-rata) | לא v1; full month only |
| RS-E5 | SUBSCRIPTIONS_ENABLED=false | UI hidden; cron skip |
| RS-E6 | refund mid-cycle | REFUNDS-DISPUTES + legal |
| RS-E7 | platform_percent changed mid-subscription | snapshot at charge time only |

---

## 5. פתוחות

| # | פער | תאריך |
|---|---|---|
| O1 | ניסוח ביטול עו״ד (RS7) | 2026-08-12 |
| O2 | annual interval | 2026-08-12 |
| O3 | SUBSCRIPTIONS_ENABLED wiring | 2026-08-12 |

---

## 6. Acceptance

- [ ] תואם SU* ב-ARCHITECTURE-SUBSCRIPTIONS
- [ ] Token ראשון + ChargeToken מחזורים
- [ ] Idempotency לתקופה
- [ ] No Escrow / agorot

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | BINDING product-facing |
| 2026-08-12 | batch-2: DOCS-TEMPLATE-BINDING |
