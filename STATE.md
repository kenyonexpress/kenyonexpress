RESUME FROM: M16-c111
Updated: 2026-10-06 (סשן `audit/final-audit`, פריט M06-c112 DONE: `pnpm build` נמדד מחדש על HEAD נקי, 340/340, אפס דריפט)

## המשך מ:

**M06-c112 - DONE (06.10.2026): `pnpm build` נמדד מחדש על HEAD נקי, exit 0, 340/340, אפס דריפט, אין מה לתקן.**
משימת התור: "pnpm build fix drift commit". `pwd` אומת, HEAD `38db6670b` = `origin/audit/final-audit`. מאז M06-c111
(`df54456a4`) השתנו 7 קבצים ב-`src` (הסרת ה-exports של M09-c111), ולכן נבנה מחדש ולא הועתק. בעץ הראשי WIP זר
(account/coupon/gifts/sitemap), לא נגעתי ולא חויב; הכל רץ ב-worktree נקי `/tmp/ke-m06-c112` (HEAD, `node_modules`
כ-APFS clone, `.env.local` כ-symlink, `refs/` הועתק, `supabase/.temp` ריק; נשאר במקומו, לא נמחק). **שערים** בחזית
תחת `env -i`: type-check 0; lint: 12 השערים הראשונים נקיים, docs-path-audit נכשל ב-worktree רק על 81 הפניות
ל-`refs/`/`supabase/.temp` שב-gitignore, נקי בעץ הראשי (155 ידועים, ללא שינוי); test **638/638, 7659 עברו, 12 דולגו**;
**`rm -rf .next` ואז build עם `CARDCOM_USE_MOCK=true`: exit 0, 340/340 דפים, אפס `Invalid API key`, `BUILD_ID`
`1r8e3FZPT4UWRlllqINJR`**. 92 שורות `rls_denied` על `reviews` בזמן prerender, אותו מספר כמו ב-M06-c111 (חוסם #3,
מיגרציה 247), ואלה כל 92 שורות ה-error בלוג; לא דריפט. לא פריט חזותי, `compare.mjs` לא נדרש. M11-c111 הועבר
ל-`docs/STATE-ARCHIVE.md` לשמירה על תקרת 300 שורות. **החלטה שהתקבלה לבד:** `RESUME FROM` נשאר M16-c111, שעדיין
בלי commit עם ראיה, כמו בשאר פריטי c111/c112.

**M01-c112 - DONE (06.10.2026): parity של `/` נמדד מחדש ב-380/768/1440, כולם PASS, אפס הפרש.**
`pwd` אומת, HEAD `89e8d357f`. בעץ הראשי WIP זר (account/coupon/gifts/sitemap), לא נגעתי ולא חויב; הכל רץ ב-worktree
נקי `/tmp/ke-m01-c112` (HEAD, `node_modules` כ-APFS clone, `.env.local` כ-symlink, `refs/` הועתק; נשאר במקומו).
build טרי תחת `env -i` עם `CARDCOM_USE_MOCK=true`: exit 0, אפס `Invalid API key`, `BUILD_ID` `V1135Uqk6oqmw89LPtdYA`;
`pnpm start -p 4998` (PID 23230, cwd המאזין אומת ב-`lsof`, נעצר ב-INT, הפורט פנוי). `compare.mjs --page=home
--width=W --baseline=refs/ke_live_W.png`, בחזית, רוחב אחרי רוחב:

| רוחב | M01-c112 | M17-c111 (`89e8d357f`) | הפרש | overall | סטטוס |
|---|---|---|---|---|---|
| 380 | **7.92%** | 7.92% | 0.00 | 14.38% | PASS |
| 768 | **9.03%** | 9.03% | 0.00 | 16.28% | PASS |
| 1440 | **4.16%** | 4.16% | 0.00 | 14.89% | PASS |

כולם מתחת ל-11%, זהים בביט למדידה הקודמת; שלוש השורות נכתבו על ידי השער ל-`docs/UI-PARITY-REPORT.md` והועברו
כמו שהן (`-dirty` בשורות 768/1440 הוא הדוח עצמו, שהשורה הראשונה שינתה). **שערים** (אותו worktree, `env -i`):
type-check 0; lint: כל השערים נקיים מלבד docs-path-audit ב-worktree, שנכשל רק על `supabase/.temp` (ב-gitignore),
נקי בעץ הראשי (155 ידועים); test 638/638, 7659 עברו, 12 דולגו; build 0. **החלטה שהתקבלה לבד:** `RESUME FROM`
נשאר M16-c111, שעדיין בלי commit עם ראיה, כמו בשאר פריטי c111.

