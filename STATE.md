RESUME FROM: L09
Updated: 2026-10-05 (סשן `audit/final-audit`, Fable 5.1, פריט L08 BLOCKED: שער 8
observability נמדד מול פרודקשן; Sentry קיבל שגיאת לקוח ב-ingest אך אין
טוקן API לאימות, PostHog אינרטי כי `NEXT_PUBLIC_POSTHOG_KEY` חסר
ב-Production, ו-Resend מחזיר 401 "API key is invalid" לשליחה אמיתית מהשרת
החי; שלושת התיקונים הם env ב-Vercel, אסור לפריט; RESUME FROM מצביע ל-L09)

## המשך מ:

**L08 - BLOCKED (05.10.2026, 23:25 מקומי): שער 8 observability. שלושת
הרגליים נמדדו מול פרודקשן; אף אחת לא ניתנת לסגירה בלי שינוי env ב-Vercel,
שאסור לפריט הזה.** משימת התור: "Gate 8 observability: trigger a test error
on production and confirm it appears in Sentry via API; send a test PostHog
event from production and confirm via API; send a Resend test email to
support@kenyonexpress.co.il and confirm delivered status via API". `pwd`
אומת, HEAD בהגעה `97f54ffaa`, עץ נקי. **Sentry, נשלח אך לא אומת ב-API:**
ה-Production של `kenyonexpress` מחזיק `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`
ו-`SENTRY_AUTH_TOKEN` (sensitive, לא נקראים) אבל **לא** את
`SENTRY_DEBUG_ROUTES`, ולכן זורק השרת `/api/debug/sentry` עונה `404` חי
(נמדד) והוא סגור בכוונה; פתיחתו היא שינוי env, אסור. ה-bundle המוגש מכיל
את ה-DSN (org `o4511944582496256`, project `4511946778607696`, אזור `de`),
ומנהרת `/monitoring` חיה (POST בלי כותרת auth מחזיר את ה-`401 bad envelope
authentication header` של Sentry עצמו, כלומר הועבר). **נזרקה שגיאת לקוח
בפועל** מ-Chromium headless על `https://www.kenyonexpress.co.il/` עם המחרוזת
`Sentry client check: L08-sentry-muu9fhwm`; ה-SDK של הבנייה החיה שלח דרך
המנהרה ו-ingest ענה `200 {"id":"c32d5f141b38426aac8c48adc20f17a8"}`. זו
קבלה ב-ingest, לא אישור ב-API: אין `SENTRY_AUTH_TOKEN` קריא בשום מקום
(ב-Vercel הוא sensitive, אין קובץ מקומי, אין תבנית `sntrys_` בדיסק), ו-MCP
של Sentry דורש הזדהות שאינה זמינה בסשן הזה. אופיר יכול לאמת לפי מזהה
האירוע. **PostHog, אין מה לשלוח:** הקוד (`src/lib/observability/posthog.ts`)
קורא רק `NEXT_PUBLIC_POSTHOG_KEY`, והוא **אינו קיים** ב-Production; קיים שם
`POSTHOG_API_KEY` שאף קובץ אינו קורא. ב-bundle החי אין מפתח `phc_`, כלומר
PostHog אינרטי בפרודקשן לפי תכנון, ואין מפתח אישי לשאילתת ה-API ממילא.
**Resend, נמדד שבור בפרודקשן:** שליחה אמיתית דרך טופס `/contact` החי
(server action `contact.submit`, אל `support@kenyonexpress.co.il`, מזהה
`L08-contact-muu9q6qw`) החזירה למשתמש "השליחה נכשלה", ולוג הפרודקשן
(`vercel logs`, 20:23:25 UTC, `request_id
95f87a6c-f8a2-436d-8baf-0c37055a771f`) אומר `email.refused` עם
`status 401 {"message":"API key is invalid"}` מ-Resend. כלומר
`RESEND_API_KEY` בפרודקשן אינו תקף, ושום מייל (צור קשר, קופון, magic link,
איפוס סיסמה, outbox) אינו יוצא; מתואם עם 72 שורות `dead` ב-
`notification_outbox` (נמדד בקריאה בלבד). המפתח המקומי
(`.env.local.bak`/`.env.local.pre-probe`, זהה) גם הוא `API key is invalid`
מול `/domains`, ולכן גם אישור `delivered` ב-API של Resend אינו אפשרי.
עוד נמדד: אין משתמש auth בכתובת `support@` (0 שורות), ולכן גם מסלולי
magic link ואיפוס סיסמה לא היו שולחים אליה. **תקלת מדידה שתועדה:** ארבע
הגשות ראשונות לחצו על `button[type=submit]` הראשון בדף, שהוא טופס באנר
ההסכמה, ולכן ארבעת ה-POST הקודמים ל-`/contact` היו פעולת ההסכמה ולא
הטופס; שום מייל לא נשלח בהם. תחימה ל-`form:has(textarea[name="message"])`
תיקנה זאת. Gmail MCP, Sentry MCP ו-Supabase MCP דורשים הזדהות בסשן הזה.
**החלטות שהתקבלו לבד:** (א) שגיאת לקוח במקום שגיאת שרת, כי שער
`SENTRY_DEBUG_ROUTES` הוא env; (ב) לא נוצר משתמש `support@` ולא הופעל
איפוס סיסמה או magic link בפרודקשן; (ג) אפס שינוי env, אפס deploy, אפס
מחיקה; (ד) מייל בדיקה אחד נוסה בפועל ונכשל אצל Resend, לא אצלנו.
**לאופיר:** מפתח Resend חדש ב-Vercel Production (ובמקומי); להוסיף
`NEXT_PUBLIC_POSTHOG_KEY` (ו-`NEXT_PUBLIC_POSTHOG_HOST` אם האזור אינו US)
ולפרוס מחדש; לפתיחה זמנית של זורקי השרת `SENTRY_DEBUG_ROUTES`; טוקן
Sentry לקריאה בלבד או הזדהות מחדש ל-MCP. הכל רשום ב-`docs/BACKLOG.md`
סעיף 9 וסעיפים 20 ו-21. שערים, כולם תחת
`env -u` ל-56 השמות המוזרקים מה-harness (אומת `0` נותרים; עם 31 שמות בלבד
נפלו 9 טסטים של `growth/resend` ו-`deployed-runtime` והבנייה על `Invalid
API key`, שניהם זיהום env ולא קוד): `pnpm type-check` exit 0; `pnpm lint`
exit 0 פעמיים, השנייה אחרי עריכת המסמכים (docs-index-gate 282,
docs-path-audit 155 ללא שינוי); `pnpm test` 615/615 קבצים, 7342 עברו, 12
דולגו (7354), 80 שניות; `CARDCOM_USE_MOCK=true
NEXT_PUBLIC_APP_URL=http://localhost:4993 pnpm build` exit 0, `BUILD_ID`
`8s1_bbxwaYQZLjkoHxQEf`, אותן שורות `supabase.rls_denied` על `reviews`
(חוסם 3). `compare.mjs` לא נדרש, אפס שינוי UI או קוד.
L07 הועבר ל-`docs/STATE-ARCHIVE.md`. קבצים: `STATE.md`,
`docs/STATE-ARCHIVE.md`, `docs/BACKLOG.md`.

