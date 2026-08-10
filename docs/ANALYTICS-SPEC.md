# ANALYTICS-SPEC.md
# מפרט מדידה (השקה)

אירועי משפך (`view_product`, `add_to_cart`, `purchase`, `redeem`), מיפוי ל-GA4 ול-Meta Pixel, ו-Consent Mode בהתאם לבאנר העוגיות.

Status: **BINDING (measurement)** · עודכן: 2026-08-11  
Scope: **docs only** · worktree `ke-arch`

מסמכים קשורים:

```
docs/ARCHITECTURE-ANALYTICS.md
docs/ARCHITECTURE-ANALYTICS-BI.md
docs/MARKETING-LAUNCH.md
docs/MARKETING-LAUNCH-PLAN.md
docs/ARCHITECTURE-LEGAL-COMPLIANCE.md
docs/CONTRADICTIONS.md
docs/ARCHITECTURE-OBSERVABILITY.md
```

עקרון: התנהגות באירועים; **כסף עסקי רק מה-ledger**. GA4/Pixel לא מחליפים דוחות אדמין.

---

## 0. הכרעות

| # | הכרעה |
|---|---|
| A1 | אירועי ליבה: `view_product`, `add_to_cart`, `begin_checkout`, `purchase`, `redeem`. |
| A2 | `purchase` ו-`redeem` נגזרים **בשרת** אחרי אימות (לא רק client). |
| A3 | GA4 + Meta Pixel נטענים רק לפי **Consent Mode** מבאנר העוגיות. |
| A4 | בלי consent שיווקי: אין Pixel / ads tags; analytics מוגבל לפי בחירת המשתמש. |
| A5 | כסף ב-props: **agorot integer** או ערך שקלים מחושב לתגי מודעות בלבד; מקור האמת נשאר DB. |
| A6 | אין PII באירועים (email, טלפון, שם, IP מלא, PAN). |

---

## 1. אירועי ליבה

| event (פנימי) | מתי | מקור | props מינימום |
|---|---|---|---|
| `view_product` | PDP נטען | client | `product_id`, `slug`, `product_type`, `list_price_agorot`, `coupon_price_agorot?` |
| `add_to_cart` | הוספה לעגלה | client | + `quantity`, `variant_id?` |
| `begin_checkout` | כניסה ל-checkout | client | `cart_id` / `items_count`, `value_agorot` |
| `purchase` | תשלום אומת + order `paid` | **server** | `order_id`, `value_agorot`, `currency=ILS`, `items[]`, `utm_*` |
| `redeem` | סריקה מוצלחת | **server** | `voucher_id`, `product_id`, `supplier_id`, `order_id` |

שם חלופי בתיעוד ישן: `coupon_redeemed` = אותו אירוע כמו `redeem`.

אופציונלי להשקה:

| event | מתי |
|---|---|
| `view_cart` | פתיחת `/cart` |
| `remove_from_cart` | הסרה |
| `sign_up` / `login` | אחרי Supabase session |
| `refund` | אחרי זיכוי Cardcom מאומת |

---

## 2. מיפוי GA4

| פנימי | GA4 recommended | הערות |
|---|---|---|
| `view_product` | `view_item` | `items[]` עם `item_id` = product_id |
| `add_to_cart` | `add_to_cart` | |
| `begin_checkout` | `begin_checkout` | |
| `purchase` | `purchase` | `transaction_id` = order_id; `value` בשקלים לדוחות Ads |
| `redeem` | event מותאם `redeem` או `coupon_redeemed` | לא מחליף purchase |

Enhanced measurement: לא מחליף את חמשת אירועי הליבה.

---

## 3. מיפוי Meta Pixel

| פנימי | Meta | הערות |
|---|---|---|
| `view_product` | `ViewContent` | `content_ids`, `content_type=product` |
| `add_to_cart` | `AddToCart` | |
| `begin_checkout` | `InitiateCheckout` | |
| `purchase` | `Purchase` | `value` + `currency=ILS`; `eventID` = order_id ל-dedup |
| `redeem` | Custom `Redeem` | אופציונלי לאופטימיזציה; לא חובה להשקה |

CAPI (Conversions API) מומלץ אחרי השקה יציבה: אותו `eventID` כמו בדפדפן ל-`Purchase`.

---

## 4. Consent Mode + באנר עוגיות

