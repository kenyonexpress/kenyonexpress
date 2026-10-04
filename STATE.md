RESUME FROM: maintenance
Updated: 2026-10-05 (סשן `audit/final-audit`, Fable 5.1, פריט L12 DONE: שער 12
הכרעה. תור `final-queue.txt` L01..L12 נסגר. LAUNCH-READY: pending-cardcom.
אין tag `v1.0.0-mvp` כי L06, L08, L09 ו-L11 הם BLOCKED, כולם env או אישור
שרק אופיר מחזיק; ארבעת השערים ירוקים, אפס שינוי קוד; RESUME FROM מצביע
ל-maintenance)

## המשך מ:

**L12 - DONE (05.10.2026, 04:30 שעון המכונה): שער 12 הכרעה. LAUNCH-READY:
pending-cardcom. אין tag, אין `LAUNCH.flag`, ארבעת השערים ירוקים, אפס שינוי
קוד.** משימת התור: "Gate 12 verdict: if L01-L11 all DONE tag v1.0.0-mvp,
push tag, write LAUNCH-READY: yes to STATE.md, echo one line summary to
~/ke-goals/LAUNCH.flag. If L11 BLOCKED write LAUNCH-READY: pending-cardcom
and keep everything else green. Update STATE.md with hamshekh me:
maintenance". `pwd` אומת, HEAD בהגעה `62e180e10`, עץ נקי. **ההכרעה, מתוך
STATE.md ו-`git log -20` בלבד:** DONE: L01 (`4949d616b`), L02 (`217ff7534`),
L03 (`9187af59c`), L04 (`d0e2ecc92`), L05 (`52b4e1469`), L07 (`97f54ffaa`),
L10 (`3f951560e`). BLOCKED: L06 (`6769b256a`, החלת מיגרציות דורשת אישור
מפורש), L08 (`331a9a980`, שלושה ערכי env ב-Vercel: Sentry token, PostHog
key, Resend key), L09 (`a2509a71f`, ערך `CRON_SECRET` ב-Vercel אינו נקרא
ואינו תואם ל-GitHub), L11 (`0bc5b349a`, אישורי Cardcom לא-מאומתים). כלומר
7 DONE ו-4 BLOCKED, ולא "L01-L11 all DONE"; לפי כלל המשימה ל-L11 BLOCKED
נרשם **LAUNCH-READY: pending-cardcom**, ונרשם כאן במפורש ששלושת החוסמים
הנוספים (L06, L08, L09) עומדים גם הם, כולם env או אישור שרק אופיר מחזיק,
אף אחד מהם קוד. **לא בוצע:** `git tag v1.0.0-mvp` (אומת שאינו קיים, `git tag
--list | grep mvp` ריק, התגית הגבוהה `v5.9.9`), אין push של tag, אין כתיבה
ל-`~/ke-goals/LAUNCH.flag` (אומת שאינו קיים; הכלל "do not modify ~/ke-goals"
ממילא אוסר, והענף "all DONE" לא התקיים). **שערים, 55 שמות מוזרקים הוסרו
(`SENSITIVE` נותרים 0, `CARDCOM_*`/`NEXT_PUBLIC_*`/`SUPABASE_*`/`VERCEL*`
נותרים 0):** `pnpm type-check` exit 0; `pnpm lint` exit 0 (i18n 627/627,
docs-index-gate 282, docs-path-audit 155 ללא שינוי); `pnpm test` 615/615
קבצים, 7342 עברו, 12 דולגו (7354), 57.7 שניות; `rm -rf .next` ואז
`CARDCOM_USE_MOCK=true NEXT_PUBLIC_APP_URL=http://localhost:4993 pnpm build`
exit 0, `BUILD_ID` `i2ARrDJNCrYk74pP9hBuR`, 92 שורות `supabase.rls_denied`
על `reviews` (חוסם 3, 247). `compare.mjs` לא נדרש, אפס שינוי UI; המדידה
התקפה האחרונה היא L07 מול פרודקשן, 7.91 / 8.98 / 4.09 PASS. **מלכודת
שנמדדה בדרך:** ריצת `pnpm test` ראשונה נכשלה 8/7354 (`resend.test.ts` 7,
`invoices.test.ts` 1) כי רשימת ה-`env -u` נבנתה ב-zsh בלי `${=VAR}` ולכן
עברה כמילה אחת, ואחרי התיקון עדיין נותרו מפתחות Supabase אמיתיים,
`CARDCOM_USE_MOCK`, `CARDCOM_WEBHOOK_SECRET` ו-`NEXT_PUBLIC_*` מוזרקים בלי
סימון `[SENSITIVE]`; עם 55 השמות (כמו ב-L10/L11) הריצה ירוקה וזהה ל-L11.
**החלטות שהתקבלו לבד:** (א) הכלל במשימה מכסה רק "L11 BLOCKED"; שלושת
ה-BLOCKED האחרים נרשמו לצד ההכרעה ולא הושמטו, כי "pending-cardcom" לבדו
היה מצייר תמונה חלקית; (ב) `docs/LAUNCH-READINESS.md` קיבל שורת הכרעה
מתוארכת תחת "Verdict: NOT READY" ולא סעיף חדש; (ג) `RESUME FROM:
maintenance` כנדרש, התור סגור, אין פריט אחרי L12 ב-`final-queue.txt`.
**לאופיר, בסדר שבו לקוח נתקל בהם:** (1) שלושת ערכי Cardcom האמיתיים
ו-`CARDCOM_SANDBOX=false` ב-Vercel Production, ואז הזמנת ₪1 וזיכוי (L11);
(2) `CRON_SECRET` זהה ב-GitHub וב-Vercel (L09); (3) `RESEND_API_KEY` תקף,
`NEXT_PUBLIC_POSTHOG_KEY`, `SENTRY_AUTH_TOKEN` (L08); (4) אישור החלת
המיגרציות הממתינות לפי `docs/RUNBOOK.md` (L06). הרשימה המלאה ב-`docs/BACKLOG.md`.
L11 הועבר לארכיון. קבצים: `STATE.md`, `docs/STATE-ARCHIVE.md`,
`docs/LAUNCH-READINESS.md`.