**L07 - DONE (05.10.2026).** ארכיון מלא ב-`docs/STATE-ARCHIVE.md` (הועבר
ב-L08): שער 7 parity נמדד מול פרודקשן ב-380/768/1440, 7.91 / 8.98 / 4.09
PASS; תיקון אחד ב-`scripts/compare.mjs` (הצד נגזר מהקורא, לא מה-hostname),
אפס CSS, אפס redeploy.

**L06 - BLOCKED (05.10.2026).** ארכיון מלא ב-`docs/STATE-ARCHIVE.md` (הועבר
ב-L07): החלת מיגרציות על פרודקשן דורשת אישור מפורש; `schema_migrations`
נקראה בלבד (162 שורות), 6 תואמים, 13 מספרים תפוסים בתוכן אחר, 39 ללא
שורה; אפס החלה, אפס `db push`, אפס שינוי בפרודקשן; 165 אינה קיימת.

**L05 - DONE (05.10.2026).** ארכיון מלא ב-`docs/STATE-ARCHIVE.md` (הועבר
ב-L06): שער 5 E2E על פרודקשן, 9 נתיבים + 10 מוצרים מהמפה + `/checkout`
+ webhook, שני 404 (`/returns`, `/cookies`) תוקנו ב-`4c87dae64` כ-redirects
קבועים, נפרסו אוטומטית ונמדדו שוב ירוק.


**L04 - DONE (05.10.2026).** ארכיון מלא ב-`docs/STATE-ARCHIVE.md` (הועבר
ב-L05): ביקורת env של Vercel Production בקריאה בלבד, 42 שמות, אפס placeholder
בין 10 הנקראים, ארבעה מועמדים לכפילות רשומים ב-`docs/BACKLOG.md` ולא הוסרו.

**L03 - DONE (05.10.2026).** ארכיון מלא ב-`docs/STATE-ARCHIVE.md` (הועבר
ב-L04): `run-final.sh` ללא קריאות vercel, `--archive=tgz` בכל פקודת deploy
מתועדת.

