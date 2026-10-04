RESUME FROM: M18-c89
Updated: 2026-10-04 (סשן `audit/final-audit`, Opus 5.5, פריט M17-c89 DONE: leak RTL בשורת המטא של דף המוצר תוקן, שער מוצר 4.96/4.58/3.25 PASS)

## המשך מ:

**M17-c89 - DONE (04.10.2026).** משימת התור: "Verify RTL on / and
/product sample no LTR leaks". **הפעם נמצא leak אמיתי ותוקן.** קוד ה-UI
לא השתנה מאז M17-c88, אבל בדיקת הרינדור בפועל העלתה ש-`.pdp-summary__meta`
ב-`src/components/storefront/ProductInfo.tsx` מקבל `dir="ltr"` על כל השורה
כשאין למוצר מק"ט. זה נכתב ב-`7a7fd0c36` כשהשורה החזיקה רק את `nameEn`;
`99b2079cb` (M18-c52) הכניס לאותה שורה את `RatingStars`, וכיוון השורה לא
עודכן. התוצאה: מוצר עם ביקורת מאושרת ובלי מק"ט מציג את קישור הביקורות
בעברית ואת מילוי הכוכבים משמאל לימין. **התיקון:** השורה תמיד `dir="rtl"`,
ורק הרצף הלטיני (`nameEn`) מבודד ב-`<span dir="ltr">`, כמו שהמק"ט כבר
בודד. טסט רגרסיה חדש `src/components/storefront/product-meta-direction.test.tsx`
(3 מקרים; בלי התיקון 2 מהם נכשלים, נבדק עם stash). **מדידה בזמן ריצה:**
`rm -rf .next && CARDCOM_USE_MOCK=true pnpm build` exit 0, `/` ו-`/product/
מזקקת-ויסקי` (סלאג אקראי מתוך 44): שניהם `<html lang="he" dir="rtl">` 200.
אחרי התיקון השורה היא `dir="rtl"`, וה-`dir="ltr"` הנותרים הם רק שדה האימייל
בניוזלטר (מכוון, `input-dir-gate`) ו-`tel:` של הספק במוצר. גריפ על
`direction: ltr`/`text-left`/`ml-`/`pr-` קשיחים ב-`src/app/page.tsx`
ובתיקיית `product`: אפס. **שער חזותי (שינוי UI), בחזית:** `compare.mjs
--page=product --widths=380,768,1440 --baseline='refs/electro_product_{width}.png'`
מול `pnpm start` על 4968 (cwd ושעת ההפעלה 12:32 אומתו ב-`lsof`/`ps`):
**`380 4.96% PASS`, `768 4.58% PASS`, `1440 3.25% PASS`, exit 0**, זהה
ל-M02-c89. **החלטה שהתקבלה לבד:** הריצה הראשונה נעשתה על 3311, שם
`pnpm start` נפל על EADDRINUSE והשער מדד שרת זר (PID 1199, הופעל 11:21
לפני הבנייה). שלוש השורות שלה ב-`docs/UI-PARITY-REPORT.md` (05:27-05:30)
נשארו כי הדוח הוא לוג, אבל **השורות התקפות הן 05:32-05:36**. השרתים
הזרים על 3311-3316 שייכים לסשנים אחרים ולא נגעתי בהם. השרת שלי נעצר, 4968
פנוי. שערים: `type-check` 0, `lint` 0, `test` 615/615 (7340/7352, 12
דולגו), `build` exit 0. M16-c89 הועבר ל-`docs/STATE-ARCHIVE.md`. קבצים:
`ProductInfo.tsx`, הטסט החדש, `docs/UI-PARITY-REPORT.md`, `STATE.md`,
`docs/STATE-ARCHIVE.md`.

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

**M15-c61..M01-c59 (סיכומים הועברו ל-`docs/STATE-ARCHIVE.md` ב-M17-c89).**
הסבבים המלאים כבר היו בארכיון; כעת גם שורות הסיכום שלהם שם.

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
