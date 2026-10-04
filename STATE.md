RESUME FROM: M18-c93
Updated: 2026-10-04 (סשן `audit/final-audit`, Sonnet 5, פריט M17-c93 DONE: RTL על / ועל שלושה דפי מוצר נבדק שוב, אפס leak)

## המשך מ:

**M17-c93 - DONE (04.10.2026).** משימת התור: "Verify RTL on / and
/product sample no LTR leaks", זהה ל-M17-c92. `pwd` אומת, עץ נקי, HEAD
`98debe39b` (M16-c93). קוד: `git diff 55d7a4ddd HEAD -- src apps
packages` ריק, אפס שינוי מאז M17-c92. בזמן ריצה: `rm -rf .next &&
CARDCOM_USE_MOCK=true NEXT_PUBLIC_APP_URL=http://localhost:4993 pnpm
build` exit 0, `pnpm start -p 4993` (cwd המאזין אומת ב-`lsof`, הריפו
הזה). בדיקת Playwright על `/` ושלושת סלאגי הדגימה הקודמים
(`samsung-galaxy-s22-128gb-samsung-galaxy-s22-128gb-5g`, `חבילת-גלידה`,
`חיתולי-האגיס`, כל השלושה אושרו קיימים ב-`supabase/catalogue-snapshot.json`
לפני הריצה) ב-380/768/1440, 12 טעינות, כולן 200: `<html lang="he"
dir="rtl">`, `body` מחושב `rtl`, `scrollWidth` שווה לרוחב בכולן (אפס
גלילה צידית), ו**אפס אלמנט גלוי עם `direction: ltr` מחושב שמחזיק טקסט
עברי ישיר**. שער `rtl-logical` (חלק מ-`pnpm lint`) ירוק באותה ריצה.
**אפס leak, אפס דריפט, אפס שינוי קוד**, ולכן `compare.mjs` לא נדרש (אין
שינוי UI). השרת נעצר (SIGINT), הפורט פנוי. שערים: `type-check` 0, `lint`
0, `test` 615/615 (7340/7352, 12 דולגו), `build` exit 0. M12-c93 הועבר
ל-`docs/STATE-ARCHIVE.md` לשמירה על תקרת 300 שורות. קבצים: `STATE.md`,
`docs/STATE-ARCHIVE.md`.

**M16-c93 - DONE (04.10.2026).** משימת התור: "Verify all product pages
have JSON-LD Product and BreadcrumbList", זהה ל-M16-c92. `pwd` אומת, עץ
נקי, HEAD `38c97a876` (M15-c93). קוד: `git log 8e9096245..HEAD -- src
apps packages` ריק, אפס שינוי מאז M16-c92; הקומיט האחרון על
`src/lib/seo/json-ld.ts` עדיין `16318ef2c` (25.09) ועל
`src/app/(store)/product/[slug]/page.tsx` עדיין `fd820969f` (30.09),
והדף עדיין מזריק `buildProductJsonLd` ו-`buildBreadcrumbJsonLd`. בזמן
ריצה: `rm -rf .next && CARDCOM_USE_MOCK=true
NEXT_PUBLIC_APP_URL=http://localhost:4987 pnpm build` (exit 0), `pnpm
start -p 4987` (cwd המאזין אומת ב-`lsof`, הריפו הזה). כל 44 הסלאגים
מ-`supabase/catalogue-snapshot.json` נשלפו ונותחו: **44/44 מחזירים 200
עם בלוק `Product` אחד ובלוק `BreadcrumbList` אחד בדיוק**, אפס שגיאות
JSON. אפס דריפט מ-M16-c92. השרת נעצר ב-SIGINT, הפורט פנוי. שערים:
`type-check` 0, `lint` 0, `test` 615/615 (7340/7352, 12 דולגו), `build`
exit 0. לא חזותי, `compare.mjs` לא נדרש. M11-c93 הועבר
ל-`docs/STATE-ARCHIVE.md` לשמירה על תקרת 300 שורות. קבצים: `STATE.md`,
`docs/STATE-ARCHIVE.md`.

