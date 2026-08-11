# ARCHITECTURE: Inventory (Physical Products)

ניהול מלאי למוצרים פיזיים: מלאי לפי variant, שמירה (reservation) ב-checkout, מניעת oversell, התראות מלאי נמוך לספק.

Status: **BINDING** · Updated: 2026-08-03  
Scope: **docs only** · branch `arch/docs-queue`  
אין שינוי קוד. אין נגיעה ב-worktree הראשי.

Companions:

```
docs/ARCHITECTURE-SUPPLIER-PORTAL.md
docs/ARCHITECTURE-CHECKOUT-CARDCOM.md
docs/ARCHITECTURE-NOTIFICATIONS.md
docs/ARCHITECTURE-FRAUD-PREVENTION.md
```

קופונים: אין "מלאי יחידות" קלאסי (יש הנפקה לפי מדיניות/תוקף). מסמך זה = **physical** (+ variants).

---

## 0. הכרעות מחייבות

| # | הכרעה |
|---|---|
| I1 | מלאי נשמר ב-DB כאמת; UI רק מציג. |
| I2 | Oversell נמנע בטרנזקציה (הורדה/שמירה אטומית), לא ב-check בלבד ב-client. |
| I3 | Reservation ב-checkout עם TTL; שחרור ב-expiry / ביטול / כשל תשלום. |
| I4 | אחרי `paid`: reservation → committed sale; stock סופי יורד. |
| I5 | Variant = יחידת מלאי (מידה/צבע/SKU). מוצר בלי variants = variant ברירת מחדל יחיד. |
| I6 | התראת low-stock לספק (ואופציונלי אדמין) דרך notifications pipeline. |

---

## 1. מודל נתונים (לוגי)

```text
product_variants
  id, product_id, sku, options jsonb,  -- size/color
  stock_on_hand int CHECK (>= 0),
  stock_reserved int CHECK (>= 0),
  low_stock_threshold int DEFAULT 3,
  updated_at

stock_reservations
  id, variant_id, order_id?, cart_id?/user_id?,
  qty int,
  expires_at,
  status  pending|committed|released|expired
```

זמין למכירה:

```text
available = stock_on_hand - stock_reserved
```

PDP/cart מציגים `available`; כפתור קנייה disabled כש-`available < requested`.

---

## 2. Per-variant stock

| פעולה | מי | אפקט |
|---|---|---|
| עדכון ידני | supplier manager/owner, admin | `stock_on_hand` |
| מכירה | מערכת אחרי paid | on_hand −= qty; reserved −= qty |
| החזרה למלאי | refund לפני משלוח | on_hand += qty (מדיניות) |
| התאמה | admin | audit חובה |

אסור: מלאי שלילי. Constraint + טרנזקציה.

---

## 3. Reservation at checkout

```text
begin_checkout / create order draft
  → FOR UPDATE variant
  → if available < qty → reject (out_of_stock)
  → stock_reserved += qty
  → insert reservation expires_at = now() + TTL (e.g. 15–30 min)
  → proceed Cardcom
```

| אירוע | מלאי |
|---|---|
| תשלום הצליח | reserved → commit; on_hand −= qty; reservation committed |
| TTL עבר / עזיבה | job משחרר reserved; status expired |
| ביטול משתמש | release מיידי |
| Webhook כפול | idempotent; לא הורדה כפולה |

TTL קצר מספיק כדי לא לנעול מלאי; ארוך מספיק ל-Cardcom Low Profile.

---

## 4. Oversell prevention

1. בדיקת available תחת `FOR UPDATE` / `UPDATE … WHERE stock_on_hand - stock_reserved >= qty`.
2. Cart UI יכול להיות סטֵיל; השרת הוא השער.
3. רכישות מקבילות: מנצחת הראשונה שעוברת את התנאי; השנייה `out_of_stock`.
4. אחרי paid אין להחזיר מלאי בלי refund/cancel מדיניות.

בדיקת קבלה: שני checkouts מקבילים על היחידה האחרונה → אחד מצליח בלבד.

---

## 5. Low-stock supplier alerts

| תנאי | פעולה |
|---|---|
| `available <= low_stock_threshold` אחרי שינוי | enqueue notification `supplier.low_stock` |
| Dedupe | `low_stock:{variant_id}:{day}` כדי לא להציף |
| ערוץ | אימייל לספק; in-portal badge |
| תוכן עברית | שם מוצר, variant, כמות נותרת, קישור לפורטל |

כשחוזרים מעל הסף: אפשר לאפס dedupe ליום הבא.

---

## 6. UI / API

| משטח | התנהגות |
|---|---|
| PDP | בחירת variant; מלאי/אזל |
| Cart | אם reserved נכשל ברענון: הודעה בעברית |
| Supplier portal | טבלת מלאי לעריכה |
| Admin | override + audit |

---

## 7. Acceptance

- [ ] available מחושב נכון
- [ ] reservation + TTL + release
- [ ] oversell test מקבילי עובר
- [ ] low-stock מייל עם dedupe
- [ ] קופונים לא נשברים מלוגיקת stock

---

## 8. Revision

| Date | Change |
|---|---|
| 2026-08-03 | מסמך ראשוני על arch/docs-queue |
