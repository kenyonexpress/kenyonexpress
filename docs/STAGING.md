# סביבת ‏Staging

‏`https://staging.kenyonexpress.co.il`: אותו קוד, פרויקט ‏Vercel נפרד, ‏Supabase branch נפרד,
מאחורי סיסמה. נמדד ונכתב ב-14.10.2026 (‏STEP 69). כל מזהה כאן נקרא מה-API של
‏Vercel ושל ‏Supabase באותו יום, לא הונח.

## 1. למה זה קיים

הפרודקשן נפרס ישירות מהענף ‏`audit/final-audit` (‏`docs/DEPLOY-PIPELINE.md`), ועד
עכשיו לא הייתה כתובת שבה אפשר לראות ‏commit רץ מול ‏DB אמיתי לפני שהוא מגיע ללקוחות.
‏preview deployments כבויים בפרויקט הראשי, וגם כשהיו דולקים הם הצביעו על ‏DB הפרודקשן.
‏staging סוגר את שני הפערים: הוא רץ על **ענף ‏DB משלו** (עותק של פרודקשן מ-08.10 ועוד
‏seed), ו**סולק במוק** (‏`CARDCOM_USE_MOCK=true`), כך שאפשר לעבור ‏checkout מלא בלי
שכרטיס נסלק ובלי ששורה נכתבת לפרודקשן.

## 2. טופולוגיה

| רכיב | ערך | מקור |
|---|---|---|
| פרויקט ‏Vercel | ‏`kenyonexpress-staging`, ‏`prj_7Ar3dFtaIqemo7bc1Fg7SMh11joY`, צוות ‏`team_TUMTPVDP8218QHwedSjmgJWl` | ‏`GET /v9/projects` |
| דומיינים | ‏`staging.kenyonexpress.co.il` (מאומת), ‏`kenyonexpress-staging.vercel.app` | ‏`GET /v9/projects/{id}/domains` |
| ‏DNS | ‏`*` ‏ALIAS ל-`cname.vercel-dns-016.com` בזון ‏`kenyonexpress.co.il` ב-Vercel DNS; אין רשומה ייעודית ל-`staging` ואין צורך בה | ‏`GET /v4/domains/.../records` |
| ‏Supabase | ‏branch ‏`staging`, ‏ref ‏`sjojzzppqhjxvjlvnwdb`, ‏`db.sjojzzppqhjxvjlvnwdb.supabase.co`, ‏`ACTIVE_HEALTHY`; ההורה ‏`ixvwfbuvfxxsjiywhbbb` | ‏`GET /v1/branches/{ref}` |
| ‏Git | מקושר ל-`kenyonexpress/kenyonexpress`, ‏production branch ‏`phase5/homepage-closeout`, ‏previews כבויים | ‏`link` בפרויקט |
| הגנת ‏Vercel | ‏`ssoProtection: all_except_custom_domains`, ‏`passwordProtection: null` | אותו ‏JSON |
| ‏Sentry | ‏`environment = staging` (סעיף 6) | ‏`lib/observability/sentry-environment.ts` |

**המשמעות של שורת ההגנה:** ה-alias ‏`*.vercel.app` דורש התחברות ל-Vercel, ו**הדומיין
המותאם פתוח לגמרי מצד ‏Vercel**. הגנת סיסמה של ‏Vercel עצמה היא תוספת בתשלום בתוכנית
הזו. לכן השער בסעיף 3 הוא הדלת היחידה על ‏`staging.kenyonexpress.co.il`.

## 3. השער: סיסמה

‏`src/lib/staging/gate.ts`, מופעל מ-`src/proxy.ts` מיד אחרי מנהרת ‏Sentry ולפני כל
דבר שעולה סיבוב רשת. מופעל אך ורק כש-`STAGING_PASSWORD` מוגדר בסביבה; בפרודקשן
המשתנה לא קיים והשער לא נקרא.

**איך נכנסים.** הדפדפן מקבל ‏`401` עם ‏`WWW-Authenticate: Basic` ופותח חלון סיסמה.
שם המשתמש לא נבדק; הסיסמה כן. הדפדפן שולח את ה-credential בכל בקשה לאותו ‏origin
מאותו רגע, כולל ‏POST של ‏Server Actions, ולכן אין עוגייה ואין מה לחתום.

**מכונות** (ה-smoke, ‏Playwright) שולחות את הסיסמה בכותרת ‏`x-staging-password` ולא
נאבקות בסיבוב ה-401. כותרת שגויה נדחית גם כשיש ‏Basic נכון לצדה.

