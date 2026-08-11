# ארכיטקטורה: אנליטיקה

סכימת אירועים, KPIs ללוח ספק, ודוחות הכנסות אדמין לפי `platform_percent` פר מוצר.

Status: **BINDING** · עודכן: 2026-08-11 · QA: PASS  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/ANALYTICS-SPEC.md
docs/ARCHITECTURE-ANALYTICS-BI.md
docs/ARCHITECTURE-ADMIN-DASHBOARD.md
docs/ARCHITECTURE-SUPPLIER-PORTAL.md
docs/ARCHITECTURE-PRICING-RULES.md
docs/ARCHITECTURE-LEGAL-COMPLIANCE.md
docs/ARCHITECTURE-OBSERVABILITY.md
docs/CONTRADICTIONS.md
```

עקרון: התנהגות באירועים; **כסף עסקי רק מה-ledger**. בלי PII באירועים.  
עמלה/GMV: snapshot של `platform_percent` + No Escrow (לא סכום מ-GA4/PostHog).

---

## 0. שכבות כלי

| שכבה | כלי |
|---|---|
| מקור אמת פנימי | `analytics_events` (וגם טבלאות כסף) ב-Postgres |
| Product analytics | **PostHog** (אחרי consent) |
| Marketing / Ads | **GA4** + Consent Mode |
| GMV / עמלה / payout | דוחות אדמין + פורטל ספק מה-ledger בלבד |

---

## 1. סכימת אירועים

### 1.1 משפך ליבה

```text
view_product → add_to_cart → begin_checkout → purchase → redeem
```

| event_name | מקור | props מינימום |
|---|---|---|
| `view_product` | client | `product_id`, `slug`, `product_type`, `list_price_agorot`, `coupon_price_agorot?` |
| `add_to_cart` | client | + `quantity` |
| `begin_checkout` | client | `items_count`, `value_agorot` |
| `purchase` | **server** אחרי paid | `order_id`, `value_agorot`, `currency=ILS`, `items[]`, `utm_*` |
| `redeem` | **server** אחרי סריקה | `voucher_id`, `product_id`, `supplier_id`, `order_id` |

שם ישן: `coupon_redeemed` = alias ל-`redeem`.

### 1.2 Envelope (בלי PII)

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

מיפוי GA4/PostHog + Consent: `ANALYTICS-SPEC.md`.

---

## 2. KPIs ללוח ספק (Supplier dashboard)

היקף: רק נתונים של `current_user_supplier_id()`. כסף לספק = שורות שלו ב-ledger / הזמנות; **לא** עמלה של פלטפורמה כהכנסת ספק.

| KPI | הגדרה | מקור |
|---|---|---|
| צפיות בדילים | `view_product` למוצרים של הספק (אם נשמר `supplier_id` ב-props או join) | events / BI |
| הוספות לעגלה | `add_to_cart` על מוצרי הספק | events |
| הזמנות paid | count orders עם פריטי הספק ב-`paid` | orders/order_items |
| GMV on-site (ספק) | סכום ששולם באתר על שורות הספק | order_items snapshots |
| מימושים | count `redeem` / vouchers `redeemed` | vouchers |
| Redeem rate | redeems / purchases (קופון) בחלון 7/30 יום | derived |
| יתרה לגבייה בעסק (ממוצע) | face − coupon על מימושים | snapshots |
| פיזי: ממתין למשלוח | שורות physical לא fulfilled | fulfillment |
| פיזי: זכאי payout | לפי PAYOUT (T+N, min) | settlement_events |
| דירוג איכות | לפי SUPPLIER-QUALITY (אם קיים) | quality tables |

אסור להציג לספק את `platform_percent` כ"ההנחה ללקוח". מותר להציג תקבולים צפויים לפי חוזה.

UI: עברית RTL; סכומים ב-₪ מתורגמים מאגורות.

---

## 3. דוחות הכנסות אדמין (לפי אחוז פר מוצר)

מקור אמת: `order_items` + `settlement_events` / ledger. **לא** PostHog.

### 3.1 מדדים

| מדד | נוסחה |
|---|---|
| GMV on-site | `sum(paid_on_site_agorot)` להזמנות paid |
| הכנסת פלטפורמה (פיזי) | `sum(paid_on_site * platform_percent_snapshot / 100)` באגורות עם עיגול יחיד |
| הכנסת פלטפורמה (קופון) | `sum(coupon_price_agorot)` (No Escrow: כל האתר לפלטפורמה) |
| חלק ספק (פיזי) | `sum(supplier_due_agorot)` מ-`charge_settled` |
| עמלה בפועל % | platform_revenue / GMV on-site (פיזי בלבד לניתוח אחוז) |
| לפי מוצר | group by `product_id` + הצגת `platform_percent` שצולם |
| לפי קטגוריה / ספק | join מוצר/ספק |
| Refunds | מפחיתים לפי invoices/refunds מאומתים |

### 3.2 מסך אדמין (יעד)

```text
/admin/reports/revenue
  · מסננים: תאריך, סוג (coupon/physical), ספק, קטגוריה
  · טבלה: מוצר | % פלטפורמה (snapshot) | GMV | הכנסת פלטפורמה | חלק ספק | #הזמנות
  · ייצוא CSV (אגורות + עמודת ₪ לתצוגה)
