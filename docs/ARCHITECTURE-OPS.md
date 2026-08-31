# ARCHITECTURE-OPS: סביבות, ניטור, גיבויים והתאוששות

<!-- stale-banner:2026-09-01 -->
> ⛔ **‏מיושן החל מ-01.09.2026. המסמך המחייב הוא `docs/FINAL-REPORT.md`.**
>
> ‏ארבע שורות בטבלת המצב בראש המסמך **שגויות היום**: ‏`/api/health` קיים,
> ‏`vercel.json` קיים, ‏`src/lib/env.ts` קיים, ו-`instrumentation.ts` קיים.
> גם השורה על ה-cron שגויה: יש **עשרה** ‏jobs ולא אחד, והם רצים מתזמן חיצוני.
> ‏רשימת ‏O1 עד ‏O7 מסומנת "פתוח" על פריטים שנסגרו.
>
> ‏לתזמון עצמו: `docs/CRON-EXTERNAL.md`. ליום העלייה: `docs/LAUNCH-RUNBOOK.md`.
>
> שאר המסמך, שהוא מפרט תכנוני ולא דיווח מצב, עדיין תקף.


תאריך: 2026-07-29 | ענף: `arch/mega-docs` | סטטוס: **מסמך מחייב, שכבת מימוש**

כפיפות סמכות. כפוף ל-`docs/MASTER-ARCHITECTURE.md` (‏R25, ‏R26, ‏R39)
ול-`docs/ARCHITECTURE-SECURITY.md` בכל מה שנוגע לסודות והרשאות. מרחיב
את `docs/ARCHITECTURE-PRODUCTION-OPS.md` ואת
`docs/ARCHITECTURE-OBSERVABILITY.md`, וגובר עליהם בפרטי המימוש של
משתני Vercel, התראות Sentry, גיבויי Supabase ו-runbooks. הכרעות
ארכיטקטורת הניטור (‏OBS-01..22) נשארות שם.

**הקשר תפעולי מחייב.** מיזם בבעלות מפעיל יחיד. אין צוות, אין NOC, אין
תורנות. כל הכרעה כאן מותאמת לאדם אחד עם טלפון, ומשם נובע העיקרון
שחוזר בכל סעיף: **התראה שלא מובילה לפעולה היא רעש, ורעש הורג את
הערוץ.**

---

## 0. מצב הפתיחה, מאומת

| מה | מצב |
|---|---|
| ‏Sentry | ‏`@sentry/node` מותקן, `src/lib/observability/sentry.ts` **קיים וטוב** |
| ‏scrubber | קיים, רקורסיבי, מוגבל עומק, 9 דפוסי redaction |
| ‏`SENTRY_DSN` | ב-`.env.example`. **לא ידוע אם מוגדר ב-Vercel** |
| ‏`instrumentation.ts` | לא נמצא בשורש |
| ‏`/api/health` | **לא קיים** |
| ‏cron | ‏job אחד: `/api/cron/expire-vouchers`, מאובטח ב-`CRON_SECRET` |
| ‏`vercel.json` | **לא קיים** (כלומר גם אין הגדרת crons) |
| ‏`src/lib/env.ts` | **לא קיים** |
| פרויקט Supabase | אחד, `ixvwfbuvfxxsjiywhbbb`. **אין הפרדת פרודקשן** |
| ‏uptime חיצוני | **אין** |
| גיבוי מתועד | **אין** |
| תרגיל שחזור | **מעולם לא בוצע** |

שתי מסקנות מיידיות:

**‏`vercel.json` לא קיים, ולכן ה-cron של פקיעת השוברים לא רץ.** ה-route
נכתב, מאובטח נכון, מתעד את עצמו היטב, ואף אחד לא קורא לו. שוברים שפגו
לא מזוכים לארנק הלקוח, וזו חשיפה משפטית לפי LEG-04.

**פרויקט Supabase אחד משמש הכל.** אין הפרדה בין dev לפרודקשן. כל
`db reset --local` שגוי, כל seed, כל מיגרציה שנכשלה באמצע, נוגעים
בדאטה היחידה שיש. ‏R25 כבר מכריע שפרודקשן הוא פרויקט חדש ב-eu-central-1;
הוא טרם הוקם.

---

## 1. סביבות

### 1.1 שלוש סביבות, שלושה גורלות

| | Development | Preview | Production |
|---|---|---|---|
| ‏Vercel scope | ‏Development | ‏Preview (פר-PR) | ‏Production |
| דומיין | ‏localhost:3000 | ‏`*.vercel.app` | ‏kenyonexpress.co.il |
| ‏Supabase | ‏stack מקומי (Docker) | פרויקט dev | **פרויקט פרודקשן חדש** |
| אזור | מקומי | ‏eu-central-1 | ‏eu-central-1 |
| ‏Vercel region | - | ‏fra1 | ‏fra1 |
| ‏Cardcom | ‏mock (אין terminal) | ‏sandbox | ‏terminal אמיתי |
| ‏R2 bucket | ‏`ke-dev` | ‏`ke-dev` | ‏`ke-prod` |
| ‏Sentry env | ‏(אין DSN) | ‏`preview` | ‏`production` |
| ‏seed | מותר | מותר | **חסום ב-`assert_seeds_allowed`** |
| גיבויים | לא | יומי | **יומי + PITR** |

