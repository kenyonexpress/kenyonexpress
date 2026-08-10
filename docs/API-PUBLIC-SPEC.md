# מפרט: API ציבורי לספקים גדולים (עתידי)

API מפתחים לספקי enterprise: קריאת מכירות ועדכון מלאי, עם API keys ו-rate limits.

Status: **DESIGN** · עודכן: 2026-08-10  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/ARCHITECTURE-API-CONTRACTS.md
docs/ARCHITECTURE-SUPPLIER-PORTAL.md
docs/ARCHITECTURE-INVENTORY.md
docs/ARCHITECTURE-SECURITY.md
docs/ARCHITECTURE-FRAUD-PREVENTION.md
docs/CONTRADICTIONS.md
```

לא מחליף את חוזי ה-API הפנימיים ב-

```
docs/ARCHITECTURE-API-CONTRACTS.md
```

זה שכבת **שותפים חיצוניים** בלבד.

---

## 0. הכרעות

| # | הכרעה |
|---|---|
| P1 | MVP ציבורי = קריאה בלבד למכירות + כתיבה מוגבלת למלאי/מכסות דיל. אין תשלום Cardcom דרך API זה. |
| P2 | אימות: API key לספק (`Authorization: Bearer ke_live_...`) + scope. אין service-role ללקוח. |
| P3 | Rate limit לפי מפתח: ברירת מחדל 60 req/min, burst 120; enterprise לפי חוזה. |
| P4 | כל כסף בדוחות = snapshots / ledger כמו בפרוד. **No Escrow.** אין שדות held/J5. |
| P5 | מלאי: עדכון מכסה/מלאי דיל של הספק בלבד; אסור לגעת בדילים של ספק אחר. |
| P6 | גרסה בנתיב: `/v1/...`. שינוי שובר = גרסה חדשה. |
| P7 | Webhooks אופציונליים בשלב 2 (paid / redeemed). שלב 1 = polling. |

---

## 1. בסיס

| נושא | חוזה |
|---|---|
| Base URL | `https://api.kenyonexpress.co.il/v1` (עתידי; עד אז אין דומיין חי) |
| פורמט | JSON UTF-8 |
| זמן | ISO-8601, אזור `Asia/Jerusalem` בשדות תצוגה בלבד |
| מטבע | אגורות (`*_agorot`) בשדות כסף |
| שגיאות | `{ "error": { "code", "message_he", "request_id" } }` |

---

## 2. API keys

| שדה | משמעות |
|---|---|
| `key_id` | מזהה ציבורי ללוגים |
| `secret` | מוצג פעם אחת ב-create; נשמר כ-hash |
| `supplier_id` | בעלות |
| `scopes` | `sales:read`, `inventory:write`, `inventory:read` |
| `env` | `test` / `live` |
| `revoked_at` | ביטול מיידי |

ניהול: אדמין או פורטל ספק (enterprise). רוטציה: create חדש → חפיפה → revoke ישן.

---

## 3. Rate limits

| מנגנון | פרט |
|---|---|
| מפתח | token bucket; כותרות `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `Retry-After` |
| IP | רשת ביטחון מול ניחוש מפתחות |
| 429 | גוף שגיאה + `request_id` ל-support |

חריגה חוזרת: throttle אוטומטי + התראת fraud/ops.

---

## 4. Endpoints (שלב 1)

### 4.1 מכירות (קריאה)

`GET /v1/sales`

| Query | חובה | משמעות |
|---|---|---|
| `from` / `to` | כן | חלון זמן (max 31 יום לבקשה) |
| `cursor` | לא | עימוד |
| `status` | לא | `paid` / `refunded` / ... |

תשובה (עקרון): שורות הזמנה של הספק עם `product_id`, `qty`, `customer_pays_now_agorot`, `platform_percent` (snapshot), `type` (`coupon`/`physical`). בלי PII מלא של לקוח (מינימום: order ref פנימי).

`GET /v1/sales/{order_item_id}`: פירוט שורה אחת בבעלות הספק.

### 4.2 מלאי (קריאה + עדכון)

`GET /v1/inventory` : דילים של הספק + `quota_remaining` / `stock`.

`PATCH /v1/inventory/{product_id}` :

```json
{
  "quota_total": 500,
  "stock": 120,
  "idempotency_key": "inv-2026-08-10-01"
}
```

חוקים: רק שדות מלאי/מכסה; לא מחיר; לא `platform_percent`; לא סטטוס publish בלי scope נפרד (עתידי).

---

## 5. אבטחה

- TLS בלבד
- אין מפתחות ב-query string
- Audit log לכל כתיבה
- IP allowlist אופציונלי לספק גדול
- חתימת webhook (שלב 2): HMAC-SHA256

---

## 6. מה מחוץ לסקופ

- יצירת הזמנות / checkout
- מימוש קופון (נשאר ב-scanner / פורטל)
- שינוי עמלות
- גישה ל-ledger גלובלי של הפלטפורמה

---

## 7. Acceptance

- [ ] מפתח עם `sales:read` בלבד נחסם על PATCH מלאי
- [ ] ספק א לא רואה מכירות של ספק ב
- [ ] 429 + כותרות limit תחת עומס
- [ ] אין שדות Escrow/held ב-JSON

---

## 8. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-10 | טיוטת API ציבורי: sales read + inventory write, keys, limits |
