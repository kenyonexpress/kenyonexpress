RESUME FROM: M02-c59
Updated: 2026-09-30 (סשן `audit/final-audit`, Sonnet 5, פריט M01-c59)

## המשך מ:

**M01-c59 - DONE (30.09): בדיקת פרודקשן בפעם השישית, DNS ו-HTTP תקינים,
פריסת HEAD עדיין חסומה באותה סיבה.** משימת התור: להריץ build+deploy של
Vercel לפרודקשן, ואז `dig`+`curl` על `kenyonexpress.co.il` ו-
`www.kenyonexpress.co.il`; אם DNS נכשל, לתעד DNS BLOCKER ולסיים.

**נמדד ישירות, לא הונח:** `dig +short kenyonexpress.co.il A` ->
`216.198.79.1`/`64.29.17.65`, `dig +short www.kenyonexpress.co.il A` ->
`216.198.79.65`/`64.29.17.1`, `dig +short kenyonexpress.co.il NS` ->
עדיין `ns1.vercel-dns.com`/`ns2.vercel-dns.com`. `curl` על
`kenyonexpress.co.il` -> `308` ל-`https://www.kenyonexpress.co.il/`,
`curl` על `www.kenyonexpress.co.il` -> `200` עם תוכן חי (`lang="he"
dir="rtl"`, לוגו קניון EXPRESS). DNS תקין — **לא היה צורך ב-DNS
BLOCKER**.

לפי כלל "goal שנתקע פעמיים — לדלג" (מוחל מ-M01-c55, פעם חמישית
עכשיו): לא נוסה ניסיון deploy חדש. נבדק קריאה-בלבד דרך Vercel MCP:
`filter_project_envs` על הפרויקט מאשר `CARDCOM_TERMINAL_NUMBER`/
`CARDCOM_API_NAME`/`CARDCOM_API_PASSWORD` עדיין חסרים ב-Production
(קיימים רק `CARDCOM_MERCHANT_ID`/`CLIENT_ID`/`API_KEY`/`USE_MOCK`/
`WEBHOOK_SECRET` שהקוד לא קורא), ו-`ALLOW_INCOMPLETE_ENV` עדיין מוגדר
שם. `list_deployments` (target=production, 3 אחרונים, כולם מניסיונות
קודמים מ-M01-c54/M01-c55, לא נוסה חדש הפעם) מאשר כל השלוש עדיין
`ERROR`. `get_deployment` על `www.kenyonexpress.co.il` מאשר הדומיין
עדיין מכוון ל-`dpl_EMtv9KbPfdGq75JLSNysp1wx3DQa` (`a388118f1`, READY).
קומיטים מאחורי פרודקשן: 171 → **175** (git-only).

שערים הורצו במלואם: `type-check` נקי, `lint` נקי (2023 קבצים, i18n
627/627), `test` 608/608 קבצים 7273/7285 (12 skipped, 58.58s), `build`
`exit 0`. אין שינוי קוד, אין שער חזותי נדרש (אין שינוי UI).

## M18-c58 (הועבר מ-STATE.md ב-M01-c59, לשמירה על תקרת 300 שורות)

**M18-c58 - DONE (30.09): בדיקת אפס-פעילות בפעם החמישית, המחזור *לא*
היה אפס-פעילות.** משימת התור: אם כל פריטי התור מעלה (M01-c58..M17-c58)
לא הפיקו שינוי קוד השבוע, לכתוב `MAINTENANCE IDLE` עם התאריך ב-STATE.md,
ואז לחפש שיפור אמיתי אחד בהמרת לקוחות בדף הבית או דף המוצר שתואם
Electro v7 וליישם אותו.