הבחירה ב-`fra1` מול `eu-central-1` היא הצמדה גיאוגרפית: פרנקפורט מול
פרנקפורט. ‏Vercel ב-`iad1` (ברירת המחדל) מול Supabase באירופה מוסיף
כ-100ms לכל שאילתה, וזה מוכפל במספר השאילתות של רינדור SSR.

### 1.2 הכלל שאסור להפר

**‏Preview לעולם לא נוגע בפרודקשן.** לא ב-DB, לא ב-terminal של Cardcom,
לא ב-bucket. ‏PR שנפתח לא יכול לחייב כרטיס אשראי אמיתי ולא יכול למחוק
תמונת מוצר חיה.

זה נאכף בשלוש שכבות, כי שכבה אחת נשברת:

1. משתני Preview ב-Vercel מצביעים לפרויקט dev. הגדרה, ולכן ניתנת
   לטעות.
2. `assert_seeds_allowed` ב-DB חוסם seed בפרודקשן.
3. `env.ts` (טרם נבנה) זורק בעליה אם `NODE_ENV=production` וגם
   `CARDCOM_SANDBOX=true`, או להפך: אם ה-URL של Supabase הוא של
   פרודקשן וה-scope אינו Production.

### 1.3 משתני Vercel, מלאי מלא

מ-`.env.example`, מסווג. ‏P = ‏Production, ‏V = ‏Preview, ‏D = ‏Development.

| משתנה | ‏P | ‏V | ‏D | סיווג | הערה |
|---|---|---|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | ✓ | ✓ | ✓ | ציבורי | ערך שונה לכל סביבה |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✓ | ✓ | ✓ | ציבורי | ‏RLS מגן |
| `SUPABASE_SERVICE_ROLE_KEY` | ✓ | ✓ | ✓ | **קריטי** | עוקף RLS |
| `SUPABASE_SECRET_KEY` | ○ | ○ | ○ | **קריטי** | שם חדש, חלופה |
| `SUPABASE_DB_URL` | ✗ | ✗ | ✓ | **קריטי** | כלים בלבד. **לא ב-Vercel** |
| `NEXT_PUBLIC_APP_URL` | ✓ | ✓ | ✓ | ציבורי | חייב להתאים לדומיין בפועל |
| `NEXT_PUBLIC_WHATSAPP_PHONE` | ✓ | ✓ | ○ | ציבורי | ריק מסתיר את ה-UI |
| `CARDCOM_TERMINAL_NUMBER` | ✓ | ✓ | ✗ | **קריטי** | ריק ⇒ mock מחוץ לפרודקשן |
| `CARDCOM_API_NAME` | ✓ | ✓ | ✗ | **קריטי** | |
| `CARDCOM_API_PASSWORD` | ✓ | ✓ | ✗ | **קריטי** | |
| `CARDCOM_WEBHOOK_SECRET` | ✓ | ✓ | ✗ | **קריטי** | סוד משותף על ה-callback |
| `CARDCOM_API_BASE_URL` | ○ | ○ | ○ | רגיל | ברירת מחדל בקוד |
| `CARDCOM_ACCOUNTS` | ✓ | ✓ | ✗ | **קריטי** | מפת terminal פר-ספק |
| `CARDCOM_SANDBOX` | **false** | true | true | **בטיחות** | true בפרודקשן = הכנסות לטרמינל בדיקה |
| `CARDCOM_ALLOW_SANDBOX` | **false** | true | true | **בטיחות** | |
| `VOUCHER_QR_SECRET` | ✓ | ✓ | ○ | **קריטי** | אותנטיות שובר |
| `VOUCHER_QR_SECRET_PREVIOUS` | ○ | ○ | ✗ | **קריטי** | חלון רוטציה |
| `VOUCHER_QR_KEY_ID` | ✓ | ✓ | ○ | רגיל | `kid` |
| `R2_ACCOUNT_ID` | ✓ | ✓ | ○ | רגיל | |
| `R2_ACCESS_KEY_ID` | ✓ | ✓ | ○ | גבוה | |
| `R2_SECRET_ACCESS_KEY` | ✓ | ✓ | ○ | **קריטי** | חותם presigned PUT |
| `R2_BUCKET` | ✓ | ✓ | ○ | רגיל | ‏bucket שונה לפרודקשן |
| `R2_PUBLIC_BASE_URL` | ✓ | ✓ | ○ | ציבורי | ‏cdn.kenyonexpress.co.il |
| `MEILISEARCH_HOST` | ○ | ○ | ✗ | רגיל | ריק ⇒ נפילה ל-Postgres |
| `MEILISEARCH_API_KEY` | ○ | ○ | ✗ | גבוה | **סוד שרת. לא לדפדפן** |
| `MEILISEARCH_INDEX` | ○ | ○ | ✗ | רגיל | |
| `SENTRY_DSN` | ✓ | ✓ | ✗ | נמוך | ריק בדב בכוונה |
| `SENTRY_ENVIRONMENT` | `production` | `preview` | ✗ | רגיל | |
| `CRON_SECRET` | ✓ | ✗ | ✗ | גבוה | **פרודקשן בלבד** |
| `UPSTASH_REDIS_REST_URL` | ✓ | ✓ | ○ | רגיל | טרם קיים |
| `UPSTASH_REDIS_REST_TOKEN` | ✓ | ✓ | ○ | גבוה | טרם קיים |
| `WC_BASE` / `WC_KEY` / `WC_SECRET` | ✗ | ✗ | ✓ | גבוה | הגירה בלבד. **לא ב-Vercel** |
| `WP_IMPORT_ALLOW_WRITES` | ✗ | ✗ | ○ | **בטיחות** | מנעול כתיבה |

