# ארכיטקטורה: אנליטיקה (משפך)

סכימת אירועי משפך, KPIs ספק, ודוחות אדמין לפי snapshot של `platform_percent`.

Status: **BINDING** · עודכן: 2026-08-12 · QA: PASS  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2` · batch #39/50  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/ANALYTICS-SPEC.md
docs/ARCHITECTURE-ANALYTICS-BI.md
docs/ARCHITECTURE-ADMIN-DASHBOARD.md
docs/ARCHITECTURE-SUPPLIER-PORTAL.md
docs/ARCHITECTURE-PRICING-RULES.md
docs/ARCHITECTURE-OBSERVABILITY.md
docs/CONTRADICTIONS.md
```

עקרון: התנהגות באירועים; **כסף עסקי רק מה-ledger**. בלי PII באירועים.  
GMV/עמלה: snapshot על `order_items` + **No Escrow** (לא סכום מ-GA4/PostHog).

---

## 0. שכבות כלי

| שכבה | כלי |
|---|---|
| מקור אמת פנימי | `analytics_events` + טבלאות כסף ב-Postgres |
| Product analytics | PostHog (אחרי consent) |
| Marketing / Ads | GA4 + Consent Mode |
| GMV / עמלה / payout | אדמין + פורטל ספק מה-ledger בלבד |

---

## 1. משפך ליבה

```text
view_product → add_to_cart → begin_checkout → purchase → redeem
```

| event_name | מקור | props מינימום |
|---|---|---|
| `view_product` | client | `product_id`, `slug`, `product_type`, `list_price_agorot`, `coupon_price_agorot?` |
| `add_to_cart` | client | + `quantity` |
| `begin_checkout` | client | `items_count`, `value_agorot` |
| `purchase` | **server** אחרי paid | `order_id`, `value_agorot`, `currency=ILS`, `items[]`, `utm_*` |
| `redeem` | **server** אחרי סריקה מוצלחת | `voucher_id`, `product_id`, `supplier_id`, `order_id` |

שם ישן: `coupon_redeemed` = alias ל-`redeem`.

`purchase` / `redeem` נגזרים מה-ledger (אחרי הכתיבה הכספית). שדות כסף באירוע = עותק לנוחות timeline בלבד.

---

## 2. Envelope (בלי PII)

```json
{
  "event_id": "uuid",
  "event_name": "view_product",
  "schema_version": 1,
  "session_id": "uuid",
  "user_id": "uuid-or-null",
  "consent": { "analytics": true, "marketing": false },
  "context": {
    "locale": "he-IL",
    "path": "/product/example",
    "utm_campaign": "launch_week"
  },
  "props": {
    "product_id": "uuid",
    "product_type": "coupon",
    "list_price_agorot": 32000,
    "coupon_price_agorot": 14900
  }
}
```

אסור: email, phone, שם, IP מלא, PAN, מחרוזת חיפוש גולמית.  
כסף: אגורות integer בלבד.

---

## 3. KPIs ספק

היקף: רק `current_user_supplier_id()`.  
כסף לספק = שורותיו ב-ledger; לא "הנחת לקוח" מ-`platform_percent`.

| KPI | מקור |
|---|---|
| צפיות / ATC על מוצרי הספק | events |
| הזמנות paid | orders/order_items |
| GMV on-site (שורות הספק) | snapshots |
| מימושים / redeem rate | vouchers + redeem events |
| יתרה לגבייה בעסק (ממוצע) | face − coupon מ-snapshots |
| פיזי: זכאי payout | settlement / PAYOUT |

UI: עברית RTL; ₪ מתורגם מאגורות.

---

## 4. דוחות הכנסה אדמין

מקור: `order_items` + `settlement_events` / ledger. **לא** PostHog.

| מדד | כלל |
|---|---|
| GMV on-site | sum paid_on_site להזמנות paid |
| הכנסת פלטפורמה (קופון) | sum coupon on-site (No Escrow: כל האתר לפלטפורמה) |
| הכנסת פלטפורמה (פיזי) | sum לפי **`platform_percent` שצולם בשורה** |
| חלק ספק (פיזי) | supplier_due מ-settlement |
| לפי מוצר | group by product_id + הצגת percent snapshot |

כל שורה מציגה את האחוז **שצולם בהזמנה**, לא את האחוז החי במוצר היום.

אין לחשב הכנסה כ-"5% או 10% קבוע מ-face".

---

## 5. KPI מוצר (פלטפורמה)

| KPI | נוסחה |
|---|---|
| ATC rate | add_to_cart / view_product |
| Checkout start | begin_checkout / add_to_cart |
| Pay conversion | purchase / begin_checkout |
| Redeem rate | redeem / purchase (coupon) |
| AOV on-site | sum(value_agorot) / count(purchase) |

---

## 6. Acceptance

- [ ] משפך חמשת האירועים מתועד  
- [ ] purchase/redeem מהשרת  
- [ ] בלי PII  
- [ ] לוח ספק בלי המצאת עמלה  
- [ ] דוח אדמין לפי snapshot percent  
- [ ] כסף לא מ-GA4/PostHog  
- [ ] No Escrow בקופון בדוחות  

---

## 7. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-06 | משפך + PostHog/GA4 |
| 2026-08-11 | KPIs ספק + SQL הכנסות |
| 2026-08-12 | batch-2 #39: BINDING על arch/docs-batch-2; הדגשת snapshots / No Escrow |
| 2026-08-12 | batch-2 #39 pass-2: BINDING על arch/docs-batch-2 (המשך תור) |