### 4.1 קטגוריות באנר

| קטגוריה | תוצאה |
|---|---|
| הכרחי | אתר + אבטחה + סל; בלי GA4/Pixel |
| analytics | מאפשר מדידת התנהגות (GA4 analytics_storage) |
| marketing | מאפשר Pixel / ads / remarketing |

ברירת מחדל לפני בחירה: **denied** ל-analytics ול-marketing (Consent Mode v2).

### 4.2 Google Consent Mode (v2)

לפני טעינת gtag:

```text
ad_storage = denied | granted
ad_user_data = denied | granted
ad_personalization = denied | granted
analytics_storage = denied | granted
```

מיפוי מבאנר:

| באנר | Consent Mode |
|---|---|
| רק הכרחי | הכל denied |
| + analytics | `analytics_storage=granted` |
| + marketing | `ad_storage`, `ad_user_data`, `ad_personalization` = granted |

אחרי עדכון באנר: `gtag('consent', 'update', …)` ואז טעינת תגים אם צריך.

### 4.3 Meta

Pixel נטען **רק** אחרי marketing granted.  
לפני כן: אין `fbq('init')` / אין image pixel.

### 4.4 רצף טכני

```text
HTML shell
  → באנר עוגיות (עברית, RTL)
  → שמירת העדפה (cookie / local + אופציונלי consent_events ב-DB למשתמש מחובר)
  → consent default denied
  → אם analytics: טען GA4
  → אם marketing: טען Meta Pixel (+ GA ads אם רלוונטי)
  → אירועי client רק לערוצים שאושרו
```

טרנזקציות שרת (`purchase`, `redeem`): נשמרות תמיד ב-Postgres; שליחה ל-GA4 Measurement Protocol / CAPI רק אם יש בסיס חוקי + מדיניות מאושרת (לא חובה ביום D0).

---

## 5. UTM ו-attribution

| שדה | שמירה |
|---|---|
| `utm_source/medium/campaign/content/term` | ב-session storage + העתקה ל-props של `purchase` |
| first-touch | נשמר לביקור הראשון בקמפיין `launch_week` |
| last-touch | נשלח עם `purchase` |

פירוט קמפיין: `MARKETING-LAUNCH.md` §4.

---

## 6. Envelope (בלי PII)

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

---

## 7. מדדי מוצר (KPI) מעל האירועים

מחושבים מ-Postgres / BI (לא מ-Ads כמקור אמת כסף).

| KPI | נוסחה | חלון |
|---|---|---|
| CTR דיל | `view_product` ייחודי / impressions (אם יש) | יומי |
| Add-to-cart rate | `add_to_cart` / `view_product` | יומי |
| Checkout start rate | `begin_checkout` / `add_to_cart` | יומי |
| Payment conversion | `purchase` / `begin_checkout` | יומי |
| AOV on-site | `sum(value_agorot)` / `count(purchase)` | שבועי |
| Redeem lag | median(`redeem_at - paid_at`) | שבועי |
| Redeem rate | `redeem` / `purchase` (coupon) | 7י / 30י |
| Platform revenue | ledger עמלה / paid on-site | יומי |

דשבורד אדמין מציג KPI כסף מה-ledger. GA4 לאופטימיזציית קמפיין בלבד.

---

## 8. אימות השקה (QA)

- [ ] בלי לחיצה על באנר: אין בקשות ל-`google-analytics.com` / `facebook.com/tr`  
- [ ] analytics בלבד: GA4 נטען; Pixel לא  
- [ ] marketing: Pixel `PageView` אחרי grant  
- [ ] `purchase` ב-GA4 מגיע עם `transaction_id` = order_id  
- [ ] סכום ב-Ads ≈ סכום ledger (סטייה רק מעיגול / refunds)  
- [ ] `redeem` נרשם אחרי סריקה מוצלחת  
- [ ] אין email/phone ב-props של אירוע  

---

## 9. Out of scope ליום ההשקה

- Session replay מלא (PostHog) בלי הגדרת פרטיות נפרדת  
- ייחוס רב-מגע מתקדם  
- שליחת purchase לכל משתמש בלי מדיניות CAPI  

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-10 | מפרט אירועים + GA4/Meta + Consent Mode מול באנר עוגיות |
| 2026-08-11 | טבלת KPI מוצר מעל אירועים + קישור לתוכנית שיווק |
