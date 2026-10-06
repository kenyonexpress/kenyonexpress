RESUME FROM: M16-c111
Updated: 2026-10-06 (סשן `audit/final-audit`, פריט M15-c112 DONE: אפס console errors ואפס hydration warnings על `/` ועל דגימת המוצר, 4/4 PASS בבנייה טרייה של `8877de66a`)

## המשך מ:

**M15-c112 - DONE (06.10.2026): אפס console errors ואפס hydration warnings על `/` ועל דגימת המוצר, בבנייה טרייה של HEAD `8877de66a`.**
משימת התור: "Verify no console errors on / and /product sample". `pwd` אומת, HEAD `8877de66a` = `origin/audit/final-audit`.
מאז M15-c111 (`4cc28b788`) השתנו 6 קבצי `src` (הסרת `export` ב-M09-c112), ולכן רץ אימות מלא ולא הסתמכות על הריצה הקודמת.
בעץ הראשי WIP זר (account/coupon/gifts/sitemap, ובו גם שגיאת biome ב-`src/server/queries/orders.ts` ו-`collected.test.ts`), לא נגעתי
ולא חויב; הכל רץ ב-worktree הנקי `/tmp/ke-m11-c112wt`, שהועבר (detached) ל-`8877de66a` ונשאר במקומו. `rm -rf .next`, `env -i`,
`CARDCOM_USE_MOCK=true`: build 0, 340/340, אפס `Invalid API key`, `BUILD_ID` `E58qhgyvnRo0KkxyB6cAS`. `pnpm start -p 4880` (PID 32843,
cwd המאזין אומת ב-`lsof` `/private/tmp/ke-m11-c112wt`, נעצר ב-INT, הפורט פנוי). `E2E_BASE_URL=http://localhost:4880
ROUTE_AUDIT_REPORT=/tmp/route-audit-m15c112.jsonl playwright test e2e/route-audit.spec.ts --grep "anon /$|anon dynamic catalogue routes"`,
בחזית: **4/4 PASS** (chromium + mobile-chrome, 45.0 שניות). הדוח, 16 שורות: **אפס `consoleErrors` ואפס `hydrationWarnings` בכל אחת**,
כולן 200 ו-`rtl:true`: `/`, `/product/צימר-מאסטר` ו-`/reviews` שלו (דגימת המוצר), `/category/hot-deals`, `/city/תל-אביב`,
`/coupons/<id>`, `/page/how-it-works`, `/s/<id>`. זהה ל-M15-c111.
**שערים** (אותו worktree, `env -i`): type-check 0; lint: כל השערים נקיים מלבד docs-path-audit ב-worktree, שנכשל רק על הפניות
ל-`refs/` ו-`supabase/.temp` (שניהם ב-gitignore), נקי בעץ הראשי (`OK. 155 known`); test **638/638, 7659 עברו, 12 דולגו**. אין שינוי UI,
ולכן `compare.mjs` לא נדרש. M09-c112 הועבר ל-`docs/STATE-ARCHIVE.md`. `RESUME FROM` נשאר M16-c111, כמו בשאר פריטי c112.