**M17-c111 - DONE (06.10.2026): RTL על `/` ועל דגימת `/product`, אפס דליפות LTR. אין שינוי קוד.**
`pwd` אומת, HEAD `4cc28b788`. מאז M17-c110 (`f82b0cb77`) השתנו 7 קבצים ב-`src` (הסרת exports של M09-c111),
ולכן נמדד מחדש ולא הועתק. בעץ הראשי WIP זר (account/coupon/gifts/sitemap), לא נגעתי ולא חויב; הכל רץ
ב-worktree נקי `/tmp/ke-m17-c111` (HEAD, `node_modules` כ-APFS clone, `.env.local` כ-symlink, `refs/` הועתק;
נשאר במקומו, לא נמחק). build טרי תחת `env -i` עם `CARDCOM_USE_MOCK=true`: exit 0, אפס `Invalid API key`,
`BUILD_ID` `0ZBHbGElh_lbWllyEUB1B`; `pnpm start -p 4997`, cwd של המאזין אומת ב-`lsof`. פרוב Playwright זמני
(מחוץ לריפו, לא חויב) על `/` ועל שלושת סלאגי הדגימה (`samsung-galaxy-s22-128gb-samsung-galaxy-s22-128gb-5g`,
`חבילת-גלידה`, `חיתולי-האגיס`) ב-380/768/1440: **12 טעינות, 12 PASS, כולן 200**: `<html lang="he" dir="rtl">`,
`body` מחושב `rtl`, `scrollWidth` = `clientWidth` בכולן, **אפס** אלמנט גלוי עם `direction: ltr` מחושב שמחזיק
טקסט עברי ישיר, **אפס** טקסט עברי בתוך `[dir="ltr"]`. 12 אלמנטים מחוץ למסך ב-380/768 בכל דף, וכולם בתוך
המגירה הסגורה של `MobileDrawer` (`fixed inset-y-0 right-0 dir="rtl"`), מחליקה מימין ואינה מוסיפה גלילה; ממצא
הנגישות שלה כבר ב-BACKLOG #24. **parity (בית, `--baseline='refs/ke_live_{width}.png'`, בחזית):** 380 **7.92%**,
768 **9.03%**, 1440 **4.16%**, כולם PASS מתחת ל-11%, זהים בביט ל-M17-c110; שלוש השורות נכתבו על ידי השער
ל-`docs/UI-PARITY-REPORT.md` והועברו כמו שהן. השרת נעצר לפי PID המאזין בלבד (INT). **שערים** (אותו worktree,
`env -i`): type-check 0; lint 0 (docs-path-audit 155 ידועים, input-dir 25/25); test 638/638, 7659 עברו, 12 דולגו;
build 0. **החלטה שהתקבלה לבד:** `RESUME FROM` נשאר M16-c111, שעדיין בלי commit; M17-c111 סגור עם ראיה.
M07-c111 הועבר ל-`docs/STATE-ARCHIVE.md` לשמירה על תקרת 300 שורות.

**M17-c111, אימות שני (06.10.2026):** סשן מקביל חייב ודחף את הפריט (`89e8d357f`) בזמן שהתחלתי, ולכן לא נבנה
build מתחרה. פרוב Playwright נפרד שלי (מחוץ לריפו, `/tmp/ke-m17-c111-probe`, לא חויב) רץ מול אותו שרת HEAD
על 4997 לפני שנעצר: `/` ושלושת סלאגי הדגימה ב-380/768/1440, **12/12 PASS, כולן 200**, `lang="he" dir="rtl"`,
`body` ‏`rtl`, `scrollWidth` = `clientWidth`, אפס עברית תחת `ltr` מחושב ואפס עברית בתוך `[dir="ltr"]`. תואם.
**שערים** (worktree `/tmp/ke-m17-c111`, קוד זהה ל-HEAD, `env -i`): type-check 0; lint 0; test 7659 עברו,
12 דולגו; build 0 עם `CARDCOM_USE_MOCK=true`, 340/340, אפס `Invalid API key`, `BUILD_ID` `ryvGQg6dIFDPqMBdsW5KI`.
אין שינוי UI, ולכן parity לא נמדד מחדש (המספרים 7.92/9.03/4.16 של `89e8d357f` עומדים).

