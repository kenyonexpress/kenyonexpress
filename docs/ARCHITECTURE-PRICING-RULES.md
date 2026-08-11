# ארכיטקטורה: כללי תמחור

מקור אמת מחייב לתמחור מוצר, פיצול פלטפורמה/ספק, מחיר קופון מוחלט, מבצעי בזק, הנחות תצוגה, וגבול מול אגרות סטטוטוריות.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מודל כסף: **No Escrow**. `platform_percent` חובה **פר מוצר**, בלי `DEFAULT`. כל חישוב באגורות integer.

מסמכים קשורים:

```
docs/CONTRADICTIONS.md
docs/BUSINESS-MODEL.md
docs/ARCHITECTURE-COMMERCE.md
docs/ARCHITECTURE-CHECKOUT-FLOW.md
docs/ARCHITECTURE-PAYOUT-MECHANISM.md
docs/ARCHITECTURE-MONEY.md
```

היררכיה: `CONTRADICTIONS.md` (C1–C11) גובר.

---

## 0. החלטה (מחייבת)

| # | הכרעה |
|---|---|
| P1 | אין עמלה גלובלית ואין fallback. `products.platform_percent` **פר מוצר**, `NOT NULL`, בלי `DEFAULT`. |
| P2 | `platform_percent + supplier_split_percent = 100` (CHECK; snapshot ל-`order_items`). |
| P3 | קופון: `coupon_price` מוחלט; **No Escrow**; `supplier_due_from_platform = 0`. |
| P4 | פיזי: חיוב 100% באתר; פיצול ledger לפי snapshot. |
| P5 | `discount_percent` לתצוגה בלבד. |
| P6 | מבצע בזק = חלון + מחיר חלופי; אחרי `paid` לא משנה snapshots. |
| P7 | אחרי `paid`: snapshots immutable. |
| P8 | שיעור ברמת ספק **אינו** ברירת מחדל לפיצול. |
| P9 | כסף: agorot integer; half-up פעם אחת על עמלה. |
| P10 | דמי ביטול / מע"מ **אינם** `platform_percent`. |

---

## 1. חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| default `platform_percent = 5` | מסתיר מוצר לא מוגדר |
| Escrow / held-until-redeem לספק | סותר No Escrow |
| `coupon_price` = `% × face` | חיוב = שדה מוחלט בלבד |
| שיעור ברמת ספק כ-default | P8; per-product בלבד |
| float במסלול כסף | round-trip אגורה |
| שינוי % רטרו על `paid` | C10; snapshot immutable |

---

## 2. סכמת DB (קיים; אין DDL חדש)

### 2.1 `products`

| שדה | תפקיד |
|---|---|
| `price_ils` / face agorot | מחירון / face |
| `coupon_price_ils` | תשלום מוחלט באתר (קופון) |
| `platform_percent` | חובה; אין default |
| `supplier_split_percent` | משלים ל-100 |
| `discount_percent` | תצוגה |
| `flash_price_*` | מבצע בזק |

### 2.2 `order_items` (snapshot)

| שדה | משמעות |
|---|---|
| `platform_percent` | אחוז בזמן קנייה |
| `paid_on_site_agorot` | חיוב באתר |
| `commission_agorot` | עמלת פלטפורמה |
| `supplier_due` / `supplier_immediate_agorot` | לספק (קופון: 0) |
| `balance_due_agorot` | יתרה בעסק (קופון) |
| `escrow_held_agorot` | תמיד 0 (legacy) |

אין DDL חדש.

---

## 3. קופון: No Escrow

```text
charged_on_site_agorot = coupon_price_agorot
balance_at_business_agorot = face_agorot - coupon_price_agorot
platform_keeps_agorot = charged_on_site_agorot
supplier_due_from_platform_agorot = 0
```

| face | 10000 (100.00 ₪) |
| coupon_price | 1500 (15.00 ₪) |
| לספק מהפלטפורמה | 0 |
| יתרה בעסק | 8500 |

---

## 4. פיזי: פיצול snapshot

```text
platform_fee_agorot = round_half_up(line_total * platform_percent / 100)
supplier_due_agorot = line_total - platform_fee_agorot
```

---

## 5. מבצעי בזק והנחות

```text
if now in [flash_starts_at, flash_ends_at) and flash_price set:
  charge = flash_price
else:
  charge = coupon_price (קופון) או price (פיזי)
```

---

## 6. אגרות סטטוטוריות (לא platform_percent)

| אגרה | כלל |
|---|---|
| דמי ביטול | עד 5% או 100 ₪, הנמוך |
| מע"מ | 18% כשחל על חשבונית |

---

## 7. מקרי קצה

| מקרה | התנהגות |
|---|---|
| publish בלי platform_percent | חסימה |
| coupon_price > face | חסימה |
| flash מסתיים mid-checkout | מחיר נקבע בשרת ב-LP |
| wallet מכסה 100% | snapshots ללא שינוי % |
| שינוי מוצר אחרי paid | order_items לא משתנה |
| עיגול half-up על 0.5 agora | deterministic |
| B2B override | חייב P1/P3/P7 |
| multi-qty קופון | face × qty; coupon × qty |

---

## 8. Acceptance

- [ ] Publish נכשל בלי `platform_percent`
- [ ] קופון: supplier_due פלטפורמה = 0
- [ ] אין held/Escrow
- [ ] flash לא שובר snapshots ישנים
- [ ] agorot integer

---

## 9. פתוחות

| ID | שאלה | ברירת מחדל |
|---|---|---|
| Q-PR-VAT | VAT 17% vs 18% בקוד? | ARCHITECTURE-MONEY M11 |

---

## 10. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-06 | platform_percent + בזק |
| 2026-08-12 | batch-2: BINDING template; חמשת סעיפי חובה |
