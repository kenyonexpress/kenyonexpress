# ARCHITECTURE: Analytics

סכימת אירועי אנליטיקה התנהגותית. בלי PII. כסף עסקי לא נסכם מאירועים.

Status: **BINDING** · Updated: 2026-08-03  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`  
אין שינוי קוד. אין נגיעה ב-worktree הראשי (`kenyonexpress`).

Companions:

```
docs/ARCHITECTURE-ANALYTICS-BI.md
docs/ARCHITECTURE-ADMIN-DASHBOARD.md
docs/ARCHITECTURE-SECURITY-RLS.md
docs/ARCHITECTURE-SEARCH.md
```

Stack: edge ingest → `analytics.fn_ingest_analytics_events` (service_role), טבלאות `analytics_events` / definitions / daily rollups.  
כסף לדוחות GMV/עמלה: **רק** מ-`orders` / `order_items` / `payments` / vouchers (ledger), לא מ-`sum(props)`.

---

## 0. הכרעות מחייבות

| # | הכרעה |
|---|---|
| A1 | אירועים התנהגותיים ב-`analytics_events`; כסף עסקי מה-ledger בלבד. |
| A2 | **אין PII** בשום payload (סעיף 3). |
| A3 | כסף ב-props: **integer agorot** בלבד, עותק לתצוגת משפך; לא מקור אמת. |
| A4 | שמות אירועים: `snake_case`. |
| A5 | `purchase` ו-`coupon_redeemed` הם **derived** מהשרת/ledger, לא מהדפדפן בלבד. |
| A6 | Ingest רק service_role אחרי edge validation. |
| A7 | Consent נשמר על האירוע; בלי consent מתאים לא אוספים שיווק/לא-הכרחי. |

---

## 1. Envelope

```json
{
  "event_id": "uuid",
  "event_name": "view_product",
  "schema_version": 1,
  "occurred_at": "2026-08-03T00:00:00.000Z",
  "session_id": "uuid",
  "user_id": "uuid-or-null",
  "consent": {
    "analytics": true,
    "marketing": false
  },
  "context": {
    "locale": "he-IL",
    "path": "/product/example",
    "referrer_host": "www.google.com",
    "viewport": "mobile",
    "app_version": "web",
    "ip_trunc": "1.2.3.0"
  },
  "props": {}
}
```

| שדה | כללים |
|---|---|
| `event_id` | UUID; idempotent upsert |
| `user_id` | רק Supabase auth uuid או null; לא email |
| `path` | בלי query string |
| `ip_trunc` | IPv4 `/24` או IPv6 `/48` בלבד |
| `props` | לפי definition; בלי מפתחות חופשיים עם טקסט משתמש גולמי |

---

## 2. קטלוג אירועים

### 2.1 Primary

| event_name | מקור | derived? | props חובה (עיקריים) |
|---|---|---|---|
| `view_product` | client | no | `product_id`, `product_type`, `supplier_id`, `list_price_agorot` |
| `add_to_cart` | client | no | `product_id`, `supplier_id`, `quantity`, `unit_price_agorot` |
| `begin_checkout` | client | no | `cart_id`, `item_count`, `cart_value_agorot` |
| `purchase` | server/ledger | **yes** | `order_id`, `order_gross_agorot`, `onsite_charged_agorot`, `platform_commission_agorot` |
| `coupon_redeemed` | server/ledger | **yes** | `voucher_id` / redemption id, `supplier_id`, `amount_collected_agorot` |

### 2.2 Secondary

| event_name | מקור | props |
|---|---|---|
| `remove_from_cart` | client | `product_id`, `quantity` |
| `search` | client | `query_hash`, `result_count`, `filters_fingerprint` (**לא** מחרוזת q גולמית) |
| `login` | client/server | `method` (`google`/`otp`); בלי email |
| `sign_up` | server | `method`; בלי email |

### 2.3 דוגמאות props

`view_product`:

```json
{
  "product_id": "uuid",
  "product_type": "coupon",
  "supplier_id": "uuid",
  "list_price_agorot": 12000,
  "coupon_price_agorot": 900
}
```

`purchase` (server):

```json
{
  "order_id": "uuid",
  "order_gross_agorot": 12000,
  "onsite_charged_agorot": 900,
  "platform_commission_agorot": 900,
  "item_count": 1,
  "has_coupon": true
}
```

לקופון תחת No Escrow: `platform_commission_agorot` על המקדמה באתר = סכום ששולם באתר (או לפי snapshot). אין שדה `escrow_held`.

---

## 3. No PII (מחייב)

**אסור** בכל event / context / props / metadata:

| אסור | חלופה |
|---|---|
| email, phone, שם מלא, ת.ז. | `user_id` בלבד |
| כתובת מגורים מלאה | לא באירוע; רק בטבלאות account תחת RLS |
| IP מלא | `ip_trunc` בלבד |
| מחרוזת חיפוש גולמית | `query_hash` (HMAC/sha עם מלח שרת) |
| PAN / token כרטיס | לעולם לא |
| תוכן הודעות / הערות חופשיות | לא |
| query string מלא עם PII | `path` בלי query |

בדיקת CI/lint מומלצת: deny-list על מפתחות `email`, `phone`, `full_name`, `card`, `raw_query`.

---

## 4. Definitions + ingest

```text
analytics_event_definitions (
  event_name, schema_version,
  is_derived boolean,
  required_props text[],
  description
)
```

Ingest:

```text
Edge / Route Handler
  → validate envelope + consent + deny-list PII
  → service_role: fn_ingest_analytics_events(batch)
  → ON CONFLICT (event_id) DO NOTHING
```

Derived events נכתבים רק משרת אחרי commit דומיין (paid / redeem).

---

## 5. Rollups

`analytics_daily` (או מקביל):

```text
(day, event_name, product_type, supplier_id) → event_count, session_count
```

שימוש: משפך, לא GMV.  
דוחות כסף באדמין: `ARCHITECTURE-ADMIN-DASHBOARD.md` / BI doc.

---

## 6. Acceptance

- [ ] Envelope אחיד + schema_version
- [ ] Primary events כולל purchase/redeem derived
- [ ] Deny-list PII מתועד ונאכף ב-ingest
- [ ] כסף ב-props באגורות; דוחות כסף מה-ledger
- [ ] `search` בלי raw query
- [ ] אין `escrow_*` בסכימה החדשה

---

## 7. Revision

| Date | Change |
|---|---|
| 2026-08-03 | ke-arch docs-lifecycle: סכימת אירועים מחייבת, בלי PII |