**M15-c111 - DONE (06.10.2026): אפס console errors על `/` ועל דגימת המוצר, בבנייה טרייה של קוד HEAD.**
`pwd` אומת, HEAD `15d495254`. מאז M15-c95 (`9278fd3be`) השתנו 178 קבצים ב-`src`/`e2e`/`next.config.ts`, ולכן
רץ אימות מלא ולא הסתמכות על ריצה קודמת. בעץ הראשי WIP זר (account/coupon/gifts/sitemap), לא נגעתי ולא חויב;
`/tmp/ke-m14-c111` היה תפוס ב-vitest של סשן מקביל, ולכן נמדד ב-worktree `/tmp/ke-m09-c111` על `bd44390f4`
(קוד זהה ל-HEAD, ההפרש `STATE.md`/`docs` בלבד; נשאר במקומו). `rm -rf .next`, `env -i`, `CARDCOM_USE_MOCK=true`:
build 0, 340/340, אפס `Invalid API key`, `BUILD_ID` `dGCyW5GkkRMlS5Xpc757f`. `pnpm start -p 4879` (PID 12360, cwd
המאזין אומת ב-`lsof`, נעצר ב-INT, הפורט פנוי). `e2e/route-audit.spec.ts --grep "anon /$|anon dynamic catalogue
routes"` עם `ROUTE_AUDIT_REPORT=/tmp/route-audit-m15c111.jsonl`: **4/4 PASS** (chromium + mobile-chrome, 57.1 שניות).
הדוח, 16 שורות: **אפס `consoleErrors` ואפס `hydrationWarnings` בכל אחת**, כולן 200: `/`, `/product/צימר-מאסטר`
ו-`/reviews` שלו (דגימת המוצר), `/category/hot-deals`, `/city/תל-אביב`, `/coupons/<id>`, `/page/how-it-works`, `/s/<id>`.
**שערים** (אותו worktree, `env -i`): type-check 0; lint: כל השערים נקיים מלבד docs-path-audit ב-worktree, שנכשל רק על
`supabase/.temp` (ב-gitignore), נקי בעץ הראשי (155 ידועים); test 638/638, 7659 עברו, 12 דולגו. אין שינוי UI, ולכן
`compare.mjs` לא נדרש. M06-c111 הועבר ל-`docs/STATE-ARCHIVE.md`. **החלטה שהתקבלה לבד:** `RESUME FROM` מצביע
ל-M16-c111, הפריט הבא ב-`final-queue.txt`.

**M14-c111 - DONE (06.10.2026): release של Sentry תואם ל-HEAD. ממצא חדש: `SENTRY_AUTH_TOKEN` נדחה 401.**
`pwd` אומת, HEAD `bd44390f4` = `origin/audit/final-audit`. קוד: release הוא `SENTRY_RELEASE ?? VERCEL_GIT_COMMIT_SHA`
(שרת/edge) ו-`NEXT_PUBLIC_SENTRY_RELEASE ?? NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA` (לקוח), ללא שינוי מאז M14-c95.
**נמדד:** `vercel api /v6/deployments` (פרויקט `kenyonexpress`, Production): העליונה `dpl_3JMMsSXC7MmySVs4k363pH8z5rjB`
READY על `audit/final-audit@bd44390f4`, ו-`/v4/aliases/www.kenyonexpress.co.il` מצביע עליה. ב-Production אין
`SENTRY_RELEASE`/`NEXT_PUBLIC_SENTRY_RELEASE` (`vercel env ls`, שמות בלבד: `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`,
`SENTRY_AUTH_TOKEN`), כך שה-fallback ל-SHA קובע. **בבאנדל הלקוח החי** (`chunks/21833t7py3y96.js` מתוך 21 של `/`):
`release:"bd44390f4c710b801a5da2274b065934a4582b27"`, **זהה ל-HEAD**. לוג ה-build של אותה פריסה (`vercel inspect --logs`)
מריץ `sentry-cli releases new bd44390f4...` ו-`sourcemaps upload --release bd44390f4...`, **ושניהם נכשלים
`Invalid token (http status: 401)`** כאזהרה בלבד: ה-release לא נרשם ב-Sentry ואין source maps. MCP של Sentry
דורש הזדהות, ולכן רשימת ה-releases בצד Sentry לא נקראה. נרשם ב-`docs/BACKLOG.md` #21 (טוקן חדש, לאופיר).
**שערים** (worktree נקי `/tmp/ke-m09-c111` על `bd44390f4`, `env -i`): type-check 0; lint: נכשל ב-worktree רק על
`supabase/.temp` שב-gitignore, docs-path-audit נקי בעץ הראשי עם עריכת BACKLOG (155 ידועים); test 638/638, 7659
עברו, 12 דולגו; `rm -rf .next` ואז build עם `CARDCOM_USE_MOCK=true`: 0, 340/340, אפס `Invalid API key`, `BUILD_ID`
`7Jw8meP8MEkF9W7gNmhYU`. אין שינוי UI, parity לא נדרש. **החלטה שהתקבלה לבד:** לא החלפתי טוקן ולא נגעתי ב-env
של Vercel (אסור); `RESUME FROM` מצביע ל-M15-c111, הפריט הבא ב-`final-queue.txt`.

