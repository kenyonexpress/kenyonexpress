RESUME FROM: M12-c110
Updated: 2026-10-06 (סשן `audit/final-audit`, פריט M11-c111 DONE: sitemap.xml חי, טרי, 98/98 כתובות 200)

## המשך מ:

**M11-c111 - DONE (06.10.2026): `sitemap.xml` נמדד שוב חי, טרי ונגיש. אין שינוי קוד.**
`pwd` אומת, HEAD `5060bcedd`. **נמדד חי מול `www.kenyonexpress.co.il`:** `/sitemap.xml` ‏200
`application/xml; charset=utf-8`, `<sitemapindex>` עם חמש תתי-מפות (content, categories, products,
regions, suppliers), כולן 200 `application/xml`, עם 15/13/46/17/7 = **98 `<loc>`, אפס כפילויות**;
lastmod החדש ביותר 2026-10-05T01:07:49Z (content, products), regions ללא lastmod. `robots.txt` ‏200 ומפנה
ל-`Sitemap: https://kenyonexpress.co.il/sitemap.xml`. כל 98 הכתובות נבדקו אחת-אחת עם `curl -L`:
**98/98 ‏200, כל אחת אחרי הפניה אחת** (apex ‏308 ל-`www`), זהה ל-M11-c110; הממצא כבר רשום כ-BACKLOG #23
(תיקון ב-Vercel env או בדומיין הראשי, שניהם מחוץ לסמכות הסוכן), ולכן לא נרשם שוב. **שערים** ב-worktree
נקי `/tmp/ke-m05-c111` על `8905d60c5` (הקוד של HEAD; `5060bcedd` נוגע ב-`STATE.md` בלבד) תחת `env -i`:
type-check 0; lint: 12 השערים הראשונים נקיים, docs-path-audit נכשל ב-worktree רק על `refs/` ו-`supabase/.temp`
שב-gitignore (84), נקי בעץ הראשי (155 ידועים, ללא שינוי); test 638/638, 7659 עברו, 12 דולגו;
`rm -rf .next` ואז build עם `CARDCOM_USE_MOCK=true`: exit 0, 340/340, אפס `Invalid API key`,
`BUILD_ID` `4oqdTpgDlGgDAnZRcdVnQ`. אין שינוי UI, ולכן `compare.mjs` לא נדרש. ה-WIP הזר בעץ הראשי
(כולל `src/lib/seo/sitemap-*`) לא נגעתי בו ולא חויב. **החלטה שהתקבלה לבד:** `RESUME FROM` נשאר M12-c110,
כמו בשאר פריטי c111.

**M09-c111, אימות שני (06.10.2026):** סשן מקביל חייב ודחף את הפריט (`8905d60c5`) בזמן שרצתי עליו; עבודתי החופפת (19 הסרות `export`, 13 מהן זהות) נזרקה ולא חויבה. אומת על `8905d60c5` ב-worktree נקי `/tmp/ke-m09-c111` (נשאר במקומו) תחת `env -i`: knip **204 / 5 / 1 / 277 / 199 / 4**, כפי שנרשם (292→277); type-check 0; lint 11 שערים נקיים, docs-path-audit נקי בעץ הראשי (155 ידועים); test 638/638, 7659 עברו, 12 דולגו; build 0, 340/340 דפים. אין שינוי UI, ולכן parity לא נדרש. **החלטה שהתקבלה לבד:** לא הורחב ההיקף ל-`readAttributionSnapshot` ולחמשת הטיפוסים שנותרו (`ClubSpendStatus`, `LegalSection`, `ImportRecord`, `SupplierOptionalFields`, `GiftAuditSource`), כדי לכבד את גבול ההיקף שה-commit המקורי קבע; `RESUME FROM` נשאר M12-c110.

