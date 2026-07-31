# ARCHITECTURE-ANALYTICS-KPI.md

ארכיטקטורת **מדדי מכירות, conversion ודוחות לבעלים** (KenyonExpress).

Status: BINDING · worktree

```
/Users/ofir/kenyonexpress-web/ke-arch
```

branch:

```
arch/docs-queue
```

Date: 2026-07-31  
Scope: docs בלבד.  
Companions: `ARCHITECTURE-ANALYTICS.md`, `ARCHITECTURE-ADMIN-ANALYTICS.md`, admin dashboard, Go-Live.

קהל ראשי: **בעלים / אדמין** במסך `/admin` (לא חשיפה לספק של נתוני פלטפורמה מלאים).

כסף בדוחות: אגורות ב-DB, תצוגה ₪. קופון: הכנסת פלטפורמה = מה ששולם באתר. פיזי: עמלה מ-snapshot `platform_percent`.

---

## 0. עקרונות

1. מקור אמת להזמנות: `orders.paid_at IS NOT NULL` (לא redirect דפדפן).
2. אין ספירת "הכנסה" ממקדמות קופון כאילו payout לספק.
3. Funnel events: server-side עדיף (`begin_checkout`, `purchase`); client רק ל-page views.
4. פרטיות: אין PII ב-dashboards מיוצאים בלי RBAC.
5. שעון: `Asia/Jerusalem` ליום עסקים.

---

## 1. מילון מדדים (KPI)

### 1.1 מכירות

| KPI | הגדרה | נוסחה / מקור |
|---|---|---|
| GMV on-site | סכום שנגבה באתר | `sum(orders.total_*)` להזמנות paid |
| Platform revenue | הכנסת פלטפורמה | קופון: `sum(paid_on_site)`; פיזי: `sum(commission_agorot)` |
| Supplier physical due | יתרת ספק פיזי | `sum(supplier_immediate/due)` לשורות physical |
| AOV | ממוצע הזמנה | GMV / #orders |
| Orders | מספר הזמנות ששולמו | count paid |
| Coupon orders % | חלק הזמנות עם לפחות שורת קופון | |
| Refunds | סכום/מספר זוכו | orders/payments refunded |

### 1.2 Conversion funnel

| שלב | אירוע | הערה |
|---|---|---|
| View home | `page_view` | |
| View product | `view_item` | |
| Add to cart | `add_to_cart` | server או analytics |
| Begin checkout | `begin_checkout` | server מ-beginCheckout |
| Login at pay | `login` / OAuth success | |
| Purchase | `purchase` | רק אחרי finalize paid |

| KPI | הגדרה |
|---|---|
| View→ATC | add_to_cart / view_item |
| ATC→Checkout | begin_checkout / add_to_cart |
| Checkout→Purchase | purchase / begin_checkout |
| Overall CVR | purchase / session או users |

### 1.3 קטלוג ותפעול

| KPI | הגדרה |
|---|---|
| Redeem rate | vouchers used / issued (בחלון) |
| Expiry rate | expired / issued |
| Time-to-redeem | median(redeemed_at - issued_at) |
| Search zero-results % | חיפושים בלי תוצאות |
| Supplier scan errors | redeem failures / attempts |

### 1.4 צמיחה

| KPI | הגדרה |
|---|---|
| New customers | profiles עם first paid order בחלון |
| Returning rate | לקוחות עם 2+ הזמנות |
| Wallet balance outstanding | sum user wallets |
| Wallet spend | debits בקופה |

---

## 2. דוחות לבעלים (מסכים)

### 2.1 Daily pulse (מסך בית אדמין)

כרטיסים:

1. GMV היום / אתמול / 7י
2. Platform revenue היום
3. Orders + CVR checkout→purchase (7י)
4. קופונים שהונפקו / מומשו היום
5. התראות DLQ / תשלומים failed (ops)

### 2.2 Sales report

פילטרים: תאריך, קטגוריה, ספק, סוג (coupon/physical).  
טבלה: יום × GMV × revenue × orders × AOV.  
ייצוא CSV (admin בלבד).

### 2.3 Product performance

| עמודה |
|---|
| מוצר, סוג, views, ATC, purchases, GMV, redeem rate (קופון) |

### 2.4 Supplier scorecard (אדמין)

| עמודה |
|---|
| ספק, GMV פיזי, commission, redeem count, scan error rate, payout pending |

ספק בפורטל רואה **רק את שלו**, בלי platform revenue הכולל.

### 2.5 Funnel report

