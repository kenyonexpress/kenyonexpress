# ארכיטקטורה: תבניות אימייל (Resend)

תבניות RTL בעברית לכל אירועי מחזור קופון והזמנה. Resend בלבד כערוץ מייל.

Status: **BINDING** · עודכן: 2026-08-12 · QA: PASS  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2` · batch #27/50  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/ARCHITECTURE-NOTIFICATIONS.md
docs/ARCHITECTURE-EMAIL-TEMPLATES.md
docs/EMAIL-TEMPLATES-COPY.md
docs/ARCHITECTURE-COUPON-LIFECYCLE.md
docs/ARCHITECTURE-LEGAL-COMPLIANCE.md
docs/CONTRADICTIONS.md
```

מודל כסף: **No Escrow**. תבניות לא מבטיחות "כסף מוחזק לספק" ולא payout על קופון.

---

## 0. הכרעות

| # | הכרעה |
|---|---|
| E1 | כל המיילים העסקיים דרך outbox → Resend; לא SMTP ישיר מדפי Next. |
| E2 | RTL + עברית; `dir=rtl` ב-HTML. |
| E3 | Idempotency: `dedupe_key` / `voucher-email:{orderId}` וכו'. |
| E4 | אין שליחה לפני `paid` לאירועי רכישה/הנפקה. |
| E5 | תוכן כספי באגורות→₪ תצוגה; מספרים מ-snapshot הזמנה. |
| E6 | Unsubscribe / העדפות לפי NOTIFICATIONS + חוק ספאם ישראלי. |

---

## 1. אירועים מחייבים

| אירוע | מתי | נמען |
|---|---|---|
| `order_paid` | אחרי finalize | לקוח |
| `voucher_issued` | אחרי mint | לקוח |
| `voucher_redeemed` | אחרי סריקה | לקוח (+ אופציונלי ספק) |
| `voucher_expired` | cron | לקוח |
| `refund_completed` | אחרי Cardcom confirm | לקוח |
| `gift_received` | אחרי transfer | נמען |

עותק מלא של טקסטים: `EMAIL-TEMPLATES-COPY.md`.

---

## 2. מבנה תבנית

```text
header (לוגו)
  → כותרת פעולה אחת
  → גוף קצר (מה קרה / מה לעשות)
  → CTA יחיד (אזור אישי / QR)
  → footer משפטי + העדפות
```

אסור: המלצות "Escrow", אחוז עמלה קבוע, הבטחת payout קופון.

---

## 3. כשלים

| מצב | התנהגות |
|---|---|
| Resend 5xx | retry outbox + DLQ |
| כפילות | dedupe_key → no-op |
| משתמש בלי אימייל | לוג; SMS/in-app אם קיים |

---

## 4. Acceptance

- [ ] רשימת אירועים מלאה  
- [ ] RTL + dedupe  
- [ ] No Escrow בנוסח  
- [ ] קישור ל-COPY ול-NOTIFICATIONS  

---

## 5. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-06 | QA-PASS |
| 2026-08-12 | batch-2 #27 |
| 2026-08-12 | batch-2 #27 pass-2: אירועים, מבנה, כשלים |