```

כל שורה מציגה את האחוז **שצולם בהזמנה**, לא את האחוז הנוכחי במוצר.

תמצית שאילתה (יעד; שמות עמודות לפי הסכמה החיה אחרי agorot cutover):

```sql
SELECT
  oi.product_id,
  oi.platform_percent AS platform_percent_snapshot,
  sum(oi.paid_on_site_agorot) AS gmv_agorot,
  sum(
    CASE WHEN oi.product_type = 'coupon'
      THEN oi.paid_on_site_agorot
      ELSE (oi.paid_on_site_agorot * oi.platform_percent / 100.0)::bigint
    END
  ) AS platform_revenue_agorot,
  count(DISTINCT oi.order_id) AS orders_count
FROM order_items oi
JOIN orders o ON o.id = oi.order_id
WHERE o.status = 'paid'
  AND o.paid_at >= $from AND o.paid_at < $to
GROUP BY 1, 2
ORDER BY platform_revenue_agorot DESC;
```

עיגול יחיד בשרת לפי `ARCHITECTURE-PRICING-RULES`; לא לעגל פעמיים ב-UI.

### 3.3 התאמות

| כלל | פירוט |
|---|---|
| קופון | אין "חלק ספק מהמקדמה"; יתרה בעסק מחוץ ל-GMV פלטפורמה |
| מנוי | פר invoice לפי ARCHITECTURE-SUBSCRIPTIONS §8 |
| ארנק | הפחתת charge Cardcom; פיצול לפי מדיניות wallet (פלטפורמה סופגת לפי ADR ארנק) |

---

## 4. KPI מוצר (פלטפורמה)

| KPI | נוסחה |
|---|---|
| ATC rate | add_to_cart / view_product |
| Checkout start | begin_checkout / add_to_cart |
| Pay conversion | purchase / begin_checkout |
| Redeem rate | redeem / purchase (coupon) |
| AOV on-site | sum(value_agorot) / count(purchase) |

פירוט מדידה חיצונית: `ANALYTICS-SPEC.md`.

---

## 5. Acceptance

- [ ] סכימת אירועים + envelope בלי PII  
- [ ] purchase/redeem מהשרת  
- [ ] לוח ספק: רק נתוני הספק; בלי המצאת עמלה  
- [ ] דוח אדמין: הכנסה לפי `platform_percent` snapshot פר מוצר  
- [ ] כסף לא מ-sum ב-GA4/PostHog  
- [ ] No Escrow בקופון בדוחות  

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-06 | משפך + PostHog/GA4 |
| 2026-08-07 | QA: CONTRADICTIONS / OBSERVABILITY |
| 2026-08-11 | סכימת אירועים מורחבת, KPIs ספק, דוחות הכנסה לפי percent פר מוצר |
| 2026-08-11 | דוגמת SQL לדוח הכנסות אדמין לפי snapshot percent |