תרשים שלבי §1.2 עם drop-off. מקור: `analytics_events` / טבלאות 033+055.

---

## 3. מודל נתונים

| שכבה | אובייקט |
|---|---|
| Raw events | `analytics_events` (name, user_id null-able, session_id, props jsonb, created_at) |
| Facts | views מ-orders/order_items/vouchers/payments |
| Marts (SQL views) | `v_kpi_daily_sales`, `v_kpi_funnel_daily`, `v_kpi_product_perf` |

חוזה view יומי:

```sql
-- conceptual
CREATE VIEW public.v_kpi_daily_sales AS
SELECT
  (paid_at AT TIME ZONE 'Asia/Jerusalem')::date AS day_il,
  count(*) AS orders,
  sum(total_agorot) AS gmv_agorot,
  sum(platform_revenue_agorot) AS platform_revenue_agorot
FROM public.orders
WHERE paid_at IS NOT NULL
GROUP BY 1;
```

`platform_revenue_agorot` מחושב משורות: קופון = paid_on_site; פיזי = commission.

---

## 4. איסוף אירועים

| אירוע | איפה נפלט |
|---|---|
| `page_view` | client (beacon) |
| `view_item` | PDP server or client |
| `add_to_cart` | cart action |
| `begin_checkout` | beginCheckout server |
| `purchase` | finalizeOrder server **חובה** |
| `coupon_redeemed` | redeem route |

Idempotency: `purchase` keyed by `order_id`.

אסור לסמוך על Meta/GA בלבד לכסף; הדוח הכספי תמיד מ-DB.

---

## 5. הרשאות

| תפקיד | גישה |
|---|---|
| Admin / owner | כל ה-KPI והייצואים |
| Support | הזמנות לקוח, בלי GMV גלובלי מלא (אופציונלי read-only מוגבל) |
| Supplier | scorecard עצמי בלבד |
| Anon | אין |

RLS על views דרך security invoker + `is_admin()`.

---

## 6. UI

- `/admin` RTL, Heebo, `#fed700` ל-CTA ייצוא.
- גרפים פשוטים (לא דשבורד סגול גנרי).
- טווחים: היום, 7י, 30י, מותאם.

---

## 7. התראות על מדדים (ops)

| תנאי | ערוץ |
|---|---|
| Purchase=0 במשך שעות פעילות אחרי traffic | Ntfy |
| Checkout→Purchase CVR צונח >X% מול 7י | Ntfy |
| Webhook fail spike | Ntfy |

לא Zapier.

---

## 8. טסטים

| # | בדיקה |
|---|---|
| K1 | הזמנת קופון מגדילה platform revenue ב-paid_on_site בלבד |
| K2 | הזמנה פיזית: revenue = commission snapshot |
| K3 | purchase event יחיד ל-order |
| K4 | ספק לא רואה GMV של ספק אחר |
| K5 | יום נחתך לפי Asia/Jerusalem |

---

## 9. Out of scope

- Attribution מלא רב-ערוצי (שלב מאוחר)
- מחסן BigQuery חובה ביום 1 (views ב-Postgres מספיקים לשיגור)
- מכירת דאטה לצד ג׳

---

## 10. Owner daily report (binding layout)

One screen `/admin` (or `/admin/analytics`) answering:

1. **היום:** הזמנות, GMV on-site, הכנסת פלטפורמה, refunds
2. **Funnel 7י:** view → cart → begin_checkout → purchase (CVR לכל שלב)
3. **פיצול:** % הזמנות קופון מול פיזי
4. **איכות:** webhook fails, notification DLQ, redeem fails
5. **Top 10** מוצרים בהכנסת פלטפורמה (לא רק GMV)

Export CSV (admin only) לטווח תאריכים. שעון `Asia/Jerusalem`.

---

## 11. Event schema (server)

| event | when | props (no PII) |
|---|---|---|
| `page_view` | RSC/client | path, type |
| `add_to_cart` | cart action | product_type, qty |
| `begin_checkout` | beginCheckout | order_id hash, item_count, total_agorot |
| `purchase` | finalize once | order_id, coupon_lines, physical_lines, platform_revenue_agorot |
| `coupon_redeem` | redeem success | supplier_id, product_id |
| `refund` | refund path | order_id, amount_agorot |

`purchase.platform_revenue_agorot`: coupon = paid_on_site; physical = commission snapshot.

---

## 12. Revision

| Date | Change |
|---|---|
| 2026-07-31 | KPI + דוחות בעלים + funnel (`arch/docs-queue`) |
| 2026-07-31 | rev B: owner daily report layout + event schema |
