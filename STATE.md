RESUME FROM: M11-c89
Updated: 2026-10-04 (סשן `audit/final-audit`, Opus 5.5, פריט M10-c89 DONE: כל המיגרציות החוסמות עדיין לא מוחלות בפרודקשן, החוסם כבר רשום, אפס דריפט)

## המשך מ:

**M10-c89 - DONE (04.10.2026).** משימת התור: "Verify migrations/pending/
applied or file blocker", זהה ל-M10-c82. `pwd` אומת, עץ נקי, HEAD
`e0ccbebe5` (M09-c89). `git log -1 -- migrations/pending` עדיין
`48c8792dd` (248): אפס קובץ חדש, 58 קבצי SQL + `preflight_162/184` +
`APPLY-ORDER.md`/`README.md`. בדיקה ישירה מול פרודקשן (CLI-keychain-token,
`SELECT` יחיד, קריאה בלבד, אפס DDL): **כל 14 הטבלאות** של 204/232/234/
235/236/239/240/244 חסרות; 9 העמודות של 223/232/242/243 חסרות
(`notifications.outbox_id`, `suppliers.about_he/opening_hours/
google_reviews_url`, `products.original_price_source(_url)/refund_policy/
shipping_price_agorot/cancellation_window_days`); `anon` בלי SELECT על
`reviews` (247); אפס מדיניות `*_unified` על `banners` (245); 82 שורות
`products` עם `city IS NULL` (כל הסטטוסים, 241). **החוסם כבר רשום** (חוסם
3 למטה, `docs/BACKLOG.md` סעיף 5, `docs/RUNBOOK.md`), אפס דריפט, לא
הוחלה אף מיגרציה. שערים: `type-check` 0, `lint` 0, `test` 614/614
(7337/7349, 12 דולגו), `rm -rf .next && CARDCOM_USE_MOCK=true
NEXT_PUBLIC_APP_URL=http://localhost:4517 pnpm build` exit 0. לא פריט
חזותי, `compare.mjs` לא נדרש. M09-c89 הועבר ל-`docs/STATE-ARCHIVE.md`.
קבצים: `STATE.md`, `docs/STATE-ARCHIVE.md`.

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

**M18-c88..M13-c88 (ארכיון מלא ב-`docs/STATE-ARCHIVE.md`, ארבעת
הראשים כווצו לשורה הזו ב-M17-c88, M17-c88 עצמו ב-M18-c88, M18-c88 ב-M01-c89).** קיצוץ STATE.md (M18-c88), RTL על / ו-/product (M17-c88), JSON-LD Product+BreadcrumbList
(M16-c88), קונסול אפס שגיאות ב-/ וב-/product (M15-c88), Sentry release
vs HEAD מול Vercel (M14-c88, אותו חוסם, סעיף 17 ב-`docs/BACKLOG.md`),
ו-`/api/health`/`/api/ready` מול פרודקשן (M13-c88) — כולם נבדקו מחדש,
אפס דריפט בארבעתם. גם M12-c88 (robots.txt) ו-M11-c88 (sitemap.xml), אפס דריפט,
וגם M05-c83/M04-c83 (test 614/614, type-check 0, כווצו לכאן ב-M01-c89).

**M01-c83..M01-c73 (ארכיון מלא ב-`docs/STATE-ARCHIVE.md`, שני טווחים
כווצו לשורה הזו ב-M05-c83 וב-M03-c82 לשמירה על תקרת 300 שורות; שום
שורה לא נמחקה מהארכיון עצמו).** מאה וארבעים ושישה פריטי תור/תחזוקה/
אימות-בלבד על פני שבעה סבבים (c83 (M01-c83..M03-c83), c82, c81, c78-c73):
שערי חזות בית/מוצר/קטגוריה כל סבב, type-check/test/build, TODO/FIXME,
Lighthouse mobile/100-100-100, unused deps/dead exports (knip), מיגרציות
ממתינות, sitemap.xml, robots.txt, health/ready, Sentry vs HEAD, קונסול/
hydration, JSON-LD, RTL, STATE.md trim — אפס דריפט/שבור בכולם, ארבעת
השערים ירוקים בכולם, אפס שינוי קוד ייצור.

