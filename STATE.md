RESUME FROM: M08-c113
Updated: 2026-10-06 (סשן `audit/final-audit`, פריט M07-c113 DONE: סריקת TODO/FIXME, שני `TODO(cardcom)` בלבד, כבר ב-BACKLOG, אפס חדשים)

## המשך מ:

**M07-c113 - DONE (06.10.2026): סריקת TODO/FIXME/HACK/XXX ב-HEAD `6ae2b05de`: שני סמנים אמיתיים בלבד, שניהם כבר ב-`docs/BACKLOG.md` סעיף 6; אפס חדשים, אין שינוי קוד.**
משימת התור: "Scan TODO FIXME older than 7 days resolve or file in docs/BACKLOG.md". HEAD `6ae2b05de` = `origin/audit/final-audit` (אחרי `git fetch`).
העץ הראשי עדיין על `main` `3f6ca53c3` (שם אין `docs/BACKLOG.md` ו-STATE.md בן 21134 שורות); **החלטה שהתקבלה לבד:** כמו M04..M06-c113, לא נגעתי בו,
והעבודה נעשתה ב-worktree נקי חדש `/tmp/ke-m07-c113` (detached על `origin/audit/final-audit`), נדחף כ-fast-forward בלבד.
**סריקה** (`git grep -nwE "TODO|FIXME|XXX|HACK"` על כל העץ במעקב): `src/lib/payments/cardcom.ts:254` (`git blame`: 2026-07-24) ו-`:319` (2026-08-07),
שניהם `TODO(cardcom)`, ישנים משבעה ימים, ודורשים טרמינל Cardcom חי, ולכן לא ניתנים לפתרון כאן ונשארים רשומים ב-BACKLOG סעיף 6 (נוספה שורת M07-c113).
שאר ההתאמות אינן סמני עבודה: `05X-XXX-XXXX` (פורמט טלפון, 3 מקומות), `'TODO'` ב-`whatsapp.test.ts:91` (מחרוזת בדיקה), תיעוד ובדיקות של `final-audit-lib.mjs`.
`node scripts/final-audit.mjs`: **0 סמנים לא-מתועדים מתוך 2**. אין שינוי UI, ולכן `compare.mjs` לא נדרש.
**שערים** (אותו worktree, `refs/` הועתק מהעץ הראשי): type-check **0**; test **640/640, 7674 עברו, 12 דולגו**; `rm -rf .next` ואז build עם `CARDCOM_USE_MOCK=true`: **0, 340/340**, אפס `Invalid API key`, `BUILD_ID` `DKqbpm_dcCSltGloedjIm`;
lint: שאר השערים נקיים, docs-path-audit נכשל ב-worktree רק על `supabase/.temp` (ב-gitignore), אותו כשל תלוי סביבה כמו ב-M04..M06-c113, ולא drift.
**STATE.md:** הרשומות M03-c113..M18-c112 הועברו לראש `docs/STATE-ARCHIVE.md` כדי להישאר מתחת ל-300 שורות. הפריט הבא ב-`final-queue.txt` (קריאה בלבד) הוא M08-c113.


**M06-c113 - DONE (06.10.2026): `pnpm build` רץ על worktree נקי של HEAD `86137f52a`, exit 0, 340/340 דפים, אפס `Invalid API key`, אפס drift; אין שינוי קוד.**
משימת התור: "pnpm build fix drift commit". HEAD `86137f52a` = `origin/audit/final-audit` (אחרי `git fetch`). העץ הראשי עדיין על `main` `3f6ca53c3`
(ahead 193, behind 110 מול `origin/main`), ושם STATE.md הוא הגרסה הישנה בת 21134 שורות. **החלטה שהתקבלה לבד:** כמו ב-M05-c113, לא נגעתי בעץ הראשי
ולא באף ref מקומי; העבודה וה-commit נעשו ב-worktree הנקי `/tmp/ke-m01-c113`, ונדחפו כ-fast-forward ל-`origin/audit/final-audit` בלבד.
**שערים** (אותו worktree, `env -i`): `rm -rf .next` ואז build עם `CARDCOM_USE_MOCK=true`: **0, 340/340**, אפס `Invalid API key`, `BUILD_ID` `AaY8VeWt_iKKzFOWAQHfg`;
type-check **0**; test **640/640, 7674 עברו, 12 דולגו**; lint: שאר השערים נקיים, docs-path-audit נכשל ב-worktree רק על `supabase/.temp`
(ב-gitignore, לא קיים ב-worktree), אותו כשל תלוי סביבה שתועד ב-M04-c113 וב-M05-c113, ולא drift. אין שינוי UI, ולכן `compare.mjs` לא נדרש.
**ידני לאופיר (עדיין פתוח):** להחזיר את `audit/final-audit` המקומי ל-`origin/audit/final-audit` ואת העץ הראשי לענף הזה.

