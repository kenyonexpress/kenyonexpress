RESUME FROM: W12
Updated: 2026-10-05 (סשן `audit/final-audit`, Fable 5.1, פריט W11 DONE: חיווט
אנליטיקה; Sentry/PostHog/Axiom אומתו, ארבעה פגמים נמדדו ותוקנו בקוד, שני ערכי env
נשארו לאופיר; W10 הועבר לארכיון; RESUME FROM מצביע ל-W12, ואם אין W12 בתור,
ההמשך הוא M02-c96)

## המשך מ:

**W11 - DONE (05.10.2026): ANALYTICS WIRING. שלוש הרגליים אומתו בקוד, ב-build
ובדפדפן; ארבעה פגמים נמדדו ותוקנו בקוד; שני ערכי env חסרים ב-Vercel ונרשמו לאופיר,
לא נוצרו. parity home 7.92% / 9.03% / 4.16% PASS ב-380 / 768 / 1440.** `pwd` אומת,
HEAD בהגעה `39c44ebf2`, עץ נקי. W11 לא הופיע ב-STATE.md, ב-BACKLOG או ב-`git log -20`;
L08 (ארכיון) מדד את אותן רגליים מול פרודקשן ונחסם על env. **Sentry, מה היה:** init
בשלושת הזמנים (`sentry.server.config.ts`, `sentry.edge.config.ts`,
`instrumentation-client.ts`, נטענים מ-`src/instrumentation.ts`), release =
`SENTRY_RELEASE ?? VERCEL_GIT_COMMIT_SHA` בשרת וב-edge ו-`NEXT_PUBLIC_*` בדפדפן
(`autoExposeSystemEnvs: true` בפרויקט, נקרא), מנהרת `/monitoring`, scrub, ‏`sendDefaultPii:false`.
**מה נמדד שבור:** לוג ה-build של הפריסה החיה `dpl_E9PfZCJMGjNH3kjwLKRFb2B4KowM`
(`vercel inspect --logs`): `No org provided. Will not upload source maps.` ב-Production
יש `SENTRY_AUTH_TOKEN` ושני DSN אבל לא `SENTRY_ORG`/`SENTRY_PROJECT`, ולכן **אף source
map לא עלה מעולם** וכל stack trace בפרודקשן נשאר minified עם build ירוק. **תוקן בקוד,
בלי env:** ה-slugs הציבוריים (`kenyonexpress`/`kenyonexpress-web`, מתועדים
ב-`SENTRY-SETUP.md`) וה-host האירופי `https://de.sentry.io` כברירת מחדל
ב-`next.config.ts`, `errorHandler` שהופך כשל העלאה לאזהרה ולא לכשל deploy;
`src/__tests__/sentry-build-config.test.ts` מצמיד. build מקומי עם
`SENTRY_KEEP_SOURCEMAPS=1`: 150 קובצי `.map` נוצרו (ההעלאה עצמה דורשת את הטוקן
שאינו מקומי, נמדד בפריסה הבאה). `pnpm sentry:verify` לא הורץ: אין `SENTRY_DSN`
ב-`.env.local`; קבלת ingest מפרודקשן נמדדה ב-L08. **PostHog, מה היה:** fan-out
בדפדפן (`commerce-client.ts`) ובשרת (`track.ts`), ‏`$pageview`, הסכמה בשני המקומות,
replay מותנה. **מה נמדד שבור ותוקן:** (1) **ה-CSP לא הכיל את מארח PostHog**: build
מקומי עם מפתח ו-host מקומיים, הסכמה ניתנה, הדפדפן סירב לכל `/capture/` על
`connect-src` ואפס אירועים יצאו; בפרודקשן זה היה המצב ביום שהמפתח ייכנס (חצי שרת
מגיע, חצי דפדפן נחסם). ‏`postHogCspHosts` ב-`frame-policy.ts`, מותנה במפתח כמו
Turnstile, פותח `connect-src`+`script-src` ל-host המוגדר ולמארח ה-assets של
PostHog Cloud (us/eu), `csp-posthog.test.ts`. (2) **שניים מששת השמות הגיעו בשם
אחר**: `view_item` (GA4) ו-`voucher_redeemed` (רשימה לבנה פרוסה). טבלת שמות אחת
`src/lib/analytics/posthog-names.ts` ששני ה-fan-outs עוברים דרכה: `view_product`,
`coupon_redeemed`. (3) **אין identify**: `identifyPostHogUser` ב-`track.ts`, נקרא
בשלושת מסלולי הכניסה (`signInWithEmail`, `verifyPhoneOtp`, `/auth/callback`), ‏`$identify`
עם uuid בלבד ו-`$anon_distinct_id` מעוגיית ה-PostHog, **מותנה בהסכמה** (בניגוד
לאירועי הכסף; הנימוק בקוד). (4) **אין `gift_sent`**: `trackPostHogServerEvent`
(PostHog בלבד, כי הרשימה הלבנה הפרוסה תפיל אותו ב-200 שקט) מ-`finalizeOrder`
כשמייל מתנה נכנס לתור ומ-`transferVoucher`. `add_to_cart`, `begin_checkout`,
`purchase` היו נכונים. **אומת בדפדפן (dev):** `scripts/posthog-sink.mjs` (חדש,
מחליף את `/capture/` מקומית; עונה ל-`/array/<key>/config` ול-`/flags/` כי בלעדיהם
posthog-js לא שולח כלל), build `9_7T9OM6JhDyOQj103gn1` על 3417 (cwd אומת), Chromium
עם UA רגיל ו-`navigator.webdriver` מוסווה (posthog-js מפיל כל capture מאוטומציה,
שלוש הדקות שנמדדו): **בלי הסכמה 0 אירועים; עם הסכמה `$pageview` על `/`,
`$pageview` על המוצר ו-`view_product` (value_agorot 9900) תחת `distinct_id` אחד;
כניסה אמיתית של משתמש E2E הפיקה `$identify` עם uuid ו-`$anon_distinct_id` זהה
למזהה הדפדפן** (ארבע כניסות על prod auth במהלך הפריט, מגבלה 10/שעה). ‏`purchase`,
`gift_sent`, `coupon_redeemed` לא הורצו חיים (כתיבה לפרודקשן); מכוסים ביחידה
(`track-posthog-identify.test.ts`, ‏`track-posthog-fanout.test.ts`). **Axiom:** אין
Vercel log drain (`/v1/drains` ו-`/v1/integrations/log-drains` ריקים, קריאה
בלבד) **ואין צורך**: `log.ts` משגר כל שורה מובנית ל-Axiom ב-fetch כשיש
`AXIOM_TOKEN`+`AXIOM_DATASET`, **ושניהם קיימים ב-Production** (שמות בלבד);
`with-request-log.ts` עוטף מסלולי API, `log-coverage.test.ts` שומר. **env:** אפס
משתנים נוצרו/שונו. **לאופיר:** (א) `NEXT_PUBLIC_POSTHOG_KEY` (+`NEXT_PUBLIC_POSTHOG_HOST`
אם EU) ב-Vercel Production ופריסה; עד אז PostHog אינרטי (BACKLOG 20). (ב) אחרי
הפריסה הבאה לקרוא `vercel inspect <dpl> --logs` ולראות העלאת source maps; אם
הטוקן חסר `project:releases` תהיה אזהרה (BACKLOG 21). **נמדד ולא תוקן:** GA4
ו-Meta גם הם מחוץ ל-CSP (BACKLOG 22, קוד). `begin_checkout` נשלח פעמיים
(דפדפן+שרת), משפך סופר אנשים ולא אירועים, תועד ב-`ANALYTICS-EVENTS.md` §8.
**החלטות שהתקבלו לבד:** (א) slugs של Sentry בקוד ולא env חדש. (ב) `gift_sent`
PostHog-only, בלי מיגרציה. (ג) identify מהשרת ומותנה בהסכמה. (ד) שמות PostHog
לפי הבריף, הרשימה הלבנה לא נגעה. (ה) push לענף כמו W01..W10. **שערים:**
`pnpm type-check` 0; `pnpm lint` 0 (i18n 606/606, docs-index 282); `pnpm test`
**636/636 קבצים, 7631 עברו, 12 דולגו** תחת `env -i`; build exit 0 פעמיים
(`rm -rf .next`); **השער בחזית, `--page=home --baseline='refs/ke_live_{width}.png'
--widths=380,768,1440`, שלוש שורות ב-`docs/UI-PARITY-REPORT.md` (`39c44ebf2-dirty`):
380: 7.92% PASS; 768: 9.03% PASS; 1440: 4.16% PASS** (M01-c96: 8.58/9.01/4.16; נמדד
על ה-build הראשון, לפני תיקון ה-CSP, שאינו משנה פיקסל). **לא נעשה:** אין מיגרציה,
אין שינוי DB/env/DNS/Vercel, אין מחיקה, אין שדה חיפוש.

**W10 - DONE (05.10.2026).** ארכיון מלא ב-`docs/STATE-ARCHIVE.md` (הועבר
ב-W11): שיתוף וקשר; ארבע מחמש הרגליים היו קיימות, קישור השאלה בסיכום המוצר
קיבל את יעד הספק עם הסבר; parity product 4.76 / 4.17 / 2.44 PASS.

**W09, W08, W07, W06, W05, W04, W03, W02, W01, M01-c96, L12, L11, M18-c95, M17-c95** —
סגורים ב-05.10.2026 (W04 BLOCKED no-dev-database, L11 BLOCKED cardcom-creds, השאר
DONE), ארכיון מלא ב-`docs/STATE-ARCHIVE.md`; התקצירים שישבו כאן הועברו לשם ב-W06,
ב-W08 וב-W11 (תקרת 300 שורות), שום שורה לא נמחקה.

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
