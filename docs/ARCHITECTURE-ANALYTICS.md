# ארכיטקטורה: אנליטיקה (משפך)

סכימת אירועי משפך, KPIs ספק, ודוחות אדמין לפי snapshot של `platform_percent`.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד.

מודל כסף: **No Escrow**. GMV/עמלה רק מה-ledger; לא מ-GA4/PostHog.

מסמכים קשורים:

```
docs/ANALYTICS-SPEC.md
docs/ARCHITECTURE-ANALYTICS-BI.md
docs/ARCHITECTURE-ADMIN-DASHBOARD.md
docs/ARCHITECTURE-SUPPLIER-PORTAL.md
docs/ARCHITECTURE-PRICING-RULES.md
docs/CONTRADICTIONS.md
```

---

## החלטה

| # | הכרעה |
|---|---|
| A1 | משפך ליבה: `view_product` → `add_to_cart` → `begin_checkout` → `purchase` → `redeem`. |
| A2 | `purchase` ו-`redeem` נשלחים **מהשרת** אחרי כתיבה כספית (ledger). |
| A3 | בלי PII באירועים (email, phone, IP מלא, PAN, חיפוש גולמי). |
| A4 | כסף באירועים: אגורות integer בלבד. |
| A5 | GMV/עמלה/ payout: אדמין וספק מה-ledger + snapshots על `order_items`. |
| A6 | PostHog (consent) + GA4 Consent Mode למוצר/שיווק; לא מקור אמת כספי. |
| A7 | קופון בדוחות: 100% on-site = הכנסת פלטפורמה; ספק 0 מהפלטפורמה (No Escrow). |
| A8 | alias: `coupon_redeemed` = `redeem`. |

### KPIs (תמצית)

| KPI | מקור |
|---|---|
| ATC rate | events |
| Pay conversion | purchase / begin_checkout |
| Redeem rate | redeem / purchase (coupon) |
| GMV on-site | order_items snapshots |
| Platform take (פיזי) | `platform_percent` **שצולם בשורה** |

---

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| GMV מ-GA4/PostHog | A5: ledger בלבד. |
| עמלה 5%/10% קבועה בדוחות | snapshot פר שורה. |
| Escrow / held ב-KPI קופון | A7: No Escrow. |
| PII ב-beacon לניתוח | A3. |
| `purchase` מ-client בלבד | A2: server after paid. |
| float באירועי כסף | A4: agorot. |

---

## סכמת DB

```text
analytics_events (
  id uuid PK,
  event_id uuid UNIQUE,
  event_name text NOT NULL,
  schema_version int DEFAULT 1,
  session_id uuid,
  user_id uuid NULL,
  consent jsonb,
  context jsonb,
  props jsonb,
  created_at timestamptz
)
```

| event_name | props מינימום |
|---|---|
| `view_product` | product_id, slug, product_type, list_price_agorot |
| `add_to_cart` | + quantity |
| `begin_checkout` | items_count, value_agorot |
| `purchase` | order_id, value_agorot, items[] |
| `redeem` | voucher_id, product_id, supplier_id |

דוחות הכנסה: `order_items` + `settlement_events` / ledger. לא PostHog.

---

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | consent analytics=false | לא שולח ל-PostHog/GA4 marketing |
| CE2 | שינוי `platform_percent` אחרי הזמנה | דוח היסטורי לפי snapshot |
| CE3 | duplicate `event_id` | dedup / ignore |
| CE4 | purchase event לפני ledger write | **אסור** (A2) |
| CE5 | ספק רואה עמלה ממוצעת 10% | UI מציג רק ledger + snapshots |

---

## פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | BI warehouse (ANALYTICS-BI) | v2 |
| O2 | UTM attribution window | MARKETING |
| O3 | server-side GA4 purchase | יישום |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-06 | משפך + PostHog/GA4 |
| 2026-08-12 | batch-2: BINDING קצר (5 סעיפים) |