**M05-c113 - DONE (06.10.2026): `pnpm test` רץ על worktree נקי של HEAD `b93675616`, 640/640 קבצים, 7674 עברו, 12 דולגו, אפס כשלים, אפס drift; אין שינוי קוד.**
משימת התור: "pnpm test fix drift commit". `pwd` אומת, HEAD `b93675616` = `origin/audit/final-audit` (אחרי `git fetch`). ה-worktree הנקי
`/tmp/ke-m01-c113` הועבר מ-`f0c73423f` ל-`b93675616` (detached; ההפרש הוא `STATE.md` בלבד). **שערים** (אותו worktree, `env -i`):
test **640/640, 7674 עברו, 12 דולגו** (163.6s, זהה ל-M04-c113); type-check **0**; lint: biome ושאר השערים נקיים, docs-path-audit
נכשל ב-worktree רק על `supabase/.temp` (ב-gitignore, לא קיים ב-worktree). בעץ הראשי docs-path-audit מדווח "NO LONGER dangling" על
`refs/electro_product.html`, כי הקובץ קיים שם מקומית (`refs/` ב-gitignore, לא במעקב). **החלטה שהתקבלה לבד:** לא להריץ `--write`,
כי ב-checkout נקי הנתיב כן תלוי וה-ledger נכון לריפו; שני הכשלים תלויי סביבה ולא drift. `rm -rf .next` ואז build עם
`CARDCOM_USE_MOCK=true`: 0, 340/340, אפס `Invalid API key`, `BUILD_ID` `paYZ7N8R0vQB_YZ0G2MjR`. אין שינוי UI, ולכן `compare.mjs` לא נדרש.
**חריגה בזמן הריצה, לא שלי:** ב-17:29 וב-17:30 תהליך אחר הריץ בעץ הראשי `reset` של `audit/final-audit` ל-`origin/main` (פעמיים),
וב-17:31 `checkout main` (ה-reflog של העץ הראשי). ה-ref המקומי `audit/final-audit` מצביע עכשיו על `7b7e01494` (= `origin/main`),
העץ הראשי על `main` `3f6ca53c3`, וה-WIP הזר ב-`docs/UI-PARITY-REPORT.md` כבר לא שם. `origin/audit/final-audit` לא נפגע (`b93675616`).
**החלטה שהתקבלה לבד:** לא נגעתי בעץ הראשי ולא באף ref מקומי; ה-commit הזה נעשה ב-worktree הנקי ונדחף כ-fast-forward
ל-`origin/audit/final-audit` בלבד. **ידני לאופיר:** לבדוק מי הזיז את `audit/final-audit` המקומי, ולהחזיר אותו ל-`origin/audit/final-audit`
לפני הפריט הבא, אחרת M06-c113 ירוץ על `main`. **החלטה שהתקבלה לבד:** הפריט הבא ב-`~/ke-goals/final-queue.txt` (קריאה בלבד) הוא
M06-c113, ולכן `RESUME FROM` עודכן ל-M06-c113. ל-M16-c111 עדיין אין commit עם ראיה; הפער רשום כאן ולא נסגר.

