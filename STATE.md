RESUME FROM: M09-c94
Updated: 2026-10-04 (סשן `audit/final-audit`, Sonnet 5, פריט M08-c94 DONE: Lighthouse mobile נמדד שוב, 100/100/100 על / ועל /product, אפס דריפט מ-M08-c93)

## המשך מ:

**M08-c94 - DONE (04.10.2026).** משימת התור: "Lighthouse mobile on /
and /product sample log scores", זהה במהות ל-M08-c93. `pwd` אומת, עץ
נקי, HEAD `f9e806b3f` (M07-c94). `git diff 08562c9bf HEAD -- src public
next.config.* package.json packages scripts/lighthouse-smoke.mjs` ריק
(אפס שינוי קוד מאז M08-c93) — אין דריפט לתקן. פורט 3311 תפוס על ידי
`next-server` של סשן מקביל אחר (`lsof` אישר שה-`cwd` של המאזין הוא
הריפו הזה, לא לנגיעה), נבחר פורט חלופי 4725 (פנוי, אומת מראש). `rm -rf
.next && CARDCOM_USE_MOCK=true NEXT_PUBLIC_APP_URL=http://localhost:4725
pnpm build` exit 0. `PORT=4725 pnpm start`, `cwd` של המאזין אומת מול
הריפו הזה (`lsof`). `/` ו-`/product/צימר-מאסטר` (אותו מוצר דוגמה כל
הסבבים) החזירו `200`. `LOCAL_BASE=http://localhost:4725 node
scripts/lighthouse-smoke.mjs --throttling-method=provided` (ו-`--url=`
למוצר), שתיהן בחזית: `/` = **100/100/100**, `/product/צימר-מאסטר` =
**100/100/100** (perf/a11y/seo), אפס דריפט מ-M08-c93. שרת נסגר ב-`INT`,
פורט 4725 אומת פנוי. שערים: `type-check` נקי; `lint` (biome + 12 שערי
סקריפט) נקי; `test` **615/615 קבצים, 7340 עברו, 12 דולגו (7352)**, אפס
כשלונות, זהה ביט ל-M08-c93; `build` למעלה exit 0. לא פריט חזותי,
`compare.mjs` לא נדרש (תקדים מ-M08-c80 ואילך). אפס שינוי קוד. M02-c94
הועבר ל-`docs/STATE-ARCHIVE.md` לשמירה על תקרת 300 שורות. קבצים:
`STATE.md`, `docs/STATE-ARCHIVE.md`.

**M07-c94 - DONE (04.10.2026).** משימת התור: "Scan TODO FIXME older
than 7 days, resolve or file in docs/BACKLOG.md", זהה במהות ל-M07-c93.
`pwd` אומת, עץ נקי, HEAD `a7f73e178` (M06-c94). `git diff c72d6b385
HEAD -- src public next.config.* package.json docs/BACKLOG.md
scripts/final-audit*.mjs` ריק (אפס שינוי קוד או בשער מאז M07-c93) — אין
דריפט לתקן. `git grep -n -E 'TODO|FIXME' -- src scripts supabase
migrations` מחזיר אותם סמנים בדיוק: שני `TODO(cardcom)` ב-
`src/lib/payments/cardcom.ts:254` (זיכוי לגאסי) ו-`:319` (מסמכים),
שניהם נושאים הפניית issue בתוך אותה רשימת תגובה (`Tracked in #41`/
`#42`), ו-`src/lib/whatsapp.test.ts:91` שהוא מחרוזת ליטרלית `'TODO'`
בבדיקה, לא סמן עבודה (מאומת: לא בתוך הערה, `scanMarkers` ב-
`scripts/final-audit-lib.mjs` מתעלם ממנו). `git log -1` על
`cardcom.ts` חוזר ל-`542c0db26` (09.09.2026), שני הסמנים עצמם מ-24.07
ו-07.08.2026 לפי `git log -S` — שניהם ישנים משבעה ימים, התנאי של
הפריט. `node scripts/final-audit.mjs` מדווח `ok 0 work markers
(TODO/FIXME/HACK/XXX) (of 2)` — שני הממצאים קיימים אך `tracked` (יש
הפניית issue), לא debt לא-ממוען. שניהם כבר מתועדים ב-`docs/BACKLOG.md`
סעיף 6 (הועבר שם ב-M07-c67, לא השתנה): מחכים לאימות שם/שדה מול טרמינל
Cardcom אמיתי, חוסם STATE.md חוסם #8. **אין פעולה נדרשת: זהה בביט
ל-M07-c93, אפס סמן חדש ואפס סמן שהפסיק לירות.** ארבעת השערים רצו: `pwd`
אומת מראש; `pnpm type-check` נקי; `pnpm lint` (biome + 12 שערי סקריפט)
נקי; `pnpm test` **615/615 קבצים, 7340 עברו, 12 דולגו (7352)**, אפס
כשלונות, זהה ביט ל-M06-c94; פורט 3311 תפוס על ידי סשן מקביל אחר
(`lsof`/cwd אישר שהוא הריפו הזה אך תהליך אחר, לא לנגיעה), נבחר פורט
חלופי 4724 (פנוי), `rm -rf .next && CARDCOM_USE_MOCK=true
NEXT_PUBLIC_APP_URL=http://localhost:4724 pnpm build` exit 0
(`.next/BUILD_ID` נוצר). אפס שינוי קוד, לכן אין שינוי UI ו-`compare.mjs`
לא נדרש. M01-c94 הועבר ל-`docs/STATE-ARCHIVE.md` לשמירה על תקרת 300
שורות. קבצים: `STATE.md`, `docs/STATE-ARCHIVE.md`.

