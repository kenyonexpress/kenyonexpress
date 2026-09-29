RESUME FROM: M03-c59
Updated: 2026-09-30 (סשן `audit/final-audit`, Sonnet 5, פריט M02-c59)

## המשך מ:

**M02-c59 - DONE (30.09): שער חזותי, בית ומוצר, שלושה רוחבים, אפס
רגרסיה, כל שש המדידות PASS מתחת ל-11%.** משימת התור: להריץ
`scripts/compare.mjs` בפורגראונד ולחכות למספרים באותה הרצה, לתקן כל
רגרסיה עד שכל השלוש מתחת ל-11%, לרשום ב-STATE.md.

- `rm -rf .next && CARDCOM_USE_MOCK=true NEXT_PUBLIC_APP_URL=http://
  localhost:3311 pnpm build` -> `exit 0`, בנייה טרייה על HEAD
  `725c64ba4`. `PORT=3311 pnpm start` מול הבנייה הזו (לא שרת ישן).
- **בית** (`--widths=380,768,1440`, `--baseline='refs/ke_live_{width}.png'`,
  בפורגראונד, חיכה למספרים באותה הרצה): **380 8.51% PASS, 768 9.02%
  PASS, 1440 3.95% PASS** — זהה בדיוק ל-M02-c58.
- **מוצר** (`COMPARE_PRODUCT_SLUG=barbecue-2`, `--widths=380,768,1440`,
  `--baseline='refs/electro_product_{width}.png'`, בפורגראונד): **380
  5.65% PASS, 768 4.95% PASS, 1440 2.92% PASS** — תנודה קטנה מ-M02-c58
  (5.61/4.92/2.99), כולם עדיין PASS, אפס תיקון נדרש. תהליך ה-driver
  (`--widths`) נתקע אחרי שהילד של 1440 כבר סיים והדפיס את מספרו (אפס
  תהליך דפדפן חי, `lsof`/`ps` אישרו) — שתי השורות כבר נכתבו
  ל-`docs/UI-PARITY-REPORT.md` על ידי הילדים עצמם לפני התקיעה, אז
  התהליך התקוע נהרג (`kill -9`) אחרי שהמספרים כבר היו בידיים; לא היה
  צורך בניסיון נוסף.
- כל שש השורות נכתבות אוטומטית ל-`docs/UI-PARITY-REPORT.md` על ידי
  השער עצמו (`live side: frozen capture`, HEAD `725c64ba4-dirty`).
- שערים נוספים הורצו במלואם אחרי המדידה: `type-check` נקי, `lint` נקי
  (2023 קבצים, i18n 627/627), `test` 608/608 קבצים 7273/7285 (12
  skipped, 58.04s), `build` `exit 0` (מהריצה הטרייה למעלה). אפס שינוי
  קוד יישומי (רק `STATE.md`/`docs/UI-PARITY-REPORT.md`).

## M01-c59 (הועבר מ-STATE.md ב-M02-c59, לשמירה על תקרת 300 שורות)

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

**כל סעיף מ-M17-c58 ועד M08-c57 (כולל M16-c58..M01-c58, M18-c57..M08-c57)**
היה מסומן כאן "ארכיון מלא ב-`docs/STATE-ARCHIVE.md`" וכווץ לשורה הזו
ב-M02-c59 לשמירה על תקרת 300 שורות — שום שורה לא נמחקה מהארכיון עצמו,
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
