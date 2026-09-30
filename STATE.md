RESUME FROM: M08-c61
Updated: 2026-09-30 (סשן `audit/final-audit`, Sonnet 5, פריט M07-c61)

## המשך מ:

**M07-c61 - DONE (30.09): route audit נמדד שוב, 241 שורות, אפס כשל
אמיתי, אפס דריפט מ-M07-c60.** אותו מתכון שאומת מ-M07-c1 ועד M07-c60:
`rm -rf .next && CARDCOM_USE_MOCK=true NEXT_PUBLIC_APP_URL=http://localhost:3472
pnpm build` → `exit 0`; `pnpm start -p 3472` מאותה בנייה (פורט 3472
אומת פנוי לפני ואחרי). `curl` אישר `200` על `/`. שישה chunks של
chromium (`--grep` לפי `anon /` / `GET /|supplier|anon dynamic` /
`customer` / שלושה פילוחי `admin`, worker יחיד), כולם נכתבו לאותו
`ROUTE_AUDIT_REPORT` משותף: 59 + 83 + 25 + 23 + 20 + 16 טסטים, כולם
עברו (playwright מדווח `passed`). נותח בקוד: **241 שורות ייחודיות
(role+path)**, 239 PASS + 2 NO DATA (זהה לכל מדידה קודמת מ-M07-c1:
`customer /account/tickets/[id]`, `admin /admin/discounts/[id]`, שני
פערי seed ידועים), **אפס FAIL, אפס consoleErrors, אפס
hydrationWarnings, אפס rtl:false** בכל 241 השורות. `git diff --stat
8402645de..HEAD -- src/app src/components src/lib e2e package.json
pnpm-lock.yaml` מחזיר רק שני קבצי טסט (`bought-this-week.test.ts`,
`stock-live.test.ts`) ובאמפ patch של `fast-xml-parser` — אפס שינוי
קוד/מסלול, ולכן 241/239/2 (זהה ל-M07-c60) אינו רעש. השרת נעצר, פורט
3472 אומת פנוי מחדש, קובץ ה-JSONL הזמני (`/tmp/route-audit-m07c61.jsonl`)
נמחק. שערים: `type-check` נקי; `lint` נקי (2025 קבצים, כל שערי התוכן
ירוקים, i18n 627/627, locale 116/64, docs-index 282, docs-path-audit
152); `test` 610/610 קבצים, 7296/7308 (12 skipped, 58.02s); `build`
`exit 0` (חלק מהמדידה עצמה, בנייה שנייה ללא env דמה). אין שינוי קוד,
אין שער חזותי נדרש (אין שינוי UI). **קובץ יחיד שונה: `STATE.md`**
(פלוס `docs/STATE-ARCHIVE.md`, M06-c61 הועבר לתקרת 300 שורות).

## M06-c61 (ארכיון מלא ב-`docs/STATE-ARCHIVE.md`)

M06-c61: Lighthouse mobile נמדד שוב, כל שמונת הציונים 90+ (99/100/100/100
בשני הדפים), אפס דריפט מ-M06-c60.

## M05-c61 (ארכיון מלא ב-`docs/STATE-ARCHIVE.md`)

M05-c61: ביקורת DB, advisors נמדדו בפעם האחת-עשרה, 44 WARN זהים
ב-100% ל-M05-c60, אפס מיגרציה חדשה נדרשת.

## M04-c61 (ארכיון מלא ב-`docs/STATE-ARCHIVE.md`)

M04-c61: תברואת תלויות — `pnpm audit` אפס חולשות, `fast-xml-parser`
5.11.1→5.11.2 הוחל (dev, same-major, היחיד מתוך 16 חבילות שלא היה
קפיצת major). ארבעת השערים ירוקים.

## M03-c61 (ארכיון מלא ב-`docs/STATE-ARCHIVE.md`)

M03-c61: בדיקה ירוקה מחדש, אפס שגיאה/אזהרה לתיקון, אפס שינוי קוד.
ארבעת השערים ירוקים (610 קבצים, 7296 עברו, 12 דולגו; build נקי).

## M02-c61 (ארכיון מלא ב-`docs/STATE-ARCHIVE.md`)

M02-c61: שער חזותי, בית ומוצר, שלושה רוחבים, אפס רגרסיה — כל שש
המדידות PASS מתחת ל-11% (8.51/9.02/3.95 בית, 4.96/4.56/3.25 מוצר).

## M01-c61 (ארכיון מלא ב-`docs/STATE-ARCHIVE.md`)

