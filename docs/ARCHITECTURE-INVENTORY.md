# ארכיטקטורה: מלאי ומכסות

מכסות קופון פר דיל ומלאי פיזי בסיסי. אין Escrow.

Status: **BINDING** · עודכן: 2026-08-12 · QA: PASS  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2` · batch #13/50  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/ARCHITECTURE-CHECKOUT-FLOW.md
docs/ARCHITECTURE-COUPON-LIFECYCLE.md
docs/ARCHITECTURE-GIFT-COUPONS.md
docs/ARCHITECTURE-PRICING-RULES.md
docs/CONTRADICTIONS.md
```

מודל כסף: **No Escrow**. מכסה מגבילה הנפקה/מכירה; לא מחזיקה כסף לספק.

---

## 0. הכרעות

| # | הכרעה |
|---|---|
| I1 | מכסת קופון נאכפת אטומית בזמן checkout/finalize. |
| I2 | כשל מכסה → אין LP / אין paid חדש על יחידות עודפות. |
| I3 | מלאי פיזי: `stock_quantity` יורד ב-finalize (idempotent עם split). |
| I4 | מתנה חולקת מכסה עם מכירה רגילה אלא אם הוגדר אחרת במפורש. |
| I5 | Over-sell אסור; reconcile מתקן תצוגה לא יוצר יחידות יש מאין. |

---

## 1. קופון

```text
available = quota - issued - reserved_pending
reserve ב-pending order (אופציונלי) / enforce ב-finalize
mint ≤ quantity ו-≤ available
```

---

## 2. פיזי

```text
finalize → stock_quantity = max(0, stock - qty)
replay finalize לא מוריד פעמיים (split_executions UNIQUE)
```

---

## 3. Acceptance

- [ ] אכיפה אטומית  
- [ ] No Escrow  
- [ ] פיזי + קופון מוגדרים  

---

## 4. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-06 | QA-PASS |
| 2026-08-12 | batch-2 #13: רענון BINDING |