**M09-c111 - DONE (06.10.2026): knip נמדד מחדש, 15 exports מתים הוסרו, אפס תלות הוסרה.**
משימת התור: "Remove unused deps and dead exports". `pwd` אומת. בעץ הראשי WIP זר של account/coupon/gifts/sitemap
שלא נגעתי בו ולא חויב; המדידה והשערים ב-worktree נקי `/tmp/ke-m05-c111` (הועבר ל-`14ade8a88`, נשאר במקומו).
`pnpm dlx knip --no-config-hints` (ephemeral): **204 files / 5 deps / 1 binary / 292 exports / 199 types / 4 dup**,
לעומת 201/5/1/271/197/4 ב-M09-c95: הדריפט הוא W04..W14. סינון לקבצים ששונו מאז `681222eb4` ואימות `grep -w` על
`src e2e scripts apps packages` בעץ הראשי (כולל ה-WIP הלא-מחויב): **הוסר** `legalPath` (`(legal)/_content/index.ts`,
מת לגמרי, אפס קורא), **הוסרה מילת `export`** מ-14 ערכים שנקראים רק בתוך הקובץ שלהם: `clubTiersSchema`,
`thresholdInput`, `POSTHOG_EVENT_NAMES`, חמשת קבועי `filter-chips.ts` (`PRICE_MAX_PARAM`..`NEWEST_SORT`),
`CLUB_WINDOW_DAYS`, `CLUB_FLOOR_TIER`, `isClubSpendStatus`, `orderPagePath`, `postHogCspHosts`, `isCameraPath`.
אחרי: **292 → 277 exports**, שאר הספירות ללא שינוי. **החלטות שהתקבלו לבד:** (1) חמש התלויות
(`@radix-ui/react-dropdown-menu`, `@radix-ui/react-select`, `drizzle-orm`, `postgres`, `react-hook-form`) ובינארי
`supabase` לא הוסרו, כמו מאז M09-c66: הכרעת מפעיל. (2) 204 ה"קבצים" הם בעיקר סקריפטי CLI ונקודות כניסה (אין
`knip.json`), לא נמחק קובץ. (3) לא נגעתי ב-server actions (`deleteVariant`, `setSupplierStatus`, `softDeleteSupplier`,
`signOutAll`, `readAttributionSnapshot`), ב-types, ב-`scripts/`, ולא בקבצים שה-WIP הזר משנה (`queries/orders.ts`,
`seo/sitemap-*`). **שערים** (worktree, `env -i`): type-check 0; lint: 12 השערים הראשונים נקיים, docs-path-audit נכשל
ב-worktree רק על `refs/` שב-gitignore (84), ונקי בעץ הראשי (155 ידועים, ללא שינוי); test **638/638, 7659 עברו,
12 דולגו**; `rm -rf .next` ואז build עם `CARDCOM_USE_MOCK=true`: exit 0, 340/340, אפס `Invalid API key`, `BUILD_ID`
`vO4eYPYB-YEapJR_scr0b`. אפס שינוי UI (הסרת `export` בלבד), `compare.mjs` לא נדרש. M02-c111 ו-M17-c110 הועברו
ל-`docs/STATE-ARCHIVE.md` לשמירה על תקרת 300 שורות. `RESUME FROM` נשאר M12-c110, כמו בשאר פריטי c111.

**M07-c111, אימות שני (06.10.2026):** סשן מקביל חייב את הפריט (`14ade8a88`) בזמן שרצתי עליו. אומת
באופן עצמאי: אותם שני `TODO(cardcom)` בלבד (blame 24.07/07.08), `final-audit` `ok 0 work markers (of 2)`.
שערים ב-worktree נקי על `df54456a4` תחת `env -i`: type-check 0, lint 0, test 638/638 (7659/12 דולגו),
build 0 340/340 `COSxbgGNr5A8uhkPFtICs`. שורת אימות נוספה ל-`docs/BACKLOG.md` §6.

