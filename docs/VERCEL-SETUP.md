# הקמת פרויקט Vercel ופריסה ראשונה

מדריך צעד אחר צעד, מאפס ועד פריסה ראשונה עובדת. נכתב מול המצב בפועל
בתאריך 07.09.2026: אין קישור מקומי (`.vercel/` לא קיים ואין token ב-CLI),
לכן כל ההקמה עוברת דרך הדשבורד, לא דרך `vercel link`.

מסמכים קשורים:

- הגדרות build ופקודות: `vercel.json` (בשורש הריפו, נקרא אוטומטית)
- עשרת ה-cron והמתזמן החיצוני: `docs/CRON-EXTERNAL.md`
- תוכנית הפניית הדומיין: `docs/DNS-CUTOVER-PLAN.md`
- runbook עלייה לאוויר: `docs/LAUNCH-RUNBOOK.md`

> ⛔ **הפניית DNS היא שלב ידני באישור בלבד. המדריך הזה עוצר לפניה.**

---

## 1. מה כבר מוכן בריפו

שלושה קבצים ש-Vercel קורא לבד. אין מה להגדיר ידנית בדשבורד עבורם:

| קובץ | מה הוא קובע |
|---|---|
| `vercel.json` | framework: nextjs, install: `pnpm install --no-frozen-lockfile`, build: `pnpm build`, dev: `pnpm dev`, region: fra1 |
| `.vercelignore` | נתיבים מעוגנים בלוכסן מוביל. אסור להוסיף נתיב לא מעוגן (זה מה שמחק את `src/lib/supabase/` והפיל 11 פריסות) |
| `package.json` | `packageManager: pnpm@11.1.2`, ממנו Vercel גוזר את גרסת pnpm |

**אין `crons` ב-`vercel.json`, וזה מכוון.** עשרת התזמונים רצים ממתזמן חיצוני.
הסבר מלא: `docs/CRON-EXTERNAL.md`. אסור להחזיר אותם: תוכנית Hobby מריצה
בשקט רק שניים ברזולוציה יומית ומתעלמת מהשאר בלי שגיאה.

## 2. יצירת הפרויקט

Chrome > vercel.com > Add New > Project:

1. Import מהריפו בגיטהאב:
   ```
   kenyonexpress/kenyonexpress
   ```
2. Framework Preset: אמור להתזהות Next.js לבד. לא לדרוס פקודות build
   בדשבורד, `vercel.json` כבר קובע אותן.
3. Root Directory: להשאיר את שורש הריפו (שם יושבים `package.json` ו-`src/`).
4. לפני Deploy: להזין את משתני הסביבה מסעיף 3. פריסה בלי הם תיבנה אך
   תיפול בזמן boot עם "An error occurred while loading instrumentation hook".

מיד אחרי היצירה, Vercel > Settings > Git:

- **Production Branch חייב להיות `main`.** זו הייתה התקלה הקודמת: הצבעה
  לענף נטוש גרמה לכך שאף קומיט מהמיינליין לא נבנה.

## 3. משתני סביבה

Vercel > Settings > Environment Variables. המקור המחייב לכל משתנה, כולל
מי קורא אותו ומה ה-fallback, הוא:

```
.env.example
```

החוזה בזמן boot יושב ב:

```
src/lib/env.ts
```

בפרודקשן הוא מפיל את התהליך כשחסר אחד מהמשתנים בטבלה הראשונה.

### 3.1 חובה (production מסרב לעלות בלעדיהם)

להגדיר על Production. מסומן Sensitive בכל מה שאינו `NEXT_PUBLIC_*`.