M01-c61: בדיקת פרודקשן בפעם השמינית, DNS/HTTP תקינים (`www.kenyonexpress.co.il`
200, NS עדיין `ns1/ns2.vercel-dns.com`), פריסת HEAD עדיין חסומה על אותו
חוסם Cardcom/`ALLOW_INCOMPLETE_ENV` (חמש פריסות `ERROR` רצופות, אוטומטיות
מ-GitHub). דילוג על ניסיון פריסה נוסף לפי כלל "נתקע פעמיים", פעם שביעית.
HEAD עלה ל-211 קומיטים אחרי `a388118f1` החי. אפס שינוי קוד.

## M18-c60 (ארכיון מלא ב-`docs/STATE-ARCHIVE.md`)

M18-c60: בדיקת אפס-פעילות בפעם השביעית, המחזור *לא* היה אפס-פעילות —
שני קומיטי טסט בלבד (`bought-this-week`/`stock-live`, `scan-context`),
אפס קוד ייצור, לפי אותו תקדים כמו M18-c55..M18-c59. ארבעת השערים
ירוקים, אין שער חזותי נדרש.

## M17-c60 (ארכיון מלא ב-`docs/STATE-ARCHIVE.md`)

M17-c60: קופי ומשפטי אומתו מחדש בפעם שמינית, אפס דריפט מאז `46b3b93ea`
(M17-c51); מחרוזת חדשה אחת בלבד מ-M18-c52 (`reviewsPage.summaryLink`),
עברית תקנית. 15 קישורי פוטר וכל ה-alias המשפטיים נבדקו, אפס שינוי.
ארבעת השערים ירוקים.

## M16-c60 (ארכיון מלא ב-`docs/STATE-ARCHIVE.md`)

M16-c60: תברואת ריפו בפעם העשירית, אפס דריפט בענפים מקומיים (43 ענפים
זהה ל-M16-c59, אפס קומיט ייחודי לא-דחוף בשום ענף), 117 ענפי remote
(עלה ב-1, לא שלנו), 24 PR פתוחים זהה ל-M16-c59. ארבעת השערים ירוקים.

## M15-c60 (ארכיון מלא ב-`docs/STATE-ARCHIVE.md`)

M15-c60: סנכרון תיעוד — טבלת המצב ב-STATE.md, `docs/LAUNCH-READINESS.md`
ו-`docs/BACKLOG.md` רועננה מול git log וראיות קוד, אפס דריפט מ-M15-c59
(207 קומיטים אחרי `a388118f1`, 18 קבצי מיגרציה ממתינים ללא שינוי, 26
ממצאי קטלוג ללא שינוי). אפס שינוי קוד ייצור.

## M14-c60 (ארכיון מלא ב-`docs/STATE-ARCHIVE.md`)

M14-c60: ביצועים — bundle/צנרת תמונות/תגיות ISR/כותרות cache אומתו
מחדש, אפס דריפט מ-M14-c59 (223.8 KB gz shared first-load זהה,
`/checkout` 324.1 kB gz הכבד ביותר זהה). אפס שינוי קוד ייצור.

## M13-c60 (ארכיון מלא ב-`docs/STATE-ARCHIVE.md`)

M13-c60: אבטחה — CSP/HSTS/X-Frame-Options/Referrer-Policy ומגבלות קצב
Upstash אומתו מחדש, אפס דריפט מ-M13-c59 (כותרות זהות בארבעה נתיבים,
ארבע מגבלות הקצב באותן שורות קוד). ממצא build מקומי בלבד (CSP חסר
`upgrade-insecure-requests` כש-`NEXT_PUBLIC_APP_URL` מקומי הוא
`http://`, מאושר תקין בפרודקשן דרך Vercel). אפס שינוי קוד.

## M12-c60 (ארכיון מלא ב-`docs/STATE-ARCHIVE.md`)

M12-c60: SEO — meta/canonical/og/JSON-LD Product+Offer/sitemap/robots
אומתו מחדש, אפס דריפט מ-M12-c59 (robots 11 שורות `Disallow`, sitemap
חמש תת-מפות, 46 כתובות מוצר, 5 `lastmod` שונים בפועל). אפס שינוי קוד.

## M11-c60 (ארכיון מלא ב-`docs/STATE-ARCHIVE.md`)

M11-c60: נגישות, axe אומתה מחדש בפעם שישית, 0 הפרות `serious`/
`critical` (ציבורי 72/74 + 2 דולג, מאומת לקוח 16/16 + ספק 7/7, אדמין
57/57 דולג — כשל התחברות פרודקשן קיים מראש). `target-size` (WCAG 2.2,
מחוץ ליעד) נשאר כהחלטה פתוחה. אפס שינוי קוד, build טרי `exit 0`.

## M10-c60 (הועבר מ-STATE.md ב-M11-c60, לשמירה על תקרת 300 שורות)