✓ חובה, ○ אופציונלי, ✗ אסור.

**‏`CRON_SECRET` ב-Preview הוא ✗ בכוונה.** ‏Preview לא אמור להריץ
משימות מתוזמנות. ‏job של פקיעת שוברים שרץ מ-preview מול DB של dev יזכה
ארנקים באופן שאיש לא ציפה לו.

**‏`SUPABASE_DB_URL` לא נכנס ל-Vercel בכלל.** הוא מחרוזת חיבור ישירה
ל-Postgres, כלומר עוקף גם את RLS וגם את PostgREST. לזמן ריצה אין בו
שימוש; רק `drizzle.config.ts` ו-`scripts/db-doc.mjs` קוראים אותו.

### 1.4 `src/lib/env.ts`: החוסם

לא קיים. ההשלכה הקונקרטית: `loadCardcomEnv()` זורק
`Missing required env: <NAME>` **בזמן בקשה**, לא בעליה. כלומר פריסה עם
משתנה חסר מצליחה, נראית ירוקה, והכשל מגיע ללקוח הראשון שמנסה לשלם.

```ts
// src/lib/env.ts
import { z } from 'zod'

const server = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(40).optional(),
  SUPABASE_SECRET_KEY:       z.string().min(20).optional(),
  CARDCOM_TERMINAL_NUMBER:   z.string().optional(),
  CARDCOM_API_NAME:          z.string().optional(),
  CARDCOM_API_PASSWORD:      z.string().optional(),
  CARDCOM_WEBHOOK_SECRET:    z.string().min(32).optional(),
  CARDCOM_SANDBOX:           z.enum(['true', 'false']).optional(),
  VOUCHER_QR_SECRET:         z.string().min(32).optional(),
  CRON_SECRET:               z.string().min(32).optional(),
  R2_SECRET_ACCESS_KEY:      z.string().optional(),
  SENTRY_DSN:                z.string().url().optional(),
})
.superRefine((e, ctx) => {
  const add = (message: string) => ctx.addIssue({ code: 'custom', message })
  if (e.NODE_ENV !== 'production') return

  // בפרודקשן, האופציונליים הופכים לחובה.
  for (const k of ['CARDCOM_TERMINAL_NUMBER','CARDCOM_API_NAME','CARDCOM_API_PASSWORD',
                   'CARDCOM_WEBHOOK_SECRET','VOUCHER_QR_SECRET','CRON_SECRET'] as const) {
    if (!e[k]) add(`${k} is required in production`)
  }
  if (!e.SUPABASE_SERVICE_ROLE_KEY && !e.SUPABASE_SECRET_KEY) {
    add('one of SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SECRET_KEY is required')
  }
  // הבדיקה שמצדיקה את כל הקובץ: sandbox בפרודקשן = הכנסות
  // שנוחתות בטרמינל בדיקה ולא מגיעות לחשבון אף פעם.
  if (e.CARDCOM_SANDBOX === 'true') add('CARDCOM_SANDBOX must be false in production')
})

// כל שם שמתחיל ב-NEXT_PUBLIC_ ומכיל מילת סוד: כשל בעליה.
const LEAK = /^NEXT_PUBLIC_.*(SECRET|PASSWORD|SERVICE_ROLE|PRIVATE|TOKEN)/i
for (const k of Object.keys(process.env)) {
  if (LEAK.test(k)) throw new Error(`refusing to boot: ${k} exposes a secret to the browser`)
}

export const env = server.parse(process.env)
```

נטען מ-`instrumentation.ts`, כלומר הכשל הוא בעליה ולא בבקשה.

---

## 2. Vercel

### 2.1 `vercel.json`, שלא קיים

> **‏תיקון 20.08: הכותרת הזו היסטורית.** הביקורת הזו נכתבה לפני
> ‏31.07, ו-`vercel.json` נוצר באותו יום (`a27c29513`). היום הוא קיים ומחזיק
> ‏**עשר** רשומות cron, לא ארבע, וכל עשרת ה-routes קיימים ומוגנים ב-`CRON_SECRET`
> דרך `bearerMatches`. משלושת ה-routes שנרשמו כאן כחסרים: ‏`reconcile-cardcom`
> קיים כ-`/api/cron/reconcile` (‏diff יומי מול המסוף בחלון 48 שעות),
> ‏`money-alarms` התפזר ל-`capturePaymentAlarm` בתוך ה-webhook וב-`stranded-payments`
> במקום להיות job נפרד, ו-**`expire-pending` אינו קיים בשום צורה**. זה מכוון ולא
> פער: מלאי אינו ננעל על ידי הזמנה שלא שולמה, כי `available_stock` מסנן על
> ‏`expires_at > now()`, כלומר שמירה פגה מפסיקה לתפוס מלאי בלי שאף job ירוץ.
> הבלוק שלמטה נשמר כתיעוד של מה שהיה, לא כמצב. הרשימה המדויקת: `vercel.json`
> וסעיף Q5 ב-`docs/QUESTIONS-FOR-OFIR.md`.
>
> **מה שכן עדיין תקף בסעיף הזה: הערת ה-Hobby.** היא הסיבה שהוא לא נמחק.

