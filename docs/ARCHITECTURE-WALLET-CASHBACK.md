# ARCHITECTURE: Wallet and Cashback

ארנק פנימי (קאשבק/קרדיט): כללי צבירה, integer agorot דרך `money.ts`, מימוש בקופה, פקיעה, בלי משיכה חיצונית.

Status: **BINDING** · Updated: 2026-08-03  
Scope: **docs only** · branch `arch/docs-queue`  
אין שינוי קוד. אין נגיעה ב-worktree הראשי.

Companions:

```
docs/ARCHITECTURE-PERSONAL-AREA.md
docs/ARCHITECTURE-REFUNDS-DISPUTES.md
docs/ARCHITECTURE-NOTIFICATIONS.md
docs/LEGAL-CHECKLIST.md
```

מימוש ייחוס כסף:

```
src/lib/money.ts
```

(כל המרות/פורמט דרכו; לא `Math.round(ils * 100)` מפוזר).

---

## 0. הכרעות מחייבות

| # | הכרעה |
|---|---|
| W1 | ארנק = קרדיט **פנימי בלבד**. לא יוצא מהמערכת (אין משיכה לבנק, אין P2P, אין זיכוי כרטיס מהארנק כברירת מחדל). |
| W2 | יתרה ותנועות: integer **agorot** בלבד ב-DB ובחוזים. |
| W3 | כל המרה/פורמט לתצוגה: דרך `money.ts` (`formatAgorot`, המרות מאומתות). |
| W4 | מימוש ארנק רק ב-checkout שרת (atomic עם ההזמנה). |
| W5 | יתרה לעולם ≥ 0 אחרי כל תנועה; בדיקת DB constraint. |
| W6 | Refund לכרטיס נכשל → אופציית זיכוי ארנק (ראה Refunds). |
| W7 | UI: `/account/wallet`, עברית, ₪. |

---

## 1. מודל נתונים (לוגי)

```text
wallet_accounts
  user_id PK/FK
  balance_agorot  bigint CHECK (>= 0)
  updated_at

wallet_ledger
  id, user_id, amount_agorot (+credit / -debit)
  balance_after_agorot
  reason  enum/text
  reference_type, reference_id  (order, refund, campaign, expiry, …)
  created_at
  idempotency_key UNIQUE
```

סיבות נפוצות:

| reason | כיוון |
|---|---|
| `cashback_earn` | + |
| `checkout_redeem` | − |
| `refund_fallback` | + |
| `manual_adjust` | ± (admin + audit) |
| `expiry` | − |
| `order_cancel_restore` | + (החזרת קרדיט שנוצל בהזמנה שבוטלה) |

---

## 2. Earning rules (צבירה)

| מקור | כלל יעד |
|---|---|
| Cashback על רכישה | % או סכום קבוע מאגורות **ששולמו באתר** (לא מיתרה בעסק). נזקף אחרי `paid` יציב (לא לפני webhook). |
| קמפיין | קוד/סגמנט עם `idempotency_key`; תקרה למשתמש |
| Refund fallback | סכום הזיכוי שלא חזר לכרטיס |
| ידני | אדמין בלבד + סיבה חובה |

כללים:

1. לא לצבור על הזמנה שבוטלה/chargeback (או clawback ledger).
2. קופון: בסיס הצבירה = `coupon_price` ששולם, לא מחיר מחירון.
3. חישוב אחוזים: basis points ב-integers דרך `money.ts` / פונקציות ייעודיות; לא float.

---

## 3. Redemption at checkout

```text
begin_checkout
  → server loads wallet balance_agorot
  → customer בוחר כמה לממש (0…min(balance, payable_on_site))
  → create order: wallet_debit + Cardcom charge for remainder
  → same transaction / ordered steps with idempotency
  → if pay fails: restore wallet (compensating ledger) or never debit until pay auth policy
```

מדיניות מומלצת (יעד):

- חיוב ארנק **רק אחרי** אישור תשלום משלים / או hold-then-capture לוגי עם פיצוי ברור
- הסכום לממש לא יכול לעלות על `total_on_site_agorot`
- לא ניתן לממש ארנק על "יתרה בעסק" של קופון

UI checkout: שורת "קרדיט ארנק" בעברית + יתרה אחרי.

---

## 4. Expiry policy

| פרמטר | יעד התחלתי |
|---|---|
| תוקף קרדיט | 12 חודשים מתאריך הזקיפה (או FIFO buckets) |
| Job | cron יומי: `expiry` ledger על יתרות שפגו |
| הודעה | אופציונלי 14 יום לפני (prefs); לא spam |

יישום FIFO: כל credit עם `expires_at`; חיוב checkout מוריד מהקרוב לפקיעה.

---

## 5. No external withdrawal

אסור:

- העברה לחשבון בנק
- PayPal / Bit / P2P בין משתמשים
- "משיכת קאשבק"

מותר להציג ב-UI:

```text
הקרדיט ניתן למימוש באתר קניון אקספרס בלבד ואינו ניתן למשיכה.
```

מחיקת חשבון: יתרה לא משולמת החוצה; מדיניות legal (ויתור / תקופת מימוש).

---

## 6. money.ts (חוזה)

| פונקציה / כלל | משמעות |
|---|---|
| קלט משתמש ILS | המרה מאומתת לאגורות (דחיית NaN / >2 עשרונים) |
| תצוגה | `formatAgorot` → ₪ `he-IL` |
| אחוזים | basis points integers |
| אסור | `value * 100` עם float בנתיבי כסף |

כל נתיב wallet חייב לעבור אותם פרימיטיבים כמו cart/checkout.

---

## 7. אבטחה

- RLS: משתמש רואה רק את הארנק שלו
- Admin adjust: audit + סף + recent auth
- Idempotency על כל credit/debit
- Rate limit על redeem attempts

---

## 8. Acceptance

- [ ] יתרה agorot בלבד + constraint ≥ 0
- [ ] checkout מממש ארנק בשרת
- [ ] אין משיכה חיצונית בנוסח וב-API
- [ ] expiry job מוגדר
- [ ] כל הפורמט דרך `money.ts`

---

## 9. Revision

| Date | Change |
|---|---|
| 2026-08-03 | מסמך ראשוני על arch/docs-queue |