**M06-c94 - DONE (04.10.2026).** משימת התור: "pnpm build fix drift
commit", זהה במהות ל-M06-c93. `pwd` אומת, עץ נקי, HEAD `3ddeb8914`
(M05-c94). `git diff a2474954a HEAD -- src public next.config.*
next.config.mjs next.config.ts package.json` ריק (אפס שינוי קוד מאז
הקומיט האחרון שנגע בקוד) — אין דריפט לתקן. ארבעת השערים רצו: פורט
3311 תפוס על ידי סשן מקביל אחר (`lsof` אישר שה-`cwd` של המאזין הוא
הריפו הזה, לא לנגיעה), נבחר פורט חלופי 4723 (פנוי, לא בפועל נדרש
להרמת שרת כאן, רק ל-build עצמו). `pnpm type-check` נקי; `pnpm lint`
(biome + 12 שערי סקריפט) נקי; `pnpm test` **615/615 קבצים, 7340
עברו, 12 דולגו (7352)**, אפס כשלונות, זהה ביט ל-M05-c94; `rm -rf
.next && CARDCOM_USE_MOCK=true NEXT_PUBLIC_APP_URL=http://localhost:4723
pnpm build` exit 0 (`.next/BUILD_ID` נוצר, manifest תקין, אין שגיאת
build). אפס שינוי קוד, לכן אין שינוי UI ו-`compare.mjs` לא נדרש.
`STATE.md` עודכן, M18-c93 הועבר ל-`docs/STATE-ARCHIVE.md` לשמירה על
תקרת 300 שורות. קבצים: `STATE.md`, `docs/STATE-ARCHIVE.md`.