```json
{
  "regions": ["fra1"],
  "crons": [
    { "path": "/api/cron/expire-vouchers",   "schedule": "0 3 * * *"  },
    { "path": "/api/cron/expire-pending",    "schedule": "*/30 * * * *" },
    { "path": "/api/cron/reconcile-cardcom", "schedule": "*/10 * * * *" },
    { "path": "/api/cron/money-alarms",      "schedule": "*/15 * * * *" }
  ]
}
```

מתוך הארבעה, רק הראשון קיים כ-route. השלושה האחרים נדרשים לפי מסמך
האב (שלב 3.5 ו-OBS-13) ואין להם קוד.

**‏Vercel Cron ב-Hobby מוגבל לריצה יומית אחת פר-job.** התזמונים של
10 ו-15 דקות דורשים תוכנית Pro. זו לא הערת מחיר: `reconcile-cardcom`
שרץ פעם ביום אומר שתשלום שנתקע מתגלה עד 24 שעות מאוחר מדי.

### 2.2 אבטחת ה-crons

התבנית שכבר ב-route של פקיעת השוברים נכונה ומועתקת לכולם:

```ts
const secret = process.env.CRON_SECRET
if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
  return NextResponse.json({ ok: false }, { status: 401 })
}
```

שלוש הערות:

- ‏`!secret` בתנאי הוא נכון: בהיעדר סוד ה-route **נסגר**, לא נפתח.
- ה-route חייב `export const runtime = 'nodejs'` (יש), כי הוא משתמש
  ב-service-role client.
- ‏cron שנכשל חייב לדווח ל-Sentry. ‏cron שקט שנכשל חודש הוא בדיוק
  כמה שוברים שפגו בלי זיכוי.

### 2.3 פריסה

‏R24: מיגרציה לפני קוד (‏expand/contract), ‏DB ‏forward-only,
‏rollback = ‏Vercel Instant Rollback.

```
1. מיגרציה (expand בלבד, דרך MCP apply_migration)
2. אימות על ה-DB שהיא חלה נקי
3. merge ל-cursor/add-supabase-3c830
4. Vercel בונה ופורס אוטומטית
5. עשן: /api/health, דף בית, דף מוצר, checkout עד ה-iframe
6. rollback במידת הצורך: Vercel Instant Rollback (שניות)
```

**גלגול לאחור הוא של הקוד בלבד, לעולם לא של ה-DB.** מיגרציה שכבר רצה
נשארת. זו הסיבה ש-expand/contract מחייב: מיגרציה שרק **מוסיפה** תואמת
גם לקוד הישן, ולכן rollback של קוד בטוח. מיגרציה שמוחקת עמודה שוברת
את הגרסה הקודמת ומבטלת את אפשרות ה-rollback.

`DROP COLUMN` מגיע במיגרציה נפרדת, לפחות פריסה אחת אחרי שהקוד הפסיק
לקרוא אותה.

### 2.4 `/api/health`

לא קיים, ו-uptime חיצוני צריך אותו.

```ts
// src/app/api/health/route.ts
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET() {
  const checks: Record<string, 'ok' | 'fail'> = {}
  const started = Date.now()

  try {
    const admin = createAdminClient()
    const { error } = await admin.from('products').select('id').limit(1)
    checks.database = error ? 'fail' : 'ok'
  } catch { checks.database = 'fail' }

  // נוכחות תצורה, לא קריאת רשת: health check שמדגדג את Cardcom
  // בכל דקה הוא תעבורה מיותרת אל ספק הסליקה.
  checks.cardcom_config = process.env.CARDCOM_TERMINAL_NUMBER ? 'ok' : 'fail'
  checks.qr_signing     = process.env.VOUCHER_QR_SECRET ? 'ok' : 'fail'

  const healthy = Object.values(checks).every((c) => c === 'ok')
  return NextResponse.json(
    { status: healthy ? 'ok' : 'degraded', checks, ms: Date.now() - started },
    { status: healthy ? 200 : 503 },
  )
}
```

`/api/health` הוא ציבורי ולכן **לא חושף גרסאות, שמות מארחים או הודעות
שגיאה**. `ok` / `fail` בלבד.

---

## 3. Sentry

### 3.1 מה שכבר נכון

`src/lib/observability/sentry.ts` הוא מהחלקים הטובים בריפו, ושלוש
ההכרעות שבו נשארות בתוקף:

- **מיקוד למסלול הכסף.** ההערה בקובץ מנסחת את זה: "ערוץ שנושא גם
  שגיאות רינדור מהקטלוג הוא ערוץ שאיש לא קורא". זה בדיוק R39.
- **‏scrubber רקורסיבי, מוגבל עומק ל-4.** ההגבלה מנומקת כהגנה מפני
  ‏DoS על מטען מושפע-תוקף.
- **‏`key` כדפוס גורף ולא `api_key`.** ההערה מודה שזה תופס גם
  `idempotency_key` שאינו סוד, ומכריעה שהמחיר של לאבד אותו הוא אפס
  והמחיר של שדה `*_key` עתידי שדולף גדול בהרבה. הכרעה נכונה.

### 3.2 מה חסר

