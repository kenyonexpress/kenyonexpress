# DEPLOY-PIPELINE: ‏blue-green, ‏auto-rollback, מיגרציות דרך ‏MCP, וניטור פריסה

תאריך: 2026-09-17. המסמך על צנרת הפריסה שנבנתה באותו יום. ‏`docs/RELEASE-PROCESS.md`
נשאר הנוהל (מי מאשר מה); ‏`docs/RUNBOOK.md` §5 נשאר מדריך ההחזרה הידנית; המסמך הזה
מתאר מה רץ לבד, מה מפעיל אותו, ומה קורה כשהוא נכשל.

כל מזהה כאן נמדד דרך ה-MCP של ‏Vercel ושל ‏Supabase ב-2026-09-17 ולא הועתק ממסמך קודם.

## 0. מה נמדד לפני שנכתב

| עובדה | ערך | מקור |
|---|---|---|
| צוות ‏Vercel | ‏`team_TUMTPVDP8218QHwedSjmgJWl` (‏hobby) | ‏MCP `list_teams` |
| פרויקט ‏Vercel | ‏`kenyonexpress-web`, ‏`prj_oqr4NKtSaB2h3szrxnT0DknAv9Xk` | ‏MCP `list_projects` |
| הריפו שהפרויקט מקושר אליו | ‏`kenyonexpress/kenyonexpress-web` (לא הריפו הזה) | אותו רשומה |
| רשומות ב-ledger המיגרציות | ‏181 | ‏MCP `list_migrations` |
| קבצים ב-`migrations/pending/` שכבר ב-ledger | **‏10** (‏217, ‏223, ‏224, ‏226, ‏227, ‏228, ‏231, ‏232, ‏233, ‏234) | ‏`pnpm migrate:plan` |

השורה האחרונה היא הממצא של היום: עשרה קבצים הוחלו ב-09.09 ו-10.09 דרך ‏MCP ומעולם
לא הועברו ל-`applied/`. ‏README של התיקייה יודע זאת בפרוזה; שום כלי לא ידע עד היום.
הם **לא** הועברו במסגרת ה-goal הזה, כי ‏`pending-migrations-inventory.test.ts` מצמיד את
רשימת הקבצים בשתי התיקיות ו-‏`CHECKSUMS.sha256`, וההעברה היא שינוי לתור המיגרציות
שמגיע עם האצווה הבאה. הטסט של המתכנן מצמיד את **הזיהוי** ולא את הסחף: ביום שהקבצים
יזוזו, הציפייה תתרוקן וזו העריכה הנכונה.

## 1. שלושת הקבצים שמניעים את הצנרת

```
.github/workflows/deploy-promote.yml   blue-green: בנייה, smoke, קידום, אימות, החזרה
.github/workflows/auto-rollback.yml    רשת ביטחון: כל deployment_status של פרודקשן נבדק
.github/workflows/production-smoke.yml הבדיקה היומית, עכשיו גם מצלצלת בטלגרם
```

ומאחוריהם ‏`scripts/deploy/`:

| קובץ | תפקיד | טסט |
|---|---|---|
| ‏`lib.mjs` | החלק הטהור: שיפוט ‏probe, בחירת יעד החזרה, טקסט התקרית | ‏`lib.test.mjs` |
| ‏`smoke.mjs` | דפים + גוף ‏`/api/health` + כל נתיב ‏cron מהרישום | דרך ‏`pipeline.test.mjs` |
| ‏`vercel.mjs` | ארבע קריאות ‏REST: פרויקט, רשימת פריסות, ‏promote, ‏rollback | ‏`vercel.test.mjs` |
| ‏`promote.mjs` | הנוהל ה-blue-green כולו כפונקציה אחת | ‏`pipeline.test.mjs` |
| ‏`rollback.mjs` | החזרה + אימות + התראה | ‏`pipeline.test.mjs` |
| ‏`notify.mjs` | טלגרם + ‏ntfy מצד הרץ, בלי ‏Next | ‏`notify.test.mjs` |
| ‏`mark-release.mjs` | חותמת פריסה ב-Sentry, ‏PostHog ו-Axiom | ‏`mark-release.test.mjs` |
| ‏`migrate-plan.mjs` | תוכנית ‏`apply_migration` מול ה-ledger | ‏`migrate-plan.test.mjs` |

‏`src/__tests__/deploy-pipeline-wiring.test.ts` מצמיד את החיווט בין ה-workflows לסקריפטים.

## 2. ‏blue-green: איך פריסה מגיעה לפרודקשן

