# ארכיטקטורה: תמיכת לקוחות

פניות לקוח, בעיות מימוש קופון, ו-SLA.

Status: **BINDING** · עודכן: 2026-08-06 · QA: PASS  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/ARCHITECTURE-FRAUD-PREVENTION.md
docs/ARCHITECTURE-LEGAL-COMPLIANCE.md
docs/ARCHITECTURE-ADMIN-DASHBOARD.md
docs/ARCHITECTURE-NOTIFICATIONS.md
docs/ARCHITECTURE-DATA-EXPORT-GDPR.md
docs/CONTRADICTIONS.md
```

---

## 0. הכרעות

| # | הכרעה |
|---|---|
| S1 | תמיכה בעברית: טופס/מייל; טלפון אופציונלי בהמשך. |
| S2 | Role `support`: קריאה רחבה; כסף מוגבל בלי mark payout/refund מלא. |
| S3 | בעיית מימוש: קודם voucher status + redemption log; לא "שחרור" בלי audit. |
| S4 | צילום מסך / מימוש כפול: מדיניות FRAUD + תסריט קבוע. |
| S5 | Chargeback/refund: העברה ל-admin/super_admin. |
| S6 | SLA: מענה ראשון ≤ **1 יום עסקים** ב-MVP; דחוף מימוש ≤ **4 שעות עסקים**. |

---

## 1. סוגי פניות

| סוג | טיפול |
|---|---|
| לא קיבלתי מייל קופון | outbox/Resend; שליחה מחדש idempotent |
| QR לא נסרק | תוקף/סטטוס; בהירות מסך; חתימה |
| "מישהו אחר מימש" | הצג `redeemed_at`; FRAUD playbook |
| ביטול/החזר | LEGAL (14 יום / דמי ביטול); voucher לא redeemed |
| ספק לא מכבד | תיעוד; פנייה לספק; אפשרות pause מוצר |

---

## 2. SLA

| עדיפות | דוגמה | יעד מענה ראשון | יעד סגירה |
|---|---|---|---|
| P1 | תשלום נמשך בלי קופון / chargeback | 2 שעות עסקים | לפי LEGAL/FRAUD |
| P2 | בעיית מימוש ביום העסקה | 4 שעות עסקים | 1 יום עסקים |
| P3 | שאלה כללית / הנחיה | 1 יום עסקים | 3 ימי עסקים |

שעות עסקים יעד: א'-ה' 09:00 עד 18:00 שעון ישראל. חריגה → אסקלציה לבעלים + תיעוד ב-`STATE.md` אם סיסטמי.

---

## 3. כלים

- Admin: הזמנה, timeline voucher, scan log (IP truncated)  
- Macros בעברית לתשובות נפוצות  
- קישור ל-`manual_review`  

---

## 4. Acceptance

- [ ] Support לא מסמן paid/refund בלי הרשאה  
- [ ] תסריטי מימוש בעברית  
- [ ] SLA מתועד ונמדד  
- [ ] Audit על פעולות חריגות  

---

## 5. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-06 | פניות, מימוש, SLA מפורש |
| 2026-08-06 | QA: קישור DATA-EXPORT-GDPR |
| 2026-08-07 | QA re-pass: en-dash בשעות; קישור CONTRADICTIONS |