**מה לא מאחורי השער**, כי הקורא הוא מכונה עם ‏credential משלה וכותרת ‏`Authorization`
כבר תפוסה אצלו:

| נתיב | מי קורא |
|---|---|
| ‏`/monitoring` | ‏SDK של ‏Sentry בדפדפן |
| ‏`/api/cron/*` | המתזמן של ‏Vercel והחיצוני, ‏`Bearer CRON_SECRET` |
| ‏`/api/payments/*` | ‏callbacks של ‏Cardcom |
| ‏`/api/webhooks/*`, ‏`/api/alerts/*`, ‏`/api/jobs/*` | ‏Twilio, תמונות, מוצרים, ‏Sentry, ‏UptimeRobot, ‏QStash |
| ‏`/api/app/*`, ‏`/api/supplier/app` | אפליקציית הקופה (‏`apps/mobile`) |
| ‏`/api/health`, ‏`/api/ready`, ‏`/api/revalidate` | ניטור, ‏smoke, ניקוי ‏cache |

כל השאר, כולל ‏`/api/search` ו-`/api/cart`, נעול. נכסים סטטיים (‏`_next/static`, תמונות)
לא עוברים דרך ה-proxy בכלל, אותה צורה של ההגנה של ‏Vercel.

**בנוסף לסיסמה:** ‏`robots.txt` מחזיר ‏`Disallow: /` בלי ‏sitemap, וכל תגובה, גם למי
שנכנס עם הסיסמה, נושאת ‏`X-Robots-Tag: noindex, nofollow`.

**איפה הסיסמה.** ב-Vercel היא ‏`sensitive` ולא ניתנת לקריאה דרך ה-API. העותק המקומי
נמצא ב-`~/kenyonexpress-staging-access.txt` על המחשב של אופיר (לא בריפו, לא ב-Desktop
שנתון ל-iCloud). היא סובבה ב-14.10 כי הקובץ הקודם ב-Desktop לא היה קריא.

**רוטציה:**

```bash
NEW=$(openssl rand -hex 16)
TOKEN=$(node -e "console.log(JSON.parse(require('fs').readFileSync(process.env.HOME+'/Library/Application Support/com.vercel.cli/auth.json','utf8')).token)")
T=team_TUMTPVDP8218QHwedSjmgJWl; P=prj_7Ar3dFtaIqemo7bc1Fg7SMh11joY
ID=$(curl -s -H "Authorization: Bearer $TOKEN" "https://api.vercel.com/v10/projects/$P/env?teamId=$T" | jq -r '.envs[]|select(.key=="STAGING_PASSWORD").id')
curl -s -X PATCH -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d "{\"value\":\"$NEW\"}" "https://api.vercel.com/v10/projects/$P/env/$ID?teamId=$T" >/dev/null
```

ואז פריסה מחדש (סעיף 4): ‏Vercel קושר משתנים בזמן ‏build, והפריסה הרצה ממשיכה עם
הערך הישן עד אז.

**הבלם ההפוך.** ‏`scripts/deploy-preflight.mjs` (רץ ב-`deploy-promote.yml` לפני ‏build
של פרודקשן) מסרב לבנות סביבה שבה ‏`NEXT_PUBLIC_APP_URL` הוא הדומיין של החנות ויש בה
‏`STAGING_PASSWORD`, ‏`SENTRY_ENVIRONMENT=staging` או ‏URL של ה-branch. עם הסיסמה
החנות נעולה ללקוחות; עם ה-branch היא מוכרת מתוך ‏DB שאיש לא מיישב.

## 4. פריסה

```bash
STAGING_PASSWORD=... node scripts/staging/deploy.mjs
```

הסקריפט מריץ ‏`vercel deploy --prod --archive=tgz --yes` עם ‏`VERCEL_ORG_ID` ו-
‏`VERCEL_PROJECT_ID` של ‏staging בסביבת תהליך הבן, ולכן **לא קורא ולא כותב
‏`.vercel/project.json`**: ה-checkout הראשי מקושר ל-`kenyonexpress-prod` ונשאר כך.
‏`--prod` כאן פירושו "ה-production של פרויקט ‏staging", כלומר הדומיין
‏`staging.kenyonexpress.co.il`; זה לא נוגע ב-`kenyonexpress`.

אחרי הפריסה הסקריפט מוכיח שלושה דברים: הדומיין עונה ‏401 עם ‏Basic בלי סיסמה, עונה
‏200 עם ‏`noindex` עם הסיסמה, וה-smoke (‏`scripts/deploy/smoke.mjs`, אותו שיש לפרודקשן)
ירוק עם ‏`--staging-password`. ‏`--no-smoke` מדלג, ‏`--dry` מדפיס בלבד.

