# ארכיטקטורה: תצפיתיות (Observability)

Sentry (כולל error boundaries לפי route group), לוגים מובנים, התראות webhook של Cardcom, דשבורד התאמה על `settlement_events`, ובדיקות uptime.

Status: **BINDING** · עודכן: 2026-08-11 · QA: **PASS** (חבילת #9; קישורים ל-ANALYTICS + CONTRADICTIONS נשמרים)  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-lifecycle`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/RUNBOOK-PRODUCTION.md
docs/ARCHITECTURE-BACKUP-DR.md
docs/ARCHITECTURE-FRAUD-PREVENTION.md
docs/ARCHITECTURE-SECURITY.md
docs/ARCHITECTURE-ANALYTICS.md
docs/SLA-MONITORING.md
docs/INCIDENT-PLAYBOOKS.md
docs/MASTER-INDEX.md
docs/CONTRADICTIONS.md
supabase/migrations/094_settlement_events.sql
```

הקשר: מפעיל יחיד עם טלפון. אין NOC.

---

## 1. Current-state audit (ריפו אמיתי)

נבדק READ-ONLY מול
`/Users/ofir/kenyonexpress-web/kenyonexpress`
(2026-08-11).

### 1.1 Sentry

| פריט | מצב |
|---|---|
| SDK | `@sentry/nextjs`: `sentry.server.config.ts`, `sentry.edge.config.ts`, `instrumentation.ts`, `instrumentation-client.ts` |
| Money helpers | `src/lib/observability/sentry.ts`: `capturePaymentError`, התראת כסף גם דרך ntfy כש-DSN חסר |
| Scrub | `scrub.ts` / `redact` לפני שליחה (tokens, secrets) |
| Error boundaries | `src/app/error.tsx` + `src/app/global-error.tsx` ברמת root בלבד |
| Per route group | **חסר:** אין `error.tsx` תחת `(shop)`, `(account)`, `(admin)`, `(supplier)`, `(auth)`, `(marketing)` וכו' |

הערה מהקוד: ה-boundary בשורש **לא** מייבא את Sentry money helpers (כדי לא לתייג UI כ-payments). חסר SDK דפדפן מחובר ל-boundaries.

### 1.2 לוגים מובנים

| פריט | מצב |
|---|---|
| לוגר | `src/lib/observability/log.ts` (JSON שורה אחת, `request_id`, scrub) |
| מעטפת API | `with-request-log.ts` על routes (למשל `/api/health`) |
| הקשר | `request-context.ts`, `request-id.ts`, `action-context.ts` |
| מדיניות | אסור `console.log` גולמי בנתיבי כסף; יש בדיקת כיסוי `log-coverage.test.ts` |

### 1.3 התראות Cardcom webhook

| פריט | מצב |
|---|---|
| Interrupt לטלפון | `alert.ts` → ntfy (`alertMoneyFailure`) |
| Webhook path | `src/app/api/payments/cardcom/webhook/` + resilience tests |
| DLQ | `webhook-dlq.ts` על `payment_webhook_events` |
| השלמה כשwebhook נעלם | cron `stranded-payments`, `reconcile` |
| Sentry DSN | אם לא מוגדר בפרוד, ה-push ל-ntfy הוא ערוץ החירום (נמדד בטסטים) |

### 1.4 `settlement_events` + דוחות

| פריט | מצב |
|---|---|
| טבלה | `094_settlement_events.sql`: append-only, kinds ידועים, RLS |
| כתיבה | `src/server/payments/settlement-events.ts` |
| דוח אדמין | `/admin/reports` קורא מ-`settlement_events` דרך `settlement-report.ts` / `loadReportEvents` |
| דשבורד reconciliation ייעודי | חלקי: יש דוחות כספיים; חסר מסך "התאמה" שמציג פערים webhook/ledger/Cardcom במפורש |

### 1.5 Uptime / health

| פריט | מצב |
|---|---|
| Public liveness | `GET /api/health`: DB probe (categories HEAD), 200/503, בלי פירוט רגיש |
| Deep checks | `src/lib/health/checks.ts` + cron `api/cron/health` (תלויות; Cardcom = config-only, בלי probe שיוצר עסקאות) |
| Uptime חיצוני | מתועד כיעד (Better Stack / דומה) על home + `/api/health`; לא חלק מהקוד |

### 1.6 QA-PASS / No Escrow (נשמר)

קישורי QA מחבילת #9 נשארים בתוקף:

- אינדקס MASTER + ANALYTICS + CONTRADICTIONS.
- **OBS8:** מדדים/התראות כסף מבוססים ledger / `settlement_events` בלבד. אסור מדד Escrow / held / J5 או "שחרור מקדמה לספק" על קופון (CONTRADICTIONS C11א).

---

## 2. Target architecture

### 2.1 הכרעות

| # | הכרעה |
|---|---|
| OBS1 | Error tracking: **Sentry** (`@sentry/nextjs`). Errors ב-MVP; Replay לא חובה. |
| OBS2 | לוגים: JSON שורה אחת; לוגר יחיד `src/lib/observability/log.ts`; אסור `console.log` בנתיבי כסף. |
| OBS3 | לוגים = אבחון; ראיות כסף ב-DB append-only (`settlement_events`, `payment_webhook_events`, audit). |
| OBS4 | Scrubber משותף: אין PAN, CVV, tokens, סיסמאות, service role. |
| OBS5 | התראות: ntfy ל-SEV1 כסף; Better Stack (או דומה) ל-uptime/spikes. |
| OBS6 | `/api/health` רדוד ופומבי; בדיקות עומק ב-cron מאומת. |
| OBS7 | Kill switch checkout לפני rollback ארוך. |
| OBS8 | **No Escrow במדדים.** אסור מדדי Escrow/held/J5. כסף מ-ledger + `settlement_events` בלבד. |
| OBS9 | Error boundary **לכל route group** משמעותי + דיווח Sentry בדפדפן עם tag `route_group`. |

### 2.2 Sentry + error boundaries לפי route group

יעד קבצים (דוגמה):

```text
src/app/error.tsx                         # fallback כללי (קיים)
src/app/global-error.tsx                  # קריסת root layout (קיים)
src/app/(shop)/error.tsx
src/app/(account)/error.tsx
src/app/(admin)/error.tsx
src/app/(supplier)/error.tsx
src/app/(auth)/error.tsx
src/app/(marketing)/error.tsx
```

חוזה לכל boundary:

1. UI עברית RTL + כפתור `reset()` + הצגת `digest` לתמיכה.
2. דיווח ל-Sentry מהלקוח עם tags: `route_group`, `domain` (ui/payment/coupon/other).
3. **לא** לקרוא ל-`capturePaymentError` מ-UI boundary (שומר על ערוץ payments נקי).
4. כסף/webhook נשארים עם `capturePaymentError` / `alertMoneyFailure` בשרת בלבד.

| SEV | דוגמה |
|---|---|
| SEV1 | checkout / webhook / finalize / stranded payment |
| SEV2 | redeem / notifications drain |
| SEV3 | UI route group |

### 2.3 לוגים מובנים

שדות מינימום: `ts`, `level`, `msg`, `request_id`, `user_id?`, `order_id?`, `domain`.

| כלל | פירוט |
|---|---|
| Sink | `console` (Node + Edge); Vercel log drain |
| Redact | אותו `scrub.ts` כמו Sentry |
| Retention | runtime קצר + drain (יעד ~30 יום) |
| ראיות | `audit_log`, `payment_webhook_events`, `settlement_events`, voucher/redemption logs |

### 2.4 Cardcom webhook alerting

```text
Cardcom POST webhook
  → אימות ?s= + GetLpResult
  → finalize / settlement_events
  → הצלחה: לוג מובנה
  → כשל: capturePaymentError + alertMoneyFailure (ntfy)
  → כשל אחרי אימות: DLQ ב-payment_webhook_events
```

התראות חובה (interrupt לטלפון):

| תנאי | למה |
|---|---|
| חיוב הצליח ב-Cardcom וההזמנה לא נסגרה | כסף בלי סחורה/קופון |
| אי-התאמת סכום אחרי GetLpResult | מניעת finalize שגוי |
| Spike ב-DLQ / stranded-payments | משלוח webhook שבורה |
| Timeout ארוך בטיפול webhook | Cardcom retries; לא לחסום את ה-handler על alerting |

Timeout להתראה ≤ 4s (כמו הקוד היום). `ALERTS_ENABLED=false` מכבה בטסטים.

### 2.5 דשבורד reconciliation על `settlement_events` (מפרט)

מסך אדמין ייעודי (ליד `/admin/reports` או תחתיו), **קריאה בלבד** מ-`settlement_events` (+ הצלבות ל-`payment_webhook_events` / סטטוס הזמנה).

| פאנל | תוכן |
|---|---|
| יומן יומי | ספירת events לפי `kind` בטווח תאריכים (Asia/Jerusalem) |
| פערים | הזמנות `paid` בלי שורת settlement צפויה; webhook verified בלי finalize |
| ספקים | התחייבות פתוחה לפי `supplier_id` (בלי שפת Escrow) |
| Refunds | kinds של החזר / `supplier_debit` מול מדיניות REFUNDS |
| ייצוא | CSV מאותו מקור אמת בלבד |

כללים:

1. אין כתיבה ידנית ל-`settlement_events` מה-UI (append-only ב-DB).
2. מספרים מוצגים ב-₪ בתצוגה; חישובים מהשדות השמורים ביומן.
3. **OBS8:** אין עמודה/גרף "held escrow" או "שחרור נאמן".

### 2.6 Uptime checks

| בדיקה | תדירות יעד | קריטריון |
|---|---|---|
| `GET /` (או home קנוני) | 1–5 דק' | HTTP 200 |
| `GET /api/health` | 30–60 שנ' | HTTP 200 ו-`ok: true` |
| Deep cron `/api/cron/health` | לפי לוח קיים | תלויות `ok` / `not_configured` (לא מפייג על not_configured) |
| Cardcom | אין HTTP probe שיוצר עסקה | רק config + heartbeat עסקי דרך stranded/reconcile |

ערוץ עמוד: Better Stack (או שקול) → ntfy/מייל ל-SEV1. פירוט SLA ב-`SLA-MONITORING.md`.

---

## 3. Numbered migration path

1. **Sentry DSN בפרוד + אימות:** לוודא ש-`capturePaymentError` ו-ntfy לא no-op על כשל כסף.
2. **Error boundaries לפי route group:** הוספת `error.tsx` לכל group משמעותי + client Sentry tag `route_group`.
3. **אכיפת לוגר יחיד:** להמשיך לאסור `console.*` בנתיבי כסף (טסט כיסוי קיים); להרחיב ל-webhooks/crons שחסרים.
4. **Webhook alerting runbook:** לחבר stranded-payments + DLQ + ntfy לשיגרת בוקר (`OPS-DAILY-ROUTINE` / SLA).
5. **דשבורד reconciliation:** פאנל פערים על `settlement_events` + קישור ל-webhook events; בלי מדדי Escrow.
6. **Uptime חיצוני:** מוניטור על home + `/api/health`; אלרט לטלפון ב-SEV1.
7. **קישורי QA:** לשמור PASS מול ANALYTICS + CONTRADICTIONS בכל ריענון נוסף.

---

## 4. Acceptance

- [ ] Sentry על payment/coupon/webhook  
- [ ] Error boundary לכל route group מרכזי עם RTL עברית  
- [ ] לוגר יחיד + scrubber  
- [ ] התראת ntfy על כשל webhook/finalize קריטי  
- [ ] דשבורד reconciliation קורא מ-`settlement_events` בלי Escrow metrics  
- [ ] Uptime על home + `/api/health`  
- [ ] OBS8 + קישורי QA-PASS נשמרים  

---

## 5. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-06 | Sentry + לוגים + התראות (מסמך ממוקד בעברית) |
| 2026-08-06 | QA: קישור MASTER-INDEX; RTL/עברית תקינים |
| 2026-08-07 | QA re-pass: קישור CONTRADICTIONS (No Escrow) |
| 2026-08-07 | QA: קישור הדדי ל-ANALYTICS |
| 2026-08-07 | QA audit: OBS8 איסור מדדי Escrow; כסף מ-ledger / settlement |
| 2026-08-11 | מבנה audit → target → migration; boundaries per route group; webhook alerting; settlement reconciliation dashboard; uptime; שמירת QA-PASS |