**M15-c93 - DONE (04.10.2026).** משימת התור: "Verify no console errors
on / and /product sample", זהה ל-M15-c92. `pwd` אומת, עץ נקי, HEAD
`3cd8de7c2` (M14-c93). קוד: הקומיט האחרון על `e2e/route-audit.spec.ts`
עדיין `b2b4b17a5` (29.09), אפס שינוי. בנייה טרייה (`rm -rf .next` ואז
`CARDCOM_USE_MOCK=true NEXT_PUBLIC_APP_URL=http://localhost:4976 pnpm
build`, exit 0), `pnpm start -p 4976` (אומת ב-`lsof` שה-cwd של המאזין הוא
הצ'קאאוט הזה). `e2e/route-audit.spec.ts` עם `--grep "anon /$|anon dynamic
catalogue routes"`, `E2E_BASE_URL=http://localhost:4976`,
`ROUTE_AUDIT_REPORT=/tmp/route-audit-m15c93.jsonl`: **4/4 PASS** (chromium
+ mobile-chrome, כ-66 שניות). הדוח, 16 שורות: אפס `consoleErrors` ואפס
`hydrationWarnings`, כל הנתיבים 200, על `/` ועל שבעת הנתיבים הדינמיים,
כולל `/product/צימר-מאסטר` ו-`/product/צימר-מאסטר/reviews` (דגימת המוצר).
אפס דריפט מ-M15-c92. השרת נעצר ב-SIGINT, הפורט פנוי. שערים: `type-check`
0, `lint` 0, `test` 615/615 (7340/7352, 12 דולגו), `build` exit 0. פריט
אימות בלבד, לא חזותי, `compare.mjs` לא נדרש. M10-c93 הועבר
ל-`docs/STATE-ARCHIVE.md` לשמירה על תקרת 300 שורות. קבצים: `STATE.md`,
`docs/STATE-ARCHIVE.md`.

**M14-c93 - DONE (04.10.2026).** משימת התור: "Verify Sentry release
matches HEAD commit", זהה ל-M14-c92. `pwd` אומת, עץ נקי, HEAD `bd16cee32`
(M13-c93). קוד: release מוגדר ב-`sentry.server.config.ts`/
`sentry.edge.config.ts` כ-`SENTRY_RELEASE ?? VERCEL_GIT_COMMIT_SHA`
וב-`instrumentation-client.ts` כ-`NEXT_PUBLIC_SENTRY_RELEASE ??
NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA`, אפס שינוי מאז `87a459403` (10.09).
נבדק מול Vercel REST, קריאה בלבד, טוקן ה-CLI, פרויקט
`prj_v49dZbPUpk1UxyHbXTCiIJlQ7opP`: פריסת הפרודקשן READY האחרונה עדיין
`dpl_2zzvvFGMoS5icgrgL94er8USKwsj`, `main@18ed044b2`, ולכן ה-release החי
הוא `18ed044b2`, לא HEAD. `SENTRY_DSN`/`NEXT_PUBLIC_SENTRY_DSN`
(production+preview) `createdAt` `1790918429743`, `SENTRY_AUTH_TOKEN`
(production) `1789566136944`, שניהם ללא שינוי מ-M14-c92. **תשובה:
ה-release שבפרודקשן אינו HEAD.** `git rev-list --count 18ed044b2..HEAD`
= **1123** (היה 1105 ב-M14-c92), `HEAD..18ed044b2` = 109 ללא שינוי. אפס
דריפט מהותי; אותו חוסם (DEPLOY-UNBLOCK למעלה, סעיף 17 ב-`docs/BACKLOG.md`).
ה-MCP של Sentry לא מאומת בסשן, רשימת ה-releases בתוך Sentry לא נקראה;
ה-release נגזר מה-commit של הפריסה. **החלטה שהתקבלה לבד:** DONE כאימות
ולא BLOCKED, כמו M14-c89..c92; לא נפתח חוסם כפול, לא נגעו ב-deploy
או ב-env. שערים: `type-check` 0, `lint` 0, `test` 615/615 (7340/7352,
12 דולגו), `rm -rf .next && CARDCOM_USE_MOCK=true
NEXT_PUBLIC_APP_URL=http://localhost:4812 pnpm build` exit 0. לא פריט
חזותי, `compare.mjs` לא נדרש. M07-c93 הועבר ל-`docs/STATE-ARCHIVE.md`
לשמירה על תקרת 300 שורות. קבצים: `STATE.md`, `docs/STATE-ARCHIVE.md`.

**M13-c93 - DONE (04.10.2026).** משימת התור: "Verify /api/health and
/api/ready return 200 with real deps", זהה ל-M13-c92. `pwd` אומת, עץ נקי,
HEAD `0ca3d4bd5` (M12-c93). קוד: הקומיט האחרון על `src/app/api/health`
ו-`src/app/api/ready` עדיין `64728ff8d` (02.09), אפס שינוי. חי, בשני
ה-hosts (`www.kenyonexpress.co.il` ו-`kenyonexpress-huplmarwo-...vercel.app`):
`/api/health` `200` `application/json`
`{"ok":true,"database":"ok","latency_ms":128}` (ו-97), תלות DB אמיתית.
`/api/ready` `503`
`{"ok":false,"checks":{"database":"ok","redis":"ok","meilisearch":"down","r2":"not_configured","cardcom":"not_configured"}}`,
זהה ל-M13-c92: Meilisearch מוגדר ולא נגיש (סעיף 16 ב-`docs/BACKLOG.md`,
חיצוני, לאופיר), R2 לא מופעל בחשבון, Cardcom ב-mock. "200 על ready" לא
מתקיים, והסיבה חיצונית ומתועדת, לא באג קוד. אפס דריפט מ-M13-c92.
**החלטה שהתקבלה לבד:** DONE כאימות, לא BLOCKED, כמו M13-c89..c92; לא
נפתח חוסם כפול. שערים: `type-check` 0, `lint` 0, `test` 615/615
(7340/7352, 12 דולגו), `rm -rf .next && CARDCOM_USE_MOCK=true
NEXT_PUBLIC_APP_URL=http://localhost:4531 pnpm build` exit 0 (פורט 3311
תפוס מריצה קודמת של הריפו הזה, לכן נבחר פורט 4531 פנוי), ה-manifest מראה
`/api/health` ו-`/api/ready` כ-`ƒ`. לא פריט חזותי, `compare.mjs` לא נדרש.
אפס שינוי קוד. קובץ: `STATE.md`.

M12-c93, M11-c93, M10-c93, M09-c93, M07-c93, M06-c93, M05-c93, M04-c93 ו-M03-c93
הועברו ל-`docs/STATE-ARCHIVE.md` (M04/M03 ב-M11-c93, M06/M05 ב-M12-c93, M09/M07
ב-M14-c93, M10 ב-M15-c93, M11 ב-M16-c93, M12 ב-M17-c93), לשמירה על תקרת
300 שורות.

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