M10-c60: כיסוי טסטים — `recordRefusedScan` ב-`src/server/domain/vouchers/scan-context.ts`
מ-50% פונקציות (55.55% שורות/הצהרות) ל-100% בכל המדדים, היחיד מתחת
ל-90% בין שש הקטגוריות של משימת התור. קובץ ששונה: `scan-context.test.ts`
בלבד. פירוט מלא ב-`docs/STATE-ARCHIVE.md`.

**M09-c60..M02-c60 (ארכיון מלא ב-`docs/STATE-ARCHIVE.md`, כווץ לשורה
הזו ב-M16-c60 לשמירה על תקרת 300 שורות):** כיסוי טסטים (שני קבצים
0%→100%), BACKLOG EMPTY (פעם ארבע-עשרה), route audit (241 שורות, אפס
כשל), Lighthouse mobile (כל שמונת הציונים 90+), advisors (44 WARN
זהים), תברואת תלויות, בדיקה ירוקה, ושער חזותי (אפס רגרסיה) — כולם אפס
דריפט מהמקבילים ב-c59, ארבעת השערים ירוקים בכולם.

**M18-c59..M15-c59 (ארכיון מלא ב-`docs/STATE-ARCHIVE.md`, כווץ לשורה
הזו ב-M10-c60 לשמירה על תקרת 300 שורות):** אפס-פעילות (בפועל שני
קומיטים אמיתיים), קופי/משפטי (אפס דריפט), תברואת ריפו (אפס דריפט),
וסנכרון תיעוד (STATE.md/LAUNCH-READINESS.md/BACKLOG.md מול git log,
אפס דריפט) — ארבעת השערים ירוקים בכולם.

## M14-c59 (ארכיון מלא ב-`docs/STATE-ARCHIVE.md`)

M14-c59: ביצועים, bundle/צנרת תמונות/תגיות ISR/כותרות cache אומתו מחדש
מול build אמיתי (223.8 KB gz shared first-load, 8 chunks; `/checkout`
324.1 kB gz הכבד ביותר), אפס דריפט מ-M14-c58 — זהה ל-100%. אפס שינוי
קוד.

## M13-c59 (ארכיון מלא ב-`docs/STATE-ARCHIVE.md`)

M13-c59: אבטחה, CSP/HSTS/X-Frame-Options/Referrer-Policy ומגבלות קצב
Upstash על login/checkout/redeem אומתו מחדש מול build אמיתי (פורט
3391), אפס דריפט מ-M13-c58 — כותרות זהות בארבעה נתיבים (`/`,
`/checkout`, `/login`, `/redeem/test-token`), ארבע מגבלות הקצב באותן
שורות קוד בדיוק. אפס שינוי קוד.

**M12-c59..M01-c59 (ארכיון מלא ב-`docs/STATE-ARCHIVE.md`, כווץ לשורה
הזו ב-M11-c60 לשמירה על תקרת 300 שורות):** SEO (אפס דריפט), נגישות
(axe בפעם חמישית, 0 `serious`/`critical`), כיסוי טסטים
(`payment-money-columns.ts` 95.23%→100%), STATE CLEAN, BACKLOG EMPTY
(פעם שלוש-עשרה), route audit (241 שורות, אפס כשל), Lighthouse mobile
(כל שמונת הציונים 90+), advisors (44 WARN זהים), תברואת תלויות, שער
ירוק, שער חזותי (אפס רגרסיה), ובדיקת פרודקשן (פעם שישית, DNS/HTTP
תקינים, פריסה עדיין חסומה) — שום שורה לא נמחקה מהארכיון עצמו, רק
הוסרה כאן הכפילות.

**כל סעיף מ-M18-c58 ועד M08-c57 (כולל M17-c58..M01-c58, M18-c57..M08-c57)**
היה מסומן כאן "ארכיון מלא ב-`docs/STATE-ARCHIVE.md`" וכווץ לשורה הזו
ב-M04-c59 לשמירה על תקרת 300 שורות — שום שורה לא נמחקה מהארכיון עצמו,
רק הוסרה כאן הכפילות.