**נמדד ישירות מ-git, לא הונח:** שני קומיטים נגעו בקוד במחזור הזה —
M04-c58 (עדכון תלות מינור, `@aws-sdk/client-s3`+
`@aws-sdk/s3-request-presigner`, `package.json`/`pnpm-lock.yaml`)
ו-M10-c58 (כיסוי ענפים `refund-wallet.ts` 93.75%→100%,
`src/server/payments/refund-wallet.test.ts`). `git diff-tree` על כל
שבעה-עשר הקומיטים של המחזור (M01-c58..M17-c58) מאשר: רק שני אלה נגעו
בקובץ שאינו `STATE.md`/`docs/*`. אותו דפוס בדיוק כמו M18-c55, M18-c56
ו-M18-c57 (כל אחד משלושתם מצא שני קומיטי שינוי-קוד אמיתיים באותו
מחזור — לא נצפה עדיין מחזור אפס-פעילות אמיתי). `MAINTENANCE IDLE` לא
נכתב, שלב חיפוש שיפור ההמרה לא הופעל.

שערים הורצו במלואם: `type-check` נקי, `lint` נקי (2023 קבצים, i18n
627/627, locale 116/116, docs-index 282, docs-path-audit 152), `test`
608/608 קבצים 7273/7285 (12 skipped, 56.97s), `build` `exit 0`. אין
שער חזותי נדרש (אפס שינוי UI/קוד, `STATE.md`/`docs/STATE-ARCHIVE.md`
בלבד).

## M17-c58, M16-c58, M15-c58, M14-c58, M13-c58, M12-c58, M11-c58, M10-c58, M09-c58, M08-c58, M07-c58, M06-c58, M05-c58, M04-c58, M03-c58, M02-c58, M01-c58, M18-c57..M08-c57 (ארכיון מלא ב-`docs/STATE-ARCHIVE.md`)

M16-c58: תברואת ריפו בפעם השמינית, אפס דריפט מ-M16-c57: `git status`
נקי, 43 ענפים מקומיים זהה בדיוק, 24 PR פתוחים, 117 ענפי remote, 12
ענפים ממוזגים ל-HEAD (מועמדים לניקוי, לא נמחקו), 28 ענפים ישנים
(14+ יום), 3 ענפים לא ממוזגים אך לא נטושים. אפס מיזוג, אפס מחיקה.
אפס שינוי קוד.

M15-c58: סנכרון תיעוד, STATE.md/docs/BACKLOG.md/docs/LAUNCH-READINESS.md
מול git log וקוד, אפס פריט חדש. 17 קומיטים נבדקו (M16-c57..M18-c57,
M01-c58..M14-c58), אף אחד לא נגע בשורת חסימה. קומיטים מאחורי פרודקשן
עלה ל-171, פער הענפים ל-545. `type-check`/`lint`/`test`
(608/608, 7273/7285)/`build` ירוקים. הועבר ב-M17-c58 לשמירה על תקרת
300 שורות.

M14-c58: ביצועים, bundle/צנרת תמונות/תגיות ISR/כותרות cache אומתו מחדש
מול build אמיתי קיים (פורט 3331), אפס דריפט מ-M14-c57 (bundle 345.1kB/
27 chunks זהה, אין באג `fill`+px `sizes` חדש, `cache-invalidation-gate`
נקי, כותרות cache תואמות למדיניות). אפס שינוי קוד.

M13-c58: אבטחה, CSP/HSTS/X-Frame-Options/Referrer-Policy ומגבלות קצב
Upstash על login/checkout/redeem אומתו מחדש מול build אמיתי (פורט
3321), אפס דריפט מ-M13-c57 — כותרות זהות בארבעה נתיבים
(`/`, `/checkout`, `/login`, `/redeem/test-token`), ארבע מגבלות הקצב
באותן שורות קוד בדיוק. אפס שינוי קוד.

M12-c58: SEO, meta/canonical/og/JSON-LD Product+Offer/sitemap/robots
אומתו מחדש, אפס דריפט מ-M12-c57 (`sitemap/products.xml` 46 כתובות,
`noindex` למוצר לא פעיל קיים ולא שונה). אפס שינוי קוד.
M11-c58: נגישות, axe אומתה מחדש בפעם רביעית, 0 הפרות `serious`/
`critical` (ציבורי 72/74 + 2 דולג, מאומת לקוח 16/16 + ספק 7/7, אדמין
57/57 דולג — כשל התחברות פרודקשן קיים מראש). `target-size` (WCAG 2.2,
מחוץ ליעד) נשאר כהחלטה פתוחה. אפס שינוי קוד.