**L11 - BLOCKED cardcom-creds (05.10.2026).** ארכיון מלא ב-`docs/STATE-ARCHIVE.md`
(הועבר ב-L12): שער 11 Cardcom; ארבעת ערכי `CARDCOM_*` ב-Vercel Production
הם Sensitive ואינם נקראים, נוצרו ב-04.10 בערב על ידי סשן ענן "כדי לעבור את
ה-preflight", אין אישור אמיתי או סנדבוקס במכונה, ולפרודקשן אפס תשלומים
לא-mock מאז ומעולם; אפס שינוי קוד, אפס כתיבה לפרודקשן. אופיר בלבד.

**L10 - DONE (05.10.2026).** ארכיון מלא ב-`docs/STATE-ARCHIVE.md` (הועבר
ב-L11): שער 10 מוקשי השקה; שתי עמודות ה-agorot קיימות כ-GENERATED ALWAYS,
059 לא הוחלה, כל select של `finalize.ts` עבר על פרודקשן, אפס שינוי קוד.

**L09 - BLOCKED (05.10.2026).** ארכיון מלא ב-`docs/STATE-ARCHIVE.md` (הועבר
ב-L10): שער 9 cron נמדד מול פרודקשן; pg_cron מחזיק עבודה אחת שרצה ב-24
השעות, 21 נתיבי `/api/cron` עונים 401 בלי bearer בשני ה-hosts, וה-200 עם סוד
הפרודקשן אינו ניתן למדידה כי הערך ב-Vercel הוא Sensitive ולא נקרא, וגם סוד
GitHub וגם הערך המקומי נדחים ב-401; יישור הסוד הוא env, אופיר בלבד.
**L08 - BLOCKED (05.10.2026).** ארכיון מלא ב-`docs/STATE-ARCHIVE.md` (הועבר
ב-L09): שער 8 observability נמדד מול פרודקשן; Sentry קיבל שגיאת לקוח
ב-ingest (`c32d5f141b38426aac8c48adc20f17a8`) בלי טוקן API לאימות, PostHog
אינרטי כי `NEXT_PUBLIC_POSTHOG_KEY` חסר ב-Production, Resend מחזיר 401
"API key is invalid" משליחה אמיתית; שלושתם env ב-Vercel.

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

## ידני לאופיר, לפי סדר קריטיות

הרשימה המלאה, ממוזגת עם `docs/LAUNCH-READINESS.md` וללא כפילויות, עברה
ל-`docs/BACKLOG.md` (M15-c51). לא נשמר עותק כאן, כדי שלא ייסטה שוב.