**‏auto-deploy מגיט, מה נמדד.** הפרויקט מקושר לריפו עם ‏production branch
‏`phase5/homepage-closeout` ו-previews כבויים, ולכן כל ‏push לענף הזה הוא פריסה ל-staging
(ולא לחנות: ‏`kenyonexpress` מקושר ל-`audit/final-audit`). בין 08.10 ל-14.10 בבוקר נרשמו
בו **אפס** פריסות למרות עשרות ‏push, ובאותו יום ב-08:20 הראשונה נוצרה מעצמה מ-push של
‏STEP 71. שלוש פריסות הגיט של אותו בוקר נכשלו באותה שורה:

```
playwright.cross-browser.config.ts(2,18): error TS2307: Cannot find module './playwright.config'
```

‏`.vercelignore` מסיר את ‏`/playwright.config.ts` אבל השאיר את הקובץ שמייבא אותו, ובדיקת
הטיפוסים של ‏`next build` נופלת עליו. תוקן ב-14.10 בהוספת
‏`/playwright.cross-browser.config.ts` לאותו קובץ. מעכשיו ‏push לענף בונה ‏staging לבד;
‏`deploy.mjs` נשאר הדרך לפרוס עץ עבודה לא מחויב ולהוכיח את השער באותה ריצה.

## 5. הנתונים ב-branch

ה-branch נוצר ב-08.10 עם ‏`with_data: true`, כלומר סכימה **ושורות** של פרודקשן באותו
רגע: ‏162 מיגרציות, אותו ‏`max(version)` כמו בפרודקשן (‏`20260910085722`), ואותן
טבלאות חסרות (‏`health_incidents`, ‏`category_guides` עדיין ‏pending בשניהם).

נמדד ב-14.10:

| טבלה | פרודקשן | ‏staging | ההפרש |
|---|---|---|---|
| ‏products | ‏82 | ‏142 | ‏60 מוצרי דמו (‏`d3e30000-…`, ‏`scripts/seed/demo-data.mjs`: 40 פיזיים ו-20 קופונים) |
| ‏suppliers | ‏13 | ‏16 | ‏3 ספקי דמו מאותו ‏seed |
| ‏categories | ‏13 | ‏13 | |
| ‏orders | ‏46 | ‏46 | עותק; ‏26 ‏paid, ‏24 ‏vouchers |
| ‏auth.users | ‏14 | ‏14 | ‏10 ‏`user-*@staging.kenyonexpress.local` (פסאודונימים מהייבוא), ‏2 ‏fixtures של ‏E2E, ‏2 חשבונות ניהול |

אין בו פרטי לקוח אמיתיים: לפי ‏`docs/INDEX.md` אף לקוח לא קנה, וההזמנות הן ‏fixtures.
אם זה ישתנה, ה-branch ייבנה מחדש **בלי** ‏`with_data` ועם ‏seed בלבד.