M10-c58: כיסוי טסטים, `refund-wallet.ts` 93.75%→100% ענפים. הענף החסר
היה הגנה על ערך `RefundState` לא מוכר (`?? []`), נוסף טסט אחד
(`'archived' as RefundState`). שאר חמש הקטגוריות הקריטיות כבר היו
93-100%; RLS helpers נמצא ללא מודול מקור (טסטים על JSON סטטי בלבד).
`type-check`/`lint`/`test` (7272→7273/7285)/`build` ירוקים.
M09-c58: STATE CLEAN, אפס פריט בר-ביצוע לסוכן קוד — שני המקורות
(`docs/BACKLOG.md` 15 סעיפים, "חוסמים פתוחים" 13 סעיפים) כולם
DNS/Vercel env/סוד/אישור פריסה/אישור מיגרציה/הכרעה עסקית, חסומים לפי
כללי `CLAUDE.md`. M08-c58: BACKLOG EMPTY, נמדד מחדש, אפס פריט שלב 1
בידי הסוכן — `docs/BACKLOG.md` עדיין 15 סעיפים אותו סדר, אפס דריפט
מ-M08-c57. שניהם `type-check`/`lint`/`test`/`build` ירוקים, אפס שינוי קוד.
M07-c58: route audit נמדד שוב, 241 שורות, אפס כשל אמיתי, אפס דלתא קוד
שנוגעת במסלול (`route-audit-recipe-and-hydration-dates`): 226 טסטים
PASS בחמישה צ'אנקים, 241 שורות ייחודיות נותחו (239 PASS, 2 NO DATA
זהות לכל מדידה קודמת), אפס `consoleErrors`/`hydrationWarnings`/
`rtl: false`. דלתא קוד מאז M07-c55: רק `money-format.ts`/`.test.ts`
(M10-c57), אפס שינוי בניתוב/הידרציה/RTL.
M06-c58: Lighthouse mobile נמדד שוב, כל שמונת הציונים 90+ (בית
98/100/100/100, מוצר 99/100/100/100), אפס תיקון נדרש, אפס דריפט מ-M06-c57.
M05-c58: ביקורת DB, advisors נמדדו בפעם השמינית ברציפות דרך ה-management
API, 44 WARN זהה שדה-שדה ל-M05-c57, אפס קובץ מיגרציה חדש נדרש.

M04-c58: תחזוקת תלויות, `pnpm audit` אפס חולשות, 13 מ-15 שורות
`pnpm outdated` דולגו כי הן major, שתי שורות מינור (`@aws-sdk/client-s3`,
`@aws-sdk/s3-request-presigner`) הוחלו. M03-c58: שער ירוק,
`type-check`/`lint`/`test`/`build` כולם נקיים, אפס תיקון נדרש, זהה
במהות ל-M03-c57. שניהם DONE, אפס שינוי UI.

M02-c58: שער חזותי, בית ומוצר, שלושה רוחבים, אפס רגרסיה, כל שש
המדידות PASS מתחת ל-11% (בית 8.51/9.02/3.95, מוצר 5.61/4.92/2.99) —
זהה בדיוק ל-M02-c57. אזהרת `HEIGHT RATIO` על תפיסת המוצר (תפיסה
קפואה מול הדף החי) אך השער עדיין PASS על שלושתם. `type-check`/`lint`/
`test`/`build` כולם ירוקים, אין שינוי קוד.
M01-c58: בדיקת פרודקשן, DNS ו-HTTP תקינים (`www.kenyonexpress.co.il`
200, redirect 308 מהעירום), פריסת HEAD חסומה באותה סיבה בדיוק (שלושת
שמות Cardcom חסרים ב-Production), פעם רביעית עם "goal שנתקע פעמיים —
לדלג", 157 קומיטים מאחורי פרודקשן. build/type-check/lint/test ירוקים.
הועבר ב-M02-c58 לשמירה על תקרת 300 שורות.