**‏`instrumentation.ts` בשורש.** בלעדיו `initSentry()` לא נקרא, וכל
המנגנון אינרטי גם כשה-DSN מוגדר.

```ts
// instrumentation.ts (שורש הפרויקט)
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./src/lib/env')                       // כשל בעליה על תצורה חסרה
    const { initSentry } = await import('./src/lib/observability/sentry')
    initSentry()
  }
}

export async function onRequestError(err: unknown, request: { path: string }) {
  const { captureException } = await import('./src/lib/observability/sentry')
  captureException(err, { path: redactPath(request.path) })
}
```

**‏redaction של `/redeem/<token>` בנתיב.** ה-scrubber מנקה מפתחות
באובייקטים, אבל טוקן שיושב ב**נתיב** של השגיאה עובר. ‏SEC-SCRUB:

```ts
function redactPath(path: string): string {
  return path
    .replace(/\/redeem\/[^/?]+/, '/redeem/[redacted]')
    .replace(/\/checkout\/return\?[^ ]+/, '/checkout/return?[redacted]')
}
```

### 3.3 ההתראות

חמש התראות. יותר מזה, ומפעיל יחיד מפסיק להסתכל.

| # | התראה | תנאי | ערוץ | חומרה |
|---|---|---|---|---|
| A1 | **כשל תשלום** | כל exception ב-`src/server/payments/` | ‏push + מייל | **מיידי** |
| A2 | **‏webhook עם חתימה שגויה** | `signature_valid = false` פעם אחת | מייל | **מיידי** |
| A3 | **אזעקת כסף** | ‏`v_money_alarms` מחזירה שורה | ‏push + מייל | **מיידי** |
| A4 | **‏cron נכשל** | ריצה שהחזירה שגיאה, או שלא רצה | מייל | תוך שעה |
| A5 | **קצב שגיאות** | ‏> 25 שגיאות ב-5 דקות | מייל | תוך שעה |

מה שבמפורש **לא** מייצר התראה:

| לא מתריע | למה |
|---|---|
| ‏404 | סורקים. אלפים ביום |
| כשל רינדור בקטלוג | לא כסף. נאסף, לא מצלצל |
| ‏rate limit שנתפס | זה הצלחה של הבקרה |
| בקשה איטית בודדת | רעש |
| שגיאת ולידציה בטופס | התנהגות משתמש |

**‏A2 מתריעה על מופע יחיד.** ‏Cardcom לא חותם את ה-callbacks הישנים
(ראה `ARCHITECTURE-SECURITY.md` 4.2), כלומר `signature_valid = false`
פירושו או שמישהו מזייף, או שהסוד המשותף ב-URL השתנה בלי שהצד השני
עודכן. שני המקרים דורשים אדם.

### 3.4 מה נשאר ב-DB ולא בלוגים

‏R39: **ראיות משפטיות רק ב-DB. לוגים הם אבחון בלבד.**

| שאלה | איפה התשובה |
|---|---|
| האם הלקוח חויב | `payments` |
| כמה בדיוק, ולמי | `order_items` (‏snapshot), ‏`split_executions` |
| מתי השובר מומש ועל ידי מי | `voucher_redemptions` |
| מי שינה מה בפאנל | `audit_log` |
| למה ההפעלה קרסה בשעה 03:14 | ‏Sentry |

לוגים נמחקים. שורת `audit_log` לא. שאלה שעלולה להישאל בבית משפט לא
מקבלת תשובה מ-Sentry.

---

## 4. גיבויים

### 4.1 השכבות

| שכבה | מה | תדירות | שמירה | ‏RPO |
|---|---|---|---|---|
| ‏Supabase אוטומטי | ‏snapshot יומי | יומי | 7 יום (‏Pro) | ‏24h |
| ‏PITR | ‏WAL רציף | רציף | 7 יום (תוספת Pro) | **דקות** |
| ‏pg_dump שלנו | לוגי מלא | יומי 04:00 | 30 יום | ‏24h |
| ‏pg_dump שבועי | לוגי מלא | ראשון | 12 שבועות | שבוע |
| סכימה בלבד | ‏DDL | לכל מיגרציה | לנצח (git) | - |
| ‏R2 | ‏content-addressed | - | - | לא רלוונטי |
| קוד | ‏git + GitHub | לכל commit | לנצח | 0 |

**גיבוי אוטומטי לבדו לא מספיק.** הוא חי אצל אותו ספק שממנו מתגוננים.
פרויקט שמושהה בטעות, חשבון שננעל, או מחיקה בקונסולה, לוקחים את
הגיבויים איתם. ‏`pg_dump` יורד למקום אחר, וזה מה שהופך אותו לגיבוי.

**‏R2 לא צריך גיבוי.** מפתחות מבוססי-hash תוכן, וההגירה יכולה לייצר
אותם מחדש מה-uploads. השחזור הוא הרצה חוזרת של שלב media.

### 4.2 הסקריפט

