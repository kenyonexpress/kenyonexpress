RESUME FROM: M09-c55
Updated: 2026-09-29 (סשן `audit/final-audit`, Sonnet 5, פריט M08-c55)

## המשך מ:

**M08-c55 - BACKLOG EMPTY (29.09): אפס פריט שלב 1 בידי הסוכן, נמדד
מחדש.** המשימה: לקחת את פריט שלב 1 הפתוח בעל ההשפעה הגבוהה ביותר
מ-`docs/BACKLOG.md` (לא נדחה, לא שלב 2) ולממש אותו במלואו עם טסטים; אם
אין — לכתוב BACKLOG EMPTY. `CLAUDE.md`, `STATE.md` (כולל 13 "חוסמים
פתוחים") ו-`docs/BACKLOG.md` (15 סעיפים) נקראו במלואם, וכן `git log -20`.
**`docs/BACKLOG.md` לא זז מאז `598ea2842` (M15-c54)** — `git log -3 --
docs/BACKLOG.md docs/POST-LAUNCH-BACKLOG.md docs/MIGRATION-BACKLOG.md`
מאשר. הקובץ עצמו אומר במפורש בשורה 16-18: "Nothing here is an action an
agent may take alone" — כל 15 הסעיפים הם env/secret של Vercel (2,3,6,8,9),
פריסת HEAD (4), מיגרציה על פרודקשן הדורשת אישור (5), הכרעת מפעיל על נתוני
קטלוג (7), חשבון Cloudflare חיצוני (10), מיזוג ענף (11), בדיקת תהליך רקע
(12), ערך שרק אופיר מחזיק (13), ספק SMS חיצוני (14), ומחיקת נתונים
הדורשת אישור (15) — כל אחד מהם חוסם לפי תנאי העצירה של `CLAUDE.md`, אף
אחד לא שלב 1 בידי הסוכן. אותה מסקנה שנמדדה ברצף מ-M08-c1 ועד M09-c54.
בדיקות עצמאיות נוספות: `grep` על `TODO|FIXME|XXX` בכל `src/` (**23**
תוצאות, לא 20 כמו ב-M08-c54 — שלוש חדשות מ-`whatsapp/twilio.ts`,
`sms/twilio.ts` ו-`auth/phone-otp.ts`; נבדקו כולן: 20 הן placeholder-י
פורמט טלפון/קוד כמו `05XXXXXXXX`/`XXXXX-XXXXX`, אחת היא מחרוזת בדיקה
(`whatsapp.test.ts:91`, לא marker), ו-2 הן `TODO(cardcom)` אמיתיים
ב-`src/lib/payments/cardcom.ts` שורות 254 ו-319 — זהות למדידות קודמות,
חסומות על מפתחות Cardcom של פרודקשן (חוסם 6 ב-`BACKLOG.md`, וגם אינטגרציית
ספק תשלום אסורה לפי חוקי הפריט הזה עצמו). `test.skip`/`it.todo` תחת
`e2e/`: **57**, זהה למדידה הקודמת. **אפס פריט בר-ביצוע לסוכן.** שערים:
`type-check` נקי, `lint` נקי (biome 2020 קבצים + 12 שערי תוכן, i18n
627/627, locale 116/116), `test` 605/605 קבצים, 7217/7229 (12 skipped,
זהה), `build` `exit 0`. אין שינוי קוד, אין שער חזותי נדרש (אין שינוי UI).
**קובץ יחיד שונה: `STATE.md`.**

## M07-c55 (ארכיון)

**M07-c55 - DONE (29.09): route audit נמדד שוב, 242 שורות, אפס כשל
אמיתי.** אותו מתכון מ-M07-c1/M07-c52/M07-c53/M07-c54: `CARDCOM_USE_MOCK=true
NEXT_PUBLIC_APP_URL=http://localhost:3472 pnpm build` -> `exit 0`;
`PORT=3472 pnpm start` מאותה סביבה (פורט אומת פנוי לפני ואחרי, `curl`
אישר `200` על `/` ועל `/product/barbecue-2`); `pnpm exec playwright test
e2e/route-audit.spec.ts --project=chromium --workers=1` בחמישה צ'אנקים
לפי תפקיד (`--grep`): anon (60), GET קבצים/API (72), customer (25), admin
(59), supplier (10) — סה"כ 226 טסטים, כל שורה נכתבת ל-`ROUTE_AUDIT_REPORT`.

**תוצאה: 240 PASS, 2 NO DATA (`customer /account/tickets/[id]`,
`admin /admin/discounts/[id]` — הרשימה לא מקשרת לשום שורה, זהה לריצות
קודמות), 0 FAIL, 0 SKIPPED.** בריצה הראשונה של צ'אנק ה-admin שני טסטים
נכשלו בתזמון (`/admin/suppliers/price-proposals`: "Execution context was
destroyed" ב-`page.evaluate`, `/admin/support`: `beforeAll` timeout של
30 שנ' אחרי שה-worker התאושש מהכשל הקודם) ועוד חמישה טסטים לא רצו בגלל
זה. **נמדד שאינו רגרסיה אמיתית**: שני הנתיבים רצו שוב בבידוד ועברו
(`28.7s`, כולל כניסה מלאה), וחמשת הטסטים שלא רצו רצו אחר כך ועברו כולם
(`4.3m`) — תואם לזיכרון `route-audit-recipe-and-hydration-dates` על
שאילתות איטיות מדי פעם מול ה-Supabase המאוחסן. אפס שגיאת console, אפס
אזהרת hydration, RTL תקין (`dir=rtl lang=he body=rtl`) על כל דף HTML
שנמדד.

**דלתא קוד מאז M07-c54** (`git diff --stat 5081decc5..HEAD`, לא כולל
`STATE.md`/`docs/BACKLOG.md`/`docs/STATE-ARCHIVE.md`/`LAUNCH-READINESS.md`):
תיקוני נגישות ב-9 קבצי אדמין (M11-c54, `role`/`aria-label`/`tabIndex` על
טבלאות גולשות), תיקון `fill`+`sizes` ב-`HeroSlider.tsx` (M14-c54),
שדרוג פטץ' ל-`posthog-js` (M04-c55), טסטים חדשים ל-`refund`/
`refund-request` (M10-c54) — אף אחד מהם לא נגע במסלול, בניתוב, או
בבדיקת RTL. אין תיקון נדרש. שערים: `type-check` נקי, `lint` נקי
(biome 2020 קבצים + 12 שערי תוכן, i18n 627/627), `test` 605/605 קבצים,
7217/7229 (12 skipped, זהה), `build` `exit 0` (חלק מהמדידה עצמה). אין
שינוי קוד, אין שער חזותי נדרש (אין שינוי UI). כל קבצי הדוח הזמניים
(`/tmp/route-audit-c55*.jsonl`, `/tmp/ke-start-c55.log`) נמחקו, השרת
על פורט 3472 נעצר ואומת פנוי. **קבצים ששונו: `STATE.md`,
`docs/STATE-ARCHIVE.md`** (M06-c55 הועבר לשמירה על תקרת 300 שורות).

## M03-c55, M04-c55 (ארכיון מלא ב-`docs/STATE-ARCHIVE.md`)

M04-c55: תחזוקת תלויות, עדכון פטץ' יחיד בהיקף (`posthog-js`), `pnpm
audit` אפס חולשות. M03-c55: שער ירוק (`type-check`/`lint`/`test`/
`build`), אין מה לתקן. שניהם DONE, אפס שינוי UI. הועברו ב-M06-c55
לשמירה על תקרת 300 שורות.

## M05-c55, M06-c55 (ארכיון מלא ב-`docs/STATE-ARCHIVE.md`)

M06-c55: Lighthouse mobile, כל שמונת הציונים 90+ (בית 93/100/100/100,
מוצר 99/100/100/100), אפס תיקון נדרש. M05-c55: ביקורת DB, 44 WARN זהה
שדה-שדה למדידה הרביעית, אפס WARN חדש, אפס קובץ מיגרציה חדש. שניהם DONE,
אפס שינוי UI. הועברו ב-M07-c55 לשמירה על תקרת 300 שורות.

## M02-c55 (ארכיון מלא ב-`docs/STATE-ARCHIVE.md`)

שער חזותי נמדד מחדש, בית ומוצר, שלושה רוחבים, אפס רגרסיה (8.51/9.02/3.95
בית, 4.96/4.56/3.25 מוצר, זהה בתוך רעש ל-M02-c54). `type-check`/`lint`/`test`/
`build` ירוקים, אין שינוי קוד. הועבר ב-M03-c55 לשמירה על תקרת 300 שורות.

## M01-c55 (ארכיון מלא ב-`docs/STATE-ARCHIVE.md`)

בדיקת פרודקשן: DNS תקין (`www.kenyonexpress.co.il` מחזיר 200 עם תוכן
חי), פריסת HEAD (`291bc2d88`) דרך Vercel MCP סורבה **בפעם החמישית
ברציפות** באותה סיבה (`CARDCOM_TERMINAL_NUMBER`/`API_NAME`/`API_PASSWORD`
חסרים ב-Production, `ALLOW_INCOMPLETE_ENV` עדיין מוגדר). פרודקשן לא
נפגע, עדיין מגיש `a388118f1`. **החלטה שהתקבלה לבד:** לפי כלל "goal
שנתקע פעמיים — לדלג", ניסיון פריסה חוזר לא ירוץ שוב עד שאופיר יתקן
את הסביבה; בדיקת DNS/200 התקופתית ממשיכה בכל מחזור.

## M18-c54 (ארכיון מלא ב-`docs/STATE-ARCHIVE.md`)

בדיקת אפס-פעילות (idle check): המחזור **לא** היה אפס-פעילות (ארבעה
קומיטי שינוי-קוד אמיתיים ב-c54), ולכן MAINTENANCE IDLE לא נכתב ושיפור
המרה מומחש לא חיפש — תנאי ה-idle `false`. עמוד הבית/מוצר נסקרו בכל זאת,
אפס שינוי לא-מתועד. הועבר ב-M01-c55 לשמירה על תקרת 300 שורות.

## M17-c54 (ארכיון מלא ב-`docs/STATE-ARCHIVE.md`)

מעבר קופי ומשפטי בפעם השנייה: אפס ממצא חדש (הפריט כבר בוצע ב-M17-c53,
`15c97abff`; ה-delta מאז הוא 10 קבצים אדמין-בלבד/badge, i18n עדיין
627/627). שער חזותי בית PASS בשלושת הרוחבים (8.51/9.02/3.95), זהה
ל-M17-c53. הועבר ב-M01-c55 לשמירה על תקרת 300 שורות.

## M16-c54 (ארכיון מלא ב-`docs/STATE-ARCHIVE.md`)

תברואת ריפו בפעם הרביעית: git נקי, כל 40 הענפים המקומיים דחופים (אימות
SHA מלא), 24 PR פתוחים, 116 ענפי remote, ממצא חדש (לא לפעולה) על `main`
המקומי שסוטה מ-`origin/main`. הועבר ב-M17-c54 לשמירה על תקרת 300 שורות.

## M15-c54 (ארכיון מלא ב-`docs/STATE-ARCHIVE.md`)

`STATE.md`/`docs/LAUNCH-READINESS.md`/`docs/BACKLOG.md` סונכרנו מול
`git log`; תשעה קומיטי שינוי-קוד מ-M15-c53 נבדקו, אף אחד לא נגע בשורת
חסימה. פנקס הקטלוג 26 מפתחות (זהה), `git stash list` 32 (זהה). הועבר
ב-M16-c54 לשמירה על תקרת 300 שורות.

## M14-c54 (ארכיון מלא ב-`docs/STATE-ARCHIVE.md`)

bundle/צנרת תמונות/תגיות ISR/כותרות cache נבדקו מול הבייסליין של M14-c53;
ממצא אמיתי אחד נמצא ותוקן — אותו באג `fill`+`sizes` בפורמט px (שכבר תוקן
פעמיים באדמין-בלבד) נמצא הפעם בעמוד הבית עצמו (`HeroSlider.tsx` badge),
הוחלף ב-`width`/`height` מפורשים. שער חזותי בית בשלושת הרוחבים PASS, זהה
בדיוק לבייסליין (תיקון לא שינה פיקסל, רק srcset קטן יותר). bundle/ISR/cache
headers ללא רגרסיה. הועבר ב-M15-c54 לשמירה על תקרת 300 שורות.

## M13-c54 (ארכיון מלא ב-`docs/STATE-ARCHIVE.md`)

CSP/HSTS/X-Frame-Options/Referrer-Policy ומגבלות קצב Upstash על
login/checkout/redeem נמדדו מחדש מול build אמיתי, אפס דריפט מ-M13-c53.
הועבר ב-M14-c54 לשמירה על תקרת 300 שורות.

## M12-c54 (ארכיון מלא ב-`docs/STATE-ARCHIVE.md`)

מטא-דאטה, canonical, og, schema.org Product/Offer, עדכניות sitemap
ו-robots נמדדו מחדש מול build אמיתי, אפס דריפט מ-M12-c53. הועבר ב-M13-c54
לשמירה על תקרת 300 שורות.

## M11-c54 (ארכיון מלא ב-`docs/STATE-ARCHIVE.md`)

axe נמדד מחדש על כל דף, 8 הפרות `serious` אמיתיות (טבלאות אדמין גולשות
בלי מקלדת ב-mobile-chrome) נמצאו ותוקנו ב-9 קבצים (`role="region"`+
`aria-label`+`tabIndex`); 242 סריקות axe ירוקות, אפס הפרות שנותרו. הועבר
ב-M12-c54 לשמירה על תקרת 300 שורות.

## M07-c54..M10-c54 (ארכיון מלא ב-`docs/STATE-ARCHIVE.md`)

route audit (M07, 241 מסלולים, 0 כשל), BACKLOG EMPTY בפעם ה-14 (M08),
STATE CLEAN בפעם ה-15 (M09), כיסוי ענפים ל-refund/refund-request ל-100%
(M10) — כולם DONE, אפס שינוי UI. הועברו ב-M11-c54 לשמירה על תקרת 300 שורות.

## M03-c54..M06-c54 (ארכיון מלא ב-`docs/STATE-ARCHIVE.md`)

M03-c54 (תיקון import דפרקציה של Sentry), M04-c54 (תחזוקת תלויות, אפס
שדרוג בהיקף), M05-c54 (ביקורת DB, 44 WARN זהה), M06-c54 (Lighthouse
mobile, כל שמונת הציונים 90+) — כולם DONE, אפס שינוי UI, ארבעתם עם
שערים ירוקים. הועברו ב-M08-c54 לשמירה על תקרת 300 שורות.

## M01-c54, M02-c54 (ארכיון מלא ב-`docs/STATE-ARCHIVE.md`)

M02-c54: שער חזותי נמדד מחדש, בית ומוצר, שלושה רוחבים, אפס רגרסיה (8.51/9.02/3.95
בית, 4.96/4.56/3.25 מוצר, זהה בתוך רעש ל-M02-c53). M01-c54: בדיקת פרודקשן,
DNS תקין, פריסת HEAD דרך Vercel MCP סורבה בפעם הרביעית באותה סיבה
(`CARDCOM_*` חסרים, `ALLOW_INCOMPLETE_ENV`), פרודקשן לא נפגע. שניהם DONE, אפס
שינוי קוד. הועברו ב-M18-c54 לשמירה על תקרת 300 שורות.

## M11-c53..M18-c53 (ארכיון מלא ב-`docs/STATE-ARCHIVE.md`)

M11-c53: עדיין לא קיים ב-`HEAD`/`origin`. M12-c53..M18-c53 בוצעו מחוץ לסדר
לפי הקצאה מפורשת; M18-c53 היה בדיקת אפס-פעילות (idle check) שקבעה
שהמחזור **לא** היה אפס-פעילות (ארבעה קומיטים אמיתיים) ולכן MAINTENANCE
IDLE לא נכתב. הועבר ב-M08-c55 לשמירה על תקרת 300 שורות.

ההיסטוריה המלאה (Q01..Q24, B01..B10, M01-c1..M11-c53, תור 23.09, וכל מה שקדם) ב-`docs/STATE-ARCHIVE.md`, החדש למעלה. הקובץ הזה מחזיק רק את מה שחי.

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
2. **פריסת פרודקשן של HEAD (87 קומיטים אחרי `a388118f1` החי, עודכן M01-c54)**:
   נוסתה שוב ב-M01-c54 (Vercel MCP, `create_deployment`, `gitSource` github,
   `audit/final-audit`@`0bcbdac18`) **וסורבה שוב ב-`deploy-preflight`**
   באותה סיבה בדיוק, פעם רביעית ברציפות (M01-c1, M01-c52, M01-c53, M01-c54):
   `dpl_BjMEzT55uBAcYWotmvpZkAuzmNdR`, `BUILD_UTILS_SPAWN_1`.
   `CARDCOM_TERMINAL_NUMBER`, `CARDCOM_API_NAME`, `CARDCOM_API_PASSWORD`
   עדיין חסרים ב-Production (קיימים במקומם
   `CARDCOM_MERCHANT_ID`/`CLIENT_ID`/`API_KEY` שהקוד לא קורא) ו-
   `ALLOW_INCOMPLETE_ENV=true` עדיין מוגדר שם (נמדד עם `filter_project_envs`,
   קריאה בלבד). עד שאופיר יתקן את הסביבה אין פריסה אפשרית מהענף הזה;
   פרודקשן נשאר על `a388118f1` (`dpl_EMtv9KbPfdGq75JLSNysp1wx3DQa`, READY)
   ולא נפגע מהניסיון. **DNS אינו קשור לחוסם הזה** — נמדד שוב ב-M01-c54,
   `www.kenyonexpress.co.il` מחזיר 200 עם התוכן החי (`a388118f1`).
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
    (נמדד M16-c54): קצה מקומי `3f6ca53c3` (10.09), קצה remote
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
