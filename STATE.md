RESUME FROM: M04-c62
Updated: 2026-09-30 (סשן `audit/final-audit`, Sonnet 5, פריט M03-c62)

## המשך מ:

**M03-c62 - DONE (30.09): שער ירוק הורץ מחדש במלואו על עץ עבודה נקי,
זהה ל-HEAD (`fa375af11`).** `type-check` נקי (0 שגיאות), `lint` נקי
(biome 2028 קבצים + 12 שערי לינט מותאמים, כולל i18n 627/627 ו-locale-format
116/116 בתקרה), `test` **610/610 קבצים, 7296/7308 בדיקות ירוקות (12
דולגים), 59.70s**, `build` הצליח (`✓ Compiled successfully`, exit 0),
כולל `TypeScript` ו-`runAfterProductionCompile`. אפס שגיאת build, אפס
אזהרת biome/tsc. שתי קטגוריות רעש ב-log זמן ה-build (לא אזהרת toolchain):
`supabase.rls_denied`/`reviews_read_failed` (401/42501, מיגרציה 247
הממתינה) ו-`db.optional_column_missing` (מיגרציה 242 הממתינה) — שתיהן
כבר רשומות ב"חוסמים פתוחים" סעיף 3 למטה, לא תיקון קוד. אין קובץ קוד
לתקן: אפס warning fixable בלי migration. עץ עבודה נשאר נקי מלבד
`STATE.md`/`docs/STATE-ARCHIVE.md` (תיעוד הפריט). קובץ ששונה: `STATE.md`,
`docs/STATE-ARCHIVE.md` (M01-c62 כווץ לפריט הזה).

**M02-c62 - DONE (30.09): שער פריטיות (`scripts/compare.mjs`) הורץ מחדש
בחזית, שרת זמני על פורט 3919 (`.next` אומת source-identical ל-HEAD דרך
`git diff --stat fd820969f..HEAD -- next.config.ts next.config.js
middleware.ts vercel.json src/ package.json pnpm-lock.yaml`, ריק).** דף
הבית מול `refs/ke_live_{width}.png`, דף המוצר מול
`refs/electro_product_{width}.png` (ברירת המחדל `מוצר-לדוגמא`, אותה שורה
שהשער השתמש בה ב-`eb1768c50`/`fd820969f`):

| דף | 380 | 768 | 1440 |
|---|---|---|---|
| בית | 8.51% PASS | 9.02% PASS | 3.95% PASS |
| מוצר | 4.96% PASS | 4.56% PASS | 3.25% PASS |

כל שש המדידות מתחת לסף 11%, אפס רגרסיה, אפס תיקון קוד נדרש. השורות נכתבו
אוטומטית על ידי השער עצמו ל-`docs/UI-PARITY-REPORT.md` (08:01-08:13,
תג `2342c2680-dirty`). השרת הזמני נהרג בסיום, לא נותר תהליך יתום. שערים:
`type-check` נקי, `lint` נקי, `test` ירוק, `build` לא נדרש מחדש (אפס שינוי
קוד). קובץ ששונה מלבד `STATE.md`: `docs/UI-PARITY-REPORT.md` (נכתב
אוטומטית על ידי השער).

**M01-c62 - BLOCKED (ארכיון מלא ב-`docs/STATE-ARCHIVE.md`, כווץ לשורה
הזו ב-M03-c62 לשמירה על תקרת 300 שורות).** בדיקת פרודקשן בפעם התשיעית:
DNS/HTTP תקינים (`www.kenyonexpress.co.il` 200, `NS` `vercel-dns.com`),
פריסת HEAD עדיין חסומה באותה סיבה (Cardcom env חסר + `ALLOW_INCOMPLETE_ENV`
ב-Production, ראה "חוסמים פתוחים" סעיף 2), דילוג על ניסיון נוסף לפי כלל
"goal שנתקע פעמיים". SHOWABLE: yes (בית/מוצר, שני הדפים מתחת ל-11%).

**S03 - DONE (30.09), פריט חד-פעמי חיצוני לתור ה-M, לא מקדם `RESUME FROM:`.**
המשימה שהתקבלה ביקשה ללכוד reference חדש ל-Electro v7 single product page
ל-`refs/electro-product-{380,768,1440}.json`, ולבחור מוצר זרוע מ-S01. אף אחד
מהשמות האלה לא קיים בריפו הזה ומעולם לא היה (`git log --all --grep=S01`,
`--grep=S03`, `grep -rn "S01\|S03" STATE.md docs/*.md`: אפס תוצאות), אותו
תבנית בדיוק כמו `scripts/_probe.mjs` ו-`refs/electro-home-*.json` של S02
(שורה למעלה). מה שקיים ועושה בדיוק את אותה עבודה: `refs/electro_product_
{380,768,1440}.png` (PNG, קו תחתון, לא JSON ולא מקף), נלכד ב-25.09 (Q05b,
`docs/MISSING-ASSETS.md` סעיף 1) ומגודר על ידי `scripts/compare.mjs
--page=product --baseline='refs/electro_product_{width}.png'` מאז.

מוצר יעד: `barbecue-2` (ארוחה בשרית, id נקי, לא ב-`supabase/
catalogue-known-issues.json`, אותו slug שהמתכון המתועד ב-`docs/
MISSING-ASSETS.md` משתמש בו). הרצה בחזית על שרת טרי (פורט 3316, `.next`
אומת source-identical ל-HEAD דרך `git diff --stat fd820969f..HEAD --
next.config.ts next.config.js middleware.ts vercel.json src/ package.json`,
ריק):