```bash
#!/usr/bin/env bash
# scripts/backup-db.sh
set -euo pipefail

TS=$(date -u +%Y%m%dT%H%M%SZ)
OUT="${BACKUP_DIR:?}/ke-${TS}.dump"

pg_dump "$SUPABASE_DB_URL" \
  --format=custom --compress=9 --no-owner --no-privileges \
  --exclude-schema='pg_*' --exclude-schema=information_schema \
  --file "$OUT"

# אימות מיידי. גיבוי שלא נבדק אינו גיבוי.
pg_restore --list "$OUT" > /dev/null

# הצפנה לפני שהוא עוזב את המכונה: יש בו PII וטוקני תשלום.
age -r "$BACKUP_AGE_RECIPIENT" -o "$OUT.age" "$OUT" && rm "$OUT"

# יעד מחוץ ל-Supabase ומחוץ ל-Vercel.
rclone copy "$OUT.age" "r2-backup:ke-backups/daily/"

find "$BACKUP_DIR" -name 'ke-*.dump.age' -mtime +30 -delete
```

שלוש שורות שאסור להשמיט: `pg_restore --list` (גיבוי פגום נראה בדיוק
כמו תקין עד שצריך אותו), ההצפנה (הקובץ מכיל `payment_tokens` ו-PII),
והיעד שאינו Supabase.

### 4.3 תרגיל שחזור

**חובה רבעונית. חוסם שיגור לפני הפעם הראשונה.**

```
1. פרויקט Supabase חדש וריק
2. pg_restore מהגיבוי של אתמול
3. מדידה: כמה זמן זה לקח בפועל
4. אימות: ספירת מוצרים, הזמנות, שוברים, יתרות ארנק
5. אימות: RLS פעיל, policies קיימות
6. אימות: מאזן ה-ledger מסתכם לאפס
7. הפניית preview לפרויקט המשוחזר, מסלול קנייה מלא
8. מחיקת הפרויקט
9. תיעוד הזמן ב-STATE.md
```

צעד 3 הוא הסיבה לתרגיל. ‏RTO משוער הוא ניחוש; ‏RTO נמדד הוא תוכנית.
בפעם הראשונה זה תמיד לוקח יותר.

### 4.4 מה שהגיבוי לא מכסה

| נכס | איפה הוא | איך משחזרים |
|---|---|---|
| סודות (‏Cardcom, ‏QR, ‏R2) | ‏Vercel env | **מנהל סיסמאות. אין להם גיבוי אחר** |
| ‏DNS | ‏Cloudflare / רשם | ייצוא זון, ידני |
| ‏terminal של Cardcom | אצל Cardcom | לא ניתן לשחזור. יצירת קשר |
| תמונות | ‏R2 | הרצה חוזרת של שלב media |
| ‏Storage buckets | ‏Supabase | **לא נכלל ב-pg_dump** |

השורה האחרונה היא מלכודת אמיתית: `pg_dump` מגבה את הטבלאות של
`storage`, לא את הקבצים. ‏bucket שנמחק לא חוזר משם.

השורה הראשונה חמורה יותר. ‏`VOUCHER_QR_SECRET` שאבד פירושו שכל שובר
שהונפק אינו ניתן לאימות. ‏`kid` ורוטציה מגנים מפני דליפה, לא מפני
אובדן. הסודות יושבים במנהל סיסמאות עם עותק אחד לא-מקוון.

---

## 5. התאוששות מאסון

### 5.1 יעדים

| תרחיש | ‏RTO | ‏RPO |
|---|---|---|
| כשל פריסה | **דקות** (‏Instant Rollback) | 0 |
| נפילת Supabase | המתנה לספק | 0 |
| השחתת דאטה | 2-4 שעות (‏PITR) | דקות |
| מחיקת פרויקט | 4-8 שעות (‏pg_dump) | ‏24h |
| כשל אזור שלם | 8-24 שעות | ‏24h |
| חשבון שנפרץ | 4-8 שעות | תלוי בהיקף |

### 5.2 מדרג ההחלטה

```
תקלה
 ├─ הקוד? ────────────────> Vercel Instant Rollback. דקות. סוף.
 ├─ Supabase למטה? ───────> status.supabase.com. באנר תחזוקה.
 │                          CHECKOUT_ENABLED=false. המתנה.
 ├─ Cardcom למטה? ────────> CHECKOUT_ENABLED=false. סעיף 6.
 ├─ דאטה מושחתת? ────────> PITR לנקודה שלפני. סעיף 5.3.
 ├─ פרויקט נעלם? ────────> פרויקט חדש + pg_restore. סעיף 5.4.
 └─ סוד דלף? ────────────> רוטציה מיידית. סעיף 5.5.
```

### 5.3 השחתת דאטה: PITR

```
1. עצירת דימום: CHECKOUT_ENABLED=false. אין כתיבות חדשות למקולקל.
2. איתור הרגע. audit_log ו-Sentry נותנים חלון.
3. שחזור לפרויקט **חדש**, לא מעל הקיים.
   לעולם לא PITR מעל הפרודקשן: זה מוחק את הראיות של מה שקרה.
4. השוואה: מה יש בשחזור ואין בחי, ולהפך.
5. אם הנזק ממוקד: תיקון כירורגי מהשחזור, בטרנזקציה.
   אם רחב: החלפת הפרויקט והפניית ה-env.
6. תיעוד ב-STATE.md.
```

צעד 3 הוא הכלל שהכי מפתה להפר תחת לחץ. ‏PITR הוא הרסני; הפעלתו מעל
הפרודקשן מוחקת גם את מה שרצית להבין.

### 5.4 אובדן פרויקט

