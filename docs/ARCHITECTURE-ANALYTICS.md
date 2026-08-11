# ARCHITECTURE: Analytics

תוכנית אירועי מעקב ל-KenyonExpress: page views, עגלה, משפך checkout, מימוש קופונים, ביצועי ספק. תואם פרטיות ושוק ישראלי.

Status: **BINDING** · Updated: 2026-08-03  
Scope: **docs only** · branch `arch/docs-queue`  
אין שינוי קוד. אין נגיעה ב-worktree הראשי.

Companions:

```
docs/ARCHITECTURE-COOKIE-CONSENT.md
docs/ARCHITECTURE-ADMIN-REPORTS.md
docs/ARCHITECTURE-SUPPLIER-ANALYTICS.md
docs/LEGAL-CHECKLIST.md
docs/ARCHITECTURE-SEO-PERFORMANCE.md
```

---

## 0. הכרעות מחייבות

| # | הכרעה |
|---|---|
| A1 | Behavioral analytics ≠ finance. הכנסה רק מ-orders/ledger (אגורות), לא מסיכום page_view. |
| A2 | קופון: GMV on-site = `coupon_price` ששולם; יתרה בעסק לא revenue פלטפורמה. |
| A3 | פיזי: הכנסת פלטפורמה = `commission_agorot` מ-snapshot `platform_percent`. |
| A4 | Marketing tags (GA4/Meta) רק אחרי consent לפי מדיניות עוגיות / 30א. |
| A5 | אין PII מלא ב-events לצד שלישי (לא אימייל גולמי, לא קוד קופון מלא). |
| A6 | עברית RTL במוצר; שמות אירועים באנגלית snake_case ליציבות. |
| A7 | Server-side / first-party מועדף לאירועי כסף; client ל-UX funnel. |

---

## 1. שכבות

```text
Browser (consent gate)
  → GA4 / pixels (behavior, ads)     [optional after consent]
First-party
  → analytics_events (Supabase)       [product analytics]
Finance source of truth
  → orders / order_items / vouchers / ledger
Admin
  → /admin/analytics + ARCHITECTURE-ADMIN-REPORTS
Supplier
  → ARCHITECTURE-SUPPLIER-ANALYTICS (scoped RLS)
```

---

## 2. Event tracking plan

### 2.1 Engagement

| event | מתי | params עיקריים |
|---|---|---|
| `page_view` | כל עמוד ציבורי | `path`, `title`, `locale=he` |
| `view_item_list` | category / search results | `list_id`, `item_count` |
| `view_item` | PDP | `item_id`, `item_name`, `item_category`, `product_type`, `price_agorot` (paid online) |
| `select_item` | קליק מכרטיס | כמו view_item |
| `search` | שליחת חיפוש | `search_term` (מקוצר/hashed אם רגיש), `results_count` |
| `share` | שיתוף מוצר | `method`, `item_id` |

### 2.2 Cart / Checkout funnel

| event | מתי | params |
|---|---|---|
| `add_to_cart` | הוספה | `item_id`, `qty`, `price_agorot`, `product_type` |
| `remove_from_cart` | הסרה | כמו לעיל |
| `view_cart` | `/cart` | `value_agorot`, `num_items` |
| `begin_checkout` | כניסה ל-`/checkout` | `value_agorot`, `num_items` |
| `add_shipping_info` | בחירת משלוח (פיזי) | `shipping_tier` |
| `add_payment_info` | מעבר ל-Cardcom | `payment_type=cardcom` (בלי PAN) |
| `purchase` | אחרי paid מאומת (server מועדף) | `transaction_id`, `value_agorot`, `tax` אם רלוונטי, `items[]` |

משפך KPI:

```text
view_item → add_to_cart → begin_checkout → purchase
```

שיעורי נטישה: מחושבים first-party; GA4 משני.

### 2.3 Coupons / redemption

| event | מתי | params |
|---|---|---|
| `coupon_issued` | voucher `issued` (server) | `voucher_id` (uuid ok), `product_id`, `paid_agorot` |
| `coupon_view` | צפייה ב-QR באזור אישי | `voucher_id` |
| `coupon_redeem_success` | redeem OK (server) | `voucher_id`, `supplier_id`, `collected_agorot` |
| `coupon_redeem_fail` | כשל | `reason` enum: already_used / expired / invalid / wrong_supplier / rate_limited |

מדדים:

| Metric | הגדרה |
|---|---|
| Redemption rate | redeemed / issued (בחלון זמן + cohort) |
| Time to redeem | median(redeemed_at − issued_at) |
| Expiry waste | expired never redeemed / issued |

### 2.4 Supplier performance (product analytics)

| event / metric | מקור |
|---|---|
| `supplier_sale` | order paid עם שורות ספק |
| GMV on-site | sum paid לשורות הספק |
| Redeem count | vouchers redeemed |
| Scan fail rate | redeem_fail / attempts |
| Physical ship lag | shipped_at − paid_at (כשקיים) |

דשבורד ספק: מסמך Supplier Analytics (RLS). כאן רק אירועים/הגדרות.

---

## 3. Privacy (ישראל)

| כלל | יישום |
|---|---|
| Consent | באנר עוגיות לפני GA4/pixels שיווקיים |
| Transactional measurement | first-party יכול לרוץ לתפעול/מניעת הונאה במסגרת מדיניות הפרטיות |
| 30א | דיוור שיווקי לא דרך analytics tags |
| Data minimization | בלי קוד קופון מלא, בלי טלפון, בלי כתובת מלאה ב-GA |
| Processors | לגלות בפרטיות: GA/Meta/Supabase לפי מה שמחובר |
| Retention | גולמי client: קצר; aggregates ארוכים יותר |
| Children | לא מכוון לקטינים; בלי איסוף מודע |

IP: truncation בלוגים; לא לשלוח IP גולמי לכלי פרסום אם אפשר.

---

## 4. יישום טכני (יעד)

| שכבה | כלי |
|---|---|
| Client | `gtag` / GTM רק אחרי consent |
| Server purchase | emit מ-finalize / webhook אחרי paid |
| First-party | `analytics_events` append-only או pipeline ל-marts |
| Admin UI | RTL, ₪ מ-agorot, Asia/Jerusalem |

Idempotency ל-`purchase` / `coupon_issued`: מפתח `transaction_id` / `voucher_id` כדי לא לכפול ב-replay.

---

## 5. מה לא מודדים ככה

- הכנסת פלטפורמה מ-session replay
- עמלה מ-`products.platform_percent` החי במקום snapshot
- "Escrow חיצוני" כמימד
- ניסויים שמשנים מחיר בלי audit

---

## 6. Acceptance

- [ ] Funnel events מוגדרים מקצה לקצה
- [ ] Redemption rate מחושב מ-vouchers
- [ ] Consent חוסם pixels שיווקיים
- [ ] purchase server-side עם idempotency
- [ ] אין PII רגיש ב-GA params

---

## 7. Revision

| Date | Change |
|---|---|
| 2026-07-31 | rev D (GA4 + KPI) |
| 2026-08-03 | Event plan מלא + privacy ישראל + redemption; Escrow-aware finance rules |
