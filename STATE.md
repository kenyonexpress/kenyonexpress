RESUME FROM: L05
Updated: 2026-10-05 (סשן `audit/final-audit`, Fable 5.1, פריט L04 DONE: ביקורת
env של Vercel Production בקריאה בלבד, 42 שמות, אפס placeholder בין 10 הנקראים,
32 חסויים אומתו בעקיפין דרך preflight/boot/ready, ארבעה מועמדים לכפילות
רשומים ולא הוסרו (כלל "never change Vercel env vars"); RESUME FROM מצביע ל-L05)

## המשך מ:

**L04 - DONE (05.10.2026).** משימת התור: "Gate 4 env hygiene: vercel env ls
production; identify every var whose value is a PENDING_ or placeholder; if
a real value exists for it keep, otherwise leave; remove only vars that are
superseded duplicates; print final list". `pwd` אומת, HEAD בהגעה `9187af59c`,
עץ נקי. **נמדד, קריאה בלבד, אפס שינוי ב-Vercel:** `vercel env ls production`
על `kenyonexpress` (`prj_v49dZbPUpk1UxyHbXTCiIJlQ7opP`) מחזיר **42 שורות
בפרודקשן** (45 רשומות בפרויקט: עוד `SUPABASE_SERVICE_ROLE_KEY` ל-preview
ול-development ו-`NEXT_PUBLIC_SUPABASE_URL` ל-preview). **10 רשומות מסוג
`encrypted`** נקראו דרך `vercel env pull --environment=production` לקובץ
זמני שאופס מיד, בלי להדפיס ערכים: **אף אחת אינה `PENDING_`, placeholder
או ריקה.** הלא-סודיות: `APP_BASE_URL` ו-`NEXT_PUBLIC_APP_URL` שתיהן
`https://kenyonexpress.co.il`, `NEXT_PUBLIC_APP_ENV`=`production`,
`CARDCOM_USE_MOCK`=`true` (חוסם 8, ידוע), `NEXT_PUBLIC_CARDCOM_SANDBOX`=
`false`, `NEXT_PUBLIC_SUPABASE_URL` = הפרויקט המאוחסן. הסודיות בצורת מפתח
אמיתי לפי אורך: `CARDCOM_WEBHOOK_SECRET` 64, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
46, `NEXT_PUBLIC_VAPID_PUBLIC_KEY` 87, `SUPABASE_SECRET_KEY` 41. **32 רשומות
מסוג `sensitive` אינן ניתנות לקריאה על ידי אף אחד** (API עם `decrypt=true`
מחזיר מעטפת מוצפנת, `env pull` כותב `[SENSITIVE]`), ולכן placeholder מול
אמיתי לא נמדד מהערך אלא בעקיפין: (א) `deploy preflight: clean` בלוג הבנייה
של הפריסה החיה `dpl_FD8ZDCouDeFH4zjxAB5JQbSfUdoc` (`9187af59c`, 04.10
19:06 UTC): שמונת `REQUIRED_RUNTIME` לא ריקים (כולל
`CARDCOM_TERMINAL_NUMBER`/`API_NAME`/`API_PASSWORD`, `VOUCHER_QR_SECRET`,
`CRON_SECRET`), `CARDCOM_SANDBOX` אינו `true`, אף מפתח admin אינו המפתח
החשוף; (ב) `src/lib/env.ts` זורק בעליית השרת על סכימה לא תקינה והפריסה
READY ומגישה, ולכן `SUPABASE_SERVICE_ROLE_KEY` באורך 40 ומעלה, `SENTRY_DSN`
URL תקין, `AXIOM_TOKEN` 10 ומעלה או ריק; (ג) `/api/ready` חי:
`database ok, redis ok, cardcom ok, meilisearch down, r2 not_configured`.
**לא ניתן לאמת** (ערך חסוי ואין אות חי): `AXIOM_DATASET`, `CHECKOUT_ENABLED`,
`MEILISEARCH_HOST`/`API_KEY` (down), `NODE_ENV`, `OPENAI_API_KEY`,
`POSTHOG_API_KEY`, `R2_*`, `REDIS_URL`, `RESEND_API_KEY` (חוסם 6),
`SENTRY_AUTH_TOKEN`, `TWILIO_*`, `VAPID_PRIVATE_KEY`, `VERCEL_ORG_ID`/
`PROJECT_ID`, `CARDCOM_API_KEY`/`CLIENT_ID`/`MERCHANT_ID`.
**מועמדים לכפילות שהוחלפה, לא נקראים באף קובץ לא-טסט ב-`src/`, `scripts/`,
`apps/`, `packages/`, `vercel.json`, `next.config.ts`, `.github/`, ולא
הוסרו:** `CARDCOM_API_KEY`, `CARDCOM_CLIENT_ID`, `CARDCOM_MERCHANT_ID`
(16.09, הוחלפו ב-`CARDCOM_TERMINAL_NUMBER`/`API_NAME`/`API_PASSWORD`
מ-04.10); `APP_BASE_URL` (כפול ל-`NEXT_PUBLIC_APP_URL`, אותו ערך);
`NEXT_PUBLIC_CARDCOM_SANDBOX` (הקוד קורא `CARDCOM_SANDBOX`);
`NEXT_PUBLIC_APP_ENV`. **יתומים או שם שגוי, לא כפילות, להשאיר:**
`R2_BUCKET_NAME` (הקוד קורא `R2_BUCKET`, מכאן `r2 not_configured`; R2 ממילא
לא מופעל, חוסם 4), `REDIS_URL` (הקוד קורא `UPSTASH_REDIS_REST_*`),
`OPENAI_API_KEY`, `POSTHOG_API_KEY`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`,
`NODE_ENV`. **לא כפילות כלל:** `SUPABASE_SERVICE_ROLE_KEY` לצד
`SUPABASE_SECRET_KEY`, כי `src/lib/supabase/admin.ts:19` מעדיף את
`SERVICE_ROLE_KEY` קודם והוא המפתח שלקוח ה-admin רץ איתו בפרודקשן; הסרתו
הייתה מחליפה מפתח חי. `SENTRY_DSN`/`NEXT_PUBLIC_SENTRY_DSN` שניהם נקראים
בכוונה. **החלטה שהתקבלה לבד:** כללי הפריט אומרים "never change DNS or
Vercel env vars" והם גוברים על "remove only vars that are superseded
duplicates"; לכן אפס מחיקות ואפס עריכות ב-Vercel, הפריט הוא ביקורת
קריאה-בלבד וארבעת המועמדים להסרה רשומים כאן ובסעיף הידני ב-`docs/BACKLOG.md`
לאופיר. **הרשימה הסופית זהה לרשימת ההגעה: 42 שמות בפרודקשן, ללא שינוי.**
שערים (תחת `env -u` של 56 שמות, `RESIDUAL=0`): `pnpm type-check` exit 0;
`pnpm lint` exit 0 (biome 2038 קבצים + 12 שערי סקריפט, docs-index-gate 282, docs-path-audit 155 ללא שינוי); `pnpm test` 615/615 קבצים, 7340 עברו, 12 דולגו
(7352), 55.5 שניות; `CARDCOM_USE_MOCK=true NEXT_PUBLIC_APP_URL=http://localhost:4993 pnpm build` exit 0 בלי `rm -rf .next` (שרת `next start` של סשן אחר, PID 56540, עדיין מגיש על 3311), אפס `Invalid API key`, `BUILD_ID` `AgIbzuJf7lYgospnFijCk`, אותן 92 שורות `supabase.rls_denied` (חוסם 3).
`compare.mjs` לא נדרש (אפס שינוי UI/קוד). L03 הועבר ל-`docs/STATE-ARCHIVE.md`.
קבצים: `STATE.md`, `docs/STATE-ARCHIVE.md`, `docs/BACKLOG.md`.