```
1. פרויקט חדש, eu-central-1
2. pg_restore מהגיבוי האחרון
3. אימות: 33 טבלאות, RLS על כולן, ספירות
4. מפתחות חדשים ל-Vercel env
5. פריסה מחדש
6. Cardcom: אימות שה-webhook URL עדיין נכון
7. הפער מאז הגיבוי מתועד. הזמנות מהחלון: ידני מול Cardcom
```

צעד 7 הוא הכאב האמיתי של RPO של 24 שעות: הזמנות שהתבצעו ולא בגיבוי
קיימות אצל Cardcom ולא אצלנו. ‏`reconcile_cardcom_settlement` היא
הכלי לשחזר אותן, וזו הסיבה שהיא לא "נחמד שיהיה".

### 5.5 סוד שדלף

| סוד | פעולה מיידית | אחרי |
|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | רוטציה בקונסולה, ‏env, פריסה | ביקורת `audit_log`, ‏`wallet_entries`, ‏`vouchers` על חלון החשיפה |
| `CARDCOM_API_PASSWORD` | קשר עם Cardcom, רוטציה | ביקורת `payments` |
| `CARDCOM_WEBHOOK_SECRET` | רוטציה, עדכון ה-callback URL | ביקורת `payment_webhook_events` על `signature_valid=false` |
| `VOUCHER_QR_SECRET` | ‏`kid` חדש, הישן ל-`_PREVIOUS` | שוברים ישנים עדיין תקפים |
| `R2_SECRET_ACCESS_KEY` | רוטציית טוקן | בדיקת אובייקטים שנכתבו בחלון |
| `CRON_SECRET` | רוטציה | בדיקת ריצות cron בחלון |

---

## 6. Runbook: תקלות Cardcom

Cardcom הוא ספק הסליקה היחיד (‏C9). אין fallback. לכן ה-runbook הזה
מפורט יותר מכל האחרים.

### 6.1 R-1: התשלום נכשל ללקוח בודד

**סימן:** לקוח מדווח, או ‏A1 נורתה.

```
1. איתור: payments לפי order_id.
   failure_code ו-failure_message הם התשובה ברוב המקרים.
2. סיווג:
   - סירוב מנפיק (051, 057, כרטיס פג): הלקוח. בקשה לכרטיס אחר.
   - שגיאת תצורה (terminal, סיסמה): שלנו. סעיף 6.3.
   - timeout: לא ידוע. סעיף 6.2.
3. אימות מול Cardcom: האם העסקה קיימת אצלם?
   אם כן ואצלנו לא: reconcile. סעיף 6.2.
4. תיעוד.
```

### 6.2 R-2: תשלום תקוע (הלקוח חויב, ההזמנה pending)

**התקלה החמורה ביותר בשגרה.** הלקוח שילם ולא קיבל.

```
1. אישור: יש עסקה מוצלחת אצל Cardcom, אין שורת paid אצלנו.
2. סיבה שכיחה: ה-webhook לא הגיע או נדחה.
   בדיקה: payment_webhook_events לפי external_event_id.
   - אין שורה בכלל -> לא הגיע. Cardcom חוסם? URL שגוי?
   - יש שורה עם signature_valid=false -> סוד לא תואם. סעיף 6.3.
   - יש שורה תקינה אך processed_at ריק -> נפל בעיבוד. Sentry.
3. תיקון: הרצת reconcile ידנית.
   היא מושכת מ-Cardcom ומיישרת דרך cardcom_transaction_id (UNIQUE),
   כלומר חיוב כפול אינו אפשרי גם אם היא רצה פעמיים.
4. אימות: order.status=paid, השובר הונפק, המייל יצא.
5. אם חלפו יותר מ-30 דקות: יצירת קשר יזומה עם הלקוח.
```

צעד 5 הוא החלטה עסקית שכתובה כאן במכוון. לקוח שמגלה בעצמו שחויב ולא
קיבל, אחרי שהמערכת ידעה, מאבד אמון שלא חוזר.

### 6.3 R-3: Cardcom למטה, או תצורה שבורה

**סימן:** כל התשלומים נכשלים.

```
1. הבחנה: הם או אנחנו?
   - כל הכרטיסים נכשלים באותו קוד -> כנראה אנחנו.
   - כשל אחרי ההפניה, בצד שלהם -> כנראה הם.
2. אם אנחנו:
   - CARDCOM_TERMINAL_NUMBER, _API_NAME, _API_PASSWORD ב-Vercel
   - CARDCOM_SANDBOX חייב להיות false בפרודקשן
   - CARDCOM_ACCOUNTS: מפת הטרמינלים פר-ספק תקינה?
   - האם הייתה פריסה בשעה האחרונה? Instant Rollback.
3. אם הם:
   - CHECKOUT_ENABLED=false. הודעה מכובדת ולא שגיאה.
   - פנייה לתמיכה של Cardcom.
   - העגלות נשמרות. הלקוח חוזר.
4. אחרי החזרה: הפעלה מחדש, ואז reconcile על החלון.
```

**‏`CHECKOUT_ENABLED` (‏D22) הוא הכפתור החשוב בכל המסמך.** בלעדיו,
תקלה אצל ספק הסליקה הופכת לזרם שגיאות מול לקוחות במשך שעות. הוא
משתנה סביבה, כלומר שינוי שלו הוא פריסה של שניות.

### 6.4 R-4: פער התאמה

**סימן:** ‏`v_money_alarms` או `reconciliation_discrepancies`.