**L02 - DONE (05.10.2026).** ארכיון מלא ב-`docs/STATE-ARCHIVE.md` (הועבר
ב-L05): production branch של `kenyonexpress` הוסב ל-`audit/final-audit`
(היה `phase5/homepage`, 327 push בלי פריסה), אומת ב-commit ריק `9e0df9ff9`
שנפרס תוך 7 שניות; מרגע זה כל push לענף הוא פריסת פרודקשן אוטומטית.

**M18-c95 - DONE (05.10.2026).** ארכיון מלא ב-`docs/STATE-ARCHIVE.md`
(הועבר ב-L02): STATE.md עמד על 216 שורות, M17-c95 הועבר לארכיון, מחזור c95
(18 פריטים) נסגר, אפס שינוי קוד, ארבעת השערים ירוקים.

**M17-c95 - DONE (05.10.2026).** ארכיון מלא ב-`docs/STATE-ARCHIVE.md`
(הועבר ב-M18-c95): RTL/LTR אומת על `/` ושלושת סלאגי הדגימה
ב-380/768/1440, 12/12 PASS, אפס leak, אפס דריפט מ-M17-c94, אפס שינוי קוד.

**M16-c95, M15-c95, M14-c95, M13-c95, M12-c95, M11-c95, M10-c95, M09-c95, M08-c95, M07-c95, M17-c94, M16-c94, M15-c94, M12-c94, M09-c94, M08-c94,
M07-c94, M06-c94, M05-c94, M10-c94** וכל מה שקדם להם (M04-c94..M01-c94,
M18-c93..M03-c93, ועד M01-c55) מתועדים במלואם ב-`docs/STATE-ARCHIVE.md`,
החדש למעלה; כולם DONE עם אפס דריפט וארבעת השערים ירוקים. ההעברות נעשו
שלב-שלב (האחרונה: M17-c95 ב-M18-c95) לשמירה על תקרת 300 שורות; שום
שורה לא נמחקה מהארכיון, רק הוסרה כאן הכפילות.

**DEPLOY-UNBLOCK - RESOLVED ב-L01 (05.10.2026).** פרודקשן מגיש `e1719ad66`
(`dpl_FxGwtE5H6hw4L9ccU4yJNYmuhVni`), ראו L01 למעלה. ההיסטוריה שמתחת
נשמרת כפי שהייתה. הרשומה המקורית, עד M14-c95: הרשומה
המקורית (04.10) אמרה: חסרים שלושה משתני Cardcom ב-Production ו-`ALLOW_INCOMPLETE_ENV`
קיים. **שניהם נסגרו על ידי סשן מקביל ב-04.10** (M14-c94, M14-c95). החוסם
הנוכחי הוא קוד: `39eb43947` הוסיף `refs` ל-`.vercelignore`, ולכן כל
פריסת HEAD נופלת ב-`pnpm build` על `refs/electro-checkout-text.json`
(חמש פריסות ERROR ב-04.10, לוג ב-M14-c95 למעלה). תיקון של שורה אחת
יושב לא-מחויב בעץ של סשן מקביל. פרודקשן READY עדיין `main@18ed044b2`
(`dpl_2zzvvFGMoS5icgrgL94er8USKwsj`, 02.10), 1162 קומיטים מאחורי HEAD.
**לאופיר/לסשן המתקן:** לחייב את תיקון `.vercelignore`, ואז deploy
`target: production` מ-`audit/final-audit`. ההיסטוריה המלאה של הרשומה
ב-`docs/STATE-ARCHIVE.md` (M14-c95).

**M14-c73 - נסגר בפועל ב-L01 (05.10.2026)**: הפריסה הזרה הוחלפה בפריסת HEAD
מהתור. מקור ההחלפה של 02.10 עדיין לא ידוע. הרשומה המקורית: production הוחלף חי מחוץ
לתור (`main`@`18ed044b2`, `SENTRY_DSN` חדש), מקור לא ידוע, לא תוקן/
הוחזר, פורט מלא ב-`docs/BACKLOG.md` סעיף 17 (ארכיון מלא, שבעת
הממצאים, ב-`docs/STATE-ARCHIVE.md`). נבדק שוב בכל סבב עד M14-c80
(למעלה): אפס דריפט, אותה פריסה בדיוק, ממתין להחלטת אופיר.

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
    **L07 (05.10):** הצד הנמדד יכול להיות פרודקשן עצמו
    (`LOCAL_BASE=https://www.kenyonexpress.co.il`) מאז שתיקון `shoot()`
    גוזר את הצד מהקורא ולא מה-hostname; נמדד 7.91 / 8.98 / 4.09 PASS.

## ידני לאופיר, לפי סדר קריטיות

הרשימה המלאה, ממוזגת עם `docs/LAUNCH-READINESS.md` וללא כפילויות, עברה
ל-`docs/BACKLOG.md` (M15-c51). לא נשמר עותק כאן, כדי שלא ייסטה שוב.
