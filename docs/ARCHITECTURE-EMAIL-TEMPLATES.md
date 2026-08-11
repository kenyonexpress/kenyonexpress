# ארכיטקטורה: תבניות אימייל (Resend)

תבניות RTL בעברית לכל אירועי מחזור קופון והזמנה. Resend בלבד כערוץ מייל.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.  
מודל כסף: **No Escrow**. תבניות לא מבטיחות "כסף מוחזק לספק".

מסמכים קשורים:

```
docs/DOCS-TEMPLATE-BINDING.md
docs/ARCHITECTURE-NOTIFICATIONS.md
docs/EMAIL-TEMPLATES-COPY.md
docs/ARCHITECTURE-COUPON-LIFECYCLE.md
docs/ARCHITECTURE-LEGAL-COMPLIANCE.md
docs/CONTRADICTIONS.md
```

---

## 0. החלטה (EM1 עד EM6)

| # | הכרעה |
|---|---|
| EM1 | כל המיילים העסקיים דרך outbox → Resend; לא SMTP ישיר מדפי Next. |
| EM2 | RTL + עברית; `dir=rtl` ב-HTML. |
| EM3 | Idempotency: `dedupe_key` / `voucher-email:{orderId}`. |
| EM4 | אין שליחה לפני `paid` לאירועי רכישה/הנפקה. |
| EM5 | תוכן כספי באגורות→₪ תצוגה; מספרים מ-snapshot הזמנה. |
| EM6 | Unsubscribe / העדפות לפי NOTIFICATIONS + חוק ספאם ישראלי. |

---

## 1. חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| SMTP ישיר מ-Vercel | deliverability + secret exposure |
| SendGrid במקביל ל-Resend | EM1; vendor אחד v1 |
| שליחה מ-client (Resend key) | EM1; key leak |
| float בסכומים במייל | EM5; agorot integer |
| נוסח "כסף מוחזק / Escrow" | No Escrow; CONTRADICTIONS |

---

## 2. סכמת DB

**אין DDL חדש במסמך זה.**

| טבלה | שימוש email |
|---|---|
| `notification_outbox` | queue + retry + DLQ |
| `notification_templates` | template key + version |
| `user_notification_preferences` | opt-out |
| `orders` / `order_items` | snapshot amounts |
| `vouchers` | event triggers |

Migration מקור: notifications migrations (ראה `ARCHITECTURE-NOTIFICATIONS.md`).

---

## 3. אירועים ומבנה

| אירוע | מתי | נמען |
|---|---|---|
| `order_paid` | אחרי finalize | לקוח |
| `voucher_issued` | אחרי mint | לקוח |
| `voucher_redeemed` | אחרי סריקה | לקוח |
| `voucher_expired` | cron | לקוח |
| `refund_completed` | אחרי Cardcom confirm | לקוח |
| `gift_received` | אחרי transfer | נמען |

```text
header (לוגו)
  → כותרת פעולה אחת
  → גוף קצר
  → CTA יחיד (אזור אישי / QR)
  → footer משפטי + העדפות
```

עותק מלא: `EMAIL-TEMPLATES-COPY.md`.

---

## 4. מקרי קצה

| # | מצב | התנהגות |
|---|---|---|
| EM-E1 | Resend 5xx | retry outbox + DLQ |
| EM-E2 | dedupe_key כפול | no-op |
| EM-E3 | משתמש בלי אימייל | לוג; in-app אם קיים |
| EM-E4 | שליחה לפני paid | חסום ב-trigger |
| EM-E5 | bounce hard | mark undeliverable; לא retry לנצח |
| EM-E6 | unsubscribe link forged | signed token `UNSUBSCRIBE_SIGNING_SECRET` |
| EM-E7 | partial order (multi voucher) | dedupe per voucher_id |

---

## 5. פתוחות

| # | פער | תאריך |
|---|---|---|
| O1 | WhatsApp parallel לחלק מהאירועים | 2026-08-12 |
| O2 | A/B subject lines (marketing) | 2026-08-12 |
| O3 | supplier copy on `voucher_redeemed` | 2026-08-12 |

---

## 6. Acceptance

- [ ] רשימת אירועים מלאה
- [ ] RTL + dedupe
- [ ] No Escrow בנוסח
- [ ] קישור ל-COPY ול-NOTIFICATIONS

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-06 | QA-PASS |
| 2026-08-12 | batch-2: DOCS-TEMPLATE-BINDING |