M18-c57: בדיקת אפס-פעילות בפעם הרביעית, המחזור *לא* היה אפס-פעילות
(שני קומיטי שינוי-קוד אמיתיים: עדכון תלות `@anthropic-ai/sdk`/
`@supabase/ssr`, וכיסוי `money-format.ts` 20.83%→100%), `MAINTENANCE
IDLE` לא נכתב, זהה מבחינה מהותית ל-M18-c55/M18-c56.

M17-c57: מעבר קופי ומשפטי בפעם החמישית, אפס ממצא חדש בר-תיקון
(`he.json` 627 מחרוזות, 15 `href` בפוטר, ארבעת עמודי ה-legal החיים
ו-`wp-migrated.ts` הקוד המת נבדקו מחדש, ממצא "Face ID" אושר לא-תקלה
כמו "Samsung Galaxy S22" הקודם).
M16-c57: תברואת ריפו בפעם השביעית, אפס דריפט מ-M16-c56 (43 ענפים
מקומיים, כולם דחופים/מוזגים בפועל; 24 PR פתוחים; 117 ענפי remote).
M15-c57: סנכרון תיעוד, STATE.md/docs/LAUNCH-READINESS.md/docs/BACKLOG.md
מול git log וקוד, אפס פריט חדש. 16 קומיטים נבדקו (M16-c56..M18-c56,
M01-c57..M14-c57), שניים נוגעים בקוד (כיסוי `money-format.ts`
20.83%→100%, שני עדכוני תלות minor), אף אחד לא בשורת חסימה. קומיטים
מאחורי פרודקשן עלה ל-153, פער הענפים ל-527, שאר המספרים ללא שינוי.
`type-check`/`lint`/`test` (608/608, 7272/7284)/`build` ירוקים. הועבר
ב-M16-c57 לשמירה על תקרת 300 שורות.

M14-c57: ביצועים, bundle/צנרת תמונות/תגיות ISR/כותרות cache אומתו מחדש
מול build אמיתי, אפס דריפט מ-M14-c56 (bundle 345.1kB/27 chunks זהה, אין
באג `fill`+px `sizes` חדש, כותרות cache תואמות למדיניות).

M13-c57: CSP/HSTS/X-Frame-Options/Referrer-Policy ומגבלות קצב Upstash
על login/checkout/redeem אומתו מחדש, אפס דריפט מ-M13-c56. M12-c57:
SEO, meta/canonical/og/JSON-LD/sitemap/robots אומתו מחדש, אפס דריפט
(`sitemap/products.xml` 46 כתובות, `noindex` למוצר לא פעיל). M11-c57:
נגישות, axe אומתה מחדש בפעם השלישית, ‏0 הפרות `serious`/`critical`
(אדמין 57/57 דילוג, כשל התחברות פרודקשן לא קשור לקוד), `moderate`
אחד מתועד (`target-size`, WCAG 2.2). M10-c57: כיסוי טסטים,
`money-format.ts` 52.94/20.83/38.46 ← **100/100/100/100**, פרמטר מת
(`withFraction`) הוסר. M09-c57, M08-c57: שני STATE CLEAN רצופים, אין
פריט בר-ביצוע לסוכן קוד ב-`docs/BACKLOG.md`. כולם
`type-check`/`lint`/`test`/`build` ירוקים, אפס שינוי UI. הועברו
ב-M14-c57 לשמירה על תקרת 300 שורות.

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
2. **פריסת פרודקשן של HEAD (175 קומיטים אחרי `a388118f1` החי — ספירת git
   בלבד, עודכן ב-M01-c59; ניסיון הפריסה עצמו האחרון היה ב-M01-c55, 105
   קומיטים אז)**:
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