**M07-c111 - DONE (06.10.2026): TODO/FIXME נסרק מחדש, אפס סמן חדש, אפס שינוי קוד.**
משימת התור: "Scan TODO FIXME older than 7 days resolve or file in docs/BACKLOG.md". `pwd` אומת, HEAD
`c1d64b886` (בזמן העבודה נכנס `df54456a4` של M06-c111, `STATE.md` בלבד). `git grep` על כל הריפו (מלבד
md/json/lock/refs) ועל ה-WIP הזר הלא-מחויב בעץ הראשי: **שני סמנים אמיתיים בלבד**,
`src/lib/payments/cardcom.ts:254` ו-`:319` (`TODO(cardcom)`, מ-24.07/07.08.2026, מקושרים ל-#41/#42),
שניהם כבר רשומים ב-`docs/BACKLOG.md` סעיף 6 כחסומים על מפתחות Cardcom חיים (לאופיר); לא ניתנים לפתרון
בלי טרמינל אמיתי, ולכן לא נגעתי. שאר הפגיעות אינן סמני עבודה: `scripts/final-audit*.mjs` (הסורק עצמו
והטסטים שלו) ו-`src/lib/whatsapp.test.ts:91` (מחרוזת ליטרלית `'TODO'`). `node scripts/final-audit.mjs
--verbose`: **`ok 0 work markers (TODO/FIXME/HACK/XXX) (of 2)`**, זהה ל-M07-c93/c76/c67. **שערים** בחזית
תחת `env -i` ב-worktree נקי `/tmp/ke-m05-c111` (הועבר ל-`c1d64b886`, נשאר במקומו): type-check 0; lint:
docs-path-audit נכשל ב-worktree רק על `refs/` שב-gitignore, ונקי בעץ הראשי (155 ידועים); test **638/638,
7659 עברו, 12 דולגו**; `rm -rf .next` ואז build עם `CARDCOM_USE_MOCK=true`: exit 0, אפס `Invalid API key`.
לא פריט חזותי, `compare.mjs` לא נדרש. `docs/BACKLOG.md` לא שונה: אין מה להוסיף.
**החלטה שהתקבלה לבד:** `RESUME FROM` נשאר M12-c110, כמו ב-M02/M03/M05/M06-c111.

**M06-c111 - DONE (06.10.2026): `pnpm build` נמדד מחדש על HEAD נקי, exit 0, אפס דריפט, אין מה לתקן.**
משימת התור: "pnpm build fix drift commit". `pwd` אומת, HEAD `13a7d8ba7` (בזמן העבודה נכנס `c1d64b886` של
M05-c111, `STATE.md` בלבד). `git diff bef85ac52 HEAD -- src` ריק: אפס שינוי קוד מאז W14. בעץ הראשי WIP זר
של account/coupon/gifts/sitemap שלא נגעתי בו ולא חויב, ולכן worktree נקי `/tmp/ke-m06-c111` (HEAD,
`node_modules` כ-APFS clone, `.env.local` כ-symlink, `refs/` הועתק ו-`supabase/.temp` ריק נוצר כי שניהם
ב-gitignore; נשאר במקומו, לא נמחק). **שערים** בחזית תחת `env -i`: type-check 0; lint 0 (כל 13 השערים,
docs-index 282, docs-path-audit 155 ידועים); test **638/638 קבצים, 7659 עברו, 12 דולגו**; **`rm -rf .next`
ואז build עם `CARDCOM_USE_MOCK=true`: exit 0, 340/340 דפים, אפס `Invalid API key`, `BUILD_ID`
`nKUqsugxjWnR2gkz_Kp9Y`**. 92 שורות `rls_denied` על `reviews` בזמן prerender, אותו מספר כמו ב-M06-c95 (חוסם
#3, מיגרציה 247), ואלה כל שורות ה-error בלוג; לא דריפט. לא פריט חזותי, `compare.mjs` לא נדרש.
**החלטה שהתקבלה לבד:** `RESUME FROM` נשאר M12-c110, כמו ב-M02/M03/M05-c111.

**M05-c111 - DONE (06.10.2026): `pnpm test` נמדד מחדש על HEAD נקי, 638/638, אפס דריפט, אין מה לתקן.**
`pwd` אומת, HEAD `b6b4ef5a9`. בעץ הראשי WIP זר של account/coupon/gifts/sitemap (11 קבצים שונו, 9 חדשים)
שלא נגעתי בו ולא חויב, ולכן הכל רץ ב-worktree נקי `/tmp/ke-m05-c111` (HEAD, `node_modules` כ-APFS clone,
`.env.local` כ-symlink; נשאר במקומו, לא נמחק). **שערים** תחת `env -i`: test **638/638 קבצים, 7659 עברו,
12 דולגו**, זהה למספרים של M02-c111 ו-M17-c110; type-check 0; lint: 11 השערים הראשונים בשרשרת נקיים,
docs-path-audit נכשל ב-worktree רק על קבצי `refs/` שב-gitignore (84 "חדשים"), ונקי בעץ הראשי
(155 ידועים, ללא שינוי); build 0 (`CARDCOM_USE_MOCK=true`), אפס `Invalid API key`. parity לא רלוונטי:
אין שינוי UI. **החלטה שהתקבלה לבד:** `RESUME FROM` נשאר M12-c110, כמו ב-M02-c111 ו-M17/M18-c110.

**M03-c111 - DONE (06.10.2026): `compare.mjs` על `/category` נמדד מחדש, 3.72 / 2.88 / 1.71 PASS.**
אין שינוי קוד. `pwd` אומת, HEAD `f82b0cb77` (`src` זהה ל-`bef85ac52`, W14; בזמן העבודה נכנס `b6b4ef5a9`
של M02-c111, docs בלבד). בעץ הראשי WIP זר של account/coupon/gifts שלא נגעתי בו, ולכן worktree נקי
`/tmp/ke-m03-c111` (HEAD, `node_modules` כ-APFS clone, `.env.local` כ-symlink, `refs/` הועתק; נשאר
במקומו, לא נמחק). build טרי תחת `env -i` עם `CARDCOM_USE_MOCK=true`, exit 0, אפס `Invalid API key`,
`BUILD_ID` `TL2rYC8UUaYfsJL1p-8NP`. `next start` על **4995**, cwd של המאזין אומת ב-`lsof`. השער רץ
בחזית: `--page=category --widths=380,768,1440 --baseline='refs/electro_shop_{width}.png'` (דגימת
`/category/hot-deals`, 200). **380 3.72% PASS, 768 2.88% PASS**; ב-1440 השרת קיבל SIGINT מבחוץ
(exit 130, כנראה ה-`pkill` של M02-c111 שתועד למעלה) והריצה נכשלה עם `ERR_CONNECTION_REFUSED`, בלי
מספר. השרת הופעל מחדש מאותו worktree על **4996** (cwd אומת) ו-1440 רץ שוב בחזית: **1.71% PASS**.
שלושת המספרים זהים בביט ל-W09 (`6e4edd589`, 05.10), כלומר W10..W14 לא הזיזו את דף הקטגוריה. שלוש
השורות נכתבו ל-`docs/UI-PARITY-REPORT.md` על ידי השער (ב-worktree) והועברו כמו שהן; הסיומת `-dirty`
ב-768/1440 היא הדוח עצמו שהשער כתב בשורה הקודמת. השרת נעצר לפי PID המאזין בלבד (INT).
**שערים** (worktree, `env -i`): type-check 0; lint: 10 שערים נקיים, docs-path-audit נכשל ב-worktree
רק על `supabase/.temp` (ב-gitignore), נקי בעץ הראשי (155 ידועים); test 638/638, 7659 עברו, 12 דולגו;
build 0.
**החלטה שהתקבלה לבד:** `RESUME FROM` נשאר M12-c110, כמו ב-M02-c111 ו-M17/M18-c110.

**M18-c110 - DONE (06.10.2026): STATE.md קוצץ.** בהגעה 249 שורות (כבר מתחת ל-300);
הסעיף הזה החזיק את הרשומה המלאה של M11-c110 ושלוש רשומות היסטוריות סגורות
(DEPLOY-UNBLOCK שנפתר ב-L01, M14-c73 שנסגר ב-L01, מצביע M18-c58..M01-c55). כולן
הועברו מילה במילה לראש `docs/STATE-ARCHIVE.md`; שום שורה לא נמחקה. נשארו: שורת
ה-resume, טבלת התור, החוסמים הפתוחים והפריטים הידניים לאופיר.
**החלטה שהתקבלה לבד:** `RESUME FROM` נשאר M12-c110. ב-`final-done.txt` של הלולאה
‏M12..M17-c110 רשומים כבוצעו, אבל אין להם commit ב-`git log` ואין רשומה כאן, ולכן
לפי הכלל "אין DONE בלי ראיה" הם לא נחשבים סגורים. M18-c110 הוא השורה האחרונה בתור.
**שערים** (worktree נקי `/tmp/ke-m18`, HEAD + שני הקבצים, תחת `env -i`, כי בעץ הראשי WIP
זר של account/coupon/gifts שלא נגעתי בו): type-check 0; lint 11 שערים נקיים (i18n 603/603,
docs-index 282), docs-path-audit נקי בעץ הראשי (155 ידועים, ב-worktree חסרים קבצי `refs/`
שב-gitignore); test 638/638, 7659 עברו, 12 דולגו; build 0, 340 דפים. parity לא רלוונטי:
אין שינוי UI. ה-worktree נשאר במקומו, לא נמחק.

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