| משתנה | מקור הערך |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase > Project Settings > API > Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | אותו עמוד, המפתח ה-publishable/anon |
| `SUPABASE_SERVICE_ROLE_KEY` | אותו עמוד, המפתח הסודי. חלופה: `SUPABASE_SECRET_KEY` בצורת `sb_secret_...`, אחד מהשניים חייב להיות |
| `NEXT_PUBLIC_APP_URL` | `https://kenyonexpress.co.il` (ממנו נבנים IndicatorUrl ו-ReturnUrl של Cardcom) |
| `NEXT_PUBLIC_SITE_URL` | אותו ערך בדיוק כמו `NEXT_PUBLIC_APP_URL` |
| `CARDCOM_TERMINAL_NUMBER` | Cardcom > פרטי טרמינל. טרמינל פרודקשן, לא test |
| `CARDCOM_API_NAME` | Cardcom > API settings |
| `CARDCOM_API_PASSWORD` | Cardcom > API settings |
| `CARDCOM_WEBHOOK_SECRET` | Terminal: `openssl rand -hex 32` |
| `VOUCHER_QR_SECRET` | Terminal: `openssl rand -hex 32`. לא רוטטבילי בקלות, כל שובר חתום בו |
| `CRON_SECRET` | Terminal: `openssl rand -hex 32`. אותו ערך בדיוק נכנס גם למתזמן החיצוני |
| `RESEND_API_KEY` | Resend > API Keys. בלעדיו אף שובר לא נשלח במייל |
| `CHECKOUT_ENABLED` | להתחיל עם `false`. המתג הראשי לגביית כסף, נפתח רק במחרוזת המדויקת `true` בשלב ה-go-live |

### 3.2 מומלץ מהיום הראשון

| משתנה | הערה |
|---|---|
| `NEXT_PUBLIC_SENTRY_DSN` | נקרא בזמן BUILD. בלעדיו ה-bundle נבנה עם `dsn: undefined` ולא מדווח כלום, בשקט |
| `SENTRY_DSN` | אותו ערך, לצד השרת |
| `SENTRY_ENVIRONMENT` + `NEXT_PUBLIC_SENTRY_ENVIRONMENT` | `production` |
| `SENTRY_ORG` + `SENTRY_PROJECT` + `SENTRY_AUTH_TOKEN` | העלאת source maps בזמן build |
| `NEXT_PUBLIC_WHATSAPP_PHONE` | בלעדיו ה-fallback הוא המספר של חנות ה-WordPress הישנה |
| `CONTACT_TO` | תיבת הדואר של טופס יצירת הקשר |
| `CONSENT_IP_SALT` | Terminal: `openssl rand -hex 16` |

### 3.3 אופציונלי לפי פיצ'ר

כל אחד מהם דומם או עם fallback מתועד כשהוא לא מוגדר. הרשימה המלאה עם
שמות הקוראים נמצאת ב-`.env.example`, הקבוצות:

- Cloudflare R2 (חמשת משתני `R2_*`): בלעדיהם תמונות נופלות ל-Supabase Storage
- Meilisearch + QStash: בלעדיהם החיפוש נופל לשאילתת Postgres, עובד ואיטי יותר
- Upstash Redis (`UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`, שניהם יחד): בלעדיהם rate limiting רץ על Postgres
- אנליטיקס: `GA4_API_SECRET`, `NEXT_PUBLIC_GA4_MEASUREMENT_ID`, `META_CAPI_TOKEN`, `NEXT_PUBLIC_META_PIXEL_ID`
- ארנקים: `APPLE_WALLET_*`, `GOOGLE_WALLET_*` (כפתורי הארנק מסתירים את עצמם כשהסט חסר)
- דגלים: `PHONE_AUTH_ENABLED`, `NEXT_PUBLIC_PHONE_AUTH_ENABLED`, `PUSH_ENABLED`, `EXPO_ACCESS_TOKEN`

### 3.4 אסור להגדיר ב-Vercel לעולם

