RESUME FROM: M01-c60
Updated: 2026-09-30 (סשן `audit/final-audit`, Sonnet 5, פריט M18-c59)

## המשך מ:

**M18-c59 - DONE (30.09): בדיקת אפס-פעילות בפעם השישית, המחזור *לא*
היה אפס-פעילות.** משימת התור: אם כל פריטי התור מעלה (M01-c59..M17-c59)
לא הפיקו שינוי קוד השבוע, לכתוב `MAINTENANCE IDLE` עם התאריך ב-STATE.md,
ואז לחפש שיפור אמיתי אחד בהמרת לקוחות בדף הבית או דף המוצר שתואם
Electro v7 וליישם אותו.

**נמדד ישירות מ-git, לא הונח:** `git diff --stat 725c64ba4^..HEAD --
. ':!STATE.md' ':!docs/'` על כל שבעה-עשר הקומיטים של המחזור
(M01-c59..M17-c59) מחזיר בדיוק שני קבצים — `pnpm-lock.yaml` (M04-c59,
רענון `caniuse-lite` בלבד, אפס שינוי ב-`package.json`) ו-
`src/lib/payments/payment-money-columns.test.ts` (M10-c59, טסט כיסוי
ענפים בלבד). אותו דפוס בדיוק כמו M18-c55, M18-c56, M18-c57 ו-M18-c58
(כל אחד מארבעתם מצא שני קומיטי שינוי-קוד אמיתיים באותו מחזור — לא נצפה
עדיין מחזור אפס-פעילות אמיתי). `MAINTENANCE IDLE` לא נכתב, שלב חיפוש
שיפור ההמרה לא הופעל.

שערים הורצו במלואם: `type-check` נקי, `lint` נקי (2023 קבצים, i18n
627/627, locale 116/116, docs-index 282, docs-path-audit 152), `test`
608/608 קבצים 7274/7286 (12 skipped, 59.47s), `build` `exit 0`. אין שער חזותי
נדרש (אפס שינוי UI/קוד, `STATE.md`/`docs/STATE-ARCHIVE.md` בלבד).

## M17-c59

**M17-c59 - DONE (30.09): מעבר קופי ומשפטי בפעם השביעית, אפס דריפט
מ-M17-c58.** משימת התור: לקרוא כל מחרוזת UI בעברית וכל עמוד משפטי
בחיפוש טעויות כתיב, דליפות LTR, מילים באנגלית בטקסט פונה-ללקוח,
וקישורים שבורים, ולתקן.

**נמדד ישירות מ-git, לא הונח:** `git log -1 -- messages/he.json`
מצביע על `99b2079c`, ו-`git log -1 -- 'src/app/(legal)'` על
`46b3b93e` — שניהם מוקדמים מ-M17-c58 (`e844e5a2b`, בדיקת ה-baseline
המלאה האחרונה). `git diff --stat e844e5a2b..HEAD -- messages/
'src/app/(legal)' src/components src/app` (שבעת הקומיטים
M18-c58..M16-c59) מחזיר ריק. ה-`diff` הכולל מול `e844e5a2b` (למעט
`STATE.md`/`docs/STATE-ARCHIVE.md`) נוגע רק ב-`docs/BACKLOG.md`,
`docs/DB-SECURITY-MODEL.md`, `docs/LAUNCH-READINESS.md`,
`docs/UI-PARITY-REPORT.md`, `pnpm-lock.yaml` ו-
`src/lib/payments/payment-money-columns.test.ts` — אף לא אחד מהם
קופי פונה-ללקוח או עמוד משפטי. **אפס מחרוזת חדשה, אפס עמוד משפטי
חדש, אפס קישור חדש מאז הקריאה המלאה ב-M17-c53.**

שערים הורצו במלואם: `type-check` נקי, `lint` נקי (2023 קבצים, i18n
627/627, `copy-gate` נקי מבלי משפט שיווקי לטיני, `rtl-logical-gate`
נקי), `test` 608/608 קבצים 7274/7286 (12 skipped, 56.78s), `build`
`exit 0`. אין שער חזותי נדרש (אפס שינוי UI, `STATE.md`/
`docs/STATE-ARCHIVE.md` בלבד).

## M16-c59 (ארכיון מלא ב-`docs/STATE-ARCHIVE.md`)

M16-c59: תברואת ריפו בפעם התשיעית, אפס דריפט בענפים מקומיים (43,
זהה ל-M16-c58), 1 ענף remote פחות (116, ללא PR פתוח שנסגר בין
המחזורים). 24 PR פתוחים, זהה. אפס מיזוג, אפס מחיקה. ארבעת השערים
ירוקים.

## M15-c59

