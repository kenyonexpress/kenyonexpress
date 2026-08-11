# ארכיטקטורה: תצפיתיות (Observability)

Sentry, לוגים מובנים, התראות Cardcom webhook, reconcile על `settlement_events`, ו-uptime.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2` · batch #32/50  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מודל כסף בתצפיתיות: **No Escrow**. מדדי כסף מ-ledger / `settlement_events` בלבד. **אין** מדדי נאמן / held / J5 / Escrow. `platform_percent` לא מופיע כ-metric גלובלי (snapshot per order_item בלבד).

מסמכים קשורים:

```
docs/DOCS-TEMPLATE-BINDING.md
docs/ARCHITECTURE-CARDCOM-WEBHOOKS.md
docs/ARCHITECTURE-BACKUP-DR.md
docs/ARCHITECTURE-FRAUD-PREVENTION.md
docs/ARCHITECTURE-SECURITY.md
docs/SLA-MONITORING.md
docs/CONTRADICTIONS.md
supabase/migrations/094_settlement_events.sql
```

הקשר: מפעיל יחיד עם טלפון. אין NOC.

---

## 0. החלטה (OBS1 עד OBS9)

| # | הכרעה |
|---|---|
| OBS1 | Error tracking: **Sentry** (`@sentry/nextjs`). |
| OBS2 | לוגים: JSON שורה אחת; לוגר יחיד; אסור `console.log` במסלולי כסף. |
| OBS3 | לוגים = אבחון; ראיות כסף ב-DB append-only (`settlement_events`, `payment_webhook_events`, audit). |
| OBS4 | Scrubber משותף: אין PAN, CVV, tokens, סיסמאות, service role. |
| OBS5 | SEV1 כסף → ntfy לטלפון; uptime חיצוני (Better Stack או דומה). |
| OBS6 | `/api/health` רדוד ופומבי; deep checks ב-cron מאומת. |
| OBS7 | Kill switch checkout לפני rollback ארוך. |
| OBS8 | מדדי כסף מ-ledger / `settlement_events` בלבד. אסור מדדי נאמן / held / J5 / Escrow. |
| OBS9 | Error boundary לכל route group משמעותי + tag `route_group`. |

---

## 1. חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| Datadog / New Relic כ-stack ראשי v1 | OBS1; Sentry + Vercel drain מספיק למפעיל יחיד |
| `console.log` במסלולי payment | OBS2; scrub + structured logger |
| מדד "held balance" / Escrow dashboard | OBS8; No Escrow |
| Return URL כ-trigger ל-alert paid | מקור אמת = GetLpResult; CARDCOM-WEBHOOKS |
| deep health פומבי (DB + Cardcom) | OBS6; information leak |
| PagerDuty enterprise | ntfy + Better Stack מספיק ל-v1 |
| log retention אינסופי ב-Vercel | עלות; DB = ראיות כסף |
| alert על כל 4xx redeem | noise; SEV2/3 בלבד |

---

## 2. סכמת DB

**אין DDL חדש במסמך זה.** טבלאות ראיות ו-reconcile:

| טבלה | שימוש observability |
|---|---|
| `settlement_events` | מקור אמת reconcile יומי; `kind`, agorot, `order_id`, `supplier_id` |
| `payment_webhook_events` | dedup webhook; DLQ; `signature_valid`, `verified_against_api` |
| `payments` | stranded detection: succeeded בלי order paid |
| `orders` | `paid_at`, status transitions |
| `audit_log` | פעולות admin / refund / manual reconcile |
| `voucher_redemptions` | SEV2 redeem failures spike |

אין עמודת `held` / `escrow_amount`. סכומים ב-agorot integer.

Migration מקור: `supabase/migrations/094_settlement_events.sql`

---

## 3. Sentry

| פריט | חוזה |
|---|---|
| SDK | server + edge + client instrumentation |
| כסף | `capturePaymentError` בשרת בלבד (לא מ-UI boundary) |
| Scrub | לפני שליחה (OBS4) |
| Boundaries | root קיים; יעד: `(shop)`, `(account)`, `(admin)`, `(supplier)`, `(auth)`, `(marketing)` |
| UI boundary | עברית RTL + `reset()` + `digest`; domain tag ui/payment/coupon |

| SEV | דוגמה |
|---|---|
| SEV1 | checkout / webhook / finalize / stranded payment |
| SEV2 | redeem / notifications drain |
| SEV3 | UI route group |

אם DSN חסר בפרוד: ntfy נשאר ערוץ חירום לכסף.

---

## 4. לוגים מובנים

שדות מינימום: `ts`, `level`, `msg`, `request_id`, `user_id?`, `order_id?`, `domain`.

| כלל | פירוט |
|---|---|
| Sink | console (Node/Edge) + Vercel log drain |
| Redact | אותו scrub כמו Sentry |
| ראיות | `audit_log`, `payment_webhook_events`, `settlement_events` |

אסור float בשדות כסף בלוג; agorot integer או מחרוזת ₪ מעוגלת.

---

## 5. Cardcom webhook alerts

```text
Cardcom POST
  → secret + GetLpResult
  → finalize / settlement_events
  → הצלחה: לוג מובנה
  → כשל: capturePaymentError + alertMoneyFailure (ntfy)
  → אחרי אימות: DLQ ב-payment_webhook_events
  → השלמה: cron stranded-payments + reconcile
