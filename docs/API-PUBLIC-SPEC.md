# מפרט API ציבורי לספקים (עתידי)

API מפתחים ל-enterprise: קריאת מכירות, עדכון מלאי, API keys, rate limits.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. כסף: **agorot integer**; **No Escrow**; snapshot `platform_percent` בלי default.

מסמכים קשורים:

```
docs/ARCHITECTURE-API-CONTRACTS.md
docs/ARCHITECTURE-SUPPLIER-PORTAL.md
docs/ARCHITECTURE-INVENTORY.md
docs/ARCHITECTURE-FRAUD-PREVENTION.md
```

שכבת **שותפים חיצוניים** בלבד; לא מחליף API פנימי.

---

## החלטה

| # | הכרעה |
|---|---|
| P1 | MVP = קריאת מכירות + כתיבה מוגבלת למלאי; **אין** Cardcom דרך API זה. |
| P2 | אימות: `Authorization: Bearer ke_live_...` + scope; אין service-role ללקוח. |
| P3 | Rate limit: 60 req/min, burst 120; enterprise לפי חוזה. |
| P4 | דוחות כסף = snapshots/ledger; אין שדות held/J5/Escrow. |
| P5 | מלאי: רק דילים של הספק; אסור מחיר/`platform_percent`. |
| P6 | גרסה בנתיב: `/v1/...`; breaking = גרסה חדשה. |
| P7 | Webhooks (paid/redeemed) = phase 2; phase 1 = polling. |

Base: `https://api.kenyonexpress.co.il/v1` (עתידי). שגיאות: `{ error: { code, message_he, request_id } }`.

---

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| checkout דרך API ציבורי | P1: מחוץ לסקופ. |
| service-role key לספק | P2: RLS לפי supplier_id. |
| float בשדות כסף | agorot integer. |
| webhooks ב-MVP | P7: polling קודם. |
| גישה ל-ledger גלובלי | מחוץ לסקופ. |

---

## סכמת DB

```text
api_keys (יעד)
  key_id, secret_hash, supplier_id, scopes[], env, revoked_at

audit_log  -- כל כתיבה

קריאה:
  order_items, orders, products, inventory/quota
```

DDL ב-phase נפרד; אין migration במסמך זה.

---

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | מפתח `sales:read` על PATCH מלאי | 403 |
| CE2 | ספק א מנסה מכירות של ב | ריק / 404 |
| CE3 | חלון `from/to` > 31 יום | 400 |
| CE4 | 429 תחת עומס | `Retry-After` + `request_id` |
| CE5 | PATCH מחיר מוצר | 403 |
| CE6 | idempotency_key כפול | 200 עם אותה תוצאה |

---

## פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | דומיין API חי | עד אז אין endpoint ציבורי. |
| O2 | IP allowlist enterprise | אופציונלי. |
| O3 | HMAC webhooks phase 2 | P7. |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-10 | rev A: sales read + inventory |
| 2026-08-12 | batch-2: BINDING 5 סעיפים |
