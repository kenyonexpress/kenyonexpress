# ARCHITECTURE-OBSERVABILITY: ניטור, התראות ותגובה לתקריות

תאריך: 2026-07-17 | סטטוס: **מסמך הכרעות מחייב, design only** (לא נכתב קוד, לא נוצרה מיגרציה, לא הותקן שירות חיצוני)
מחבר: ארכיטקט observability ותגובה לתקריות
כפיפות סמכות: כפוף ל-`docs/MASTER-ARCHITECTURE.md` (v3) ול-`docs/ARCHITECTURE-SECURITY.md`. מרחיב את `docs/ARCHITECTURE-PRODUCTION-OPS.md` סעיף 5 וגובר עליו בפרטי המימוש של ניטור והתראות. חוזי ה-API כפופים ל-`docs/ARCHITECTURE-API-CONTRACTS.md` (המסמך הזה לא משנה אף חוזה, רק מוסיף routes חדשים בתבנית L2).
הקשר: מיזם בבעלות מפעיל יחיד. אין צוות, אין NOC. כל הכרעה כאן מותאמת לאדם אחד עם טלפון.

---

## 0. רישום הכרעות (OBS-01..OBS-22)

| # | הכרעה | סעיף |
|---|-------|------|
| OBS-01 | Error tracking: **Sentry** (`@sentry/nextjs`), errors בלבד, בלי tracing ובלי Replay | 1.1 |
| OBS-02 | Source maps דרך `withSentryConfig` + אינטגרציית Sentry ב-Vercel Marketplace, מחיקה אחרי העלאה | 1.2 |
| OBS-03 | טקסונומיית שגיאות בארבעה דומיינים קשיחים: `payment` / `coupon` / `webhook` / `rls`, tag בשם `domain` על כל אירוע | 1.3 |
| OBS-04 | שלוש דרגות חומרה בלבד: SEV1 / SEV2 / SEV3, עם ניתוב ערוצים קבוע | 1.5, 4.1 |
| OBS-05 | לוגים מובנים: JSON שורה אחת לאירוע, לוגר יחיד ב-`src/lib/log.ts`, אסור `console.log` חופשי בנתיבי כסף | 2.1 |
| OBS-06 | הלוגים הם אבחון בלבד; ראיות משפטיות/כספיות חיות אך ורק בטבלאות append-only ב-DB (audit_log, security_events, payment_webhook_events, coupon_scan_events) | 2.0 |
| OBS-07 | רשימת שדות אסורים בלוגים ובאירועי Sentry (סעיף 2.3), אכיפה ב-scrubber אחד משותף | 2.3 |
| OBS-08 | Retention לוגים: Vercel runtime קצר-טווח, drain ל-Better Stack Logs עם יעד 30 יום; ראיות DB לפי טבלת ה-retention של LEGAL סעיף 5 | 2.4 |
| OBS-09 | כלי uptime + סינתטיקה + סטטוס + on-call: **Better Stack** (הוכרע; Checkly ו-Vercel native נדחו) | 3.1 |
| OBS-10 | `/api/health` נשאר רדוד ופומבי (חוזה L1); בדיקות עומק רצות רק בתוך cron מאומת | 3.2 |
| OBS-11 | Cardcom heartbeat: cron ייעודי מול טרמינל sandbox כל 15 דקות, מדווח ל-heartbeat של Better Stack | 3.4 |
| OBS-12 | פרוב סריקת קופון: קוד שמור `00000000` + משתמש probe ייעודי, כל 10 דקות | 3.5 |
| OBS-13 | מנוע ההתראות העסקיות: cron יחיד `/api/cron/alerts` כל 15 דקות שקורא `v_money_alarms` + בדיקות סף נוספות | 4.2 |
| OBS-14 | ספי התראה מספריים קבועים (טבלה 4.3); שינוי סף = עדכון המסמך הזה באותו commit | 4.3 |
| OBS-15 | ערוצי התראה לבעלים בשני שלבים: שלב A (עד שתשתית 031 חיה): Better Stack push/מייל/שיחת טלפון; שלב B: WhatsApp דרך `notifications_outbox` בנוסף | 4.4 |
| OBS-16 | שמונה runbooks מחייבים (סעיף 5), כל תקרית מתועדת ב-`security_events` + קובץ תחקיר | 5.0 |
| OBS-17 | סדר התאוששות מחייב (ירושה מ-TESTING סעיף 5.4): kill switch ואז rollback אפליקציה ואז DB | 5.0 |
| OBS-18 | דף סטטוס ציבורי: Better Stack Status Page על `status.kenyonexpress.co.il`, 4 רכיבים | 6.1 |
| OBS-19 | מודל on-call ליחיד: SEV1 מעיר בטלפון 24/7, SEV2 בשעות ערות בלבד, SEV3 בדייג'סט בוקר | 6.2 |
| OBS-20 | תרגולת חודשית: fire drill להתראות + תרגיל שחזור גיבוי, מתועדים ב-STATE.md | 6.4 |
| OBS-21 | מיגרציית observability עתידית תיקח את המספר הפנוי הבא בעת הכתיבה (כרגע 040, אחרי 036 vendors / 037 legal / 038 perf / 039 agents), לפי משמעת המספור של MASTER 1.19 | 7.2 |
| OBS-22 | תקציב אירועי Sentry: errors תמיד, warnings בדגימת 10%; חריגה מ-4,000 אירועים בחודש = משימת ניקוי רעש לפני כל פיצ'ר | 1.4 |

---

## 1. Error tracking: Sentry

### 1.1 מה הותקן ולמה (OBS-01)

PRODUCTION-OPS סעיף 5.1 כבר הכריע Sentry. כאן נסגר המימוש המלא:

- חבילה: `@sentry/nextjs` (גרסה עדכנית התומכת ב-Next 16 App Router).
- **errors בלבד**: `tracesSampleRate: 0`. ביצועים נמדדים ב-Vercel Speed Insights (הכרעת PERFORMANCE D-9); אין צורך בכפילות שתשרוף את מכסת 5k אירועים/חודש של ה-free tier.
- **Session Replay כבוי**: סיכון PII ומכסה. לא מפעילים.
- **Sentry Cron Monitors כבויים**: ניטור crons נעשה ב-heartbeats של Better Stack (סעיף 3.6), מקור אמת אחד.
- `sendDefaultPii: false` תמיד.
- `environment` נלקח מ-`VERCEL_ENV` (production / preview / development). Preview שולח לאותו פרויקט עם environment נפרד; development לא שולח כלל (`enabled: process.env.NODE_ENV === 'production'` בצד לקוח, ובשרת רק כש-`VERCEL_ENV` קיים).

קבצים (לפי קונבנציות Next 16.2.4 כפי שאומתו ב-`node_modules/next/dist/docs/`; אין `sentry.client.config.ts` בדפוס הישן):

```
src/instrumentation.ts          <- register() + onRequestError
src/instrumentation-client.ts   <- Sentry.init לדפדפן + onRouterTransitionStart
src/app/global-error.tsx        <- לכידת קריסות render ברמת השורש
next.config.ts                  <- עטיפת withSentryConfig
```