| רוחב | both-painted | סף |
|---|---|---|
| 380 | **5.61%** | PASS (< 11%) |
| 768 | **4.92%** | PASS (< 11%) |
| 1440 | **2.99%** | PASS (< 11%) |

זהה לארבע השורות האחרונות שנרשמו מ-29.09 (`7274ff68f` ועד היום), אפס
דריפט. השורות נכתבו אוטומטית על ידי השער עצמו ל-`docs/UI-PARITY-REPORT.md`
(07:41-07:46). המספרים הכוללים גבוהים בהרבה (20-35%) כי הרפרנס של Electro
הוא מוצר אחר וארוך יותר (ביקורות, טאבים, קרוסלת מוצרים קשורים, 11181px/
8408px/7653px גובה) ו-`diff-bands.mjs` מסמן את זה כאזהרת יחס-גובה בכוונה,
לא ככשל: המדד המגודר הוא סטיית "both painted" בלבד, בדיוק כפי שמתועד
ב-`docs/MISSING-ASSETS.md` סעיף 1.

שערים: `type-check` נקי, `lint` נקי (12 שערים), `test` 610/610 קבצים
7296/7308 ירוק. `build` לא הורץ מחדש: `.next` כבר אומת source-identical
ל-HEAD (למעלה). השרת הזמני על פורט 3316 נהרג בסיום, לא נותר תהליך יתום.

**לא מקדם את `RESUME FROM:`** - S03 אינו חלק מתור ה-M הפנימי (ראה
"טבלת מצב לתור" למטה); M01-c62 נשאר היעד הבא של הלולאה האוטונומית.
קובץ ששונה: `STATE.md`, `docs/UI-PARITY-REPORT.md` (נכתב אוטומטית
על ידי השער).

**S02 - DONE (30.09), פריט חד-פעמי דומה, פירוט מלא ב-`docs/STATE-ARCHIVE.md`
(כווץ לשורה הזו ב-S03 לשמירה על תקרת 300 שורות).** בקצרה: אותה בעיית שמות
לא-קיימים (`refs/electro-home-*.json`, `scripts/_probe.mjs`), אותו פתרון
(`compare.mjs --page=home` מול `refs/ke_live_{width}.png`), אותה תוצאה:
380 8.51% / 768 9.02% / 1440 3.95%, כולם PASS, אפס דריפט מ-M02-c61/M15-c61.

**M18-c61 ו-M17-c61 (ארכיון מלא ב-`docs/STATE-ARCHIVE.md`, כווץ לשורה
הזו ב-M02-c62 לשמירה על תקרת 300 שורות):** M18-c61 — שיפור המרה אמיתי
אחד, "נצפו לאחרונה" (Recently Viewed Products) בדף המוצר, שער חזותי PASS
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
2. **פריסת פרודקשן של HEAD (231 קומיטים אחרי `a388118f1` החי — ספירת git
   בלבד, עודכן ב-M01-c62 מ-211 שנמדד ב-M01-c61; ניסיון הפריסה הידני האחרון
   היה ב-M01-c55, 105 קומיטים אז)**:
   נוסתה לאחרונה ב-M01-c55 (Vercel MCP, `create_deployment`, `gitSource`
   github, `audit/final-audit`@`291bc2d88`) **וסורבה ב-`deploy-preflight`**
   באותה סיבה בדיוק, פעם חמישית ברציפות (M01-c1, M01-c52, M01-c53, M01-c54,
   M01-c55): `dpl_FJYf483tkqSNf5pkG9MenghGQF46`, `BUILD_UTILS_SPAWN_1`.
   **מ-M01-c56 ועד M01-c62 לא נוסה ניסיון פריסה ידני נוסף** (כלל "goal שנתקע
   פעמיים — לדלג", מוחל מ-M01-c55, פעם שמינית ב-M01-c62 — כולל דחיית משימת
   התור שביקשה בפירוש build+deploy חדש, ראו M01-c62 למעלה), אך התנאי נבדק
   שוב בקריאה בלבד בכל פעם ואושר ללא שינוי: `CARDCOM_TERMINAL_NUMBER`,
   `CARDCOM_API_NAME`, `CARDCOM_API_PASSWORD` עדיין חסרים ב-Production
   (קיימים במקומם `CARDCOM_MERCHANT_ID`/`CLIENT_ID`/`API_KEY` שהקוד לא
   קורא) ו-`ALLOW_INCOMPLETE_ENV` עדיין מוגדר שם (`filter_project_envs`,
   קריאה בלבד, M01-c62). **`list_deployments` (target=production, 5
   אחרונות) מראה בדיוק את אותן חמש פריסות `ERROR` שנמדדו ב-M01-c61** —
   שום push מאז (כולל S02/S03/M18-c61 התיעודיים) לא הפעיל build אוטומטי
   חדש (`1083b8d8d`, `99b2079cb`, `0bcbdac18`, `291bc2d88` פעמיים), כולן
   `ERROR` באותה סיבה, נמדד שוב M01-c62.
   עד שאופיר יתקן את הסביבה אין פריסה אפשרית מהענף הזה; פרודקשן נשאר על
   `a388118f1` (`dpl_EMtv9KbPfdGq75JLSNysp1wx3DQa`, READY, מאושר שוב
   ב-M01-c62 דרך `curl` ישיר על `www.kenyonexpress.co.il`). **DNS
   אינו קשור לחוסם הזה** — נמדד שוב ב-M01-c62, `www.kenyonexpress.co.il`
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
