# SUBSCRIPTIONS-BILLING-SPEC.md
# מפרט מנויים: Cardcom Recurring

מוצר מסוג `subscription` עם טוקן חוזר של Cardcom וחיוב תקופתי.  
לא חלק מהשקת הקופונים. דורש threat model + מיגרציה לפני קוד.

Status: **SPEC (future)** · עודכן: 2026-08-11  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`

מסמכים קשורים:

```
docs/CARDCOM-ARCHITECTURE.md
docs/ARCHITECTURE-COMMERCE.md
docs/ARCHITECTURE-PRICING-RULES.md
docs/BUSINESS-MODEL.md
docs/CHECKOUT-OPTIMIZATION.md
docs/ARCHITECTURE-LEGAL-COMPLIANCE.md
docs/CONTRADICTIONS.md
```

---

## 0. הכרעות

| # | הכרעה |
|---|---|
| S1 | סוג מוצר: `products.type = 'subscription'`. |
| S2 | סכום חיוב: integer **agorot**; interval ראשוני `monthly`. |
| S3 | אמצעי: Cardcom Recurring Token אחרי חיוב ראשון מוצלח. |
| S4 | פיצול עמלה: אותם כללי `platform_percent` snapshot כמו commerce. |
| S5 | אין Escrow; מנוי ≠ מקדמת קופון. |
| S6 | ביטול מנוי לפי חוק / מדיניות (14ג1 וכו') לפני יישום. |
| S7 | Cron חיוב: idempotency מפתח `(subscription_id, billing_period)`. |

---

## 1. מודל נתונים (טיוטה)

```text
subscriptions
  id, user_id, product_id
  cardcom_recurring_token  (server-only)
  status: active | paused | past_due | cancelled
  amount_agorot            (snapshot)
  platform_percent_snapshot
  interval: monthly
  next_billing_at
  cycles_completed
  max_billing_cycles       (null = ללא הגבלה)
  created_at, cancelled_at

subscription_invoices
  id, subscription_id, order_id?
  period_start, period_end
  amount_agorot, status
  idempotency_key
```

חיוב ראשון יוצר `orders` רגיל + שומר טוקן. חיובים הבאים יוצרים order/invoice חדשים.

---

## 2. זרימת הצטרפות

```text
PDP subscription
  → חובה משתמש מחובר (לא אורח)
  → Low Profile / טוקן לפי Cardcom Recurring
  → חיוב ראשון אומת (GetLpResult / API)
  → status=active, next_billing_at = +1 month
  → מייל אישור מנוי + קישור לביטול בחשבון
```

כישלון חיוב ראשון: אין מנוי פעיל; אין טוקן שמור לשימוש חוזר בלי הסכמה.

---

## 3. Cron חיוב חוזר

```text
כל יום (או שעתי):
  בחר subscriptions where status=active and next_billing_at <= now()
  לכל אחד:
    charge with recurring token (amount_agorot)
    if success:
      invoice paid + order row
      cycles_completed++
      next_billing_at += interval
      אם הגיע max_cycles → cancelled
    if soft decline:
      status=past_due; retry policy (3 ניסיונות / 7 ימים)
      הודעת מייל "עדכנו אמצעי תשלום"
    if hard decline / token invalid:
      paused או cancelled לפי מדיניות
```

אין double-charge: אותה `idempotency_key` לתקופה.

---

## 4. ביטול והשהיה

| פעולה | מי | תוצאה |
|---|---|---|
| ביטול ע״י משתמש | account UI | `cancelled`; אין חיוב עתידי; גישה עד סוף תקופה ששולמה אם רלוונטי |
| השהיה | משתמש/admin | `paused`; cron מדלג |
| חידוש | משתמש | דורש אמצעי תקף |

נוסח משפטי ומדיניות החזר: LEGAL לפני פרוד.

---

## 5. אבטחה

- טוקן רק בשרת / vault; לא ל-client  
- rate limit על "עדכון כרטיס"  
- audit לכל שינוי status  
- התראת anomaly על כשל המוני ב-cron  

---

## 6. Out of scope

- מנוי שמוכר קופונים חודשיים עם מימוש פיזי (דורש מפרט נפרד)  
- שנתי עם הנחה (אפשר phase 2 על אותו מודל)  
- Apple/Google IAP (אפ: מנויים דיגיטליים בחנות לפי כללי Apple; לא לערבב עם Cardcom בלי ייעוץ)

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-11 | מפרט מנויים + Cardcom Recurring, cron, idempotency |