**M14-c73 - BLOCKED (02.10.2026), קריטי** — production הוחלף חי מחוץ
לתור (`main`@`18ed044b2`, `SENTRY_DSN` חדש), מקור לא ידוע, לא תוקן/
הוחזר, פורט מלא ב-`docs/BACKLOG.md` סעיף 17 (ארכיון מלא, שבעת
הממצאים, ב-`docs/STATE-ARCHIVE.md`). נבדק שוב בכל סבב עד M14-c80
(למעלה): אפס דריפט, אותה פריסה בדיוק, ממתין להחלטת אופיר.

**M18-c68..M01-c72 (שבעה סבבים שלמים: c68-c72, ארכיון מלא ב-
`docs/STATE-ARCHIVE.md`, שום שורה לא נמחקה מהארכיון עצמו).** חמישים
ותשעה פריטי תור/אימות-בלבד/תחזוקה, DONE/אפס-דריפט בכולם, ארבעת השערים
ירוקים בכולם: שערים חזותיים בית/מוצר/קטגוריה כל סבב; type-check/test/
build; TODO/FIXME (תיקון אחד ב-c66's M07); Lighthouse 100/100/100; `knip`;
מיגרציות ממתינות; sitemap.xml; robots.txt (חוסם 2); `/api/health`/
`/api/ready`; Sentry מול HEAD (הפער גדל כל סבב, אין DSN בפרודקשן עד
שהשתנה ב-M14-c73); אפס console error/hydration; JSON-LD
Product+BreadcrumbList; RTL — leak אמיתי נמצא ותוקן ב-c66's M17
(`HeroSlider.tsx`), אפס דריפט חוזר אח"כ.

**Q25..Q55 (29 פריטים חיצוניים חד-פעמיים, ארכיון מלא ב-`docs/STATE-ARCHIVE.md`).**
עשרים וארבעה DONE/VERIFIED ובנויים במלואם (Q25..Q50: LCP+AVIF, שעות
פתיחה/ביקורות גוגל, שני BLOCKED על מדיניות אופיר), וחמישה נוספים
(Q51..Q55): Crisp נדחה (Q51 BLOCKED), Meilisearch Hebrew ו-Cardcom
sandbox-toggle כבר קיימים (Q52/Q53 VERIFIED), שלוש jobs חדשות ב-CI
(Q54 DONE), `v1.0.0-rc7-final-audit` תויג (Q55 DONE). אפס שינוי קוד
ייצור חוץ מ-Q43/Q54, ארבעת השערים ירוקים בכולם, שער חזותי PASS בכל מה
שנמדד.

**Q26 ו-M01-c62..M18-c65 (ארכיון מלא ב-`docs/STATE-ARCHIVE.md`).** Q26:
פריט חיצוני חד-פעמי, קופון/פיזי לדף המוצר מלאה. חמישים וארבעה פריטי בדיקה חוזרת (אפס דריפט)
וארבעה שיפורי המרה אמיתיים (דירוג כוכבים בבית/מוצר, לב מועדפים, קופי) —
אבטחה, SEO, axe, כיסוי טסטים, STATE/BACKLOG EMPTY, route audit,
Lighthouse, advisors, תברואת ריפו/תלויות. ארבעת השערים ירוקים בכולם,
שער חזותי יציב (8.51/9.02/3.95 בית, 5.61/4.92/2.99 מוצר, 99/100/100/100
Lighthouse).

**S02, S03 ו-M18-c61/M17-c61 (ארכיון מלא ב-`docs/STATE-ARCHIVE.md`).** S02/S03: שני
פריטים חד-פעמיים, reference בשם לא-קיים נתבקש, הפתרון כבר קיים בריפו
(`refs/ke_live_{width}.png`/`refs/electro_product_{380,768,1440}.png`),
אפס דריפט, לא קידמו `RESUME FROM:`. M18-c61 — שיפור המרה אמיתי אחד,
"נצפו לאחרונה" (Recently Viewed Products) בדף המוצר, שער חזותי PASS
בשלושת הרוחבים (4.96%/4.56%/3.25%). M17-c61 — קופי/משפטי, אפס דריפט.
ארבעת השערים ירוקים בשניהם.

**M15-c61..M01-c61 (ארכיון מלא ב-`docs/STATE-ARCHIVE.md`, כווץ לשורה
הזו ב-M16-c61 לשמירה על תקרת 300 שורות):** סנכרון תיעוד (אפס דריפט),
ביצועים (אפס דריפט), אבטחה (אפס דריפט), SEO (אפס דריפט), נגישות (0
`serious`/`critical`), כיסוי טסטים (שש הקטגוריות הקריטיות ב-100%),
STATE CLEAN, BACKLOG EMPTY (פעם חמש-עשרה), route audit (241 שורות,
אפס כשל), Lighthouse mobile (כל שמונת הציונים 90+), advisors (44 WARN
זהים), תברואת תלויות (`fast-xml-parser` 5.11.2), בדיקה ירוקה, שער חזותי
(אפס רגרסיה), ובדיקת פרודקשן (פעם שמינית, DNS/HTTP תקינים, פריסה עדיין
חסומה) — שום שורה לא נמחקה מהארכיון עצמו, רק הוסרה כאן הכפילות.

**M18-c60..M11-c60 (ארכיון מלא ב-`docs/STATE-ARCHIVE.md`, כווץ לשורה
הזו ב-M10-c61 לשמירה על תקרת 300 שורות):** אפס-פעילות (שני קומיטי טסט
בלבד), קופי/משפטי (אפס דריפט), תברואת ריפו (אפס דריפט), סנכרון תיעוד
(אפס דריפט), ביצועים (אפס דריפט), אבטחה (אפס דריפט, ממצא build מקומי
בלבד), SEO (אפס דריפט), ונגישות (axe, 0 `serious`/`critical`) — ארבעת
השערים ירוקים בכולם, אפס שינוי קוד ייצור בכולם.

**M10-c60..M02-c60 (ארכיון מלא ב-`docs/STATE-ARCHIVE.md`, כווץ לשורה
הזו ב-M09-c61 לשמירה על תקרת 300 שורות):** כיסוי טסטים (`recordRefusedScan`
50%→100%, ושני קבצים נוספים 0%→100%), BACKLOG EMPTY (פעם ארבע-עשרה), route audit (241 שורות, אפס
כשל), Lighthouse mobile (כל שמונת הציונים 90+), advisors (44 WARN
זהים), תברואת תלויות, בדיקה ירוקה, ושער חזותי (אפס רגרסיה) — כולם אפס
דריפט מהמקבילים ב-c59, ארבעת השערים ירוקים בכולם.

**M18-c59..M15-c59 (ארכיון מלא ב-`docs/STATE-ARCHIVE.md`, כווץ לשורה
הזו ב-M10-c60 לשמירה על תקרת 300 שורות):** אפס-פעילות (בפועל שני
קומיטים אמיתיים), קופי/משפטי (אפס דריפט), תברואת ריפו (אפס דריפט),
וסנכרון תיעוד (STATE.md/LAUNCH-READINESS.md/BACKLOG.md מול git log,
אפס דריפט) — ארבעת השערים ירוקים בכולם.

**M14-c59 ו-M13-c59 (ארכיון מלא ב-`docs/STATE-ARCHIVE.md`, שני הראשים
המקוריים כווצו לשורה הזו ב-M13-c62 לשמירה על תקרת 300 שורות).** M14-c59
— ביצועים, bundle/צנרת תמונות/תגיות ISR/כותרות cache אומתו מחדש מול
build אמיתי, אפס דריפט מ-M14-c58. M13-c59 — אבטחה, CSP/HSTS/
X-Frame-Options/Referrer-Policy ומגבלות קצב Upstash אומתו מחדש, אפס
דריפט מ-M13-c58. ארבעת השערים ירוקים בשניהם, אפס שינוי קוד.

**M12-c59..M01-c59 (ארכיון מלא ב-`docs/STATE-ARCHIVE.md`, כווץ לשורה
הזו ב-M11-c60 לשמירה על תקרת 300 שורות):** SEO (אפס דריפט), נגישות
(axe בפעם חמישית, 0 `serious`/`critical`), כיסוי טסטים
(`payment-money-columns.ts` 95.23%→100%), STATE CLEAN, BACKLOG EMPTY
(פעם שלוש-עשרה), route audit (241 שורות, אפס כשל), Lighthouse mobile
(כל שמונת הציונים 90+), advisors (44 WARN זהים), תברואת תלויות, שער
ירוק, שער חזותי (אפס רגרסיה), ובדיקת פרודקשן (פעם שישית, DNS/HTTP
תקינים, פריסה עדיין חסומה) — שום שורה לא נמחקה מהארכיון עצמו, רק
הוסרה כאן הכפילות.

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
   M10-c89 (04.10, בדיקה ישירה מול פרודקשן בפועל דרך CLI-keychain-token,
   לא רק git): כל 19 הקבצים החוסמים עדיין לא הוחלו, אפס סחיפה מ-M10-c82.**
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