ההיסטוריה המלאה (Q01..Q24, B01..B10, M01-c1..M15-c56, תור 23.09, וכל מה
שקדם) נשארת שלמה, החדש למעלה, ב-`docs/STATE-ARCHIVE.md`. **כל סעיף
מ-M06-c57 ועד M01-c55 (כולל M18-c55..M01-c56, M16-c55..M13-c55, M07-c55,
M03-c55..M01-c55)** היה מסומן כאן "ארכיון מלא ב-`docs/STATE-ARCHIVE.md`"
וכווץ לשורה הזו ב-M08-c58 לשמירה על תקרת 300 שורות — שום שורה לא נמחקה
מהארכיון עצמו, רק הוסרה כאן הכפילות. הקובץ הזה מחזיק רק את מה שחי.

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
2. **פריסת פרודקשן של HEAD (211 קומיטים אחרי `a388118f1` החי — ספירת git
   בלבד, עודכן ב-M01-c61 מ-194 שנמדד ב-M01-c60; ניסיון הפריסה הידני האחרון
   היה ב-M01-c55, 105 קומיטים אז)**:
   נוסתה לאחרונה ב-M01-c55 (Vercel MCP, `create_deployment`, `gitSource`
   github, `audit/final-audit`@`291bc2d88`) **וסורבה ב-`deploy-preflight`**
   באותה סיבה בדיוק, פעם חמישית ברציפות (M01-c1, M01-c52, M01-c53, M01-c54,
   M01-c55): `dpl_FJYf483tkqSNf5pkG9MenghGQF46`, `BUILD_UTILS_SPAWN_1`.
   **מ-M01-c56 ועד M01-c61 לא נוסה ניסיון פריסה ידני נוסף** (כלל "goal שנתקע
   פעמיים — לדלג", מוחל מ-M01-c55, פעם שביעית ב-M01-c61 — כולל דחיית משימת
   התור שביקשה בפירוש build+deploy חדש, ראו M01-c61 למעלה), אך התנאי נבדק
   שוב בקריאה בלבד בכל פעם ואושר ללא שינוי: `CARDCOM_TERMINAL_NUMBER`,
   `CARDCOM_API_NAME`, `CARDCOM_API_PASSWORD` עדיין חסרים ב-Production
   (קיימים במקומם `CARDCOM_MERCHANT_ID`/`CLIENT_ID`/`API_KEY` שהקוד לא
   קורא) ו-`ALLOW_INCOMPLETE_ENV` עדיין מוגדר שם (`filter_project_envs`,
   קריאה בלבד, M01-c61). **`list_deployments` (target=production, 5
   אחרונות) חושף שVercel מריץ build אוטומטי על כל push ל-`audit/final-audit`
   דרך חיבור ה-GitHub** — לא רק בניסיונות ידניים — וכל חמשת האחרונות
   (`1083b8d8d`, `99b2079cb`, `0bcbdac18`, `291bc2d88` פעמיים) `ERROR`
   באותה סיבה, נמדד M01-c61.
   עד שאופיר יתקן את הסביבה אין פריסה אפשרית מהענף הזה; פרודקשן נשאר על
   `a388118f1` (`dpl_EMtv9KbPfdGq75JLSNysp1wx3DQa`, READY, מאושר שוב
   ב-M01-c61 דרך `curl` ישיר על `www.kenyonexpress.co.il`). **DNS
   אינו קשור לחוסם הזה** — נמדד שוב ב-M01-c61, `www.kenyonexpress.co.il`
   מחזיר 200 עם התוכן החי, `kenyonexpress.co.il` מפנה 308 ל-`www`, ה-NS
   עדיין `ns1/ns2.vercel-dns.com`.
3. **מיגרציות ממתינות**: **218 (טריגר `enforce_profile_privilege_columns` מפיל כל
   עדכון פרופיל של לקוח ב-42703; נמדד 25.09 ב-M05-c1, 5 מ-5 לקוחות, בניגוד לרישום
   "הוחלה" מ-21.09)**, 245 ו-246 (advisors, M05-c1; 245 אחרי 209 ואחרי 203), 204 (הצטרפות ספקים והסכם click-wrap; בלעדיה הטופס
   עונה "עדיין לא פעיל"), 240 (הסכמת "הכל באפליקציה"), 241 (עיר משלוש
   כותרות), 242 (מקור מחיר + ביקורות גוגל), 243 (תנאי מוצר), 244 (קמפיינים
   והמרות של תוכנית השותפים; בלעדיה התוכנית "עדיין לא פתוחה"), 247 (`anon`
   בלי הרשאת SELECT על `reviews`, נמדד M18-c52; בלעדיה דף הביקורות הציבורי
   נכשל תמיד, ללא תלות בשום קובץ אחר). סדר והתנאים
   ב-`docs/RUNBOOK.md`, סקירה ב-`docs/MIGRATION-REVIEW.md`. לא הוחל דבר.
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

## ידני לאופיר, לפי סדר קריטיות

הרשימה המלאה, ממוזגת עם `docs/LAUNCH-READINESS.md` וללא כפילויות, עברה
ל-`docs/BACKLOG.md` (M15-c51). לא נשמר עותק כאן, כדי שלא ייסטה שוב.