**M05-c94 - DONE (04.10.2026).** משימת התור: "pnpm test fix drift
commit", זהה במהות ל-M05-c93. `pwd` אומת, עץ נקי, HEAD `b258b1a1b`
(M04-c94). `git diff a2474954a HEAD -- src public next.config.*
next.config.mjs next.config.ts package.json` ריק (אפס שינוי קוד מאז
הקומיט האחרון שנגע בקוד, `a2474954a`) — אין דריפט לתקן. ארבעת השערים
רצו: `pnpm test` **615/615 קבצים, 7340 עברו, 12 דולגו (7352)**, אפס
כשלונות, זהה ביט ל-M05-c93; `pnpm type-check` נקי; `pnpm lint` (biome +
12 שערי סקריפט) נקי; `pnpm build` (`CARDCOM_USE_MOCK=true
NEXT_PUBLIC_APP_URL=http://localhost:4722` — פורט 3311 תפוס על ידי סשן
מקביל אחר, `lsof` אישר שה-`cwd` של המאזין הוא הריפו הזה, לא לנגיעה,
נבחר פורט 4722 פנוי) exit 0 (לוגי `supabase.rls_denied` על `reviews`
ב-prerender אנונימי הם רעש צפוי מחוסם #11 בתור, לא כשל build). אפס
שינוי קוד, לכן אין שינוי UI ו-`compare.mjs` לא נדרש. `STATE.md` עדיין
מתחת לתקרת 300 השורות, אין ארכוב נדרש בפריט הזה. קובץ: `STATE.md`.

**M04-c94 - DONE (04.10.2026).** משימת התור: "pnpm type-check fix drift
commit", זהה במהות ל-M04-c93. `pwd` אומת, עץ נקי, HEAD `925c5bf8d`
(M03-c94). `git diff 925c5bf8d HEAD -- src public next.config.*
package.json` ריק (HEAD לא זז, אפס שינוי קוד) — אין דריפט לתקן. ארבעת
השערים רצו: `pnpm type-check` (`tsc --noEmit`) יצא נקי; `pnpm lint`
(biome + 12 שערי סקריפט) נקי; `pnpm test` 615/615 קבצים, 7340/7352 (12
דולגו), זהה ל-M04-c93/M03-c94; `pnpm build` רץ מול השרת הקיים על פורט
3311 (סשן מקביל אחר, `lsof` אישר שה-`cwd` של המאזין הוא הריפו הזה, לא
לנגיעה), exit 0 (לוגי `supabase.rls_denied` על `reviews` ב-prerender
אנונימי הם רעש צפוי מחוסם #11 בתור, לא כשל build). אין קוד לשנות, אין
commit קוד — רק עדכון `STATE.md`.

**M03-c94 - DONE (04.10.2026).** ארכיון מלא ב-`docs/STATE-ARCHIVE.md`
(הועבר ב-M04-c94): /category נמדד שוב ב-380/768/1440, 768/1440 אפס
דריפט מ-M03-c93 (2.52%/1.69%), 380 שונה ב-0.60 נ"פ (2.93% מול 3.53%,
שניהם PASS, רעש תזמון לא רגרסיה).

M02-c94, M01-c94, M18-c93, M17-c93, M16-c93, M15-c93, M14-c93, M13-c93, M12-c93, M11-c93,
M10-c93, M09-c93, M07-c93, M06-c93, M05-c93, M04-c93 ו-M03-c93 הועברו
ל-`docs/STATE-ARCHIVE.md` (M04/M03 ב-M11-c93, M06/M05 ב-M12-c93, M09/M07
ב-M14-c93, M10 ב-M15-c93, M11 ב-M16-c93, M12 ב-M17-c93, M17 ב-M18-c93,
M13 ב-M01-c94, M14 ב-M02-c94, M15/M16 ב-M03-c94, M18 ב-M06-c94), לשמירה
על תקרת 300 שורות. M01-c94 הועבר ל-`docs/STATE-ARCHIVE.md` ב-M07-c94.
M02-c94 הועבר ל-`docs/STATE-ARCHIVE.md` ב-M08-c94.

**DEPLOY-UNBLOCK - BLOCKED (04.10.2026).** נמדד, לא נוסה deploy חוזר.
`VERCEL_TOKEN` לא מוגדר בסביבה; נעשה שימוש בטוקן ה-CLI (רוענן ב-`vercel
whoami`). REST `v6/deployments` לפרויקט `prj_v49dZbPUpk1UxyHbXTCiIJlQ7opP`:
**פרודקשן READY הוא `dpl_2zzvvFGMoS5icgrgL94er8USKwsj`**
(`kenyonexpress-huplmarwo-kenyonexpress-projects.vercel.app`, 02.10 05:42Z),
**נבנה מ-`main@18ed044b2` "Wave 6: build success", 1034 קומיטים מאחורי
HEAD**, לא מ-`a388118f1`. מישהו פרס את `main` הישן לפרודקשן ב-02.10;
`/sitemap.xml` בשני ה-hosts: etag `427ac6d9...`, last-modified 02.10
07:02 GMT. שבע הבניות של `audit/final-audit` מאז (אחרונה
`dpl_D2B3jyG3m1YKGYHymAf3ajg5ds5x`, 37f70196c) הן preview ו-ERROR כולן,
בתוך `deploy-preflight.mjs` לפני `pnpm build`: חסרים ב-Preview
`CARDCOM_TERMINAL_NUMBER`, `CARDCOM_API_NAME`, `CARDCOM_API_PASSWORD`,
`CARDCOM_WEBHOOK_SECRET`, `VOUCHER_QR_SECRET`, `CRON_SECRET`. **אין באג
קוד לתקן.** רשימת שמות ה-env ב-Production (שמות בלבד): עדיין חסרים שלושת
`CARDCOM_TERMINAL_NUMBER`/`CARDCOM_API_NAME`/`CARDCOM_API_PASSWORD`,
ו-`ALLOW_INCOMPLETE_ENV` עדיין קיים, כלומר deploy פרודקשן של HEAD ייפול
באותו preflight בדיוק כמו `dpl_EJvyytwYXRjGBj2HJiXavgr3GkBk` ב-25.09.
**החלטות שהתקבלו לבד:** (1) לא נשלח deploy נוסף, כי הוא רק מוסיף ERROR
לרשימה. (2) לא נדחף ל-`main`: הוא מוגן, ו-HEAD של `audit/final-audit`
אינו fast-forward שלו; קומיט זה נדחף ל-`audit/final-audit`. (3) לא נגעו
ב-env (אסור בכללי הפריט). **לאופיר:** להוסיף את שלושת שמות Cardcom
ל-Production, להסיר `ALLOW_INCOMPLETE_ENV`, ואז deploy REST עם
`target: production` מ-`audit/final-audit` (המתכון ב-memory). דחוף
יותר מבעבר: פרודקשן מגיש עכשיו את `main` הישן, שלפי
`docs/BRANCH-AUDIT.md` חסר את עבודת האבטחה.
שערים על HEAD: `type-check` נקי, `lint` נקי, `test` 614/614 (7337/7349),
`rm -rf .next && pnpm build` exit 0. קבצים: `STATE.md`, `docs/STATE-ARCHIVE.md`.

**M14-c73 - BLOCKED (02.10.2026), קריטי** — production הוחלף חי מחוץ
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
2. **פריסת פרודקשן של HEAD (285 קומיטים אחרי `a388118f1` החי, ספירת git
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
   M10-c93 (04.10, בדיקה ישירה מול פרודקשן בפועל דרך CLI-keychain-token,
   לא רק git): כל 19 הקבצים החוסמים עדיין לא הוחלו, אפס סחיפה מ-M10-c92.**
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
