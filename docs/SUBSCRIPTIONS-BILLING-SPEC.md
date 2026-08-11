# SUBSCRIPTIONS-BILLING-SPEC.md
# מפרט מנויים: Cardcom Recurring (סיכום מוצר)

סיכום קצר. **מקור מחייב:**

```
docs/ARCHITECTURE-SUBSCRIPTIONS.md
```

Status: **SPEC (future)** · עודכן: 2026-08-11  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`

מסמכים קשורים:

```
docs/ARCHITECTURE-SUBSCRIPTIONS.md
docs/CARDCOM-ARCHITECTURE.md
docs/ARCHITECTURE-COMMERCE.md
docs/ARCHITECTURE-PRICING-RULES.md
docs/BUSINESS-MODEL.md
docs/CHECKOUT-OPTIMIZATION.md
docs/ARCHITECTURE-LEGAL-COMPLIANCE.md
docs/REFUNDS-CANCELLATION-POLICY.md
docs/CONTRADICTIONS.md
```

---

## 0. הכרעות (תמצית מ-ARCHITECTURE-SUBSCRIPTIONS)

| # | הכרעה |
|---|---|
| S1 | סוג מוצר: `products.type = 'subscription'`. |
| S2 | סכום חיוב: integer **agorot**; interval ראשוני `monthly`. |
| S3 | אמצעי: Cardcom Recurring Token אחרי חיוב ראשון מוצלח. |
| S4 | פיצול עמלה: אותם כללי `platform_percent` snapshot כמו commerce. |
| S5 | אין Escrow; מנוי ≠ מקדמת קופון. |
| S6 | ביטול מנוי לפי חוק / מדיניות לפני יישום (**[דורש עו״ד]**). |
| S7 | Cron חיוב: idempotency מפתח `(subscription_id, billing_period)`. |
| S8 | Retry: עד 3 ניסיונות soft בחלון ~7 ימים; אחר כך pause/cancel. |

פירוט מלא: הצטרפות, סכמה SQL, מכונת מצבים, זכויות צרכן, אבטחה → `ARCHITECTURE-SUBSCRIPTIONS.md`.

---

## 1. זרימות (מפה)

| נושא | איפה במסמך הקנוני |
|---|---|
| הצטרפות + Token | §3 |
| מחזור cron | §4 |
| כשלים / retry / עדכון כרטיס | §5 |
| ביטול / הקפאה | §6 |
| זכויות צרכן | §7 |
| Acceptance | §12 |

---

## 2. Out of scope

- מנוי שמוכר קופונים חודשיים עם מימוש פיזי  
- שנתי עם הנחה (phase 2)  
- Apple/Google IAP  

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-11 | מפרט מנויים + Cardcom Recurring, cron, idempotency |
| 2026-08-11 | הופנה ל-`ARCHITECTURE-SUBSCRIPTIONS.md` כמקור מחייב |
