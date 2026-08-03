# ARCHITECTURE: Customer Support

פניות לקוח וטיפול בבעיות מימוש קופון.

Status: **BINDING** · Updated: 2026-08-03 (pack-20)
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`
אין שינוי קוד. אין נגיעה ב-worktree הראשי (`kenyonexpress`).

Companions:

```
docs/ARCHITECTURE-FRAUD-PREVENTION.md
docs/ARCHITECTURE-ADMIN-DASHBOARD.md
docs/ARCHITECTURE-NOTIFICATIONS.md
docs/ARCHITECTURE-LEGAL-COMPLIANCE.md
```

---

## 0. הכרעות

| # | הכרעה |
|---|---|
| S1 | תמיכה דרך טופס/מייל בעברית; טלפון אופציונלי בהמשך. |
| S2 | Role `support`: קריאה רחבה, כסף מוגבל (`canSeeMoney` / בלי payout mark). |
| S3 | בעיה במימוש: קודם בודקים voucher status + redemption log; לא "משחררים" ידנית בלי audit. |
| S4 | מימוש כפול / צילום מסך: מדיניות FRAUD; תספית קבוע ללקוח. |
| S5 | Chargeback / refund: העברה ל-admin/super_admin. |
| S6 | SLA יעד: מענה ראשון ≤ 1 יום עסקים ב-MVP. |

---

## 1. סוגי פניות

| סוג | טיפול |
|---|---|
| לא קיבלתי מייל קופון | בדיקת outbox/Resend; שליחה מחדש idempotent |
| QR לא נסרק | בדיקת תוקף/סטטוס; הנחיית בהירות מסך |
| "מישהו אחר מימש" | הצג redeemed_at; FRAUD playbook |
| ביטול/החזר | legal + voucher not redeemed; admin path |
| ספק לא מכבד | תיעוד; פנייה לספק; אפשרות pause מוצר |

---

## 2. כלים

- Admin: הזמנה, voucher timeline, scan log (IP truncated)
- Macros בעברית לתשובות נפוצות
- קישור ל-`manual_review` כשצריך

---

## 3. Acceptance

- [ ] Support לא מסמן paid/refund בלי הרשאה
- [ ] תסריטי מימוש מתועדים בעברית
- [ ] Audit על פעולות חריגות

---

## 4. Revision

| Date | Change |
|---|---|
| 2026-08-03 | pack-20: customer support + redemption issues |