| משתנה | למה |
|---|---|
| `ALLOW_INCOMPLETE_ENV` | פתח מילוט מקומי ל-Playwright בלבד. ב-Vercel הוא מבטל את כל בדיקות ה-boot |
| `CARDCOM_USE_MOCK` | תשלומים "מצליחים" בלי שכרטיס חויב |
| `CARDCOM_SANDBOX` | `src/lib/env.ts` מפיל את ה-boot כשהוא `true` בפרודקשן, בכוונה |
| כל סעיף `[tooling]` ב-`.env.example` | סקריפטים וטסטים בלבד (`DATABASE_URL`, `E2E_*`, `WC_*`, וכו') |

וכלל קבוע: אסור ששום סוד יקבל קידומת `NEXT_PUBLIC_`. הקוד ב-`src/lib/env.ts`
מסרב לעלות כשהוא מזהה `NEXT_PUBLIC_*(SECRET|PASSWORD|SERVICE_ROLE|PRIVATE_KEY|API_KEY)`.

## 4. פריסה ראשונה

1. Chrome > Vercel: ללחוץ Deploy (או לדחוף קומיט ל-`main`, כל push ל-`main`
   פורס לפרודקשן של הפרויקט, עדיין על דומיין `*.vercel.app`).
2. לעקוב אחרי ה-build log. שתי שורות שחובה לוודא:
   - `Removed N ignored files defined in .vercelignore` עם N קטן (עשרות).
     מאות פירושו ש-`.vercelignore` מחק קוד חי.
   - אין `module-not-found` על `@/lib/supabase/*`.
3. אימות מול הפריסה (Terminal, להחליף את ה-URL בזה שהתקבל):
   ```bash
   BASE=https://<deployment>.vercel.app
   curl -s -o /dev/null -w '%{http_code}\n' "$BASE"                      # מצופה 200
   curl -s -o /dev/null -w '%{http_code}\n' "$BASE/api/health"           # מצופה 200
   curl -s -o /dev/null -w '%{http_code}\n' "$BASE/api/cron/health"      # מצופה 401 בלי header
   curl -s -o /dev/null -w '%{http_code}\n' \
     -H "Authorization: Bearer $CRON_SECRET" "$BASE/api/cron/health"     # מצופה 200
   ```
   אם הדף הראשי מחזיר 500 עם "instrumentation hook" בלוגים: חסר משתנה
   מטבלה 3.1. הלוג של Vercel מדפיס את שם המשתנה החסר.

הערה ל-Deployment Protection: אם היא פועלת על הפרויקט, ה-curl יחזיר 401
על הכל. לסוויטת ה-E2E יש תמיכה מוכנה: Vercel > Settings >
Deployment Protection > Protection Bypass for Automation, ואת הערך שמים
מקומית (לא ב-Vercel) בתור:

```
VERCEL_AUTOMATION_BYPASS_SECRET
```

## 5. הפעלת המתזמן החיצוני

חוסם go-live. עד שהוא פועל אף אחד מעשרת ה-cron לא רץ, כולל שלושת
מסלולי הכסף וזיכוי שוברים שפגו. שתי האפשרויות, ההוראות המלאות
והרשימה של כל עשרת הנתיבים:

```
docs/CRON-EXTERNAL.md
```

הקצרה שבהן, GitHub > Settings > Secrets and variables > Actions
(השמות נלקחו מ-`.github/workflows/cron.yml`):

1. Secret בשם `CRON_SECRET`: אותו ערך שהוזן ב-Vercel.
2. Variable בשם `CRON_BASE_URL`: כתובת הפריסה (`https://<project>.vercel.app`
   עכשיו, `https://kenyonexpress.co.il` אחרי ה-DNS).
3. Variable בשם `CRON_SCHEDULER_ENABLED` עם הערך `true`: בלעדיו ה-workflow
   מדלג על עצמו.

## 6. מה נשאר ידני ומחוץ למדריך הזה

1. **הפניית DNS של `kenyonexpress.co.il` לפרויקט.** באישור בלבד, לפי
   `docs/DNS-CUTOVER-PLAN.md`. לא מריצים.
2. **הפיכת `CHECKOUT_ENABLED` ל-`true`.** שלב go-live, אחרי אימות מסלול
   התשלום מקצה לקצה.
3. **בחירת פרויקט Vercel קיים מול חדש.** אם הדומיין כבר מוצמד לפרויקט
   ישן בחשבון, מוחקים את ההצמדה שם רק אחרי שהפרויקט החדש ירוק, כחלק
   משלב ה-DNS ולא לפניו.