**L02 - DONE (05.10.2026, 01:49 מקומי).** משימת התור: "Gate 2 git
integration: via vercel API confirm project kenyonexpress production branch
is audit/final-audit; push an empty commit to audit/final-audit and confirm a
new deployment is created automatically; if not fix the setting via API".
`pwd` אומת, HEAD בהגעה `21ba0f102`, עץ נקי. **נמדד לפני** (`vercel api
/v9/projects/prj_v49dZbPUpk1UxyHbXTCiIJlQ7opP`; ה-MCP של Vercel מחזיר 404
על ה-project עם `teamId` ואינו מחזיר `link` כלל, לכן ה-CLI): `link.type=github`,
repo `kenyonexpress/kenyonexpress` (repoId 1255271784),
**`productionBranch=phase5/homepage`** (מאז יצירת הפרויקט, 31.08),
`previewDeploymentsDisabled=true`, `gitProviderOptions.createDeployments=enabled`,
`commandForIgnoringBuildStep=null`. התוצאה: **327 קומיטים נדחפו
ל-`audit/final-audit` מ-02.10 13:00 ועד L01 ואף אחד לא יצר פריסה** בפרויקט
הזה (אפס פריסות `source=git` אחרי `dpl_D2B3jyG3m1YKGYHymAf3ajg5ds5x`, 02.10
12:52, שהייתה preview ונפלה ב-preflight על 6 משתנים חסרים ב-Preview env).
האינטגרציה עצמה חיה: הפרויקט האחי `kenyonexpress-prod`
(`prj_keQjjnDoTb41AYmHy3ia59BKumyt`, אותו repo, `productionBranch=main`) בונה
כל push ל-`audit/final-audit` כ-preview ונופל (20/20 ERROR מ-02.10, האחרון
`dpl_5Na2twFW4B35879Vpom7kmBcnp6Q` על `21ba0f102`); לא נגעתי בו, מחוץ לפריט,
רשום כאן כבזבוז בנייה לידיעת אופיר. **תיקון (API בלבד, לא env, לא DNS):**
`PATCH /v9/projects/{id}/branch` עם `branch=audit/final-audit`, אומת ב-GET:
`productionBranch=audit/final-audit`. **אימות:** commit ריק `9e0df9ff9` נדחף
01:47:17; **7 שניות אחרי** נוצרה `dpl_79smj1WGM5V6wzJiuXafMVmPsFWN`,
`source=git`, `target=production`, `gitSource.ref=audit/final-audit`; לוג:
`Cloning ... Commit: 9e0df9f`, `Restored build cache from previous deployment
(FxGwtE5H6hw4L9ccU4yJNYmuhVni)`, `deploy preflight: clean`, `Compiled
successfully in 7.3s`, אותן שורות `supabase.rls_denied` (חוסם #3); **READY +
PROMOTED ב-01:48:51**, aliases `www.kenyonexpress.co.il`, `kenyonexpress.co.il`,
`kenyonexpress.vercel.app`. חי: `GET /v13/deployments/www.kenyonexpress.co.il`
מחזיר את `dpl_79smj...`; `www` 200 `age: 0`; apex 308 ל-`www`; `/api/health`
`{"ok":true,"database":"ok"}`. **מרגע זה כל push ל-`audit/final-audit` הוא
פריסת פרודקשן אוטומטית** (לפני L02 פרודקשן התעדכן רק בפריסת CLI ידנית, L01).
**החלטה שהתקבלה לבד:** שינוי ה-production branch הוא הגדרת פרויקט ב-Vercel
שהפריט ביקש במפורש ("if not fix the setting via API"), והפריסה האוטומטית בנתה
את אותו קוד שכבר חי (`e1719ad66` + שני קומיטי docs + commit ריק), ולכן לא
נחשב "push לפרודקשן" שמחייב עצירה. שערים (סקראב `env -u` של 55 שמות,
`RESIDUAL=0`): `pnpm type-check` exit 0; `pnpm lint` exit 0 (docs-index-gate
282, docs-path-audit 155 ללא שינוי); `pnpm test` **615/615 קבצים, 7340 עברו,
12 דולגו (7352)**, 56.3 שניות; `rm -rf .next && CARDCOM_USE_MOCK=true
NEXT_PUBLIC_APP_URL=http://localhost:4993 pnpm build` exit 0, אפס `Invalid API
key`, `BUILD_ID` `JL728RxB-vGgGNmR1asQc`, 92 שורות `rls_denied`. **תקלת
מדידה אחת, שלי:** ריצת test ראשונה עם סקראב של 30 שמות (`[SENSITIVE]` בלבד)
נפלה 8/7352 בשני קבצים (`resend.test.ts`, `invoices.test.ts`, "key unset" מול
מפתחות אמיתיים של ה-harness), התקלה המתועדת בזיכרון; הסקראב הורחב ל-55
שמות והסוויטה ירוקה. `compare.mjs` לא נדרש (אפס שינוי UI, אפס שינוי קוד).
קבצים: `STATE.md`, `docs/STATE-ARCHIVE.md` (M18-c95 הועבר).

**M18-c95 - DONE (05.10.2026).** ארכיון מלא ב-`docs/STATE-ARCHIVE.md`
(הועבר ב-L02): STATE.md עמד על 216 שורות, M17-c95 הועבר לארכיון, מחזור c95
(18 פריטים) נסגר, אפס שינוי קוד, ארבעת השערים ירוקים.

**M17-c95 - DONE (05.10.2026).** ארכיון מלא ב-`docs/STATE-ARCHIVE.md`
(הועבר ב-M18-c95): RTL/LTR אומת על `/` ושלושת סלאגי הדגימה
ב-380/768/1440, 12/12 PASS, אפס leak, אפס דריפט מ-M17-c94, אפס שינוי קוד.

**M16-c95, M15-c95, M14-c95, M13-c95, M12-c95, M11-c95, M10-c95, M09-c95, M08-c95, M07-c95, M17-c94, M16-c94, M15-c94, M12-c94, M09-c94, M08-c94,
M07-c94, M06-c94, M05-c94, M10-c94** וכל מה שקדם להם (M04-c94..M01-c94,
M18-c93..M03-c93, ועד M01-c55) מתועדים במלואם ב-`docs/STATE-ARCHIVE.md`,
החדש למעלה; כולם DONE עם אפס דריפט וארבעת השערים ירוקים. ההעברות נעשו
שלב-שלב (האחרונה: M17-c95 ב-M18-c95) לשמירה על תקרת 300 שורות; שום
שורה לא נמחקה מהארכיון, רק הוסרה כאן הכפילות.

**DEPLOY-UNBLOCK - RESOLVED ב-L01 (05.10.2026).** פרודקשן מגיש `e1719ad66`
(`dpl_FxGwtE5H6hw4L9ccU4yJNYmuhVni`), ראו L01 למעלה. ההיסטוריה שמתחת
נשמרת כפי שהייתה. הרשומה המקורית, עד M14-c95: הרשומה
המקורית (04.10) אמרה: חסרים שלושה משתני Cardcom ב-Production ו-`ALLOW_INCOMPLETE_ENV`
קיים. **שניהם נסגרו על ידי סשן מקביל ב-04.10** (M14-c94, M14-c95). החוסם
הנוכחי הוא קוד: `39eb43947` הוסיף `refs` ל-`.vercelignore`, ולכן כל
פריסת HEAD נופלת ב-`pnpm build` על `refs/electro-checkout-text.json`
(חמש פריסות ERROR ב-04.10, לוג ב-M14-c95 למעלה). תיקון של שורה אחת
יושב לא-מחויב בעץ של סשן מקביל. פרודקשן READY עדיין `main@18ed044b2`
(`dpl_2zzvvFGMoS5icgrgL94er8USKwsj`, 02.10), 1162 קומיטים מאחורי HEAD.
**לאופיר/לסשן המתקן:** לחייב את תיקון `.vercelignore`, ואז deploy
`target: production` מ-`audit/final-audit`. ההיסטוריה המלאה של הרשומה
ב-`docs/STATE-ARCHIVE.md` (M14-c95).

**M14-c73 - נסגר בפועל ב-L01 (05.10.2026)**: הפריסה הזרה הוחלפה בפריסת HEAD
מהתור. מקור ההחלפה של 02.10 עדיין לא ידוע. הרשומה המקורית: production הוחלף חי מחוץ
לתור (`main`@`18ed044b2`, `SENTRY_DSN` חדש), מקור לא ידוע, לא תוקן/
הוחזר, פורט מלא ב-`docs/BACKLOG.md` סעיף 17 (ארכיון מלא, שבעת
הממצאים, ב-`docs/STATE-ARCHIVE.md`). נבדק שוב בכל סבב עד M14-c80
(למעלה): אפס דריפט, אותה פריסה בדיוק, ממתין להחלטת אופיר.

**כל סעיף מ-M18-c58 ועד M01-c55** (כולל M17-c58..M01-c58, M18-c57..M08-c57,
M06-c57..M01-c55, M18-c55..M01-c56, M16-c55..M13-c55, M07-c55, M03-c55..
M01-c55) היה מסומן כאן "ארכיון מלא ב-`docs/STATE-ARCHIVE.md`" וכווץ לשורה
הזו במספר שלבים (M04-c59, M08-c58) לשמירה על תקרת 300 שורות — שום שורה
לא נמחקה מהארכיון עצמו, רק הוסרה כאן הכפילות. ההיסטוריה המלאה (Q01..Q24,
B01..B10, M01-c1..M15-c56, תור 23.09, וכל מה שקדם) נשארת שלמה, החדש
למעלה, ב-`docs/STATE-ARCHIVE.md`. הקובץ הזה מחזיק רק את מה שחי.

## טבלת מצב לתור `final-queue.txt`

התור נסגר (B10 היה האחרון). כל השורות (Q01..Q24, B01..B10, M01-c1..M09-c1,
M11-c51..M15-c52) הועברו ל-`docs/STATE-ARCHIVE.md` ב-M14-c53 לשמירה על
תקרת 300 שורות; שום שורה לא נמחקה, רק הוזזה. SHOWABLE: no, ראו "חוסמים
פתוחים" למטה.

## חוסמים פתוחים (לא בידי הסוכן)

1. **DNS אצל הרשם — RESOLVED (29.09, M01-c52).** ה-NS של `kenyonexpress.co.il`
   כבר `ns1.vercel-dns.com`/`ns2.vercel-dns.com` (לא `ns1/ns2.vercel.com`
   כפי שנמדד בכל בדיקה מ-25.09 ועד M18-c51). `dig +short A` מחזיר
   `216.198.79.1`/`216.198.79.65`, `curl` ל-`www.kenyonexpress.co.il` מחזיר
   `200` עם תוכן אמיתי (`lang="he" dir="rtl"`, כותרת קניון EXPRESS). מי שינה
   ומתי — לא נמדד, רק התוצאה. **לחשבון שלושה פרויקטי Vercel; רק הפרויקט
   בשם `kenyonexpress` (`prj_v49dZbPUpk1UxyHbXTCiIJlQ7opP`) מחזיק את הדומיין
   — `kenyonexpress-prod` הוא פרויקט אחר שמחזיק רק `.vercel.app`, אל תבלבלו
   ביניהם.** פירוט מלא ברשומת M01-c52.
2. **RESOLVED ב-L01 (05.10):** פרודקשן מגיש את HEAD (`e1719ad66`,
   `dpl_FxGwtE5H6hw4L9ccU4yJNYmuhVni`), `robots.txt` ו-`sitemap.xml` החיים
   כבר בגרסת HEAD. הטקסט שמתחת הוא ההיסטוריה עד 05.10 בבוקר. **M14-c95:** משתני ה-env שחסמו את ה-preflight נסגרו;
   החוסם עכשיו הוא `refs` ב-`.vercelignore` (`39eb43947`), ראו DEPLOY-UNBLOCK
   למעלה. הטקסט שמתחת הוא ההיסטוריה עד 04.10. **פריסת פרודקשן של HEAD (285 קומיטים אחרי `a388118f1` החי, ספירת git
   בלבד, עודכן ב-M01-c65 מ-267 שנמדד ב-M01-c64; ניסיון הפריסה הידני האחרון
   היה ב-M01-c55, 105 קומיטים אז)**:
   נוסתה לאחרונה ב-M01-c55 (Vercel MCP, `create_deployment`, `gitSource`
   github, `audit/final-audit`@`291bc2d88`) **וסורבה ב-`deploy-preflight`**
   באותה סיבה בדיוק, פעם חמישית ברציפות (M01-c1, M01-c52, M01-c53, M01-c54,
   M01-c55): `dpl_FJYf483tkqSNf5pkG9MenghGQF46`, `BUILD_UTILS_SPAWN_1`.
   **מ-M01-c56 ועד M01-c65 לא נוסה ניסיון פריסה ידני נוסף** (כלל "goal שנתקע
   פעמיים, לדלג", מוחל מ-M01-c55, פעם אחת-עשרה ב-M01-c65, כולל דחיית משימת
   התור שביקשה בפירוש build+deploy חדש, ראו M01-c65 למעלה), אך התנאי נבדק
   שוב בקריאה בלבד בכל פעם ואושר ללא שינוי: `CARDCOM_TERMINAL_NUMBER`,
   `CARDCOM_API_NAME`, `CARDCOM_API_PASSWORD` עדיין חסרים ב-Production
   (קיימים במקומם `CARDCOM_MERCHANT_ID`/`CARDCOM_CLIENT_ID`/`CARDCOM_API_KEY`
   שהקוד לא קורא) ו-`ALLOW_INCOMPLETE_ENV` עדיין מוגדר שם (Vercel MCP,
   `filter_project_envs`, קריאה בלבד, M01-c65).
   **`list_deployments` (target=production, 5 אחרונות) מראה בדיוק את
   אותן חמש פריסות `ERROR` שנמדדו ב-M01-c61 עד M01-c64**, שום push מאז
   לא הפעיל build אוטומטי חדש (`1083b8d8d`, `99b2079cb`, `0bcbdac18`,
   `291bc2d88` פעמיים), כולן `ERROR` באותה סיבה, נמדד שוב M01-c65.
   עד שאופיר יתקן את הסביבה אין פריסה אפשרית מהענף הזה; פרודקשן נשאר על
   `a388118f1` (`dpl_EMtv9KbPfdGq75JLSNysp1wx3DQa`, READY, מאושר שוב
   ב-M01-c65 דרך `curl` ישיר על `www.kenyonexpress.co.il`). **DNS
   אינו קשור לחוסם הזה**, נמדד שוב ב-M01-c65: `www.kenyonexpress.co.il`
   מחזיר 200 עם התוכן החי, `kenyonexpress.co.il` מפנה 308 ל-`www`, ה-NS
   עדיין `ns1/ns2.vercel-dns.com`. **תוצאה קונקרטית נוספת, M12-c68**:
   `robots.txt` החי עדיין בגרסת `a388118f1`, בלי שלוש כתובות-האסימון
   (`/gift/`,`/order/`,`/wishlist/s/`) ו-`/debug/` שתוקנו ב-M12-c67 — ונבדק
   חי ששלושתן מחזירות `200` בפרודקשן כרגע, בלי כיסוי `Disallow`. **עוד
   תוצאה קונקרטית, M11-c73**: `sitemap.xml` החי גם הוא עדיין בגרסת
   `a388118f1` — `urlset` שטוח, לא `sitemapindex` (סעיף 79, 09.09), וחמשת
   נתיבי תתי-המפות של הקוד הנוכחי מחזירים `404` בפרודקשן.
3. **מיגרציות ממתינות**: **218 (טריגר `enforce_profile_privilege_columns` מפיל כל
   עדכון פרופיל של לקוח ב-42703; נמדד 25.09 ב-M05-c1, 5 מ-5 לקוחות, בניגוד לרישום
   "הוחלה" מ-21.09)**, 245 ו-246 (advisors, M05-c1; 245 אחרי 209 ואחרי 203), 204 (הצטרפות ספקים והסכם click-wrap; בלעדיה הטופס
   עונה "עדיין לא פעיל"), 240 (הסכמת "הכל באפליקציה"), 241 (עיר משלוש
   כותרות), 242 (מקור מחיר + ביקורות גוגל), 243 (תנאי מוצר), 244 (קמפיינים
   והמרות של תוכנית השותפים; בלעדיה התוכנית "עדיין לא פתוחה"), 247 (`anon`
   בלי הרשאת SELECT על `reviews`, נמדד M18-c52; בלעדיה דף הביקורות הציבורי
   נכשל תמיד, ללא תלות בשום קובץ אחר). סדר והתנאים
   ב-`docs/RUNBOOK.md`, סקירה ב-`docs/MIGRATION-REVIEW.md`. **אומת שוב
   M10-c95 (05.10, בדיקה ישירה מול פרודקשן בפועל דרך CLI-keychain-token,
   לא רק git, 15 אובייקטים של 13 קבצים): כל 19 הקבצים החוסמים עדיין לא
   הוחלו, אפס סחיפה מ-M10-c93.**
   60 קבצים ב-`migrations/pending/`, `git log -1` עדיין `48c8792dd` (248).
4. **R2 לא מופעל בחשבון Cloudflare** (10.09): תמונות המוצר נופלות ל-Supabase
   Storage, וגיבויי ה-DB החיצוניים אינם נכתבים כלל.
5. **צילומי reference ב-380 וב-768 לסל ולקופה**: קיימים רק ב-1440
   (`refs/live-cart.png`, `refs/live-checkout.png`), ולכן השער של Q10 נמדד ב-1440
   בלבד. **דף המוצר נסגר ב-Q05b (25.09)** עם reference של Electro v7 בשלושת
   הרוחבים (`refs/electro_product_{380,768,1440}.png`, נוצר מחדש בפקודה
   ב-`docs/MISSING-ASSETS.md` סעיף 1; `refs/` אינו ב-git). **לסל ולקופה נוסה
   ב-M09-c1 (25.09): הדמו עונה `403 - Forbidden` על `/cart/` ועל `/checkout/`, עם
   seed ובלי, בעוד המוצר נפתח.** הסקריפט כבר יודע לזרוע (`--add-to-cart=2439`)
   והשער כבר מחווט; הפקודות ליום שהדמו יענה ב-`MISSING-ASSETS.md` סעיף 1b.
6. **`RESEND_API_KEY` בפרודקשן**: השם קיים ב-target Production של הפרויקט
   (נמדד 25.09, Q24; הערך לא נקרא). בלי ערך תקף כל חמשת המיילים נופלים
   בשקט ל-`skipped`, ואיפוס סיסמה חוזר ל-SMTP של Supabase.
7. **`SUPABASE_SECRET_KEY` חשוף ודורש רוטציה** (CLAUDE.md, `RUNBOOK`);
   `deploy-preflight` מסרב לבנות איתו, ומ-B01 (25.09) הוא רץ בפועל לפני
   `pnpm build` ב-`vercel.json`. **נמדד ב-M01-c1: הסריקה על סביבת Production
   של Vercel לא מצאה את המפתח החשוף** (אף שורת `COMPROMISED`), כלומר החשיפה
   נוגעת לעותקים מקומיים ולנוהל, לא לפריסה.
8. **Cardcom בפרודקשן**: ספק התשלום ב-mock, נמדד 25.09 על `/checkout` החי
   (`frame-src ... 'self'`); 24 תשלומי `mock-` ו-0 אמיתיים ב-30 יום. שמות
   `CARDCOM_API_KEY`/`CLIENT_ID`/`MERCHANT_ID`/`USE_MOCK` ו-`CHECKOUT_ENABLED`
   קיימים בפרויקט (ערכים לא נקראו).
9. **מספר עוסק/ח.פ לשורת המוכר** באישור הרכישה (Q09): אינו קיים בריפו.
   עריכה אחת ב-`messages/he.json`, `purchaseConfirmation.sellerName`.
10. **המתזמן מתוזמן ונדחה** (Q24): `cron.yml` על `main` נכשל 40/40, כל נתיב
    עונה 401 ל-`CRON_SECRET` של GitHub (סוד שונה מזה ב-Vercel). 72 הודעות
    `pending` ב-`notification_outbox` מאז 10.09; `expire-vouchers` ושאר 21
    העבודות לא רצות. תיקון: אותו ערך בשני המקומות. פעולה של אופיר בלבד.
11. **הקטלוג החי מכיל שורות תבנית וכפילויות** (`supabase/catalogue-known-issues.json`,
    **26** ממצאים על 44-46 מוצרים פעילים לפי המדידה — לא 25; ראו M15-c53
    למעלה): שלוש שורות `מאסטר`, חמש `-copy`/`-העתק`/`-לדוגמא`, שמות שסותרים
    slug, מחיר שסותר את הטקסט של עצמו, ותמונה חסרה (`מזקקת וויסקי`). **לא
    היה רשום כחוסם ב-STATE.md עד M15-c51** (נמדד ב-`docs/LAUNCH-READINESS.md`
    שורה חוסמת 6 ו-`CLAUDE.md` §"מצב נוכחי", ששניהם עדיין אומרים 25); שער
    `pnpm test src/lib/catalogue` ירוק מול הפנקס — הפנקס הוא הכרעת מפעיל,
    לא תקלה שנמדדת.
12. **`scripts/cron-jobs.json` ב-`main` מכיל שבעה נתיבים ש-HEAD אינו מגיש**
    (`search-reindex`, `job-dlq`, `search-outbox`, `cashback-settlement`,
    `email-retry`, `expire-cashback`, `expire-coupons`), כל אחד עונה 404 גם
    אחרי שחוסם 10 נסגר. נפתר מעצמו במיזוג הענף הזה ל-`main`. **לא היה רשום
    ב-STATE.md עד M15-c51** (נמדד ב-`docs/LAUNCH-READINESS.md` ידני 9).
13. **הענף המקומי `main` בריפו הזה סוטה מ-`origin/main`, לא רק מאחורה**
    (נמדד M16-c54, re-verified M16-c55 אפס שינוי): קצה מקומי `3f6ca53c3` (10.09), קצה remote
    `18ed044b2` (18.09), אין קשר-אב בין השניים. **לא עבודה אבודה**: קצה
    ה-`main` המקומי הוא ancestor של `origin/audit/final-audit` וגם
    `origin/work/goal-queue-0923` — מצביע-ישן משורשלת ה-`audit`, לא ענף
    נפרד. **לא לפעולה מצד הסוכן**: `main` מוגן ב-GitHub, וסטייה כזו
    תדרוש force-push כדי לדחוף, אסור לפי הכללים. אם רוצים לנקות את
    ה-ref המקומי המבולבל (`git branch -f main origin/main`, לא מיזוג
    ולא מחיקה) — החלטה של אופיר.

14. **`kenyonexpress.co.il` עצמו נסרב כ-live reference ב-`scripts/compare.mjs`
    (נמדד לראשונה ב-Q31, 01.10.2026, `--page=home`)**: ה-DNS כבר מצביע
    לפריסת Vercel שלנו (חוסם #2 למעלה), כך שניווט חי לדף הבית מחזיר את
    הבנייה שלנו ("live side is our-build", REFUSED, לא PASS שקרי). מאותו
    רגע **כל מדידה על `home` חייבת `--baseline='refs/ke_live_{width}.png'`**
    (קיים בשלושת הרוחבים, נבדק PASS ב-Q31: `8.51%`/`9.02%`/`3.95%`). לדף
    המוצר יש כבר באותו תבנית (`refs/ke_live_product_{width}.png`, Q05b).
    **`category` נסגר כבר ב-Q27**: `refs/electro_shop_{width}.png`
    (Electro `/shop/`) קיים בשלושת הרוחבים, נבדק PASS שוב ב-M03-c66
    (01.10.2026, אפס דריפט: 3.53%/2.52%/1.69%). **לא נבדק**: אם
    `products`/`search` נתקלים באותו סירוב — יש להם רק צילום בודד
    לא-ממותג-רוחב (`refs/live-{products,search}.png`), לא `{width}` לכל
    רוחב, כך שהם עלולים להיתקע ללא reference תקין בכלל. בדיקה והקפאת
    reference תלת-רוחבי לשניהם, אם יידרש מדד חזותי עליהם, היא עבודה של
    פריט עתידי.

## ידני לאופיר, לפי סדר קריטיות

הרשימה המלאה, ממוזגת עם `docs/LAUNCH-READINESS.md` וללא כפילויות, עברה
ל-`docs/BACKLOG.md` (M15-c51). לא נשמר עותק כאן, כדי שלא ייסטה שוב.
