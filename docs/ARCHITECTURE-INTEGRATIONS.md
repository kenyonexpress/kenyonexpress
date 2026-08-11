# ארכיטקטורה: אינטגרציות עתידיות (Wolt / Gett בסגנון)

ורטיקלים food/rides: בנייה פנימית, webhooks נכנסים, מיפוי ל-`orders`.

Status: **DESIGN → BINDING על העקרונות** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.  
מודל כסף: **No Escrow** לקופוני shop; food/rides = חיוב מלא on-site.

מסמכים קשורים:

```
docs/DOCS-TEMPLATE-BINDING.md
docs/ARCHITECTURE-MOBILE-SUPERAPP.md
docs/ARCHITECTURE-API-CONTRACTS.md
docs/CARDCOM-ARCHITECTURE.md
docs/CONTRADICTIONS.md
```

עקרון: **לא מחברים כרטיס ל-Wolt/Gett חיצוניים.** ורטיקל פנימי על Supabase + Cardcom.

---

## 0. החלטה (I1 עד I7)

| # | הכרעה |
|---|---|
| I1 | ורטיקל = קוד ב-`verticals/<key>`; אין JS זר ב-runtime. |
| I2 | כסף רק דרך checkout ליבה; ורטיקל לא כותב `payments` ישירות. |
| I3 | הזמנה = `orders.vertical` + `delivery_jobs` / `ride_jobs`. |
| I4 | Webhooks נכנסים חתומים + idempotent. |
| I5 | webhook ורטיקל **לא** מעביר `orders` ל-`paid`. |
| I6 | shop coupon = No Escrow; food/rides = on-site full charge. |
| I7 | Kill switch: `verticals.status = paused`. |

---

## 1. חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| OAuth לחשבון Wolt/Gett | I1; אין חיבור מותג |
| WebView תשלום צד ג' | PCI + חנות |
| paid status מ-webhook שליח | I5 |
| held balance לקופון ב-food | I6 |
| micro-frontend runtime load | אבטחה + CSP |

---

## 2. סכמת DB

**DDL יעד** (additive, לא במסמך זה):

| אובייקט | שימוש |
|---|---|
| `orders.vertical` | `shop` / `food` / `rides` |
| `delivery_jobs` | status, external_ref, geo |
| `ride_jobs` | same pattern |
| `vertical_webhook_events` | dedup `external_event_id` |
| `verticals` | manifest, `status` paused/active |

agorot integer; `platform_percent` per product/route, no global default.

---

## 3. Webhooks ומיפוי (תמצית)

```text
POST /api/verticals/{key}/webhooks/{provider}
  → verify HMAC
  → insert vertical_webhook_events (idempotent)
  → map status → delivery_jobs
  → notify push topic food.*
  → paid רק מ-Cardcom webhook ליבה
```

| אירוע | job status | תשלום |
|---|---|---|
| `merchant_accepted` | `preparing` | ללא שינוי |
| `delivered` | `delivered` | settlement פנימי |
| `cancelled` | `cancelled` | refund LEGAL |

---

## 4. מקרי קצה

| # | מצב | התנהגות |
|---|---|---|
| IN-E1 | duplicate webhook event id | no-op |
| IN-E2 | out-of-order status events | `occurred_at` ordering |
| IN-E3 | vertical paused mid-order | complete in-flight; no new |
| IN-E4 | courier marks paid | reject; I5 |
| IN-E5 | refund food after delivered | Cardcom + support |
| IN-E6 | invalid signature | 401; no payload log |
| IN-E7 | shop coupon in mixed cart | blocked v1 |

---

## 5. פתוחות

| # | פער | תאריך |
|---|---|---|
| O1 | legal food/rides licensing | 2026-08-12 |
| O2 | contractor courier onboarding | 2026-08-12 |
| O3 | surge pricing v2 | 2026-08-12 |

---

## 6. סדר יישום

V0 shop stable → V1 verticals table + kill switch → V2 food manual status → V3 inbound webhooks → V4 rides.

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-10 | מסמך ראשון integrations |
| 2026-08-12 | batch-2: DOCS-TEMPLATE-BINDING |