```
push ל-main (או dispatch)
  │
  ├─ 1. vercel pull   → .vercel/.env.production.local
  ├─ 2. deploy-preflight.mjs על הסביבה שנמשכה   ← מסרב למפתח שנחשף
  ├─ 3. vercel build --prod ; vercel deploy --prebuilt   (בלי --prod!)
  │        = ה-green: פריסה עם URL משלה ואפס תנועה
  ├─ 4. smoke על ה-URL של ה-green
  │        נכשל → "preview rejected", הפרודקשן לא נגע, exit 1
  ├─ 5. POST /v10/projects/{id}/promote/{green}   ← הדומיין עובר
  ├─ 6. smoke על דומיין הפרודקשן
  │        עבר  → "promoted", mark-release, exit 0
  │        נכשל → 7
  └─ 7. POST /v9/projects/{id}/rollback/{blue} ; smoke שוב
           עבר  → "rolled back", exit 4
           נכשל → "ROLLBACK FAILED", issue, exit 5
```

**למה שתי בדיקות ‏smoke.** ה-URL של ה-green מוכיח את ה-build. דומיין הפרודקשן מוכיח את
ה-build מאחורי הדומיין: משתני הסביבה של פרודקשן, ‏`VERCEL_URL` אחר, ה-crons שרק שם
מתוזמנים. ‏`production-smoke.yml` דיווח על אתר בריא שלושה ימים בעוד שלושה נתיבי ‏cron
ענו ‏404, כי הוא שאל רק על ‏`/` ו-`/api/health`. ‏`smoke.mjs` שואל על כל נתיב
ב-`scripts/cron-jobs.json`, וקורא את **גוף** ‏`/api/health` ולא רק את הסטטוס.

**‏`concurrency: deploy-production`** משותף לשני ה-workflows. שני קידומים במקביל יכולים
כל אחד להיכשל ולהחזיר ל-green של השני.

**מה משבית את זה.** הסוד ‏`VERCEL_TOKEN`. בלעדיו כל שלב מכריז על דילוג ויוצא ירוק,
כי הפרויקט ב-Vercel מקושר היום לריפו אחר (‏`RELEASE-PROCESS.md` §0) ו-workflow שנכשל
אדום בכל ‏push בגלל סוד חסר הוא ‏workflow שמישהו מוחק. **ברגע שהסוד מוגדר, הקובץ הזה
הוא מסלול השחרור**, ומיזוג ל-main לבדו אינו.

## 3. ‏auto-rollback: הרשת מתחת

‏`auto-rollback.yml` מאזין ל-`deployment_status`. כל פריסת פרודקשן שמדווחת ‏success,
מכל מקור (ה-GitHub app של ‏Vercel, קידום מהדשבורד, החזרה ידנית), עוברת:

1. ‏45 שניות המתנה (ה-edge cache של הדומיין מתעדכן אחרי ‏READY, לא איתו).
2. ‏`smoke.mjs` על דומיין הפרודקשן.
3. נכשל: **קודם** התראה בטלגרם + ‏ntfy, **אחר כך** ‏`rollback.mjs`. הסדר מכוון: החזרה
   שנתקעת לא יכולה לבלוע את ההתראה.
4. ‏`rollback.mjs` בוחר את פריסת הפרודקשן ה-READY החדשה ביותר שאינה זו שמוגשת
   (‏`pickRollbackTarget`), מחזיר, ובודק ‏smoke שוב. יעד שגם הוא נכשל מדווח
   כ-ROLLBACK FAILED ולא כהצלחה.
5. ‏issue אחד תחת ‏`production-down`, אותו label של הבדיקה היומית, כך שפריסה רעה
   ב-09:00 והבדיקה של 07:20 למחרת נוחתות על שרשור אחד.
6. הריצה אדומה.

בלי ‏`VERCEL_TOKEN` השלבים 1-3 ו-5-6 רצים; ההתראה אומרת במפורש "אין ‏VERCEL_TOKEN,
החזרה ידנית" במקום להעמיד פנים.

## 4. מיגרציות דרך ‏MCP

הכלל לא השתנה: ‏`db push` אסור, שינוי סכימה הוא קובץ ב-`migrations/pending/`, וההחלה
היא ‏`apply_migration` דרך ה-MCP של ‏Supabase **אחרי אישור מפורש** (מצב עצירה 3).

מה שהתווסף הוא השלב שבין הקובץ לקריאה:

```bash
pnpm migrate:plan            # תוכנית markdown
pnpm migrate:plan --json p.json
pnpm migrate:plan:check      # exit 1 על סחף או snapshot ישן
```

‏`migrate-plan.mjs` קורא את התיקייה ואת ‏`migrations/ledger.snapshot.json` (תוצאת
‏`list_migrations` שמורה, עם תאריך המדידה) ומוציא:

- **סחף**: קבצים שעדיין ב-`pending/` ושמם כבר ב-ledger. ההתאמה היא לפי ‏slug **וגם**
  מספר, כי ‏169, ‏172, ‏126, ‏127 ו-093 מופיעים כל אחד פעמיים ב-ledger תחת ‏slugs שונים,
  והתאמה לפי מספר לבד הייתה מסמנת קובץ לא נכון כמוחל.
