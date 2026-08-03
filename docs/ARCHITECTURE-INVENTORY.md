# ARCHITECTURE: Inventory

מלאי קופונים ומכסות פר דיל (ומלאי פיזי בסיסי).

Status: **BINDING** · Updated: 2026-08-03 (pack-20)
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`
אין שינוי קוד. אין נגיעה ב-worktree הראשי (`kenyonexpress`).

Companions:

```
docs/ARCHITECTURE-PRICING-RULES.md
docs/ARCHITECTURE-ADMIN-DASHBOARD.md
docs/ARCHITECTURE-COUPON-REDEMPTION.md
docs/BUSINESS-MODEL.md
```

---

## 0. הכרעות

| # | הכרעה |
|---|---|
| I1 | קופון: מלאי = מכסת הנפקות (`max_issuances` / `quota`) לא יחידות פיזיות במחסן. |
| I2 | מכסה נאכפת ב-checkout/finalize באטומיות (לא רק ב-UI). |
| I3 | `sold_count` / `issued_count` מצטברים; לא סופרים vouchers cancelled/refunded כזמינים מחדש אוטומטית בלי מדיניות. |
| I4 | פיזי: `stock_qty` על variant; decrement ב-paid; oversell אסור (conditional update). |
| I5 | דיל יכול להיות `unlimited` במפורש; אחרת חובה מספר. |
| I6 | תצוגה: "נשארו X" רק אם המכסה מוגדרת ומתחת לסף הצגה. |

---

## 1. שדות מוצר

| שדה | סוג מוצר | משמעות |
|---|---|---|
| `quota_total` | coupon | מקס שוברים להנפקה |
| `quota_issued` | coupon | כמה הונפקו (או נגזר מספירה) |
| `quota_per_user` | coupon | אופציונלי |
| `stock_qty` | physical | יחידות |
| `inventory_policy` | both | `deny` oversell (מחייב) |

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

Webhook/finalize חייב אותה בדיקה או נעילה מוקדמת ב-reserve.

---

## 3. Acceptance

- [ ] מכסת קופון לא נפרצת במרוץ
- [ ] פיזי לא oversell
- [ ] Admin רואה נותר/הונפק
- [ ] Unlimited מפורש בלבד

---

## 4. Revision

| Date | Change |
|---|---|
| 2026-08-03 | pack-20: inventory + coupon quotas |