**‏fixtures של ‏E2E** (‏`scripts/seed-test-data.mjs`): קיימים ב-branch (‏2 מוצרים במרחב
‏`0e02b2c3d`). להרצה מחדש מול ה-branch, עם המפתחות של ה-branch ולא של פרודקשן:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://sjojzzppqhjxvjlvnwdb.supabase.co \
NEXT_PUBLIC_SUPABASE_ANON_KEY=... SUPABASE_SECRET_KEY=... \
node scripts/seed-test-data.mjs --check
```

**איפוס מלא** (מחיקת ה-branch ויצירה מחדש) הוא מחיקת ‏DB ולכן עצירה לפי הכלל הקבוע;
לא בוצע ולא יבוצע בלי אישור. הפקודות: ‏`DELETE /v1/branches/{ref}` ואז
‏`POST /v1/projects/{parent}/branches` עם ‏`{"branch_name":"staging","with_data":true}`.

**מיגרציות.** ‏`migrations/pending/` לא מוחלות גם על ‏staging בלי אישור. כשיאושר, הסדר
הנכון הוא ‏staging קודם, ‏`deploy.mjs`, ‏smoke, ורק אז פרודקשן.

## 6. משתני סביבה

‏17 משתנים, כולם על ‏`production` ו-`preview` של הפרויקט. מה ששונה מהחנות:

| משתנה | ‏staging | למה |
|---|---|---|
| ‏`NEXT_PUBLIC_SUPABASE_URL` | ‏`https://sjojzzppqhjxvjlvnwdb.supabase.co` | ה-branch |
| ‏`NEXT_PUBLIC_SUPABASE_ANON_KEY`, ‏`SUPABASE_SECRET_KEY` | המפתחות של ה-branch | לא אלה של פרודקשן |
| ‏`NEXT_PUBLIC_APP_URL`, ‏`APP_BASE_URL` | ‏`https://staging.kenyonexpress.co.il` | קישורים, ‏sitemap, ‏return URL |
| ‏`CARDCOM_USE_MOCK` | ‏`true` | אין סליקה אמיתית; ‏`CARDCOM_TERMINAL_NUMBER` ו-`CARDCOM_API_NAME` הם מחרוזות מוק |
| ‏`CHECKOUT_ENABLED` | ‏`true` | ה-checkout פתוח, במוק |
| ‏`SENTRY_ENVIRONMENT`, ‏`NEXT_PUBLIC_SENTRY_ENVIRONMENT` | ‏`staging` | מנצח את ‏`VERCEL_ENV=production` של הפרויקט (סעיף 7) |
| ‏`STAGING_PASSWORD` | מוגדר | השער |
| ‏`CRON_SECRET`, ‏`VOUCHER_QR_SECRET`, ‏`CARDCOM_WEBHOOK_SECRET` | ערכים משלו | לא משותפים עם פרודקשן |
| ‏`NEXT_PUBLIC_WHATSAPP_PHONE` | אותו מספר | |

**מה אין**, ובכוונה: ‏Resend, ‏Twilio, ‏Meilisearch, ‏Upstash, ‏R2, ‏Sentry DSN. בלי ‏Resend
ה-outbox נשאר ‏pending ואף מייל לא יוצא מ-staging; בלי ‏Twilio אין ‏SMS; החיפוש נסוג
ל-Postgres. ‏`/admin/health` מציג אותם כ-`not_configured`, לא כתקלה.

## 7. ‏Sentry

ב-Vercel, ה-deploy של ה-production branch של **כל** פרויקט מקבל ‏`VERCEL_ENV=production`,
גם בפרויקט ‏staging. ‏`sentryEnvironment` העדיף עד עכשיו את ערך הפלטפורמה תמיד, ולכן
אירוע מ-staging היה נרשם כ-`production`. מ-14.10 הערך ‏`staging` בלבד, כשהוא מוגדר ביד,
גובר על הפלטפורמה: הפלטפורמה לא פולטת את המילה הזו לעולם, ולכן הוא לא עותק ישן של
כלום. הכיוון ההפוך (המילה בחנות) נתפס ב-preflight.

## 8. בדיקות מול ‏staging

```bash
# smoke, כמו בפרודקשן
STAGING_PASSWORD=... node scripts/deploy/smoke.mjs --base https://staging.kenyonexpress.co.il

# Playwright מול staging: הסיסמה נשלחת כ-x-staging-password בכל בקשה
STAGING_PASSWORD=... E2E_BASE_URL=https://staging.kenyonexpress.co.il pnpm exec playwright test
```

‏`E2E_BASE_URL` משמעו ש-Playwright לא מרים שרת ולא מזריק את משתני המוק; ב-staging הם
כבר בסביבה, אז מסלול הרכישה במוק עובד שם כפי שהוא עובד ב-CI.

## 9. מה לא נפתר

- למה ‏auto-deploy מגיט שתק בין 08.10 ל-14.10 ואז התעורר לא אובחן (סעיף 4); ‏`deploy.mjs`
  הוא המסלול שלא תלוי בזה.
- ה-alias ‏`kenyonexpress-staging.vercel.app` מאחורי ‏SSO של ‏Vercel ולא מאחורי השער;
  ‏`x-vercel-protection-bypass` לא מוגדר לפרויקט, אז מכונות משתמשות בדומיין המותאם.
- ה-crons מ-`vercel.json` רצים גם ב-staging, מול ה-branch, עם ה-`CRON_SECRET` שלו.
  זה רצוי (אותם נתיבים נבדקים), ובלי ‏Resend הם לא שולחים כלום.

## קשור

- ‏`docs/DEPLOY-PIPELINE.md`: הצינור של פרודקשן.
- ‏`docs/DEPLOYMENT.md`: מה נפרס לאן.
- ‏`docs/ENV-REFERENCE.md` §3.12: ‏`STAGING_PASSWORD`.
- ‏`docs/runbooks/web-vercel.md`: תקרית בפריסה.