```
1. סיווג הפער:
   - יש אצלם, אין אצלנו -> webhook שאבד. R-2.
   - יש אצלנו, אין אצלם -> חמור. חיוב שנרשם ולא בוצע?
   - סכומים שונים -> החמור מכולם. חקירה מיידית.
2. לעולם לא לתקן אוטומטית פער בסכום. אדם בלבד.
3. תיקון = שורות נגדיות ב-ledger, לא UPDATE.
   ה-ledger הוא append-only, וזה בכוונה.
4. תיעוד מלא: מה, למה, מה תוקן.
```

### 6.5 R-5: חשד להונאה במימוש

**סימן:** ‏tier 3 בסעיף 9.3 של מסמך האבטחה, או דיווח ספק.

```
1. voucher_redemptions לספק: קצב, שעות, שיעור כישלון.
2. דפוסים: 20 מימושים ב-2 דקות ב-3 לפנות בוקר.
3. חסימת סריקה לספק (לא חסימת החשבון).
4. יצירת קשר. לפעמים זו מכשיר גנוב, לפעמים עובד.
5. השהיית ה-payout עד בירור.
6. voucher_redemptions הוא הראיה. הוא append-only, ולכן קביל.
```

### 6.6 טבלת שיפוט מהירה

| סימן | קודם כל | ‏runbook |
|---|---|---|
| לקוח: "חויבתי ואין שובר" | `payments` + `payment_webhook_events` | R-2 |
| כל התשלומים נכשלים | תצורה, ואז status של Cardcom | R-3 |
| ‏`signature_valid=false` | הסוד המשותף ב-callback URL | R-3 |
| ‏`v_money_alarms` | סוג הפער | R-4 |
| כשל מימוש בקצב גבוה | ‏`voucher_redemptions` | R-5 |
| האתר איטי | ‏Vercel Analytics, ‏Supabase | - |
| ‏500 בכל הדפים | פריסה אחרונה | ‏Instant Rollback |

---

## 7. שער השיגור התפעולי

| # | דרישה | סטטוס |
|---|---|---|
| O1 | פרויקט Supabase נפרד לפרודקשן | **פתוח** |
| O2 | ‏Supabase Pro (‏PITR + גיבוי 7 יום) | **פתוח** |
| O3 | ‏`vercel.json` עם regions ו-crons | **פתוח** |
| O4 | ‏`src/lib/env.ts` שנכשל בעליה | **פתוח** |
| O5 | ‏`instrumentation.ts` שמפעיל את Sentry | **פתוח** |
| O6 | ‏`/api/health` | **פתוח** |
| O7 | ‏uptime חיצוני על `/api/health` | **פתוח** |
| O8 | חמש ההתראות מחוברות ונבדקו | **פתוח** |
| O9 | ‏`pg_dump` יומי מוצפן ליעד חיצוני | **פתוח** |
| O10 | **תרגיל שחזור אחד, עם זמן מדוד** | **פתוח** |
| O11 | ‏`CHECKOUT_ENABLED` מחווט | **פתוח** |
| O12 | ‏`reconcile-cardcom` כ-cron | **פתוח** |
| O13 | עסקת אמת אחת ב-Cardcom פרודקשן | **פתוח** |
| O14 | סודות במנהל סיסמאות + עותק לא-מקוון | **פתוח** |
| O15 | תרגיל אש אחד (‏R-2 מדומה) | **פתוח** |

**‏O10 ו-O15 הם היחידים שאי אפשר לזייף.** גיבוי שלא שוחזר וזרימת תגובה
שלא תורגלה הן הנחות, לא יכולות.

---

## 8. פערים פתוחים

| # | פער | חומרה |
|---|---|---|
| OPS-1 | פרויקט Supabase אחד ל-dev ולפרודקשן | **קריטי** |
| OPS-2 | אין `vercel.json`: ה-cron של פקיעת שוברים לא רץ | **קריטי** |
| OPS-3 | אין גיבוי חיצוני ולא תרגיל שחזור | **קריטי** |
| OPS-4 | אין `env.ts`: כשל תצורה מגיע ללקוח | **גבוה** |
| OPS-5 | אין `instrumentation.ts`: ‏Sentry אינרטי | **גבוה** |
| OPS-6 | אין `/api/health` ואין uptime | גבוה |
| OPS-7 | אין `CHECKOUT_ENABLED` | גבוה |
| OPS-8 | אין `reconcile-cardcom` | גבוה |
| OPS-9 | טוקן ב-URL לא מנוקה ב-Sentry | בינוני |
| OPS-10 | ‏Storage buckets לא בגיבוי | בינוני |
| OPS-11 | ‏Vercel Hobby: cron יומי בלבד, מול **עשר** רשומות (‏20.08) | **גבוה** |
| OPS-12 | ‏DNS ללא ייצוא זון | נמוך |

---

מסמכים קשורים:
`docs/ARCHITECTURE-PRODUCTION-OPS.md` (תשתית ו-cutover),
`docs/ARCHITECTURE-OBSERVABILITY.md` (‏OBS-01..22),
`docs/ARCHITECTURE-SECURITY.md` (סודות ורוטציה),
`docs/DEPLOY.md` (המדריך התפעולי),
`docs/ARCHITECTURE-ROADMAP.md` (מתי כל שער נסגר).
