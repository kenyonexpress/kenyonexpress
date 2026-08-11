# ארכיטקטורה: UX מימוש קופון

מפרט UX מחייב לסורק ספק וללקוח שמציג QR. עברית RTL. בלי optimistic `redeemed`.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2` · batch #9/50  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/ARCHITECTURE-COUPON-REDEMPTION.md
docs/ARCHITECTURE-COUPON-LIFECYCLE.md
docs/ARCHITECTURE-SUPPLIER-REDEMPTION.md
docs/ARCHITECTURE-PERSONAL-AREA.md
```

---

## 0. הכרעות

| # | הכרעה |
|---|---|
| UX1 | מסך ספק: מצלמה + הזנה ידנית; תוצאה רק מתשובת שרת. |
| UX2 | אין סימון "מומש" מקומי לפני HTTP 200 success. |
| UX3 | הודעות בעברית לפי outcome (ראה טבלה ב-REDEMPTION). |
| UX4 | לקוח: QR + קוד באזור אישי; יתרת עסק לתצוגה בלבד. |
| UX5 | Wrong shop / not_found: אותה הודעה למשתמש. |
| UX6 | אחרי success: הצג יתרה לגבייה בעסק אם > 0; אין הבטחת payout. |

---

## 1. זרימת ספק

```text
פתח סריקה → הרשאת מצלמה / מקלדת
  → שלח payload
  → loading חוסם סריקה כפולה
  → success: ירוק + פרטי שובר + יתרה
  → 409/404: הודעה + אפשרות סריקה חדשה
```

PIN צוות: לפי מדיניות פורטל (SUPPLIER-REDEMPTION).

---

## 2. זרימת לקוח

```text
הזמנה paid → שובר issued באזור אישי
  → הצג QR + קוד + תוקף + שם עסק
  → אחרי redeemed: מצב סופי; אין QR פעיל
```

---

## 3. Acceptance

- [ ] RTL מלא  
- [ ] אין optimistic redeem  
- [ ] מיפוי הודעות לכל outcome  
- [ ] No Escrow בשפה למשתמש (אין "כסף משוחרר לספק")  

---

## 4. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | batch-2 #9: UX מחייב מקוצר |