```

התראות interrupt חובה:

| תנאי | למה |
|---|---|
| חיוב הצליח וההזמנה לא נסגרה | כסף בלי סחורה/קופון |
| amount_mismatch אחרי GetLpResult | מניעת finalize שגוי |
| spike ב-DLQ / stranded | משלוח webhook שבורה |

Timeout להתראה ≤ 4s. `ALERTS_ENABLED=false` בטסטים.

---

## 6. Reconcile על `settlement_events`

מסך אדמין קריאה בלבד (ליד `/admin/reports`):

| פאנל | תוכן |
|---|---|
| יומן יומי | ספירת events לפי `kind` (Asia/Jerusalem) |
| פערים | `paid` בלי settlement צפוי; webhook verified בלי finalize |
| ספקים | התחייבות פתוחה לפי `supplier_id` (פיזי בלבד) |
| Refunds | kinds החזר מול מדיניות REFUNDS |
| ייצוא | CSV מאותו מקור אמת |

אין כתיבה ידנית ל-`settlement_events` מה-UI. אין עמודת "held". תצוגה ב-₪; חישוב מיומן agorot.

קופון: settlement = platform revenue; **אין** supplier due מהפלטפורמה.

---

## 7. Uptime

| בדיקה | תדירות יעד | קריטריון |
|---|---|---|
| `GET /` | 1 עד 5 דק' | HTTP 200 |
| `GET /api/health` | 30 עד 60 שנ' | 200 + `ok: true` |
| Deep cron health | לפי לוח | תלויות; לא מפייג על `not_configured` |
| Cardcom | אין probe שיוצר עסקה | config + stranded/reconcile |

ערוץ עמוד: Better Stack (או שקול) → ntfy ל-SEV1.

---

## 8. מקרי קצה

| מקרה | תרחיש | observability | הערה |
|---|---|---|---|
| OBE1 | webhook dup | dedup; no alert | replay 200 |
| OBE2 | paid stranded > 5 min | SEV1 ntfy | reconcile cron |
| OBE3 | amount_mismatch | block finalize + P1 | no settlement write |
| OBE4 | Sentry down | ntfy still fires | OBS5 fallback |
| OBE5 | DSN missing prod | ntfy money path | OBS1 |
| OBE6 | log PII leak attempt | scrubber drop field | OBS4 |
| OBE7 | reconcile gap coupon vs physical | filter by product_type | OBS8 |
| OBE8 | false positive uptime (200 empty) | health body `ok:true` | OBS6 |
| OBE9 | alert storm during deploy | `ALERTS_ENABLED` off staging | ops |
| OBE10 | settlement_events lag | dashboard gap panel | 094 migration |
| OBE11 | finalize partial + voucher missing | SEV1 | CHECKOUT-FLOW |
| OBE12 | metric "avg platform_percent" global | **אסור** | C1 per product |

---

## 9. פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | `/admin/reports` reconcile UI: קיים או backlog | admin dashboard |
| O2 | Better Stack vs alternative chosen | SLA-MONITORING |
| O3 | Sentry boundaries: כל route groups מכוסים | OBS9 rollout |
| O4 | log drain retention policy | cost |
| O5 | runbook auto-link מ-Sentry → RUNBOOK-OPERATIONS | ops |
| O6 | stranded threshold: 5 min vs configurable | tuning |

עודכן: 2026-08-12.

---

## 10. Acceptance

- [ ] Sentry על payment/coupon/webhook  
- [ ] Boundaries לפי route group + RTL  
- [ ] לוגר יחיד + scrubber  
- [ ] ntfy על כשל webhook/finalize קריטי  
- [ ] דשבורד reconcile מ-`settlement_events` בלי מדדי נאמן  
- [ ] Uptime על home + `/api/health`  
- [ ] OBS8 נשמר  
- [ ] החלטה + חלופות שנדחו + סכמת DB + מקרי קצה + פתוחות  

---

## 11. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | batch #32/50: ריענון BINDING (Sentry, webhook alerts, reconcile) |
| 2026-08-12 | batch-2 pass-3: DOCS-TEMPLATE-BINDING (חלופות, DB, מקרי קצה, פתוחות) |