**M14-c111, אימות שני (06.10.2026):** סשן מקביל חייב ודחף את הפריט (`b0363aaed`) בזמן שמדדתי; נמדד בנפרד ותואם:
`vercel api /v6/deployments?target=production` העליונה `dpl_3JMMsSXC7MmySVs4k363pH8z5rjB` ‏READY, `source=git`,
`githubCommitSha` `bd44390f4c71...` = HEAD הקוד; `vercel inspect www.kenyonexpress.co.il` מחזיר אותה פריסה; `vercel env ls
production` מכיל רק `SENTRY_DSN`/`NEXT_PUBLIC_SENTRY_DSN`/`SENTRY_AUTH_TOKEN`; לוג ה-build מראה `releases new bd44390f4...`
ו-`sourcemaps upload --release bd44390f4...`, שניהם `Invalid token (http status: 401)`, כבר ב-BACKLOG #21. **שערים** ב-worktree
חדש `/tmp/ke-m14-c111` על `b0363aaed` (נשאר במקומו), `env -i`: type-check 0; lint נכשל רק על docs-path-audit, 84 הפניות ל-`refs/`
ו-`supabase/.temp` שב-gitignore ואינם ב-worktree, נקי בעץ הראשי (155 ידועים); test 638/638, 7659 עברו, 12 דולגו;
`rm -rf .next` ואז build עם `CARDCOM_USE_MOCK=true`: 0, 340/340, אפס `Invalid API key`, `BUILD_ID` `f9XjdDE8sFw_ikugbT-ZC`.
אין שינוי UI ולכן אין parity. `RESUME FROM` נשאר M15-c111.

**M12-c111 - DONE (06.10.2026): `robots.txt` נמדד שוב, בטוח לפרודקשן. אין שינוי קוד.**
`pwd` אומת, HEAD `5060bcedd` (בזמן העבודה נכנס `11ed72a09` של M11-c111, `STATE.md` בלבד). `git log -1 --
src/app/robots.ts` עדיין `4d3702025` (M12-c67). **חי** (`www.kenyonexpress.co.il/robots.txt`): ‏200
`text/plain; charset=utf-8`, etag `b36a25fd...`, sha256 `6c0d631f...`, **16 שורות `Disallow`** כולל ארבע
שורות M12-c67 (`/gift/`, `/order/`, `/wishlist/s/`, `/debug/`), כלומר הפער שתועד ב-M12-c68..c95 סגור מאז
פריסת L01. `Sitemap:`/`Host:` ל-apex, שעונה 308 ל-`www` ו-`/sitemap.xml` שם ‏200 `application/xml`. שכבת
noindex חיה: `/gift/foo` `noindex`, `/wishlist/s/foo` ו-`/redeem/foo` `noindex, nofollow`; `/order/foo` ו-`/debug/foo`
‏404, `/coupon/foo` ‏307. **בנייה מקומית של HEAD** (worktree נקי `/tmp/ke-m09-c111` על `5060bcedd`, נשאר במקומו,
`rm -rf .next`, `env -i`, `CARDCOM_USE_MOCK=true`): build 0, 340/340, אפס `Invalid API key`, `BUILD_ID`
`4AegN9rtjUaSrjpKHoCcb`; `next start` על 4871 (cwd המאזין אומת ב-`lsof`, נעצר לפי PID ב-INT), ו-`/robots.txt`
המקומי **זהה בביט לחי** (`diff` 0). **שערים**: type-check 0; lint: כל השערים נקיים מלבד docs-path-audit
ב-worktree, שנכשל רק על `supabase/.temp` (ב-gitignore) ונקי בעץ הראשי (155 ידועים); test 638/638, 7659
עברו, 12 דולגו. אין שינוי UI, ולכן parity לא נדרש. M03-c111 ו-M18-c110 הועברו ל-`docs/STATE-ARCHIVE.md`.
**החלטה שהתקבלה לבד:** `RESUME FROM` מצביע ל-M13-c111, הפריט הבא ב-`final-queue.txt`, לפי כלל שורה 1.

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
