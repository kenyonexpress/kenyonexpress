# ארכיטקטורה: Feature Flags / Kill Switches

דגלי תכונה וברזי חירום ל-KenyonExpress: env, kill switches, No Escrow binding.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.  
מודל כסף: **No Escrow**; `ESCROW_FLOW_ENABLED` אסור true; `platform_percent` פר מוצר בלי default.

מסמכים קשורים:

```
docs/ARCHITECTURE-GO-LIVE-CHECKLIST.md
docs/RUNBOOK-PRODUCTION-DEPLOY.md
docs/ARCHITECTURE-ENV-SECRETS.md
docs/ARCHITECTURE-FRAUD-RATE-LIMITS.md
docs/MASTER-ARCHITECTURE.md
```

---

## 1. החלטה

| # | הכרעה |
|---|---|
| F1 | Flag שמשפיע על **כסף** חייב default **בטוח** (checkout כבוי אם חסר env מסוכן). |
| F2 | Phase 1: **Vercel env** + `process.env` בשרת בלבד; לא expose ל-client. |
| F3 | Phase 2 (אופציונלי): `app_settings(key, value_json, updated_at)` + RLS admin-only + cache 30s. |
| F4 | **`ESCROW_FLOW_ENABLED`**: תמיד `false`; אסור קריאה שמאפשרת true. No Escrow binding. |
| F5 | **`CHECKOUT_ENABLED`**: `'true'` מפורש בלבד לפתיחה; כל ערך אחר = כבוי (fail-closed). |
| F6 | שינוי flag ב-prod: Vercel env redeploy או `app_settings` update; לתעד ב-audit. |
| F7 | כל flag מתועד כאן + ב-Go-Live / Runbook. |
| F8 | Kill switch לא מוחק נתונים; רק חוסם מסלול (beginCheckout, scan, send). |

### 1.1 Flags מחייבים

| Key | Default prod | משמעות |
|---|---|---|
| `CHECKOUT_ENABLED` | `false` עד P0 PASS | כבוי → `beginCheckout` → `CHECKOUT_DISABLED` |
| `ESCROW_FLOW_ENABLED` | **false / unset** | אסור true; מסלול פסול |
| `NOTIFICATIONS_ENABLED` | `true` | כבוי → enqueue בלבד / skip send |
| `WHATSAPP_NOTIFICATIONS_ENABLED` | `false` | עד templates מאושרים |
| `SEARCH_ENABLED` | `true` | כבוי → fallback SQL אם Meili down |
| `WALLET_APPLY_ENABLED` | `true` | כבוי → checkout ללא wallet apply |
| `SUPPLIER_SCAN_ENABLED` | `true` | כבוי → redeem RPC block |
| `AI_CS_AGENT_ENABLED` | `false` | עד shadow done |
| `AI_SUPPLIER_AGENT_ENABLED` | `false` | |
| `MAINTENANCE_MODE` | `false` | דף תחזוקה ציבורי; admin נשאר |

### 1.2 חוזה קוד (ייחוס)

```ts
function isCheckoutEnabled() {
  return process.env.CHECKOUT_ENABLED === 'true'
}

function isEscrowFlowEnabled() {
  // Binding: always false. Do not read env to enable.
  return false
}
```

הערה: חלק מהקוד היסטורי בודק `!== 'false'`; **יעד BINDING** הוא `=== 'true'` fail-closed (ראה STATE.md, RUNBOOK).

### 1.3 Runbook

| אירוע | פעולה |
|---|---|
| Cardcom down | `CHECKOUT_ENABLED=false` + redeploy |
| Redeem abuse spike | `SUPPLIER_SCAN_ENABLED=false` + חקירה |
| Bad notification blast | `NOTIFICATIONS_ENABLED=false` |
| Deploy רע | `MAINTENANCE_MODE=true` + revert |
| Meili outage | `SEARCH_ENABLED` נשאר true; SQL fallback |

---

## 2. חלופות שנדחו

| חלופה | נימוק דחייה |
|---|---|
| LaunchDarkly / Flagsmith יום 1 | עלות + secrets; env מספיק ל-kill switches. |
| Feature flags ב-client bundle | leak intent + bypass; server-only. |
| `ESCROW_FLOW_ENABLED` true ב-staging | מסלול Escrow פסול גם ב-staging; always false. |
| `CHECKOUT_ENABLED` default true | fail-open מסוכן; `'true'` מפורש בלבד. |
| DB flags ללא cache | load על כל request; 30s cache מספיק Phase 2. |
| Flag per `platform_percent` | percent פר מוצר ב-DB; לא env flag. |

---

## 3. סכמת DB

**אין DDL חובה Phase 1.** env ב-Vercel בלבד.

### Phase 2 (אופציונלי): `app_settings`

| עמודה | סוג | שימוש |
|---|---|---|
| `key` | text PK | e.g. `CHECKOUT_ENABLED` |
| `value_json` | jsonb | `"true"` / `"false"` |
| `updated_at` | timestamptz | audit |
| `updated_by` | uuid | admin profile |

RLS: SELECT/UPDATE admin-only; service role לקריאה ב-drain/cron.

**לא קיים ב-repo נכון לכתיבה:** DDL ב-`migrations/pending` רק באישור; כאן תיעוד יעד.

טבלאות קשורות קיימות:

| טבלה | קשר |
|---|---|
| `audit_log` | log שינוי flag admin |
| `products.platform_percent` | לא flag; snapshot per product |

---

## 4. מקרי קצה

| # | מצb | התנהגות |
|---|---|---|
| E1 | `CHECKOUT_ENABLED` unset | fail-closed: disabled |
| E2 | `CHECKOUT_ENABLED=false` mid-payment | webhook/idempotency מסיים; beginCheckout חדש חסום |
| E3 | `NOTIFICATIONS_ENABLED=false` | outbox נשמר; drain skip send |
| E4 | `SUPPLIER_SCAN_ENABLED=false` | scan RPC error ברור; audit |
| E5 | `MAINTENANCE_MODE=true` | public 503; `/admin` עובד |
| E6 | env stale אחרי Vercel change | redeploy/restart required |
| E7 | `app_settings` + env conflict | env wins Phase 1; Phase 2: document precedence = DB |
| E8 | AI flag true ללא rate limit | agents still `check_my_rate_limit` |
| E9 | `WALLET_APPLY_ENABLED=false` | checkout card-only; ledger לא משתנה |
| E10 | attempt enable Escrow via env | code returns false; log warning |

---

## 5. פתוחות

| # | פער | החלטה זמנית | תאריך |
|---|---|---|---|
| O1 | `CHECKOUT_ENABLED` `=== 'true'` vs `!== 'false'` בקוד | BINDING: migrate to `=== 'true'` | 2026-08-12 |
| O2 | `app_settings` migration timing | pending עד אישור; env Phase 1 | 2026-08-12 |
| O3 | Admin UI ל-flags | env Vercel ידני עד dashboard | 2026-08-12 |
| O4 | Per-tenant flags (B2B) | לא scope v1 | 2026-08-12 |

---

## 6. Revision

| תאריך | שינוי |
|---|---|
| 2026-07-31 | Feature flags + kill switches (`arch/docs-queue`) |
| 2026-08-12 | BINDING מלא: החלטה, חלופות, DB, קצה, פתוחות (`arch/docs-batch-2`) |
