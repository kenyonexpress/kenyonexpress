# ארכיטקטורה: תצפיתיות (Observability)

Sentry, לוגים מובנים, התראות Cardcom webhook, reconcile על `settlement_events`, ו-uptime.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: `arch/docs-batch-2` · batch #32/50  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
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

## 0. הכרעות

| # | הכרעה |
|---|---|
| OBS1 | Error tracking: **Sentry** (`@sentry/nextjs`). |
| OBS2 | לוגים: JSON שורה אחת; לוגר יחיד; אסור `console.log` במסלולי כסף. |
| OBS3 | לוגים = אבחון; ראיות כסף ב-DB append-only (`settlement_events`, `payment_webhook_events`, audit). |
| OBS4 | Scrubber משותף: אין PAN, CVV, tokens, סיסמאות, service role. |
| OBS5 | SEV1 כסף → ntfy לטלפון; uptime חיצוני (Better Stack או דומה). |
| OBS6 | `/api/health` רדוד ופומבי; deep checks ב-cron מאומת. |
| OBS7 | Kill switch checkout לפני rollback ארוך. |
| OBS8 | מדדי כסף מ-ledger / `settlement_events` בלבד. אסור מדדי נאמן / held / J5. |
| OBS9 | Error boundary לכל route group משמעותי + tag `route_group`. |

---

## 1. Sentry

| פריט | חוזה |
|---|---|
| SDK | server + edge + client instrumentation |
| כסף | `capturePaymentError` בשרת בלבד (לא מ-UI boundary) |
| Scrub | לפני שליחה |
| Boundaries | root קיים; יעד: `(shop)`, `(account)`, `(admin)`, `(supplier)`, `(auth)`, `(marketing)` |
| UI boundary | עברית RTL + `reset()` + `digest`; domain tag ui/payment/coupon |

| SEV | דוגמה |
|---|---|
| SEV1 | checkout / webhook / finalize / stranded payment |
| SEV2 | redeem / notifications drain |
| SEV3 | UI route group |

אם DSN חסר בפרוד: ntfy נשאר ערוץ חירום לכסף.

---

## 2. לוגים מובנים

שדות מינימום: `ts`, `level`, `msg`, `request_id`, `user_id?`, `order_id?`, `domain`.

| כלל | פירוט |
|---|---|
| Sink | console (Node/Edge) + Vercel log drain |
| Redact | אותו scrub כמו Sentry |
| ראיות | `audit_log`, `payment_webhook_events`, `settlement_events` |

---

## 3. Cardcom webhook alerts

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

## 4. Reconcile על `settlement_events`

מסך אדמין קריאה בלבד (ליד `/admin/reports`):

| פאנל | תוכן |
|---|---|
| יומן יומי | ספירת events לפי `kind` (Asia/Jerusalem) |
| פערים | `paid` בלי settlement צפוי; webhook verified בלי finalize |
| ספקים | התחייבות פתוחה לפי `supplier_id` |
| Refunds | kinds החזר מול מדיניות REFUNDS |
| ייצוא | CSV מאותו מקור אמת |

אין כתיבה ידנית ל-`settlement_events` מה-UI. אין עמודת "held". תצוגה ב-₪; חישוב מיומן.

---

## 5. Uptime

| בדיקה | תדירות יעד | קריטריון |
|---|---|---|
| `GET /` | 1–5 דק' | HTTP 200 |
| `GET /api/health` | 30–60 שנ' | 200 + `ok: true` |
| Deep cron health | לפי לוח | תלויות; לא מפייג על `not_configured` |
| Cardcom | אין probe שיוצר עסקה | config + stranded/reconcile |

ערוץ עמוד: Better Stack (או שקול) → ntfy ל-SEV1.

---

## 6. Acceptance

- [ ] Sentry על payment/coupon/webhook  
- [ ] Boundaries לפי route group + RTL  
- [ ] לוגר יחיד + scrubber  
- [ ] ntfy על כשל webhook/finalize קריטי  
- [ ] דשבורד reconcile מ-`settlement_events` בלי מדדי נאמן  
- [ ] Uptime על home + `/api/health`  
- [ ] OBS8 נשמר  

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | batch #32/50: ריענון BINDING (Sentry, webhook alerts, reconcile) |