```ts
// src/instrumentation.ts
import * as Sentry from '@sentry/nextjs'

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    Sentry.init({
      dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
      environment: process.env.VERCEL_ENV ?? 'development',
      enabled: Boolean(process.env.VERCEL_ENV),
      tracesSampleRate: 0,
      sendDefaultPii: false,
      beforeSend: scrubEvent, // סעיף 2.3, scrubber משותף
    })
  }
}

// לכידת כל שגיאת שרת: RSC render, route handlers, server actions, proxy
export const onRequestError = Sentry.captureRequestError
```

```ts
// src/instrumentation-client.ts
import * as Sentry from '@sentry/nextjs'

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NEXT_PUBLIC_VERCEL_ENV ?? 'development',
  enabled: process.env.NODE_ENV === 'production',
  tracesSampleRate: 0,
  sendDefaultPii: false,
  beforeSend: scrubEvent,
})

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart
```

הערת יישום: `onRequestError` של Next 16 מדווח גם על שגיאות בהקשר `routeType: 'proxy'`, כלומר כשלים ב-`src/proxy.ts` (רענון session, CSP) נלכדים בלי קוד נוסף. חשוב כי PERFORMANCE ציין ש-`proxy.ts` עוד לא קיים בפועל; ביום שייכתב הוא מנוטר אוטומטית.

### 1.2 Source maps על Vercel (OBS-02)

1. התקנת אינטגרציית **Sentry מ-Vercel Marketplace** על הפרויקט: מזריקה `SENTRY_AUTH_TOKEN` אוטומטית לסביבת ה-build (לא רץ בדפדפן, לא נחשף).
2. `next.config.ts`:

```ts
import { withSentryConfig } from '@sentry/nextjs'

export default withSentryConfig(withNextIntl(nextConfig), {
  org: 'kenyonexpress',
  project: 'kenyonexpress-web',
  silent: true,
  widenClientFileUpload: true,
  sourcemaps: { deleteSourcemapsAfterUpload: true }, // לא משאירים .map ב-deploy הציבורי
  tunnelRoute: '/monitoring', // עוקף adblockers; route פנימי, RL3
  disableLogger: true,
})
```

