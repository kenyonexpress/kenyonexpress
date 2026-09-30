RESUME FROM: M17-c61
Updated: 2026-09-30 (סשן `audit/final-audit`, Sonnet 5, פריט M16-c61)

## המשך מ:

**M16-c61 - DONE (30.09): תברואת ריפו בפעם האחת-עשרה, אפס דריפט
בענפים מקומיים, ‏1 ענף remote פחות (לא שלנו).** משימת התור: לוודא
`git status` נקי, שכל ענף מקומי דחוף, ולרשום PR פתוחים וענפים ישנים
ב-STATE.md, בלי למזג או למחוק דבר.

**נמדד:** `git status` נקי, `audit/final-audit` תואם בדיוק ל-`origin/
audit/final-audit` (`b33f407cd`, אפס עבודה לא-committed, אפס commit
לא-דחוף). **43 ענפים מקומיים, זהה בדיוק ל-M16-c60** (אפס ענף חדש, אפס
ענף שנעלם). כל 43 נבדקו ב-SHA ישיר מול `origin/<שם>` (לא רק מצב
tracking): 36 זהים ל-`origin/<שם>` שלהם (כולל ענפי `arch/*` שעוקבים
בטעות אחרי `origin/main` אך ה-SHA זהה למקביל ב-remote, ו-7 ענפים חסרי
upstream מקומי אך זהים ל-remote), ו-6 ענפים (`pr36`, `release/v1.1`,
`wip/refund-record-rebase-head`, `chore/vitest-4`,
`docs/nightly-health-green`, `fix/main-nightly-red`) **אין להם ענף
remote באותו שם כלל**, אך ראש הענף שלהם מוכל ב-`origin/main` וב-
`origin/audit/final-audit` (אומת ישירות עם `git merge-base
--is-ancestor`) — **אפס קומיט ייחודי לא-דחוף בשום ענף מקומי, זהה
בדיוק ל-M16-c60.** `main` המקומי נשאר בסטייה הידועה (`ahead=193
behind=109` מול `origin/main`, ללא אב-משותף אמיתי — חוסם 13, ללא
שינוי).

**24 PR פתוחים** (`gh pr list --state open`, זהה בדיוק ל-M16-c60,
אותם מספרים 2-47). **116 ענפי remote** (`git branch -r` אחרי `git
fetch --prune`, **ירד ב-1** מ-117 ב-M16-c60 — ענף remote שלא שלנו נעלם
בין המחזורים, ללא PR פתוח תואם, ללא השפעה על 24 ה-PR הפתוחים ועל אף
ענף מקומי; אין דרך לזהות איזה מ-`git log` בלבד, ואין בכך פעולה נדרשת
מהפריט הזה). **12 מ-43 הענפים המקומיים כבר ממוזגים לתוך HEAD** (זהה
בדיוק ל-M16-c60): `audit/final-audit` עצמו, `chore/vitest-4`,
`docs/nightly-health-green`, `docs/v1-final`, `fix/main-nightly-red`,
`main`, `pr36`, `release/v1.0`, `release/v1.1`, `release/v1.2`,
`wip/refund-record-rebase-head`, `work/goal-queue-0923`, מועמדים
לניקוי, לא נמחקו (הכלל אוסר מחיקת ענפים). **28 ענפים ישנים** (קומיט
אחרון לפני 16.09, זהה בדיוק ל-M16-c60): `save/ke-visual-work`,
`arch/account-area`, `arch/checkout-cardcom-verification`,
`arch/notifications-v2`, `arch/seed-data`, `arch/wp-migration`,
`docs/final-pack`, `arch/docs-batch-2`, `arch/docs-queue`,
`feat/e2e-quality`, `feat/auth-model`, `feat/db-hardening-v2`,
`feat/product-type`, `merge/supplier-and-arch-night`,
`feat/auth-hardening`, `feat/checkout-e2e`, `feat/monitoring-sentry`,
`feat/notifications-full`, `feat/performance-seo`,
`feat/search-meilisearch`, `feat/ux-wave-final`, `feat/rate-limit-layer`,
`docs/final-pass`, `worktree-ke-fetch-timeout`, `worktree-mega-63-72`,
`closeout/v1-final`, `feat/coupon-qr`, `worktree-order-state-machine`.
**3 ענפים לא ממוזגים אך לא נטושים** (זהה בדיוק ל-M16-c60): `autopilot`
(17.09), `docs/ui-design-system` (23.09), `phase5/homepage-closeout`
(24.09). **אפס מיזוג, אפס מחיקה.**

**שערים**: `type-check` נקי, `lint` נקי (12 שערים, ספירות זהות: i18n
627/627, `docs-index` 282 מסמכים, `docs-path-audit` 152), `test` המלא
610/610 קבצים 7296/7308 (12 דולגים, 58.46s) — זהה ל-100% ל-M15-c61.
`build` לא הורץ מחדש: 46 תהליכי `next-server`/`pnpm start` מקבילים
רצים — ראה [[concurrent-worktree-builds-oom]]; במקום זאת אומת ש-`.next`
הקיים (`BUILD_ID` `JvTmoHwdiXPpaSeOjzjaw`) תואם מקור ל-HEAD: `git diff
--stat 8fd11aae4..HEAD -- next.config.ts next.config.js next.config.mjs
middleware.ts vercel.json src/ package.json pnpm-lock.yaml` חוזר ריק.
אין שינוי UI, אין שער חזותי נדרש.

קובץ ששונה: `STATE.md`, `docs/STATE-ARCHIVE.md`.

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
