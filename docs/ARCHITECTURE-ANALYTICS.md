# ARCHITECTURE-ANALYTICS.md

ארכיטקטורת **אנליטיקה**: GA4, אירועי המרה, דשבורד מכירות לבעלים.

Status: BINDING · worktree

```
/Users/ofir/kenyonexpress-web/ke-arch
```

branch:

```
arch/docs-queue
```

Date: 2026-07-31 (rev C)  
Scope: docs בלבד.  
Companions: `ARCHITECTURE-ANALYTICS-KPI.md`, admin dashboard, cookie-consent, Go-Live, `MASTER-ARCHITECTURE-v2.md`.

---

## 0. מודל כסף במדדים (דורס הכל)

| כלל | משמעות ב-GA4 / דשבורד |
|---|---|
| קופון | הכנסת פלטפורמה = מלוא מה שנגבה באתר (`coupon_price` / `paid_on_site`). יתרה בעסק **לא** revenue |
| פיזי | הכנסת פלטפורמה = עמלה מ-snapshot `platform_percent` (דינמי, בלי default) |
| אין Escrow | אין מדד escrow_held / release לספק מקופון |
| אגורות | DB באגורות; GA4 value ב-ILS עשרוני מחושב בשרת |
| Behavioral ≠ finance | לא לסכום הכנסה מ-page_view |

---

## 1. שכבות

```
Client (consent)          Server (money truth)
  page_view, add_to_cart    begin_checkout, purchase
  → GA4 gtag / GTM          → GA4 Measurement Protocol
                            → analytics_events + marts
                            → /admin analytics (SQL)
```

| שכבה | אחריות |
|---|---|
| GA4 | Funnel שיווקי, audiences, השוואות תקופה |
| `analytics_events` | עובדות פנימיות append-only |
| Marts / views | דשבורד מכירות מהיר לבעלים |
| Ledger / orders | מקור אמת כספי |

---

## 2. GA4

### 2.1 נכס

- Property ייעודי ל-KenyonExpress (או data stream Web נפרד).
- Measurement ID ב-`NEXT_PUBLIC_GA_MEASUREMENT_ID` רק אחרי cookie/analytics consent אם נדרש.
- Server events: `GA4_API_SECRET` בשרת בלבד (לא PUBLIC).

### 2.2 הגדרות

| הגדרה | ערך |
|---|---|
| Currency | ILS |
| Timezone | Asia/Jerusalem |
| Enhanced measurement | זהירות: לא לכפול purchase ידני |
| DebugView | staging בלבד |

### 2.3 אירועי המרה (binding names)

| Event | מקור | מתי | Params עיקריים |
|---|---|---|---|
| `page_view` | client | ניווט | `page_location`, `page_title` |
| `view_item` | client | PDP | `item_id`, `item_name`, `item_category`, `price` (= מחיר לתשלום באתר; לקופון = coupon_price) |
| `add_to_cart` | client/server | אחרי add מצליח | items[], `value` |
| `begin_checkout` | **server** | `beginCheckout` אחרי יצירת order pending | `transaction_id` (order id), `value`, `items` |
| `purchase` | **server** | `finalizeOrder` פעם אחת (`paid_at`) | `transaction_id`, `value` (= on-site charge), `tax` optional, items[] |
| `refund` | server | refund path | `transaction_id`, `value` |
| `generate_lead` | optional | contact/support | |

**איסור:** לשלוח `purchase` מ-redirect הדפדפן בלבד (רק אחרי webhook/finalize).

### 2.4 Item payload (קופון מול פיזי)

```json
{
  "item_id": "product-uuid",
  "item_name": "שם בעברית",
  "item_category": "coupon|physical",
  "price": 50.00,
  "quantity": 1
}
```

לקופון: `price` = `coupon_price_ils` ליחידה (לא face).  
פרמטר מותאם (אופציונלי): `platform_revenue` רק באירועי server פנימיים/admin; לא חובה ב-GA4 הציבורי.

### 2.5 Conversions ב-GA4 Admin

סמן כ-conversion: `purchase`, `begin_checkout` (אופציונלי), `add_to_cart` (אופציונלי).  
אל תסמן `page_view`.

---

## 3. Funnel פנימי (מקביל ל-GA4)

אירועים ב-`analytics_events` (ids בלבד, בלי PII):

`product_view` → `add_to_cart` → `begin_checkout` → `purchase` → `coupon_redeem` (אם רלוונטי)

חישוב CVR ב-marts לפי יום (`Asia/Jerusalem`). פירוט נוסחאות: `ARCHITECTURE-ANALYTICS-KPI.md`.

---

## 4. דשבורד מכירות (`/admin` / `/admin/analytics`)

קהל: בעלים / `is_admin()` בלבד. RTL, Heebo, `#fed700` ל-CTA ייצוא.

### 4.1 וידג'טים מחייבים

1. **היום / 7י / 30י:** מספר הזמנות paid, GMV on-site, הכנסת פלטפורמה, refunds.
2. **פיצול:** % הזמנות עם קופון מול פיזי.
3. **Funnel:** view → ATC → begin_checkout → purchase (CVR).
4. **Top products** לפי הכנסת פלטפורמה (לא רק GMV).
5. **איכות ops:** webhook fails, notification DLQ (קישור).

הכנסת פלטפורמה:

```
coupon lines:  sum(paid_on_site_agorot)
physical lines: sum(commission_agorot)  -- from snapshot
```

### 4.2 ייצוא

CSV לטווח תאריכים (admin only). בלי עמודות token/PAN.

### 4.3 מה הספק רואה

לא את דשבורד הבעלים. בפורטל: הזמנות/סריקות/payout פיזי שלו בלבד.

---

## 5. פרטיות ו-consent

- Cookie banner: ראה `ARCHITECTURE-COOKIE-CONSENT.md`.
- אירועי כסף בשרת לא תלויים ב-marketing cookie.
- Client GA4: מכבד opt-out אנליטיקה אם מופעל.
- אין שליחת אימייל/טלפון כ-event param.

---

## 6. יישום טכני (יעד)

```
src/lib/analytics/ga4.ts          # client helpers
src/server/analytics/ga4-mp.ts    # Measurement Protocol purchase
src/server/analytics/track.ts     # existing server track
src/app/(admin)/admin/analytics/*
```

Idempotency: `purchase` keyed by `order_id` (GA4 + internal).

---

## 7. טסטים

| # | בדיקה |
|---|---|
| GA1 | DebugView: view_item price = coupon_price לקופון |
| GA2 | purchase נשלח פעם אחת אחרי finalize; לא ב-return page |
| GA3 | דשבורד: הזמנת קופון מגדילה platform revenue ב-paid_on_site |
| GA4 | הזמנה פיזית: revenue = commission snapshot |
| GA5 | ספק לא ניגש ל-`/admin/analytics` |

---

## 8. Out of scope (v1)

- BigQuery export חובה
- Attribution רב-ערוצי מלא
- Ads conversion API (שלב מאוחר)

---

## 9. Revision

| Date | Change |
|---|---|
| 2026-07-29 | Analytics marts + admin |
| 2026-07-31 | rev C: GA4, conversion events, sales dashboard, money rules |
