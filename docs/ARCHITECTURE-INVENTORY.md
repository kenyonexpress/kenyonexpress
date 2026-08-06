# ארכיטקטורה: מלאי

מלאי קופונים ומכסות פר דיל (ומלאי פיזי בסיסי).

Status: **BINDING** · עודכן: 2026-08-06  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/ARCHITECTURE-PRICING-RULES.md
docs/ARCHITECTURE-ADMIN-DASHBOARD.md
docs/ARCHITECTURE-COUPON-REDEMPTION.md
```

---

## 0. הכרעות

| # | הכרעה |
|---|---|
| I1 | קופון: מלאי = מכסת הנפקות (`quota`), לא יחידות מחסן. |
| I2 | מכסה נאכפת ב-checkout/finalize באטומיות. |
| I3 | פיזי: `stock_qty` על variant; oversell אסור. |
| I4 | `unlimited` רק במפורש; אחרת מספר חובה. |
| I5 | תצוגת "נשארו X" רק מתחת לסף הצגה. |

---

## 1. שדות

| שדה | סוג | משמעות |
|---|---|---|
| `quota_total` | coupon | מקס שוברים |
| `quota_issued` | coupon | כמה הונפקו |
| `quota_per_user` | coupon | אופציונלי |
| `stock_qty` | physical | יחידות |
| `inventory_policy` | both | `deny` oversell |

---

## 2. אכיפה

```text
BEGIN
  SELECT product FOR UPDATE
  IF coupon AND quota_issued + qty > quota_total → abort
  IF physical AND stock_qty < qty → abort
  … create order …
COMMIT
```

Webhook/finalize חייב אותה בדיקה או reserve מוקדם.

---

## 3. Acceptance

- [ ] מכסת קופון לא נפרצת במרוץ  
- [ ] פיזי לא oversell  
- [ ] Admin רואה נותר/הונפק  
- [ ] Unlimited מפורש בלבד  

---

## 4. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-06 | מלאי קופונים ומכסות פר דיל |