M15-c59 - DONE (30.09): סנכרון תיעוד — טבלת המצב ב-STATE.md,
docs/LAUNCH-READINESS.md ו-docs/BACKLOG.md רועננה מול git log וראיית קוד,
אפס דריפט מ-M15-c58. משימת התור: לרענן את טבלת המצב בשלושת הקבצים
מ-git log וראיית קוד, לשמור פריט אחד לכל סעיף ידני לאופיר לפי סדר
קריטיות, בלי כפילות. בדיקת דריפט: `git log 456becb9c..HEAD` (מאז
המדידה הקודמת, M15-c58) מחזיר 17 קומיטים (M16-c58..M18-c58,
M01-c59..M14-c59), כולם תיעוד/מדידה/תלות/טסטים (ביצועים, אבטחה, SEO,
נגישות, כיסוי טסטים, STATE CLEAN, backlog, route audit, Lighthouse, DB
advisors, תברואת תלויות). `git diff --stat 456becb9c..HEAD -- src/
supabase/ migrations/ package.json pnpm-lock.yaml next.config.mjs
vercel.json scripts/cron-jobs.json .github/workflows/` מחזיר רק שני
קבצים: `pnpm-lock.yaml` (עדכון `caniuse-lite`, M04-c59) ו-
`src/lib/payments/payment-money-columns.test.ts` (טסט בלבד, M10-c59) —
**אפס קומיט נגע בשורת חסימה**.

נמדד בכל זאת מחדש: `type-check` נקי, `lint` נקי (2023 קבצים, 12 שערים,
docs-index 282 מסמכים ללא שינוי, docs-path-audit 152 ידועים ללא שינוי,
i18n 627/627, locale-format 116/116), `test` 608/608 קבצים, 7274/7286
(12 skipped) — זהה ל-100% למה שנמדד ב-M14-c59, `build` נבנה מחדש
בהצלחה. מספרים שהשתנו (git בלבד, לא פרודקשן):
- **קומיטים מאחורי `a388118f1` (החי בפרודקשן)**: `git rev-list --count
  a388118f1..HEAD` = **189** (היה 175 ב-M01-c59, 171 ב-M15-c58) — חוסם 2
  למטה ו-`docs/BACKLOG.md` סעיף 4 עודכנו.
- **מרחק מ-`origin/main`**: `git rev-list --count origin/main..HEAD` =
  **563** (היה 545 ב-M15-c58); `origin/main..HEAD` (autopilot) נשאר
  **109**, ללא שינוי — `docs/LAUNCH-READINESS.md` עודכן.
- **פנקס הקטלוג** (`supabase/catalogue-known-issues.json`): **26**
  ממצאים, ללא שינוי. **מיגרציות ממתינות**: כל 18 הקבצים בסדר ההחלה
  (204, 209, 218, 220, 223, 224, 234-236, 239-247) עדיין קיימים
  ב-`migrations/pending/`, אפס קובץ חדש. **stash**: `git stash list`
  מחזיר **32**, ללא שינוי. **`dns-watch.sh`**: עדיין רץ תחת `caffeinate`
  (pid 957/999), ללא שינוי.

`docs/BACKLOG.md` נבדק מול הרשימה הקיימת: עדיין 15 סעיפים, אותו סדר,
אפס כפילות, אפס פריט חדש — נוסף פסקת "נבדק מחדש (M15-c59)" ועודכן סעיף
4 (189). **קבצים ששונו: `STATE.md`, `docs/STATE-ARCHIVE.md` (M14-c59
הועבר לתקרת 300 שורות), `docs/BACKLOG.md`, `docs/LAUNCH-READINESS.md`**
— אפס שינוי קוד ייצור.

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

## M12-c59 (ארכיון מלא ב-`docs/STATE-ARCHIVE.md`)

M12-c59: SEO, meta/canonical/og/JSON-LD Product+Offer/sitemap/robots
אומתו מחדש, אפס דריפט מ-M12-c58 (`sitemap/products.xml` 46 כתובות,
`noindex` למוצר לא פעיל קיים ולא שונה). אפס שינוי קוד.

## M11-c59 (ארכיון מלא ב-`docs/STATE-ARCHIVE.md`)

M11-c59: נגישות, axe אומתה מחדש בפעם חמישית, 0 הפרות `serious`/
`critical` (ציבורי 72/74 + 2 דולג, מאומת לקוח 16/16 + ספק 7/7, אדמין
57/57 דולג — כשל התחברות פרודקשן קיים מראש). `target-size` (WCAG 2.2,
מחוץ ליעד) נשאר כהחלטה פתוחה. אפס שינוי קוד.

## M10-c59 (ארכיון מלא ב-`docs/STATE-ARCHIVE.md`)

M10-c59: כיסוי טסטים, `payment-money-columns.ts` 95.23%→100% ענפים
(הענף החסר היה הגנת race על `warned` בקריאות מקבילות ל-`resolvePaymentMoneySchema`).
טסט יחיד נוסף, אפס שינוי קוד ייצור. ארבעת השערים ירוקים.

## M09-c59 (ארכיון מלא ב-`docs/STATE-ARCHIVE.md`)

M09-c59: STATE CLEAN, אפס פריט בר-ביצוע לסוכן קוד, אפס דריפט מ-M08-c59
(מונים זהים: pending 59, git-gap 183, stash 32). כל ארבעת השערים
ירוקים.

