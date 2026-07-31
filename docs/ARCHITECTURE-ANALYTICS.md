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
Companions: `ARCHITECTURE-ANALYTICS-KPI.md`, `ARCHITECTURE-COOKIE-CONSENT.md`, admin dashboard, Go-Live, `MASTER-ARCHITECTURE-v2.md`.

Stack: GA4 (client + server where needed), Supabase `analytics_events` / marts, `/admin/analytics` RTL.

---

## 0. מודל כסף בכל KPI

| כלל | משמעות באנליטיקה |
|---|---|
| קופון | GMV on-site / הכנסת פלטפורמה = מלוא `paid_on_site` (`coupon_price`). יתרה בעסק **לא** revenue |
| פיזי | הכנסת פלטפורמה = `commission_agorot` מ-snapshot `platform_percent` (דינמי, בלי default) |
| אין Escrow | אין מדדי escrow_held / release |
| אגורות | DB bigint; UI ₪ |
| Behavioral ≠ finance | לא סוכמים הכנסה מ-page_view |

---

## 1. שכבות

```
Browser (consent) → GA4 (behavior)
                 → optional ke analytics_events ingest

Server (authoritative money):
  beginCheckout / finalizeOrder / redeem
    → trackServerEvent + GA4 Measurement Protocol (purchase)
    → orders / order_items snapshots

Admin dashboard:
  reads marts + SQL on paid orders (not GA4 alone for money)
```

| שכבה | תפקיד |
|---|---|
| GA4 | Funnel שיווקי, traffic, CVR התנהגותי |
| Server events | Funnel כסף אמין + קישור ל-order_id |
| Marts / SQL | דשבורד מכירות יומי לבעלים |

---

## 2. GA4

### 2.1 נכס

- Property אחד ל-prod (stream Web ל-`kenyonexpress.co.il`).
- Measurement ID ב-`NEXT_PUBLIC_GA_MEASUREMENT_ID` (ציבורי).
- API secret ל-Measurement Protocol **רק בשרת** (לא NEXT_PUBLIC).

### 2.2 Consent

- טעינת gtag רק לפי `ARCHITECTURE-COOKIE-CONSENT.md`.
- אירועי כסף בשרת לא תלויים ב-cookie marketing (אופציונלי לשלוח purchase תמיד כ-transactional measurement; מדיניות legal קובעת).

### 2.3 אירועי המרה (שמות מחייבים)

| Event | מקור | פרמטרים עיקריים (בלי PII) |
|---|---|---|
| `page_view` | client | page_path, page_type |
| `view_item` | client PDP | item_id, item_category, item_variant (coupon\|physical) |
| `add_to_cart` | client/server | item_id, quantity, value (on-site ILS), currency=ILS |
| `begin_checkout` | **server** | value, items[], order draft id hash |
| `purchase` | **server** אחרי finalize | transaction_id=order_id, value=on-site total, tax/shipping אם רלוונטי, items[] |
| `refund` | server | transaction_id, value |
| `generate_lead` | אופציונלי | supplier interest |
| `login` | client אחרי Google | method=Google |

`value` ב-GA4 לקופון = מחיר ששולם באתר בלבד (לא face value).

Item params:

```
item_id, item_name, item_category, quantity,
price  // unit on-site charge
item_brand // supplier display name ok
```

אסור ב-GA4: email, phone, PAN, cardcom_token, service role.

### 2.4 Enhanced measurement

- אפשר scrolls/outbound בזהירות; לא תחליף ל-`purchase` שרת.

---

## 3. אירועים פנימיים (Supabase)

קטלוג קצר (מפורט גם ב-KPI doc):

| event_name | מתי |
|---|---|
| `product_view` | PDP |
| `add_to_cart` | הצלחת ATC |
| `begin_checkout` | beginCheckout |
| `purchase` | finalize פעם אחת |
| `coupon_redeem` | redeem success |
| `refund` | refund path |

Envelope: event_id, occurred_at, session_id, user_id uuid optional, props jsonb בלי PII.

---

## 4. דשבורד מכירות (`/admin/analytics`)

קהל: אדמין/בעלים בלבד (`is_admin()`).

### 4.1 וידג'טים חובה

1. **היום / 7י / 30י:** מספר הזמנות paid, GMV on-site, הכנסת פלטפורמה, refunds.
2. **Funnel:** view_item → add_to_cart → begin_checkout → purchase (CVR בין שלבים).
3. **פיצול:** % הזמנות עם קופון מול פיזי.
4. **Top products** לפי הכנסת פלטפורמה (לא רק GMV).
5. **Top suppliers** (פיזי commission + כמות קופונים שנמכרו; בלי לרמוז payout על prepaid).
6. **איכות ops:** webhook fails, notification DLQ (קישור), redeem fail rate.

### 4.2 נוסחאות כסף

```
GMV_on_site = sum(orders.total_agorot) where paid_at is not null

platform_revenue =
  sum(coupon lines paid_on_site_agorot)
  + sum(physical lines commission_agorot)

NOT included: balance_due_at_business, escrow_*, wishful % of face
```

שעון: `Asia/Jerusalem`.

### 4.3 ייצוא

CSV לטווח תאריכים; RBAC admin; לוג audit.

---

## 5. סנכרון GA4 ↔ שרת

| נושא | כלל |
|---|---|
| Idempotency | `purchase` פעם אחת ל-order_id (finalize guard) |
| Bot traffic | סנן ב-ingest; אל תאמן KPI כסף מ-GA4 בלבד |
| Discrepancy | דוח שבועי: GA4 purchases count מול count(orders.paid) |

---

## 6. פרטיות ואבטחה

- RLS על analytics raw: staff select; insert דרך edge/service.
- אין הצגת PII בדשבורד.
- ספקים לא מקבלים את דשבורד הפלטפורמה המלא.

---

## 7. טסטים

| # | בדיקה |
|---|---|
| AN1 | purchase נורה פעם אחת אחרי finalize |
| AN2 | value קופון = coupon_price לא face |
| AN3 | דשבורד platform_revenue תואם SQL ידני על order_items |
| AN4 | בלי consent: אין client GA4 (אם מדיניות דורשת) |
| AN5 | אין אירועי escrow במערכת |

---

## 8. Out of scope

- BigQuery warehouse חובה ביום 1
- Attribution רב-ערוצי מלא
- מכירת דאטה

---

## 9. Revision

| Date | Change |
|---|---|
| 2026-07-29 | Analytics marts + goals ראשוני |
| 2026-07-31 | rev C: GA4, conversion events, sales dashboard, money rules |