3. משתני סביבה חדשים (מתווספים לטבלת PRODUCTION-OPS 1.2): `NEXT_PUBLIC_SENTRY_DSN` (public), `SENTRY_AUTH_TOKEN` (build בלבד, מנוהל ע"י האינטגרציה), `SENTRY_ORG`, `SENTRY_PROJECT`.
4. אימות: אחרי ה-deploy הראשון עם Sentry, זורקים שגיאת בדיקה (`/api/health?boom=1` זמני ב-preview) ומוודאים stack trace ממופה עם שמות קבצים מקוריים.

### 1.3 טקסונומיית שגיאות (OBS-03)

כל אירוע Sentry מקבל שלושה tags חובה: `domain`, `api_error_code` (מתוך 16 הקודים של API-CONTRACTS 2.2 כשקיים), `request_id` (סעיף 2.2). fingerprint נקבע ידנית בנתיבי הכסף כדי שאותה תקלה לא תתפצל למאה issues.

| domain | מה נכנס | רמה | fingerprint |
|--------|---------|-----|-------------|
| `payment` | חריגות ב-`beginCheckout` / `chargeWithToken` / `refundPayment`; `PAYMENT_PROVIDER_ERROR`; timeout מול Cardcom; כשל יצירת Low Profile | error (קריסת checkout מלאה: fatal) | `['payment', api_error_code]` |
| `webhook` | חתימה לא תקינה (`SIGNATURE_INVALID`), פער אימות מול ה-API (`verified_against_api=false`), חריגת עיבוד אחרי persist, webhook לתשלום לא מוכר | error, וחתימה שגויה גם `security_events` severity critical (כבר מוכרע ב-API-CONTRACTS D3) | `['webhook', provider, failure_kind]` |
| `coupon` | חריגות RPC ב-`redeem_coupon` (לא תוצאות עסקיות!), rate limit fail-closed שנפל על שגיאת RPC, כשל חתימת QR ביום ההנפקה | error | `['coupon', failure_kind]` |
| `rls` | שגיאות Postgres `42501` (denial) ו-`PGRST` ממסלולי קוד לגיטימיים | warning | `['rls', table_name]` |

כללים:

- תוצאות עסקיות של סריקה (`not_found`, `already_used`, `expired`, `wrong_supplier`, `rate_limited`) הן **לא** שגיאות ולא נשלחות ל-Sentry. מקור האמת שלהן הוא `coupon_scan_events`, וההתראות עליהן עסקיות (סעיף 4.3).
- כל החלטת rate-limit שנכשלה ברמת RPC מדווחת ל-Sentry כ-warning עם tag `rate_limit_action` (דרישת MASTER 1.29: ה-fail-open השקט של היום הוא בדיוק מה שאסור שיחזור).
- `RLS denial` בנפח חריג = או באג רגרסיה או סריקה עוינת; שניהם מטופלים בסף 4.3 שורה 12.
- דומיינים משניים (`auth`, `notifications`, `cron`, `catalog`) מקבלים tag domain גם כן, בלי fingerprint ידני.

### 1.4 תקציב מכסה (OBS-22)

Free tier = 5k אירועים/חודש. משמעת: errors נשלחים תמיד; warnings נדגמים 10% (ב-`beforeSend`, דטרמיניסטי לפי `event_id`); `ignoreErrors` כולל רעש דפדפן מוכר (`AbortError`, `ResizeObserver loop`, כשלי רשת של סורקים). אם צריכת החודש עוברת 4,000: משימת ניקוי רעש נפתחת לפני כל פיצ'ר. אין שדרוג plan לפני שיש הכנסה שמצדיקה.

### 1.5 חוקי Alert בתוך Sentry (OBS-04)

Sentry הוא גלאי, לא מנתב. שלושה חוקים בלבד, כולם שולחים למייל הבעלים:

1. Issue חדש עם tag `domain:payment` או `domain:webhook` -> מייל מיידי (זה SEV2 בטבלת 4.1; אם מלווה בנפילת uptime זה SEV1 דרך Better Stack).
2. כל issue עם יותר מ-50 אירועים בשעה -> מייל מיידי (רגרסיה רוחבית, כנראה deploy שבור).
3. Regression (issue שנסגר וחזר) -> מייל.

כל השאר נצפה בסקירה השבועית (6.3). אין חיבור Sentry ל-WhatsApp; ניתוב חכם עושה רק שכבת ההתראות של סעיף 4.

---

## 2. אסטרטגיית לוגים

### 2.0 עיקרון העל (OBS-06)

שני מישורים, בהקבלה לעיקרון שני המישורים של ANALYTICS-BI:

- **ראיות** (מי עשה מה בכסף): אך ורק טבלאות append-only ב-DB: `audit_log`, `security_events`, `payment_webhook_events`, `coupon_scan_events`, `wallet_transactions`, `consent_events`. Retention לפי LEGAL סעיף 5 (7 שנים / לנצח). לוג טקסט לעולם אינו הראיה.
- **אבחון** (למה זה קרה, כמה זמן זה לקח): לוגים מובנים קצרי-חיים. מותר לאבד אותם בלי נזק משפטי.

### 2.1 פורמט (OBS-05)

לוגר יחיד `src/lib/log.ts` (עטיפה דקה על `console.log` עם JSON.stringify; בלי תלות חיצונית, pino מיותר בסביבת serverless). שורה אחת לאירוע:

```json
{
  "ts": "2026-07-17T18:22:05.123Z",
  "level": "info",
  "event": "checkout.begin.ok",
  "request_id": "9f6c1e2a-...",
  "domain": "payment",
  "user_id": "uuid",
  "order_id": "uuid",
  "payment_id": "uuid",
  "amount_ils": 129.9,
  "duration_ms": 412,
  "outcome": "ok"
}
```

שדות חובה: `ts`, `level` (`info|warn|error`), `event` (snake_case, `<flow>.<step>.<outcome>`), `request_id`, `domain`. שדות מזהים: UUID בלבד. `console.log` חופשי אסור בקבצי `src/server/actions/payments/`, `src/app/api/**` ו-`src/lib/supabase/admin.ts` (נאכף ב-biome rule בהמשך).

### 2.2 קורלציה: request_id

- `src/proxy.ts` (כשייכתב) מייצר `request_id = crypto.randomUUID()` לכל בקשה נכנסת וקובע אותו ב-header ‏`x-request-id`.
- הלוגר קורא אותו, Sentry מקבל אותו כ-tag, ו-`ApiError.details.incident_id` (API-CONTRACTS 2.2) מוגדר בזאת = `request_id`. זה סוגר את הפער שהמסמכים השאירו פתוח (איפה חי ה-incident_id): המשתמש רואה מזהה, ואיתו מאתרים את הלוג ואת אירוע ה-Sentry באותה בקשה.

### 2.3 מה חובה ללוג פר זרימה קריטית

| זרימה | אירועי חובה | שדות |
|-------|-------------|------|
| Checkout | `checkout.begin.start`, `checkout.begin.ok/fail`, `checkout.lp_created`, `order.expired` | cart_id, order_id, payment_id, cardcom_low_profile_id, amount_ils, wallet_applied_ils, api_error_code, rate_limit decision |
| Webhook | `webhook.received`, `webhook.persisted`, `webhook.verified.ok/mismatch`, `webhook.finalized`, `webhook.replay_ignored` | external_event_id, payment_id, signature_valid, verified_against_api, duration_ms |
| מימוש קופון | `redeem.request`, `redeem.result` | coupon_code_id (לא הקוד!), supplier_id, scanned_by, result, duration_ms. הפירוט המלא ממילא ב-`coupon_scan_events` |
| ארנק | `wallet.transfer.ok/fail` על כל קריאת `fn_wallet_transfer` מהאפליקציה | reason, idempotency_key, amount_ils, debit/credit account UUIDs |
| Payout | `payout.generate/approve/mark_paid/cancel` | statement_number, supplier_id, total_payout_ils, actor user_id |
| Cron | `cron.<name>.ok/fail` בסוף כל ריצה | processed, duration_ms |
| Auth | `auth.login.fail`, `auth.rate_limited` | user_id אם ידוע, ip_trunc בלבד |

### 2.3.1 חוקי עריכת PII (OBS-07), לפי חוק הגנת הפרטיות + תיקון 13

מאגר בסיווג "רמת אבטחה בינונית" (LEGAL 1.3). עקרון צמצום המידע חל גם על לוגים. **אסור שיופיעו בלוג או באירוע Sentry**:

1. שם מלא, אימייל, טלפון, כתובת ‏(billing/shipping)
2. IP מלא (מותר `ip_trunc` ‏/24 בלבד, ורק היכן שיש צורך אבטחתי)
3. קוד קופון 8 ספרות ו-`qr_token` (רגישים תפעולית; לוגים מזהים רק `coupon_code_id`)
4. `cardcom_token`, פרטי כרטיס מכל סוג (ממילא אסורים ב-DB שלנו מחוץ ל-payment_tokens, הכרעת SAQ-A), מספרי חשבון בנק של ספקים
5. Headers: ‏`authorization`, ‏`cookie`, גוף בקשות (request body) בשלמותו
6. `raw_response` של Cardcom (נשאר רק בעמודה בטבלת payments)
7. תוכן הודעות (notifications payload), פרטי consent

אכיפה: פונקציה אחת `scrubEvent` ב-`src/lib/log.ts` משמשת גם את `beforeSend` של Sentry וגם את הלוגר: מוחקת מפתחות ברשימה שחורה (`email`, `phone`, `name`, `address`, `code`, `token`, `authorization`, `cookie`, `body`), ומפעילה regex לניקוי תבניות אימייל וטלפון ישראלי (`05X-XXXXXXX`) מכל string. מחיקת חשבון (`fn_execute_account_deletion`) לא צריכה לגעת בלוגים: הם פוקעים לבד בתוך חלון ה-retention הקצר, וזה חלק מההצדקה להכרעת OBS-08.

### 2.4 Retention ‏(OBS-08)

| שכבה | היכן | משך | הערה |
|------|------|-----|------|
| Vercel runtime logs | Vercel | שעות עד ימים (לפי plan) | חיפוש נקודתי מיידי בלבד |
| Log Drain -> Better Stack Logs | Better Stack | יעד 30 יום (לפי tier; מינימום free 3 ימים מקובל עד ההשקה המסחרית, שדרוג tier לוגים נכנס לתקציב ההשקה) | האבחון ההיסטורי |
| Sentry issues | Sentry | 90 יום (ברירת מחדל) | |
| ראיות DB | Supabase | לפי LEGAL סעיף 5 (7 שנים / לנצח / 90 יום לפי טבלה) | מקור האמת |

Log Drain מ-Vercel דורש Vercel Pro; Pro ממילא חובה (cron + Speed Insights, PRODUCTION-OPS 6.2), אין עלות החלטה חדשה.

---

## 3. Uptime וניטור סינתטי

### 3.1 הכרעת הכלי (OBS-09): Better Stack

הוכרע **Better Stack**. נימוק קצר מול החלופות שנדחו:

- **Checkly**: הסינתטיקה החזקה בשוק (Playwright checks), אבל אין דף סטטוס, אין on-call עם שיחות טלפון, והתמחור מיועד לצוותים. עודף כוח בדיוק במקום הלא נכון ליחיד.
- **Vercel native (Observability/Monitoring)**: אין בדיקה מחוץ לפלטפורמה (כש-Vercel נופל, הניטור נופל איתו), אין heartbeats ל-crons, אין דף סטטוס, אין אסקלציית טלפון.
- **Better Stack**: monitor-ים חיצוניים, heartbeats, דף סטטוס מתארח, אפליקציית מובייל עם push, ואסקלציה בשיחת טלפון, הכול ב-tier חינמי/זול אחד, וכבר הוזכר כמועמד ב-PRODUCTION-OPS 5.2. שירות אחד = מערכת עצבים אחת למפעיל יחיד.

חשבון אחד, ארבעה שימושים: Uptime monitors, Heartbeats, Status page (סעיף 6.1), Logs (drain, סעיף 2.4).

### 3.2 נקודות health ‏(OBS-10)

- `GET /api/health` נשאר בדיוק כחוזה L1 של API-CONTRACTS: ללא auth, `select 1` דרך anon client, ‏`{ ok, db }`, ‏503 בכשל. הוא ה-target של ה-monitor הראשי. אסור להוסיף לו בדיקות עומק: הוא חייב להיות זול (רץ כל 30 שניות) ולא לחשוף מבנה פנימי.
- בדיקות עומק (partition ברירת מחדל ריקה, backlog של outbox, crons בזמן) רצות בתוך `/api/cron/alerts` המאומת (סעיף 4.2), לא בנקודה פומבית.

### 3.3 רשימת ה-monitors (תדירות / תנאי כשל / חומרה)

| # | Monitor | תדירות | כשל | חומרה |
|---|---------|--------|------|-------|
| M1 | `GET https://kenyonexpress.co.il/` (דף הבית, מאזור EU) | 30 שניות | סטטוס לא-2xx או > 10 שניות, פעמיים ברצף | SEV1 |
| M2 | `GET https://kenyonexpress.co.il/api/health` | 30 שניות | ‏`ok:false`/503/timeout פעמיים ברצף | SEV1 (זה גם גלאי Supabase down: PPR מסתיר נפילת DB בדפים סטטיים, ההערה של PERFORMANCE 6.2) |
| M3 | `GET /he/products` (דף רשימה דינמי-חלקית) | 5 דקות | לא-2xx | SEV2 |
| M4 | `GET https://kenyonexpress.co.il/api/supplier/redeem` (בלי session; מצפים ל-401 מהיר) | 5 דקות | כל תשובה שאינה 401 בתוך 3 שניות | SEV2 (מוכיח שה-route חי ושכבת ה-auth עובדת) |
| M5 | תעודת TLS + תפוגת דומיין | יומי | < 14 יום לתפוגה | SEV3 |

בנוסף: הרשמה להתראות הסטטוס הרשמיות של Supabase ושל Vercel (מייל), כולל ההתראה הקריטית על project pause (PRODUCTION-OPS 5.2).

### 3.4 Cardcom sandbox heartbeat ‏(OBS-11)

route חדש בתבנית L2: `POST /api/cron/cardcom-heartbeat`, כל 15 דקות (Vercel cron, ‏`CRON_SECRET`):

1. יוצר בקשת Low Profile בטרמינל ה-**sandbox** ‏(`CARDCOM_SANDBOX_*`, סט env נפרד; ה-fake המקומי של הבדיקות לעולם לא מוגדר בפרודקשן, TESTING 5.3) על 1 ש"ח, בלי לגעת בטרמינל הפרודקשן ובלי ליצור עסקאות אמת.
2. מודד latency; הצלחה = קיבלנו URL תקין בתוך 5 שניות.
3. הצלחה -> ‏GET ל-URL ה-heartbeat ‏(`BETTERSTACK_HEARTBEAT_CARDCOM`); כשל -> ‏`/fail`.
4. Better Stack מכריז תקרית אחרי 2 כשלים רצופים (30 דקות) -> SEV2 "Cardcom degraded". שילוב עם ספייק תשלומים כושלים (4.3 שורה 1) מעלה ל-SEV1 ומפעיל את runbook 5.1.

הערה: heartbeat על sandbox מגלה נפילת פלטפורמה של Cardcom, לא בעיה בטרמינל הפרודקשן שלנו; את זו מגלים דרך ספייק כשלונות אמיתי ודרך `payments-reconcile`. שני הגלאים ביחד מכסים.

### 3.5 פרוב מימוש קופון (OBS-12)

route חדש: `POST /api/cron/synthetic-scan`, כל 10 דקות:

1. משתמש probe ייעודי (`probe@kenyonexpress.co.il`, נוצר ידנית, חבר `supplier_members` בתפקיד `scanner` אצל ספק סינתטי "KE Probe" בסטטוס `active`, בלי קופונים אמיתיים) מבצע קריאת RPC ‏`redeem_coupon('00000000', 'manual')` עם session אמיתי.
2. תוצאה תקינה = `not_found` בתוך 800ms. כל דבר אחר (שגיאת RPC, ‏timeout, ‏`rate_limited` בלתי צפוי) = כשל.
3. דיווח ל-heartbeat ‏`BETTERSTACK_HEARTBEAT_SCAN`; שני כשלים רצופים -> SEV2 (מסלול המימוש מושבת: ספקים עומדים מול לקוחות בקופה).
4. הקוד `00000000` מוגדר קוד שמור: מיגרציית ה-observability (OBS-21) תוסיף CHECK/guard בהנפקה ש-`code <> '00000000'` כדי שלעולם לא יונפק ללקוח.
5. תדירות 10 דקות = 144 סריקות probe ביום ב-`coupon_scan_events`; ה-rollup האנליטי מסנן אותן לפי `supplier_id` של ספק ה-probe (מתווסף לרשימת הסינון של צוות ובוטים, ANALYTICS 033).

### 3.6 Heartbeats לכל ה-crons

כל route תחת `/api/cron/*` (הטבלה המלאה ב-API-CONTRACTS L2) מסיים ריצה מוצלחת ב-GET ל-heartbeat הייעודי שלו ב-Better Stack, עם חלון סבלנות = פי 2 מהתדירות. ככה "cron שמת בשקט" (הכשל השקט המסוכן ביותר אצל יחיד) הופך להתראה תוך מחזור אחד. קריטיים במיוחד: `payments-reconcile` (רשת הביטחון של webhooks), `expire-orders`, `notifications-worker`, ‏`alerts` עצמו (מי שומר על השומר: ה-heartbeat).

---

## 4. התראות עסקיות (כסף אמיתי)

### 4.1 דרגות חומרה וניתוב (OBS-04, OBS-15)

| דרגה | הגדרה | ערוץ שלב A (היום) | ערוץ שלב B (אחרי 031 + ספקי שליחה חיים) | זמן תגובה נדרש |
|------|--------|--------------------|------------------------------------------|----------------|
| SEV1 | כסף נשבר / האתר למטה / חשד לשחיתות דאטה | Better Stack: ‏push -> אחרי 2 דקות ללא אישור: שיחת טלפון. 24/7 | + הודעת WhatsApp מפורטת דרך `notifications_outbox` | מיידי, גם בלילה |
| SEV2 | זרימה אחת פגועה / דגרדציה | Better Stack push + מייל, בשעות 08:00-23:00; בלילה ממתין לבוקר אלא אם הצטבר ל-SEV1 | + WhatsApp | תוך שעתיים בשעות ערות |
| SEV3 | אנומליה / חוב תפעולי | דייג'סט מייל יומי 08:00 | דייג'סט WhatsApp 08:00 | באותו יום עבודה |

שלב A קיים מהיום הראשון בלי שום תשתית שליחה משלנו (Better Stack שולח). שלב B מוסיף את הפירוט העשיר בעברית ל-WhatsApp של הבעלים דרך ה-outbox (template ‏`owner_alert`, ‏utility, לא שיווקי; דורש את 031 מוחלת + Resend + Meta Cloud API חיים).

### 4.2 המנוע (OBS-13): `/api/cron/alerts`

route בתבנית L2, כל 15 דקות, service client:

1. קורא `v_money_alarms` (033): failed_payments_24h, invalid_webhook_signatures_24h, payments_stuck_redirected_10m, pending_orders_past_expiry_1h, wallet_ledger_drift_accounts, analytics_default_partition_rows.
2. מריץ את בדיקות הסף הנוספות של 4.3 (SQL ישיר על טבלאות ה-ledger; לעולם לא על analytics_events, עקרון שני המישורים).
3. כל הפרת סף: כותב שורת `security_events` ‏(דרך `fn_log_security_event`, ‏severity לפי הדרגה) עם snapshot הערכים ב-metadata; דדופ: לא כותב אם קיימת שורה פתוחה זהה מ-6 השעות האחרונות (מפתח: event_type + entity).
4. הפרה חדשה ברמת SEV1/SEV2: ‏POST ל-heartbeat ‏`/fail` ייעודי (`BETTERSTACK_HEARTBEAT_ALERTS_SEV1` / `..._SEV2`) עם תקציר; Better Stack מנתב לפי 4.1. שלב B: בנוסף `notification_events` עם dedupe_key.
5. SEV3 נצברים ונשלחים בדייג'סט אחד ב-08:00 (ריצת ה-cron הראשונה אחרי 08:00 אוספת את כל מה שנפתח מאתמול).
6. סוף ריצה: ‏heartbeat תקין ל-`BETTERSTACK_HEARTBEAT_ALERTS` (ריצה שנכשלה = התראה על מנוע ההתראות עצמו).

### 4.3 טבלת הספים המחייבת (OBS-14)

מספרים מכוילים לעסק בתחילת דרכו (עשרות הזמנות ביום, לא אלפים). כיול מחדש: אחרי חודש של דאטה אמיתי, ואז אחת לרבעון, בעדכון המסמך הזה.

| # | התראה | תנאי מדויק (SQL על טבלאות ledger) | דרגה |
|---|-------|-----------------------------------|------|
| 1 | ספייק תשלומים כושלים | `payments.status='failed'` ‏>= 3 ב-15 דקות, או >= 30% מניסיונות החיוב בשעה כשיש >= 5 ניסיונות | SEV2 |
| 2 | Cardcom כנראה למטה | >= 10 כשלונות ב-15 דקות, או >= 3 כשלי `checkout.lp_created` רצופים, או heartbeat 3.4 נפל יחד עם שורה 1 | SEV1 -> runbook 5.1 |
| 3 | חתימת webhook שגויה | `invalid_webhook_signatures_24h` ‏>= 1 | SEV2 (אבטחה: זיוף או רוטציית secret שנשברה) |
| 4 | Webhook backlog | `payments_stuck_redirected_10m` ‏>= 5 בו-זמנית, או reconcile heartbeat נעדר פעמיים | SEV2 -> runbook 5.3 |
| 5 | Cron expiry מת | `pending_orders_past_expiry_1h` ‏>= 1 | SEV3 |
| 6 | אנומליית מימוש: ספק | לספק בודד בשעה: `wrong_supplier` + `rate_limited` ‏>= 10 ב-`coupon_scan_events` | SEV2 (הונאה או תקלת שטח) |
| 7 | אנומליית מימוש: replay | ‏`already_used` ‏>= 5 בשעה גלובלית, או ניסיון INSERT כפול ל-`coupon_redemptions` (הפרת ה-UNIQUE נלכדת כ-exception) | SEV2 -> runbook 5.4 |
| 8 | סחף ארנק מול ledger | ‏`wallet_ledger_drift_accounts` ‏>= 1 (ה-cache ב-`wallet_accounts.balance_ils` לא שווה לסכימת `wallet_transactions`) | **SEV1** -> runbook 5.8 |
| 9 | ארנק מול הזמנות | פער בין `sum(orders.cashback_applied_ils)` של היום לבין `sum(wallet_transactions.amount_ils) where reason='order_spend'` של היום > 1 ש"ח | SEV1 -> runbook 5.8 |
| 10 | עליית התחייבות חריגה | ‏`v_wallet_liability` קפץ > 20% וגם > 1,000 ש"ח מאתמול | SEV3 |
| 11 | אי-התאמת payout | ‏`cardcom_settlement_txns.match_status` ב-`unmatched`/`amount_mismatch` ‏>= 1 | SEV3 בדייג'סט + חסימה תפעולית של `approve_payout_statement` לתקופה (הכלל הקיים של SUPPLIER 5.3); statement עם `total_payout_ils <> sum(lines)` = SEV1 (אמור להיות בלתי אפשרי) |
| 12 | ספייק RLS denials | ‏>= 20 אירועי `42501` בשעה ב-Sentry | SEV3 (באג או probing) |
| 13 | Partition ברירת מחדל | ‏`analytics_default_partition_rows` ‏>= 1 | SEV3 |
| 14 | Expiry sweep מפגר | ‏`v_coupon_expiry_liability.overdue_not_swept` ‏> 0 | SEV3 |
| 15 | Outbox גוסס | ‏`notifications_outbox.status='dead'` חדש >= 1, או delivery rate יומי < 95% מייל / < 90% ‏WhatsApp ‏(`v_notification_kpis`) | SEV3 |

### 4.4 יעד ההתראות

יעד יחיד: הבעלים. הטלפון והמייל מוגדרים ב-Better Stack (לא ב-env). כשיהיה עובד ראשון: מוסיפים אותו כ-escalation שני ב-Better Stack, בלי לגעת בקוד. זהו. אין PagerDuty, אין Slack.

---

## 5. Runbooks: שמונה תרחישים (OBS-16, OBS-17)

כללים לכל תקרית:

- **סדר התאוששות מחייב** (TESTING 5.4): ‏(1) kill switch לתשלומים, (2) ‏rollback אפליקציה, (3) רק בסוף DB. לעולם לא בסדר הפוך.
- כל תקרית SEV1/SEV2 נפתחת ונסגרת עם שורת `security_events`, ואחריה קובץ תחקיר קצר `docs/incidents/YYYY-MM-DD-<slug>.md` (התיקייה תיווצר עם התקרית הראשונה; לא נוצרת עכשיו בגלל עבודת הקונסולידציה ב-docs/).
- אירוע אבטחה עם חשש לפגיעת פרטיות: החלטת דיווח לרשות להגנת הפרטיות בתוך **72 שעות** (LEGAL 1.3). זה שעון נפרד מהתיקון הטכני.
- פקודות ה-kill switch (מופיעות שוב ושוב, מובאות פעם אחת):

```bash
# Terminal, מהשורש. השבתת checkout (הדפדוף נשאר חי):
vercel env rm CHECKOUT_ENABLED production -y
echo "false" | vercel env add CHECKOUT_ENABLED production
vercel redeploy --prod
# הפעלה מחדש: אותו דבר עם "true"
```

### 5.1 Cardcom למטה

- **זיהוי**: התראה 4.3#2 (ספייק כשלונות + heartbeat sandbox נפל). אימות: דף הסטטוס של Cardcom, ניסיון checkout ידני.
- **בלימה**: ‏kill switch (למעלה) בתוך 10 דקות מהאימות: עדיף "החנות סגורה זמנית לתשלומים" מאשר לקוחות תקועים ב-redirect. הדפדוף, הקופונים שכבר נקנו והמימוש אצל ספקים ממשיכים לעבוד.
- **rollback**: אין (התקלה חיצונית). אחרי התאוששות: הפעלת checkout מחדש + ריצה ידנית של reconcile לתפוס עסקאות שהושלמו בצד Cardcom בזמן התקלה:

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" https://kenyonexpress.co.il/api/cron/payments-reconcile
```

- **תקשורת** (דף סטטוס + באנר באתר): ‏"עדכון: חלה תקלה זמנית אצל ספק הסליקה שלנו. לא ניתן לבצע רכישות חדשות ברגעים אלה. קופונים שנרכשו בעבר תקפים וניתנים למימוש כרגיל. אנחנו עוקבים ונעדכן ברגע שהתקלה תיפתר. תודה על הסבלנות."
- **חזרה לשגרה**: heartbeat ירוק 30 דקות, עסקת אמת אחת מוצלחת, ‏reconcile נקי.

### 5.2 Supabase למטה

- **זיהוי**: ‏M2 ‏(`/api/health` ‏503) יחד עם M1 אולי עדיין ירוק (PPR מגיש דפים סטטיים מה-CDN; אל תתבלבל: האתר "נראה חי" אבל הכול דינמי מת).
- **בלימה**: לבדוק status.supabase.com. אם תקלת פלטפורמה: אין מה לתקן אצלנו; ‏kill switch כדי למנוע checkout חצוי, עדכון דף סטטוס. אם **project paused** ‏(free tier): ‏Restore מיידי מה-dashboard, וזה טריגר לשדרוג Pro באותו יום (PRODUCTION-OPS 6.2 קבע ש-Pro חובה לפני תשלום ראשון בכל מקרה).
- **rollback**: אין. אחרי חזרה: ‏reconcile ידני (כמו 5.1), בדיקת `v_money_alarms`, ווידוא ש-crons השלימו סבב.
- **תקשורת**: ‏"עקב תקלה אצל ספק התשתית, חלק מהפעולות באתר (התחברות, רכישה, אזור אישי) אינן זמינות זמנית. הדפדוף באתר ממשיך לעבוד. אנחנו במעקב צמוד ונעדכן בהקדם."
- **חזרה לשגרה**: ‏health ירוק 15 דקות + כל ה-heartbeats של crons ירוקים בסבב הבא.

### 5.3 Webhook backlog (תשלומים תקועים)

- **זיהוי**: התראה 4.3#4: ‏>= 5 תשלומים ב-`redirected` מעל 10 דקות, או heartbeat של reconcile נעדר.
- **בלימה**: (1) ריצת reconcile ידנית (פקודה ב-5.1). ‏(2) אם reconcile עצמו נכשל: לבדוק לוגי function ב-Vercel ו-Sentry ‏domain:webhook. חשודים מיידיים: רוטציית `CARDCOM_WEBHOOK_SECRET` שלא הושלמה (חתימות נדחות: יופיע בהתראה 4.3#3 במקביל), שינוי כתובת ה-webhook אצל Cardcom, deploy ששבר את ה-route. (3) לזכור: החוזה הוא persist-first + return 200; האירועים שמורים ב-`payment_webhook_events` גם אם העיבוד קרס, אז אין אובדן דאטה, רק עיכוב.
- **rollback**: אם זה deploy: ‏`vercel rollback` ‏(Instant). אם זה secret: השלמת הרוטציה בשני הצדדים.
- **תקשורת** (רק אם לקוחות שילמו ולא קיבלו קופון מעל 15 דקות, מייל טרנזקציוני ללקוחות הרלוונטיים): ‏"שילמת? ההזמנה בדרך. עקב עומס זמני, אישור ההזמנה והקופון שלך מתעכבים בכמה דקות. אין צורך לשלם שוב. אם לא קיבלת אישור בתוך שעה, כתבו לנו ונטפל מיד."
- **חזרה לשגרה**: ‏`payments_stuck_redirected_10m = 0` בשתי ריצות alerts רצופות.

### 5.4 חשד למימוש כפול

- **זיהוי**: התראה 4.3#7, או דיווח ספק "הקוד הזה כבר מומש אצלי". לזכור: מימוש כפול אמיתי בלתי אפשרי ברמת DB ‏(CAS אטומי על `status='issued'` + ‏UNIQUE על `coupon_redemptions.coupon_code_id`). לכן חשד = או הונאה (לקוח מציג צילום מסך ישן), או באג UI, או ספק שסורק פעמיים בתום לב.
- **בלימה**: (1) שליפת התמונה המלאה:

```sql
-- Supabase > SQL Editor
select cse.created_at, cse.result, cse.scan_method, cse.scanned_by, cse.supplier_id, cse.metadata
from coupon_scan_events cse
where cse.coupon_code_id = '<UUID>'
order by cse.created_at;
select * from coupon_redemptions where coupon_code_id = '<UUID>';
```

(2) אם דפוס עוין ממוקד בסורק מסוים: הקפאה מיידית: ‏`update supplier_members set is_active=false where id='<UUID>'` ‏(Supabase, כאדמין) + שיחה לספק. (3) אם לקוח נפגע (שילם ולא קיבל שירות): פיצוי דרך `adminAdjustWallet` בלבד, לעולם לא UPDATE ידני על קופון.
- **rollback**: אין rollback של מימוש. תיקון כספי = תנועת ledger מתקנת (`manual_adjust`), עם audit.
- **תקשורת** (לספק, ‏WhatsApp): ‏"היי, זיהינו ניסיון סריקה חוזר על קופון שכבר מומש אצלכם. המערכת חסמה אותו אוטומטית ואין צורך בפעולה מצדכם. אם לקוח עומד מולכם עם קופון שנראה תקין, בקשו את הקוד בן 8 הספרות ונבדוק יחד. תודה!"
- **חזרה לשגרה**: אין הישנות ל-48 שעות + שורת סיכום ב-`security_events`.

### 5.5 Deploy שבר את ה-checkout

- **זיהוי**: ספייק Sentry ‏domain:payment עם fingerprint חדש בתוך 30 דקות מ-deploy, או M-monitors, או התראה 4.3#1. ה-release tag ב-Sentry מצביע על ה-deploy האשם.
- **בלימה**: לפי הסדר המחייב: (1) ‏kill switch (2) ואז:

```bash
# Terminal: חזרה מיידית ל-deployment הקודם
vercel rollback
# או מה-Dashboard: Deployments > הקודם > Promote to Production
```

(3) אם ה-deploy כלל מיגרציה: **אסור** להוריד סכימה. ‏DB הוא forward-only ‏(TESTING D21): אם הקוד הישן לא תואם את הסכימה החדשה, כותבים מיגרציית פיצוי קדימה. זה בדיוק התרחיש שמשמעת expand/contract נועדה למנוע, ואם הגענו לכאן: תחקיר חובה.
- **rollback**: הפקודה למעלה. אחרי ייצוב: תיקון על branch, ‏CI ירוק מלא, deploy מחדש, הפעלת checkout.
- **תקשורת**: אם החלון קצר מ-15 דקות ואין לקוחות שנפגעו: אין פרסום. מעבר לזה: תבנית 5.1 (בלי להזכיר ספק סליקה: ‏"תקלה זמנית באתר").
- **חזרה לשגרה**: עסקת בדיקה מוצלחת ב-production + ‏Sentry שקט שעה.

### 5.6 תקלת DNS

- **זיהוי**: ‏M1/M2 אדומים, אבל ה-URL הפנימי `<project>.vercel.app` עונה תקין. ‏`dig kenyonexpress.co.il` מחזיר תשובה שגויה/ריקה.
- **בלימה**: (1) ‏`vercel domains inspect kenyonexpress.co.il` לאימות מה-Vercel מצפה לו. (2) כניסה לרשם הדומיין, השוואת הרשומות ליעד: ‏A ‏-> ‏`76.76.21.21` ו-CNAME ‏www ‏-> ‏`cname.vercel-dns.com` (או הערכים שה-inspect מציג). ‏(3) תיקון/שחזור הרשומות; ‏TTL כבר 300 לפי הכרעת ה-cutover, אז ההתפשטות מהירה. (4) אם זו חטיפת דומיין/פריצת רשם: החלפת סיסמת רשם + נעילת transfer מיידית, וזה SEV1 אבטחתי עם שעון 72 השעות.
- **rollback**: החזרת הרשומות האחרונות הידועות כתקינות (מגובות בקובץ התחקיר של ה-cutover; בתקופת המעבר מ-WP: החזרת ה-A הישן לשרת וורדפרס שנשאר חי שבועיים לפי תוכנית ה-cutover).
- **תקשורת** (ברשתות החברתיות, כי האתר לא נגיש): ‏"האתר חווה תקלת גישה זמנית. הצוות מטפל בה ברגעים אלה. קופונים שרכשתם שמורים ותקפים. עדכון יפורסם כאן בהקדם."
- **חזרה לשגרה**: ‏dig נקי משלושה resolvers שונים + ‏M1 ירוק שעה.

### 5.7 מיצוי מכסות (Supabase / Vercel / Sentry)

- **זיהוי**: מיילי אזהרה מהספקים (80%), הסקירה השבועית (6.3), או סימפטומים: 5xx על egress, ‏auth שנכשל, אירועי Sentry שנחתכים. המכסות המסוכנות ידועות מראש: ‏PRODUCTION-OPS 6.1: ‏DB ‏500MB, ‏egress ‏5GB, ‏pause אחרי 7 ימים (free), לוגים יום אחד.
- **בלימה**: לפי המשאב: ‏(1) DB מתמלא: הרצת cleanups מיידית: ‏`cleanup_rate_limits()`, ‏`cleanup_user_rate_limits()` ‏(Supabase > SQL Editor), ‏`fn_drop_old_analytics_partitions(13)`, בדיקת הטבלאות השמנות (`pg_total_relation_size`). ‏(2) egress: לוודא שכל התמונות עוברות דרך next/image ולא ישירות מ-storage; ‏(3) Sentry: הידוק דגימת warnings ל-0 זמנית. (4) בכל מקרה שהמכסה קשורה לכסף (auth/DB): שדרוג plan באותו יום. ‏$25 של Supabase Pro זול מכל שעה של checkout מושבת.
- **rollback**: אין. זו תקלת קיבולת, התיקון הוא קדימה.
- **תקשורת**: פנימית בלבד, אלא אם היו נפילות בפועל (אז תבנית 5.2).
- **חזרה לשגרה**: צריכה מתחת ל-70% בכל המשאבים + משימת מעקב קיבולת בסקירה השבועית.

### 5.8 שחיתות דאטה (החמור מכולם)

- **זיהוי**: התראות 4.3#8/#9 ‏(drift בארנק), שורות ב-`analytics_events_default`, ‏CHECK violations בלוגים (למשל על `wallet_accounts_user_nonneg`), ‏statement שלא מסתכם, או ממצא ידני.
- **בלימה**: (1) **עצירת כסף מיידית**: ‏kill switch + השבתת סריקות בפועל ע"י `update suppliers set status='suspended'` היא דרקונית מדי; במקום זה משביתים רק אם הפגיעה במימוש: מקפיאים לפי היקף. (2) ‏**snapshot לפני כל תיקון**:

```bash
# Terminal: dump מיידי לראיות ולשחזור
pg_dump "$PROD_DB_URL" --format=custom --file="incident-$(date +%Y%m%d-%H%M).dump"
```

(3) תיחום ההיקף ב-SQL קריאה בלבד: אילו חשבונות ב-drift ‏(`select * from v_wallet_ledger_drift`), מאיזה תאריך, איזו זרימה כתבה. (4) **תיקון אך ורק בתנועות מפצות**: ‏`fn_wallet_transfer` עם `reason='manual_adjust'` ו-idempotency_key בתבנית `incident:<date>:<account>`; לעולם לא UPDATE ישיר על `balance_ils` ולא DELETE מ-`wallet_transactions`. סכימה append-only מתקנים ב-append. ‏(5) אם המקור הוא באג קוד: ‏rollback אפליקציה לפני התיקון הכספי, שהחור יפסיק לדמם.
- **rollback**: שחזור מלא מגיבוי הוא המוצא האחרון בלבד (מאבד עסקאות שאחרי הגיבוי): פרויקט חדש -> ‏restore מה-dump היומי -> ‏repoint env -> ‏redeploy ‏(DR runbook של PRODUCTION-OPS 4.4), ואז reconcile מול Cardcom על החלון האבוד.
- **תקשורת**: אם נחשף מידע אישי או שנפגעו יתרות לקוחות: הודעה אישית ללקוחות שנפגעו + החלטת דיווח לרשות להגנת הפרטיות בתוך 72 שעות. תבנית ללקוח: ‏"שלום, זיהינו תקלה טכנית שהשפיעה זמנית על הצגת יתרת הארנק בחשבונך. היתרה תוקנה ומלוא הזכות שלך שמורה. פרטי התשלום שלך לא נחשפו ולא נפגעו. אנו מתנצלים על אי הנוחות, ולכל שאלה אנחנו זמינים במייל התמיכה."
- **חזרה לשגרה**: ‏`v_money_alarms` ריק לחלוטין 24 שעות + תחקיר כתוב + בדיקה חדשה ב-CI שמכסה את הבאג.

---

## 6. דף סטטוס ומודל on-call

### 6.1 דף סטטוס (OBS-18)

- **הוכרע: כן, ציבורי, מהיום הראשון.** ‏Better Stack Status Page על `status.kenyonexpress.co.il` ‏(CNAME אצל הרשם). עלות אפס, נבנה מה-monitors הקיימים, ונותן כתובת לתקשורת בתקרית כשהאתר עצמו לא נגיש (5.6).
- ארבעה רכיבים: **האתר** ‏(M1), **רכישה ותשלומים** ‏(M2 + heartbeat Cardcom), **מימוש קופונים בבתי העסק** ‏(M4 + פרוב הסריקה), **אזור אישי והתחברות** ‏(M2).
- מדיניות פרסום: ‏SEV1 מתפרסם תמיד, תוך 15 דקות מהאימות. ‏SEV2 מתפרסם אם ההשפעה גלויה ללקוח מעל 30 דקות. ‏SEV3 לא מתפרסם. שפת הפרסומים: עברית, לפי התבניות של סעיף 5.
- הרכיב "מימוש קופונים" הוא הרגיש ביותר תדמיתית (ספק מול לקוח בקופה): כל תקרית עליו מחייבת גם הודעת WhatsApp יזומה לספקים הפעילים (שלב B: אוטומטית דרך outbox; שלב A: ידנית).

### 6.2 מודל on-call ליחיד (OBS-19)

אין רוטציה כשיש אדם אחד; יש משמעת מכשיר וחלונות:

- אפליקציית Better Stack מותקנת עם הרשאת critical alerts שעוקפת מצב שקט. שרשרת אסקלציה: ‏push ‏-> אחרי 2 דקות ללא acknowledge ‏-> שיחת טלפון ‏-> אחרי 5 דקות ‏-> שיחה חוזרת.
- ‏SEV1 מעיר בלילה. ‏SEV2 מחכה ל-08:00. ‏SEV3 בדייג'סט. הגדרות השעות חיות ב-Better Stack ‏(policy אחד), לא בקוד.
- **חלון אי-זמינות מתוכנן** (טיסה, מילואים, שבת מלאה): מפעילים מראש "מצב שמרני": ‏kill switch נשאר זמין מהטלפון (אפליקציית Vercel/דפדפן); אם צפויה אי-זמינות מעל 24 שעות: שוקלs הקפאת קמפיינים ומכירות מראש. כלל אצבע: אסור שמכירה שיווקית גדולה תרוץ כשאין מי שיענה לטלפון.
- עובד ראשון בעתיד: נכנס כ-step שני באסקלציה, בלי שינוי ארכיטקטורה.

### 6.3 שגרת שבוע (30 דקות, יום ראשון בבוקר)

1. ‏Sentry: ‏issues חדשים מהשבוע, סגירת רעש, בדיקת צריכת מכסה.
2. ‏Better Stack: זמינות שבועית, ‏heartbeats שהחסירו פעימות.
3. ‏`v_owner_dashboard` + דייג'סטים של SEV3 שלא טופלו.
4. מכסות: ‏Supabase (DB size, egress), ‏Vercel, ‏Sentry: מתחת 70%?
5. ‏Speed Insights: ‏p75 מול תקציבי PERFORMANCE 4.1 (שבעה ימים רצופים מעל תקציב = משימת ביצועים לפני פיצ'רים, הכלל הקיים).

### 6.4 תרגולות (OBS-20)

- **חודשי: fire drill.** ‏cron ‏alerts נורה ידנית עם flag בדיקה; מוודאים שהשיחה מגיעה לטלפון תוך 3 דקות. תאריך + תוצאה נרשמים ב-STATE.md.
- **חודשי: תרגיל שחזור.** ‏restore של ה-dump היומי האחרון לפרויקט scratch, ‏`select count(*)` על orders/payments/wallet_transactions מול production. (מרחיב את "תרגיל שחזור אחד לפני cutover" של PRODUCTION-OPS לקבוע.)
- **רבעוני**: הרצת runbook 5.5 מלא על preview (deploy שבור מכוון), ורוטציית סודות לפי לוח SECURITY 4.2, כולל ווידוא שההתראות שורדות רוטציית `CRON_SECRET` (מנגנון dual-accept של 24 שעות, ‏API-CONTRACTS שכבה 2).

---

## 7. תוכנית ביצוע ורישום מלאי

### 7.1 קבצים חדשים (כולם מחוץ לאזורי הקונסולידציה; ייכתבו בשלבי הבנייה, לא עכשיו)

```
src/instrumentation.ts
src/instrumentation-client.ts
src/app/global-error.tsx
src/lib/log.ts                          <- לוגר + scrubEvent משותף
src/lib/alerts/thresholds.ts            <- קבועי הספים של טבלה 4.3
src/app/api/health/route.ts             <- חוזה L1 כפי שהוא
src/app/api/cron/alerts/route.ts        <- סעיף 4.2, כל 15 דקות
src/app/api/cron/cardcom-heartbeat/route.ts   <- סעיף 3.4, כל 15 דקות
src/app/api/cron/synthetic-scan/route.ts      <- סעיף 3.5, כל 10 דקות
docs/incidents/                          <- נפתח בתקרית הראשונה
```

### 7.2 מיגרציה עתידית (OBS-21, design בלבד, לא נכתבה)

`0XX_observability.sql` (המספר הפנוי בעת הכתיבה; כרגע 040 בהינתן 036 vendors / 037 legal / 038 performance / 039 agents): ‏(1) guard שמונע הנפקת הקוד השמור `00000000`; ‏(2) ספק ומשתמש probe ‏(seed מותנה, עם `assert_seeds_allowed` של 035 מותאם: ה-probe כן מותר בפרודקשן); ‏(3) view ‏`v_ops_alarms` שמרכז את בדיקות הסף של 4.3 שאינן ב-`v_money_alarms` ‏(שורות 6, 7, 9, 10, 14, 15) כדי שה-cron יקרא שני views ותו לא.

### 7.3 משתני סביבה חדשים

| שם | סקופ | הערה |
|----|------|------|
| `NEXT_PUBLIC_SENTRY_DSN` | public | |
| `SENTRY_AUTH_TOKEN` | build בלבד | מוזרק ע"י אינטגרציית Vercel |
| `SENTRY_ORG`, `SENTRY_PROJECT` | build | |
| `CARDCOM_SANDBOX_TERMINAL`, `CARDCOM_SANDBOX_USERNAME`, `CARDCOM_SANDBOX_API_NAME`, `CARDCOM_SANDBOX_API_PASSWORD` | server | ל-heartbeat בלבד; נפרדים לחלוטין מסודות הפרודקשן |
| `BETTERSTACK_HEARTBEAT_ALERTS`, `BETTERSTACK_HEARTBEAT_ALERTS_SEV1`, `BETTERSTACK_HEARTBEAT_ALERTS_SEV2`, `BETTERSTACK_HEARTBEAT_CARDCOM`, `BETTERSTACK_HEARTBEAT_SCAN` | server | ‏URL-ים, לא סודות קריטיים, אבל לא public |
| ‏heartbeat פר cron ‏(`BETTERSTACK_HEARTBEAT_<JOB>`) | server | מתווספים עם כל route |

כולם נכנסים ל-schema של `src/lib/env.ts` ‏(zod fail-fast, החוב הפתוח של SECURITY 4.1).

### 7.4 סדר הפעלה (משתלב בסדר הבנייה של MASTER סעיף 5)

1. **עם תחילת Phase 2 (קוד checkout ראשון)**: ‏Sentry מלא (1.1-1.2) + ‏`src/lib/log.ts` + ‏`/api/health` + ‏Better Stack: ‏M1/M2/M5 + דף סטטוס. שום קוד כסף לא נכתב בלי שהעצבים מחוברים.
2. **עם ה-webhook הראשון**: ‏heartbeats לכל cron קיים, ‏`/api/cron/alerts` עם השורות שכבר רלוונטיות (1-5, 8, 9), ‏M4.
3. **עם עליית מימוש הקופונים**: פרוב הסריקה (3.5) + התראות 6-7 + מיגרציית ה-observability.
4. **לפני שער השיגור**: ‏Cardcom heartbeat, כל טבלת 4.3 פעילה, ‏fire drill ראשון, תרגיל שחזור ראשון. שער השיגור של MASTER (פריט 4: ‏reconciliation + ‏`v_money_alarms` מחוברים להתראה) לא נחצה בלי סעיף זה ירוק.
5. **שלב B של ערוצים** (אחרי 031 + ‏Resend + ‏Meta live): תבנית `owner_alert` ב-WhatsApp + דייג'סטים ב-WhatsApp.

### 7.5 מה המסמך הזה לא מכסה בכוונה

- ‏APM/tracing מלא ‏(OpenTelemetry): מיותר בסקייל הנוכחי; ייפתח מחדש אם יהיו > 3 שירותים או צוות > 2.
- ניטור ה-AI agents מעבר ל-heartbeats ‏(`v_agent_costs_daily` וה-kill switch שלהם מוגדרים ב-ARCHITECTURE-AI-AGENTS).
- ‏SLO/SLA פורמליים ללקוחות: אין התחייבות חוזית; היעדים הפנימיים הם תקציבי PERFORMANCE 4.1 וזמני התגובה של 4.1 כאן.

---

*מסמך זה נכתב בסשן 2026-07-17 על בסיס קריאת כל docs/ + כל המיגרציות 001-035 + קונבנציות Next 16.2.4 מהתיעוד המקומי. שום קוד, מיגרציה או שירות חיצוני לא הופעלו.*