## M08-c59 (ארכיון מלא ב-`docs/STATE-ARCHIVE.md`)

M08-c59: BACKLOG EMPTY, נמדד מחדש בפעם השלוש-עשרה, אפס פריט שלב 1
בידי הסוכן, `docs/BACKLOG.md` עדיין 15 סעיפים אותו סדר, אפס דריפט
מ-M08-c58.

## M07-c59 (ארכיון מלא ב-`docs/STATE-ARCHIVE.md`)

M07-c59: route audit נמדד שוב, 241 שורות, אפס כשל אמיתי, אפס דלתא קוד
שנוגעת במסלול (239 PASS, 2 NO DATA זהה לכל מדידה קודמת מ-M07-c1),
אפס דריפט מ-M07-c58.

## M06-c59 (ארכיון מלא ב-`docs/STATE-ARCHIVE.md`)

M06-c59: Lighthouse mobile נמדד שוב, כל שמונת הציונים 90+ (בית
99/100/100/100, מוצר 99/100/100/100), אפס תיקון נדרש, אפס דריפט מ-M06-c58.

## M05-c59 (ארכיון מלא ב-`docs/STATE-ARCHIVE.md`)

M05-c59: advisors נמדדו בפעם התשיעית, 44 WARN זהים ב-100% ל-M05-c58,
אפס מיגרציה חדשה נדרשת, אפס שינוי סכימה.

## M04-c59 (ארכיון מלא ב-`docs/STATE-ARCHIVE.md`)

M04-c59: תברואת תלויות, `pnpm audit` נקי, אפס עדכון זכאי (14 שורות
`pnpm outdated`, כולן major). שינוי יחיד: `caniuse-lite` ב-`pnpm-lock.yaml`.
ארבעת השערים ירוקים.

## M03-c59 (ארכיון מלא ב-`docs/STATE-ARCHIVE.md`)

M03-c59: שער ירוק, `type-check`/`lint`/`test` (608/608, 7273/7285)/`build`
כולם נקיים, אפס תיקון נדרש.

## M02-c59 (ארכיון מלא ב-`docs/STATE-ARCHIVE.md`)

M02-c59: שער חזותי, בית ומוצר, שלושה רוחבים, אפס רגרסיה, כל שש המדידות
PASS מתחת ל-11% (בית 8.51/9.02/3.95, מוצר 5.65/4.95/2.92). ארבעת השערים
ירוקים.

M01-c59: בדיקת פרודקשן בפעם השישית, DNS ו-HTTP תקינים, פריסת HEAD עדיין
חסומה באותה סיבה (env חסר + `ALLOW_INCOMPLETE_ENV`); לא נוסה deploy
חדש לפי כלל "נתקע פעמיים — לדלג". פירוט מלא ב-`docs/STATE-ARCHIVE.md`.

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
2. **פריסת פרודקשן של HEAD (189 קומיטים אחרי `a388118f1` החי — ספירת git
   בלבד, עודכן ב-M15-c59 מ-175 שנמדד ב-M01-c59; ניסיון הפריסה עצמו האחרון
   היה ב-M01-c55, 105 קומיטים אז)**:
   נוסתה לאחרונה ב-M01-c55 (Vercel MCP, `create_deployment`, `gitSource`
   github, `audit/final-audit`@`291bc2d88`) **וסורבה ב-`deploy-preflight`**
   באותה סיבה בדיוק, פעם חמישית ברציפות (M01-c1, M01-c52, M01-c53, M01-c54,
   M01-c55): `dpl_FJYf483tkqSNf5pkG9MenghGQF46`, `BUILD_UTILS_SPAWN_1`.
   **מ-M01-c56 ועד M01-c59 לא נוסה ניסיון פריסה נוסף** (כלל "goal שנתקע
   פעמיים — לדלג", מוחל מ-M01-c55, פעם חמישית ב-M01-c59), אך התנאי נבדק
   שוב בקריאה בלבד בכל פעם ואושר ללא שינוי: `CARDCOM_TERMINAL_NUMBER`,
   `CARDCOM_API_NAME`, `CARDCOM_API_PASSWORD` עדיין חסרים ב-Production
   (קיימים במקומם `CARDCOM_MERCHANT_ID`/`CLIENT_ID`/`API_KEY` שהקוד לא
   קורא) ו-`ALLOW_INCOMPLETE_ENV` עדיין מוגדר שם (`filter_project_envs`,
   קריאה בלבד, M01-c59). `list_deployments` (target=production) מאשר
   שלוש הפריסות האחרונות (כולן מניסיונות קודמים, לא חדש) עדיין `ERROR`.
   עד שאופיר יתקן את הסביבה אין פריסה אפשרית מהענף הזה; פרודקשן נשאר על
   `a388118f1` (`dpl_EMtv9KbPfdGq75JLSNysp1wx3DQa`, READY, מאושר שוב
   ב-M01-c59 דרך `get_deployment` על `www.kenyonexpress.co.il`). **DNS
   אינו קשור לחוסם הזה** — נמדד שוב ב-M01-c59, `www.kenyonexpress.co.il`
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
