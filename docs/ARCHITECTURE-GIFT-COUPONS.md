# ארכיטקטורה: קופון מתנה

רכישה, העברת בעלות, וברכות. אותם כללי כסף כמו קופון רגיל (No Escrow).

Status: **BINDING** · עודכן: 2026-08-12 · QA: PASS  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2` · batch #14/50  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/ARCHITECTURE-COUPON-LIFECYCLE.md
docs/ARCHITECTURE-INVENTORY.md
docs/ARCHITECTURE-CHECKOUT-FLOW.md
docs/ARCHITECTURE-NOTIFICATIONS.md
docs/CONTRADICTIONS.md
```

---

## 0. הכרעות

| # | הכרעה |
|---|---|
| G1 | תשלום ו-mint כמו קופון רגיל אחרי `paid`. |
| G2 | העברת בעלות רק מ-`issued` ל-user אחר; לא מ-`redeemed`. |
| G3 | ברכה = מטא-דאטה; לא משנה כסף. |
| G4 | מכסה משותפת עם דיל הרגיל (I4). |
| G5 | No Escrow; אין payout על העברה או מימוש. |

---

## 1. זרימה

```text
רוכש → checkout → paid → voucher issued (owner=buyer)
  → transfer (אופציונלי) → owner=recipient
  → redeem אצל ספק כמו רגיל → redeemed
```

---

## 2. Acceptance

- [ ] Transfer רק מ-issued  
- [ ] No Escrow  
- [ ] מכסה מוגדרת  

---

## 3. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-06 | QA-PASS |
| 2026-08-12 | batch-2 #14 |