**M14-c112 - DONE (06.10.2026): release של Sentry בפרודקשן תואם ל-HEAD `d8942154e`. טוקן ההעלאה עדיין נדחה 401 (BACKLOG #21).**
משימת התור: "Verify Sentry release matches HEAD commit". `pwd` אומת, HEAD `d8942154e` = `origin/audit/final-audit`. קוד ה-release
לא השתנה (`SENTRY_RELEASE ?? VERCEL_GIT_COMMIT_SHA` בשרת/edge, `NEXT_PUBLIC_SENTRY_RELEASE ?? NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA` בלקוח;
הקומיט האחרון על קובצי האתחול ו-`next.config` עדיין `b1632df45`). בעץ הראשי WIP זר (account/coupon/gifts/sitemap), לא נגעתי ולא חויב.
**נמדד:** `vercel api /v6/deployments` (Production): הפריסה של HEAD `dpl_AdgHsyDsv2hgd8maFj8FJEnoegZ8` הייתה BUILDING, חיכיתי בחזית
עד READY, ואז `/v4/aliases/www.kenyonexpress.co.il` מצביע עליה (קודם `dpl_91M48...` על `29ce235cb`). ב-Production עדיין אין
`SENTRY_RELEASE`/`NEXT_PUBLIC_SENTRY_RELEASE` (`vercel env ls`, שמות בלבד: `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`),
כך שה-fallback ל-SHA קובע. **בבאנדל הלקוח החי** (21 קבצי JS של `/`, ה-HTML נושא `dpl=dpl_AdgHsy...`): בדיוק chunk אחד,
`immutable/chunks/34l4yzfbgcvpf.js`, מכיל `release:"d8942154e39801e3f179b063cd0ee539403c9b49"`, **זהה ל-HEAD**. לוג ה-build של אותה פריסה
(`vercel inspect --logs`) מריץ `sentry-cli releases new d8942154e...` ו-`sourcemaps upload -p kenyonexpress-web --release d8942154e...`,
**ושניהם עדיין `Invalid token (http status: 401)`** כאזהרה בלבד: ה-release לא נרשם בצד Sentry ואין source maps. MCP של Sentry דורש
הזדהות, כך שרשימת ה-releases ב-Sentry לא נקראה. ללא שינוי מ-M14-c111, כבר רשום ב-BACKLOG #21 (טוקן חדש, לאופיר), נוספה שורת מדידה.
**החלטה שהתקבלה לבד:** DONE ולא BLOCKED, כי תנאי הפריט (release = HEAD) מתקיים ונמדד בבאנדל החי; ה-401 הוא ממצא ידוע ונפרד.
**שערים** (worktree נקי `/tmp/ke-m11-c112wt` הועבר ל-`d8942154e`, `env -i`): type-check 0; lint: נכשל ב-worktree רק על docs-path-audit
(הפניות ל-`refs/` שב-gitignore), בעץ הראשי `docs-path-audit: OK. 155 known`; test **638/638, 7659 עברו, 12 דולגו**; `rm -rf .next` ואז
build עם `CARDCOM_USE_MOCK=true`: 0, 340/340, אפס `Invalid API key`, `BUILD_ID` `HnrQJPgq0FQ3FYp3eOM13`. אין שינוי UI, `compare.mjs` לא נדרש.
**M14-c111** הועבר ל-`docs/STATE-ARCHIVE.md` (הוחלף ברשומה זו). `RESUME FROM` נשאר M16-c111, כמו בשאר פריטי c112.

**M13-c112 - BLOCKED (06.10.2026): `/api/health` חי 200, אבל `/api/ready` חי 503 על `meilisearch:"down"`, חיצוני ורשום (BACKLOG #16).**
משימת התור: "Verify /api/health and /api/ready return 200 with real deps". `pwd` אומת, HEAD `29ce235cb` = `origin/audit/final-audit`.
הקומיט האחרון על `src/app/api/health`, `src/app/api/ready`, `src/lib/health` עדיין `64728ff8d` (02.09), ואין WIP עליהם (בעץ הראשי WIP
זר account/coupon/gifts/sitemap, לא נגעתי ולא חויב). **חי** מול `www.kenyonexpress.co.il`, שלוש פעמים ברצף, יציב: `/api/health`
**200** `{"ok":true,"database":"ok","latency_ms":233}`; `/api/ready` **503** `cache-control: no-store`,
`{"database":"ok","redis":"ok","meilisearch":"down","r2":"not_configured","cardcom":"ok"}`. ביחס ל-M13-c67 השינוי היחיד הוא
`cardcom` שעבר מ-`not_configured` ל-`ok` (ידוע מ-L11, חוסם 8). `/api/search?q=test` עונה 200, כלומר הנפילה ל-Postgres עובדת
והלקוח לא נפגע. `r2 not_configured` אינו מפיל את ה-ready (רק `down` מפיל) ותואם לחוסם 4 ול-`R2_BUCKET_NAME` (BACKLOG #19).
**למה BLOCKED ולא DONE:** תנאי הפריט ("return 200") לא מתקיים ל-`/api/ready`, והתיקון הוא אינסטנס Meilisearch חי ו-
`MEILISEARCH_HOST`/`MEILISEARCH_API_KEY` תואמים ב-Vercel, שניהם מחוץ לסמכות הסוכן (אסור לגעת ב-env של Vercel, אין גישה לשירות).
**החלטה שהתקבלה לבד:** לא שיניתי את `checkSearch` כדי שידווח `not_configured` או `ok`, כי זה היה מסתיר תקלה אמיתית ממוניטור.
**שערים** (worktree נקי `/tmp/ke-m11-c112wt` הועבר ל-`29ce235cb`, `env -i`): type-check 0; lint: 12 השערים הראשונים נקיים,
docs-path-audit נכשל ב-worktree רק על הפניות ל-`refs/` שב-gitignore, נקי בעץ הראשי; test **638/638, 7659 עברו, 12 דולגו**
(ריצה ראשונה עם `CARDCOM_USE_MOCK=true` בסביבה הפילה בעקביות את `invoices.test.ts` "does not spend an attempt when there are no
credentials", כי הדגל נראה כמו אישורים; בלעדיו 26/26. ארטיפקט של הרצה, לא רגרסיה, וכמו בפריטים הקודמים הדגל שייך ל-build בלבד);
`rm -rf .next` ואז build עם `CARDCOM_USE_MOCK=true`: 0, 340/340, אפס `Invalid API key`, `BUILD_ID` `NQ_44_4L5xMPECXtIgmnr`.
אין שינוי UI, `compare.mjs` לא נדרש. M08-c112 הועבר ל-`docs/STATE-ARCHIVE.md`. `RESUME FROM` נשאר M16-c111, כמו בשאר פריטי c112.

**M12-c112 - DONE (06.10.2026): `robots.txt` נמדד שוב, בטוח לפרודקשן, החי זהה בביט לבנייה של HEAD. אין שינוי קוד.**
משימת התור: "Verify robots.txt production-safe". `pwd` אומת, HEAD `f2b209471` = `origin/audit/final-audit`. `git log -1 --
src/app/robots.ts` עדיין `4d3702025` (M12-c67), אין WIP על `robots.ts`/`site-url.ts`. בעץ הראשי WIP זר (account/coupon/gifts/sitemap),
לא נגעתי ולא חויב. **חי** (`www.kenyonexpress.co.il/robots.txt`): 200 `text/plain; charset=utf-8`, etag `b36a25fd...`, sha256
`6c0d631f...` (זהה ל-M12-c111). `User-Agent: *`, `Allow: /`, אין `Disallow: /` גורף (האתר ניתן לאינדוקס), **16 שורות `Disallow`**:
כל כתובות-האסימון (`/redeem/`, `/coupon/`, `/gift/`, `/order/`, `/wishlist/s/`) ו-`/account/`, `/supplier/`, `/scan`, `/admin/`,
`/checkout`, `/cart`, `/auth/`, `/api/`, `/reset-password`, `/forgot-password`, `/debug/`. `Host:`/`Sitemap:` ל-apex, שעונה 308 ל-`www`
ו-`/sitemap.xml` שם 200 `application/xml`. שכבת noindex חיה: `/redeem/foo` ו-`/wishlist/s/foo` `noindex, nofollow`, `/gift/foo`
`noindex`, `/order/foo` ו-`/debug/foo` 404 עם `noindex`, `/coupon/foo` 307. **בנייה מקומית של HEAD** (worktree נקי `/tmp/ke-m11-c112wt`
הועבר ל-`f2b209471`, נשאר במקומו, `rm -rf .next`, `env -i`, `CARDCOM_USE_MOCK=true`): build 0, 340/340, אפס `Invalid API key`, `BUILD_ID`
`M3A9xIbLyTcaoZ-THzDWf`; `next start` על 4872 (cwd המאזין אומת ב-`lsof`, נעצר לפי PID ב-INT, הפורט פנוי), ו-`/robots.txt` המקומי
**זהה בביט לחי** (`diff` 0, אותו sha256). **שערים** (אותו worktree, `env -i`): type-check 0; lint: 12 השערים הראשונים נקיים,
docs-path-audit נכשל ב-worktree רק על 84 הפניות ל-`refs/` ו-`supabase/.temp` שב-gitignore, נקי בעץ הראשי (155 ידועים, ללא שינוי);
test **638/638, 7659 עברו, 12 דולגו**. אין שינוי UI, ולכן `compare.mjs` לא נדרש. M01-c112 הועבר ל-`docs/STATE-ARCHIVE.md` לשמירה
על תקרת 300 שורות. `RESUME FROM` נשאר M16-c111, כמו בשאר פריטי c112.

**M11-c112 - DONE (06.10.2026): `sitemap.xml` נמדד שוב חי, טרי ונגיש, 98/98 כתובות 200. אין שינוי קוד.**
משימת התור: "Verify sitemap.xml fresh and reachable". `pwd` אומת, HEAD `7a4a2f437` = `origin/audit/final-audit`. בעץ הראשי WIP זר
(account/coupon/gifts, כולל `src/lib/seo/sitemap-*`), לא נגעתי ולא חויב; לכן נמדד האתר החי והשערים רצו על קוד ה-HEAD.
**נמדד חי מול `www.kenyonexpress.co.il`:** `/sitemap.xml` 200 `application/xml; charset=utf-8`, `<sitemapindex>` עם חמש תתי-מפות
(content, categories, products, regions, suppliers), כולן 200 `application/xml`, עם 15/13/46/17/7 = **98 `<loc>`, אפס כפילויות**;
lastmod החדש ביותר 2026-10-05T01:07:49Z (content, products, יום לפני המדידה), categories 2026-09-16, suppliers 2026-09-16, regions
ללא lastmod. `robots.txt` 200 ומפנה ל-`Sitemap: https://kenyonexpress.co.il/sitemap.xml`. כל 98 הכתובות נבדקו אחת-אחת עם `curl -L`:
**98/98 200, כל אחת אחרי הפניה אחת** (apex 308 ל-`www`), זהה ל-M11-c111; הממצא כבר רשום כ-BACKLOG #23 (Vercel env או דומיין
ראשי, מחוץ לסמכות הסוכן), ולכן לא נרשם שוב. **שערים** ב-worktree נקי חדש `/tmp/ke-m11-c112wt` על `7a4a2f437` (`node_modules` כ-APFS
clone, `.env.local` כ-symlink, נשאר במקומו) תחת `env -i`: type-check 0; lint: 12 השערים הראשונים נקיים, docs-path-audit נכשל
ב-worktree רק על 84 הפניות ל-`refs/` ו-`supabase/.temp` שב-gitignore, נקי בעץ הראשי (155 ידועים, ללא שינוי); test **638/638, 7659
עברו, 12 דולגו**; `rm -rf .next` ואז build עם `CARDCOM_USE_MOCK=true`: exit 0, 340/340, אפס `Invalid API key`, `BUILD_ID`
`p1T2TKtK-nob_RF8wc79X`. אין שינוי UI, ולכן `compare.mjs` לא נדרש. `RESUME FROM` נשאר M16-c111, כמו בשאר פריטי c112.

**M10-c112 - DONE (06.10.2026): migrations/pending נבדק ישירות מול פרודקשן, אף קובץ לא הוחל, החוסם גדל מ-19 ל-23 קבצים.**
משימת התור: "Verify migrations/pending/ applied or file blocker". `pwd` אומת, HEAD `b36f8cbda`. בעץ הראשי WIP זר
(account/coupon/gifts/sitemap), לא נגעתי ולא חויב. מאז הבדיקה הישירה האחרונה (M10-c95, `f5564d638`) נוספו ל-`migrations/pending/`
ארבעה קבצים חדשים: 249 (`products.publish_at`), 250 (שעון pg_cron לתזכורות תפוגה), 251 (`club_tiers`), 252 (`affiliate_clicks`
ו-`affiliate_payout_requests`), ועוד `preflight_250.sql`: **65 קבצי `.sql`** (היה 60), `git log -1 -- migrations/pending/` הוא
`3043995e9` (252). בדיקה ישירה טרייה, קריאה בלבד: טוקן ה-CLI מה-keychain (לא הודפס), `POST .../database/query` עם
`read_only: true`, `SELECT` יחיד, אפס DDL. **17 אובייקטים מ-15 קבצים, כולם חסרים:** טבלאות של 204/234/235/236/240/244/251/252
(×2) לא קיימות (`to_regclass` ריק); עמודות של 218 (`profiles.supplier_id`), 223 (`outbox_id`), 242, 249, 251 (`orders.club_tier`)
לא קיימות; `proconfig` של `fn_wallet_entries_block_mutation` עדיין `NULL` (220); ב-`cron.job` רק `report_tables_nightly`, אף אחת
משלוש המשימות של 250; 82 מוצרים עם `city IS NULL` (241 לא הוחל). **החלטה שהתקבלה לבד:** 249..252 נוספו לרשימת החוסם ב-BACKLOG
סעיף 5 (23 קבצים), כי פיצ'רים שכבר בקוד (פרסום מתוזמן, תזכורות תפוגה, דרגות מועדון, קליקים ומשיכות של שותפים) תלויים בהם; 250
חסומה בנוסף על ערך ה-vault (חוסם 16). לא הוחלה שום מיגרציה, אפס שינוי קוד, אפס שינוי UI, `compare.mjs` לא נדרש. **שערים** ב-worktree נקי חדש `/tmp/ke-m10-c112wt` (HEAD + שלושת קבצי ה-docs,
`env -i`, נשאר במקומו): type-check 0; lint: 12 השערים הראשונים נקיים, docs-path-audit נכשל ב-worktree רק על 81 הפניות ל-`refs/`
ו-3 ל-`supabase/.temp` שב-gitignore, נקי בעץ הראשי (155 ידועים, ללא שינוי); test **638/638, 7659 עברו, 12 דולגו**; `rm -rf .next`
ואז build עם `CARDCOM_USE_MOCK=true`: exit 0, 340/340, אפס `Invalid API key`, `BUILD_ID` `kOgsAXgvDGVUyPpHYS18H`. M17-c111 הועבר
ל-`docs/STATE-ARCHIVE.md` לשמירה על תקרת 300 שורות. `RESUME FROM` נשאר M16-c111, כמו בשאר פריטי c112.

**M11-c110 - DONE** (sitemap.xml טרי, 98/98 כתובות 200, ממצא apex→www ב-BACKLOG),
ו-W14..W01, M01-c96, L12, L11 וכל מה שקדם: ארכיון מלא ב-`docs/STATE-ARCHIVE.md`, החדש למעלה.

## טבלת מצב לתור `final-queue.txt`

התור נסגר (B10 היה האחרון). כל השורות (Q01..Q24, B01..B10, M01-c1..M09-c1,
M11-c51..M15-c52) הועברו ל-`docs/STATE-ARCHIVE.md` ב-M14-c53 לשמירה על
תקרת 300 שורות; שום שורה לא נמחקה, רק הוזזה. **LAUNCH-READY: pending-cardcom (L12, 05.10.2026; L06/L08/L09 BLOCKED גם).**
SHOWABLE: no, ראו "חוסמים
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
   נתיבי תתי-המפות של הקוד הנוכחי מחזירים `404` בפרודקשן **נסגר, M11-c110 (06.10): החי הוא
   `sitemapindex` עם חמש תתי-מפות, 98/98 כתובות 200.**
3. **מיגרציות ממתינות**: **218 (טריגר `enforce_profile_privilege_columns` מפיל כל
   עדכון פרופיל של לקוח ב-42703; נמדד 25.09 ב-M05-c1, 5 מ-5 לקוחות, בניגוד לרישום
   "הוחלה" מ-21.09)**, 245 ו-246 (advisors, M05-c1; 245 אחרי 209 ואחרי 203), 204 (הצטרפות ספקים והסכם click-wrap; בלעדיה הטופס
   עונה "עדיין לא פעיל"), 240 (הסכמת "הכל באפליקציה"), 241 (עיר משלוש
   כותרות), 242 (מקור מחיר + ביקורות גוגל), 243 (תנאי מוצר), 244 (קמפיינים
   והמרות של תוכנית השותפים; בלעדיה התוכנית "עדיין לא פתוחה"), 247 (`anon`
   בלי הרשאת SELECT על `reviews`, נמדד M18-c52; בלעדיה דף הביקורות הציבורי
   נכשל תמיד, ללא תלות בשום קובץ אחר). סדר והתנאים
   ב-`docs/RUNBOOK.md`, סקירה ב-`docs/MIGRATION-REVIEW.md`. **אומת שוב
   M10-c112 (06.10, בדיקה ישירה מול פרודקשן דרך CLI-keychain-token, קריאה
   בלבד, 17 אובייקטים של 15 קבצים): אף קובץ לא הוחל; החוסם עכשיו 23 קבצים
   (19 הקודמים + 249, 250, 251, 252).**
   65 קבצים ב-`migrations/pending/`, `git log -1` הוא `3043995e9` (252).
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
6. **`RESEND_API_KEY` בפרודקשן אינו תקף, נמדד.** L08 (05.10): שליחה אמיתית
   מ-server action חי החזירה מ-Resend `401 API key is invalid`
   (`email.refused` בלוג הפרודקשן). עד מפתח חדש ב-Vercel Production שום
   מייל אינו יוצא: צור קשר, קופון, magic link, איפוס סיסמה ו-outbox (72
   שורות `dead`). ההיסטוריה: השם קיים מ-25.09 (Q24), הערך לא נקרא.
7. **`SUPABASE_SECRET_KEY` חשוף ודורש רוטציה** (CLAUDE.md, `RUNBOOK`);
   `deploy-preflight` מסרב לבנות איתו, ומ-B01 (25.09) הוא רץ בפועל לפני
   `pnpm build` ב-`vercel.json`. **נמדד ב-M01-c1: הסריקה על סביבת Production
   של Vercel לא מצאה את המפתח החשוף** (אף שורת `COMPROMISED`), כלומר החשיפה
   נוגעת לעותקים מקומיים ולנוהל, לא לפריסה.
8. **Cardcom בפרודקשן: אישורים לא-מאומתים.** עד 04.10 ספק התשלום היה
   mock (נמדד 25.09 על `/checkout` החי, `frame-src ... 'self'`; 24 תשלומי
   `mock-` ו-0 אמיתיים). **L11 (05.10):** ה-build החי כבר אינו mock
   (`frame-src https://secure.cardcom.solutions`, `/api/ready` ‏`cardcom: ok`),
   אך `CARDCOM_TERMINAL_NUMBER`/`API_NAME`/`API_PASSWORD`/`SANDBOX` נוצרו
   ב-04.10 21:40 על ידי סשן סוכן בענן "כדי לעבור את ה-preflight", הם Sensitive
   ואינם ניתנים לקריאה, ואין אישור אמיתי או סנדבוקס במכונה. עד שאופיר יזין
   ערכים אמיתיים ויבצע הזמנת ₪1 וזיכוי, סליקה אמיתית אינה מוכחת
   (BACKLOG סעיף 6; השמות הישנים `API_KEY`/`CLIENT_ID`/`MERCHANT_ID`, סעיף 19).
9. **מספר עוסק/ח.פ לשורת המוכר** באישור הרכישה (Q09): אינו קיים בריפו.
   עריכה אחת ב-`messages/he.json`, `purchaseConfirmation.sellerName`.
10. **המתזמן מתוזמן ונדחה** (Q24, נמדד שוב L09 05.10): `cron.yml` על `main`
    נכשל בכל ריצה, האחרונה 04.10 19:11 UTC (`abandoned-cart -> 401`), כל 21
    הנתיבים עונים 401 גם לסוד המקומי; סוד Vercel הוא Sensitive ולא נקרא.
    72 הודעות `dead` ב-`notification_outbox`, 0 חדשות ב-24 שעות;
    `expire-vouchers` ושאר 20 העבודות לא רצות. pg_cron מחזיק רק
    `report_tables_nightly` (רץ). תיקון: אותו ערך בשני המקומות. אופיר בלבד.
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
    **L07 (05.10):** הצד הנמדד יכול להיות פרודקשן עצמו
    (`LOCAL_BASE=https://www.kenyonexpress.co.il`) מאז שתיקון `shoot()`
    גוזר את הצד מהקורא ולא מה-hostname; נמדד 7.91 / 8.98 / 4.09 PASS.
    **M01-c96 (05.10):** אותו reference, build מקומי של HEAD על 3396:
    8.58 / 9.01 / 4.16 PASS.
    **W01 (05.10):** אחרי בניית שורת האייקונים מחדש, אותו reference ואותו
    מסלול: 8.60 / 9.02 / 4.16 PASS.

15. **אין מסד פיתוח, ולכן קטלוג הדמו (W04) אינו זרוע בשום מקום** (05.10):
    `scripts/seed-demo-catalog.ts --apply` מסרב לפרודקשן בכוונה, Docker לא רץ,
    ואין פרויקט Supabase חד-פעמי. יצירת פרויקט כזה והזנת `SEED_SUPABASE_URL`
    + `SEED_SUPABASE_SERVICE_KEY` היא של אופיר; אז ההרצה ואימות הרינדור נמדדים.

16. **השעון של תזכורות התפוגה: 250 ממתינה, חסומה על ערך vault אחד** (W06,
    05.10): `APP_BASE_URL` ב-vault הוא ה-apex `https://kenyonexpress.co.il`
    שעונה 308 ל-`www`; 250 מסרבת להיחל במצב הזה. תיקון של אופיר, שורה אחת:
    `select vault.update_secret((select id from vault.secrets where
    name='APP_BASE_URL'), 'https://www.kenyonexpress.co.il');` ואז
    `preflight_250.sql` (6 בלוקים) ו-250. אם `CRON_SECRET` ב-vault שונה מזה
    של Vercel, הריצה הראשונה תראה 401 ב-`net._http_response`, והתיקון הוא
    `vault.update_secret` ולא מיגרציה. **162 כפי שהיא לא תעבוד** (POST → 405,
    שמות vault שגויים, preflight דורש vercel.app) ותדרוס את שני השמות של 250
    אם תוחל אחריה; לתקן אותה קודם. עד ההחלה: אף שובר לא פג מעצמו ואף תזכורת
    לא נשלחת (0 שורות `voucher_expiring` אי פעם).

## ידני לאופיר, לפי סדר קריטיות

הרשימה המלאה, ממוזגת עם `docs/LAUNCH-READINESS.md` וללא כפילויות, עברה
ל-`docs/BACKLOG.md` (M15-c51). לא נשמר עותק כאן, כדי שלא ייסטה שוב.