- **לתור, לפי סדר**: לכל קובץ שם ה-`apply_migration` (‏slug ואז מספר, המוסכמה כאן),
  ה-preflight שלו אם קיים, ומה חוסם אותו: אין ‏rollback כתוב, קורא ‏`vault.decrypted_secrets`
  שטרם נזרעו (‏162), או ‏`CREATE INDEX CONCURRENTLY` שחייב הצהרה-הצהרה.
- **קריאה שלמה** לכל שורה מוכנה: ‏`project_id`, ‏`name`, וגוף הקובץ כ-`query`.

הסוכן שמחזיק את סשן ה-MCP מדביק קריאה אחת, בסדר, ומריץ את המתכנן שוב. הוא לא מתחבר
לשום דבר בעצמו (‏`deploy-pipeline-wiring.test.ts` מצמיד: אין ‏`@supabase`, אין ‏`fetch`).
‏snapshot ישן משבעה ימים מסומן ‏STALE והמתכנן מסרב ב-`--check`.

**רענון ה-snapshot:** ‏`list_migrations` דרך ה-MCP, להדביק ל-`migrations/ledger.snapshot.json`
ולעדכן ‏`measured_at`.

## 5. החזרה ידנית, כשהאוטומטית לא יכולה

מצבי היציאה שמחייבים אדם: ‏`promote.mjs` יצא ‏5, או ‏`rollback.mjs` יצא ‏1 או ‏3.

1. דשבורד ‏Vercel → הפרויקט → ‏Deployments → סינון ‏Production → פריסה ‏READY קודמת
   → ‏"Promote to Production" (או ‏"Instant Rollback" מהפריסה הנוכחית).
2. ‏`pnpm deploy:smoke --base https://<host>` מקומית, לאמת.
3. ‏`pnpm deploy:mark-release --sha <sha> --event rolled-back` כדי שהגרפים ידעו.
4. לסגור את ה-issue תחת ‏`production-down` עם מה נמצא.

## 6. ניטור: מה מסומן איפה

| משטח | מה נכתב בפריסה | משתנים | קורא |
|---|---|---|---|
| ‏Sentry | ‏release ל-sha (‏208 = כבר קיים, מה-build) + רשומת ‏deploy עם ‏environment | ‏`SENTRY_AUTH_TOKEN`, ‏`SENTRY_ORG`, ‏`SENTRY_PROJECT` | ‏"first seen in release", ‏regressions |
| ‏PostHog | ‏annotation על ציר הזמן של הפרויקט | ‏`POSTHOG_API_KEY` (מפתח **אישי**, לא ‏`NEXT_PUBLIC_POSTHOG_KEY`), ‏`POSTHOG_PROJECT_ID` | הגרפים ב-PostHog |
| ‏Axiom | אירוע ‏`kind=deploy` ב-`AXIOM_DEPLOY_DATASET` (נופל ל-`AXIOM_DATASET`) | ‏`AXIOM_TOKEN` | המוניטורים של ‏5xx ו-slow-query ב-`scripts/axiom/` |
| טלגרם + ‏ntfy | כל תוצאה: ‏promoted (שקט), ‏rolled back, ‏ROLLBACK FAILED (‏urgent) | ‏`TELEGRAM_BOT_TOKEN`, ‏`TELEGRAM_CHAT_ID`, ‏`NTFY_TOPIC` | הטלפון |

כל רגל אינרטית בלי המשתנים שלה ומדווחת לחוד; ‏`mark-release.mjs` יוצא ‏0 תמיד, כי
חותמת היא נוחות ואסור לה להכשיל פריסה שכבר קרתה.

טקסט ההתראה: כותרת אנגלית בשורה הראשונה (לטלגרם אין שדה כותרת; ‏ntfy קורא כותרת
‏ASCII בלבד), גוף עברי, **מזהים בלבד**: מזהה פריסה, ‏sha קצר, ‏URL הריצה. לא שמות
משתנים, לא גופי תשובה, לא הודעות שגיאה מהפלטפורמה.

## 7. מה לא נעשה, ולמה

- **הטוקן לא הוגדר ולא נוצר.** יצירת ‏token ב-Vercel והצבתו כסוד בריפו הן פעולה על
  פרודקשן (מצב עצירה 1). הצנרת מוכנה ומדלגת בקול עד אז.
- **עשרת קבצי הסחף לא הועברו ל-`applied/`.** ראה §0.
- **‏`e2e-preview` ב-`ci.yml` לא נגע.** הוא בודק ‏PR previews עם ‏Playwright; זה
  מסלול הבדיקה של הקוד, לא של הפריסה, והשניים משלימים.
- **אין ‏staging DB.** ‏preview ופרודקשן מצביעים על אותו ‏Supabase (‏`RELEASE-PROCESS.md` §0.4),
  ולכן ה-smoke על ה-green קורא רק: דפים, ‏health, וסטטוס של נתיבי ‏cron מוגנים.