**M04-c113 - DONE (06.10.2026): `pnpm type-check` רץ על worktree נקי של HEAD `f0c73423f`, exit 0, אפס שגיאות, אפס drift; אין שינוי קוד.**
משימת התור: "pnpm type-check fix drift commit". `pwd` אומת, HEAD `f0c73423f` = `origin/audit/final-audit` (אחרי `git fetch`).
בעץ הראשי אותו WIP זר (`docs/UI-PARITY-REPORT.md`), לא נגעתי בו ולא חויב. ה-worktree הנקי `/tmp/ke-m01-c113` הועבר ל-`f0c73423f`
(detached). לשם כך שינוי השער שנשאר בו ב-`docs/UI-PARITY-REPORT.md` מ-M03-c113 גובה קודם ל-`/tmp/m04c113-worktree-UI-PARITY-REPORT.backup.md`
ורק אז הוחזר לגרסת ה-commit. ההפרש מ-`d0cc3be4f` כולל את `ebbb72628` (fix: L1 LANDMINES, 17 קבצים ב-`src`), ו-type-check עובר גם איתו.
**שערים** (אותו worktree, `env -i`): type-check **0** (`tsc --noEmit`, אפס פלט); lint: eslint ושאר השערים נקיים מלבד docs-path-audit
ב-worktree, שנכשל רק על `supabase/.temp` (ב-gitignore), נקי בעץ הראשי (`OK. 155 known`, ללא שינוי); test **640/640, 7674 עברו, 12 דולגו**;
`rm -rf .next` ואז build עם `CARDCOM_USE_MOCK=true`: 0, 340/340, אפס `Invalid API key`, `BUILD_ID` `19K9yT18GhFO2-hIUtJSD`.
אין שינוי UI, ולכן `compare.mjs` לא נדרש. **החלטה שהתקבלה לבד:** הפריט הבא ב-`~/ke-goals/final-queue.txt` (קריאה בלבד, שורה 2124)
הוא M05-c113, ולכן `RESUME FROM` עודכן ל-M05-c113. ל-M16-c111 עדיין אין commit עם ראיה; הפער רשום כאן ולא נסגר.


**M11-c110 - DONE** (sitemap.xml טרי, 98/98 כתובות 200, ממצא apex→www ב-BACKLOG),
ו-W14..W01, M01-c96, L12, L11 וכל מה שקדם: ארכיון מלא ב-`docs/STATE-ARCHIVE.md`, החדש למעלה.

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
   נתיבי תתי-המפות של הקוד הנוכחי מחזירים `404` בפרודקשן **נסגר, M11-c110 (06.10): החי הוא
   `sitemapindex` עם חמש תתי-מפות, 98/98 כתובות 200.**
3. **מיגרציות ממתינות**: **218 (טריגר `enforce_profile_privilege_columns` מפיל כל
   עדכון פרופיל של לקוח ב-42703; נמדד 25.09 ב-M05-c1, 5 מ-5 לקוחות, בניגוד לרישום
   "הוחלה" מ-21.09)**, 245 ו-246 (advisors, M05-c1; 245 אחרי 209 ואחרי 203), 204 (הצטרפות ספקים והסכם click-wrap; בלעדיה הטופס
   עונה "עדיין לא פעיל"), 240 (הסכמת "הכל באפליקציה"), 241 (עיר משלוש
   כותרות), 242 (מקור מחיר + ביקורות גוגל), 243 (תנאי מוצר), 244 (קמפיינים
   והמרות של תוכנית השותפים; בלעדיה התוכנית "עדיין לא פתוחה"), 247 (`anon`
   בלי הרשאת SELECT על `reviews`, נמדד M18-c52; בלעדיה דף הביקורות הציבורי
   נכשל תמיד, ללא תלות בשום קובץ אחר). סדר והתנאים
   ב-`docs/RUNBOOK.md`, סקירה ב-`docs/MIGRATION-REVIEW.md`. **אומת שוב
   M10-c112 (06.10, בדיקה ישירה מול פרודקשן דרך CLI-keychain-token, קריאה
   בלבד, 17 אובייקטים של 15 קבצים): אף קובץ לא הוחל; החוסם עכשיו 23 קבצים
   (19 הקודמים + 249, 250, 251, 252).**
   65 קבצים ב-`migrations/pending/`, `git log -1` הוא `3043995e9` (252).
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
