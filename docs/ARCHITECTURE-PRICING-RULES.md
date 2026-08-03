# ARCHITECTURE: Pricing Rules

`platform_percent` דינמי פר מוצר, הנחות, ומבצעי בזק.

Status: **BINDING** · Updated: 2026-08-03 (pack-20)
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`
אין שינוי קוד. אין נגיעה ב-worktree הראשי (`kenyonexpress`).

Companions:

```
docs/ARCHITECTURE-ADMIN-DASHBOARD.md
docs/BUSINESS-MODEL.md
docs/ARCHITECTURE-INVENTORY.md
docs/ARCHITECTURE-FRAUD-PREVENTION.md
```

---

## 0. הכרעות

| # | הכרעה |
|---|---|
| P1 | אין עמלה גלובלית קבועה. `platform_percent` **פר מוצר**, בלי default, admin only. |
| P2 | `platform_percent + supplier_split_percent = 100`. |
| P3 | קופון: מחיר אתר = `coupon_price_ils` מוחלט; יתרה בעסק = face − coupon; **No Escrow** (כל המקדמה לפלטפורמה). |
| P4 | פיזי: פיצול on-site לפי snapshot ב-`order_items`. |
| P5 | הנחת תצוגה (`discount_percent`) לא מקור חיוב. |
| P6 | מבצע בזק = חלון זמן + מחיר/קופון חלופי; נגמר לפי שעון שרת. |
| P7 | אחרי paid: snapshots לא משתנים כשמעדכנים מוצר. |

---

## 1. שדות כסף במוצר

| שדה | תפקיד |
|---|---|
| `price_ils` / face | מחירון |
| `coupon_price_ils` | תשלום באתר לקופון |
| `platform_percent` | עמלת פלטפורמה (פיזי; בקופון לביקורת/עקביות) |
| `supplier_split_percent` | משלים ל-100 |
| `flash_price_ils` / `flash_starts_at` / `flash_ends_at` | מבצע בזק אופציונלי |

Checkout בוחר מחיר אפקטיבי לפי עכשיו ∈ חלון הבזק.

---

## 2. מבצעי בזק

```text
if now() in [flash_starts_at, flash_ends_at) and flash_price set:
  charge_price = flash_price
else:
  charge_price = coupon_price or physical price
```

כללים: לא מאריך אוטומטית; admin יכול להאריך עם audit; מלאי/מכסה עדיין חלים.

---

## 3. Acceptance

- [ ] Publish נכשל בלי platform_percent
- [ ] Flash לא שובר snapshots ישנים
- [ ] קופון: platform keeps on-site; till balance נפרד
- [ ] UI אדמין מציג זוג אחוזים = 100

---

## 4. Revision

| Date | Change |
|---|---|
| 2026-08-03 | pack-20: pricing rules + flash deals |
