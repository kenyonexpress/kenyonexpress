RESUME FROM: M14-c62
Updated: 2026-09-30 (סשן `audit/final-audit`, Sonnet 5, פריט M13-c62)

## המשך מ:

**M13-c62 - DONE (30.09): אבטחה — CSP/HSTS/X-Frame-Options/Referrer-Policy
ומגבלות קצב Upstash על login/checkout/redeem, אימות מחדש, אפס דריפט
מ-M13-c61.** משימת התור: לוודא CSP, HSTS, X-Frame-Options,
Referrer-Policy ומגבלות קצב על login/checkout/redeem, ולתקן פערים עם
טסטים. בדיקת דריפט קודם: `git diff --stat 743084d38..HEAD --
middleware.ts 'src/**/rate-limit*' 'src/**/ratelimit*' 'src/lib/security*'
'src/lib/headers*' next.config.* vercel.json 'src/server/actions/auth*'
'src/server/actions/checkout*' 'src/server/actions/*voucher*'
'src/server/actions/*redeem*' 'src/app/api/supplier/vouchers/redeem*'
'src/app/redeem/**'` מחזיר קובץ אחד בלבד: `auth-coverage.test.ts` (+7
שורות, רישום `recently-viewed.ts:getRecentlyViewedProducts` כפעולה
ציבורית ללא session — קריאה בלבד מ-`localStorage` של הדפדפן, לא נוגע
בכותרות או ב-rate limiting). `git diff --stat` המלא מ-`743084d38`
מראה 14 קבצים, כולם תיעוד/PDP (`RecentlyViewedRail`, M18-c61) — אפס
קומיט נגע במשטח האבטחה.

נמדד בכל זאת חי מול שרת `next start` קיים שכבר רץ על HEAD הנוכחי
(פורט 3471, `.next/BUILD_ID` `Qiw0jzh8aP48yZxykGhsO`, אומת מול
`pnpm build` שהורץ מחדש בפועל בפריט הזה — ראה שערים למטה):
- כותרות תגובה על `/`, `/checkout`, `/login`, `/redeem/test-token`
  זהות בארבעתן ל-M13-c61: CSP (`default-src 'self'`, `frame-ancestors
  'none'`, `frame-src`/`form-action` ל-`secure.cardcom.solutions`
  ו-`'self'` בלבד, `object-src 'none'`), `Strict-Transport-Security:
  max-age=63072000; includeSubDomains; preload`, `X-Frame-Options:
  DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy:
  strict-origin-when-cross-origin`.
- מגבלות קצב נמדדו בקוד, אותן שורות בדיוק כמו M13-c61: `login`
  (`src/server/actions/auth.ts:141`), `begin_checkout`
  (`src/server/actions/payments/checkout.ts:351`, 10 ל-60 שניות),
  `redeem` (`src/app/redeem/[token]/page.tsx:109`, 60 ל-3600 שניות),
  `voucher-redeem` (`src/app/api/supplier/vouchers/redeem/route.ts:223`,
  `rateLimit('voucher-redeem', user.id)`, 429). `src/lib/rate-limit/limiter.ts`
  (Upstash כברירת מחדל, נפילה ל-postgres, נכשל פתוח בשגיאה) לא השתנה.
  טסטים קיימים על שני הצדדים: `src/lib/security/frame-policy.test.ts`
  לכותרות, ו-20 קבצי טסט (`limiter.test.ts`, `policies.test.ts`,
  `auth.test.ts`, `checkout.test.ts`, `redeem/route.test.ts` ועוד) על
  ה-rate limiting.
- `upgrade-insecure-requests` נעדר שוב מה-CSP המקומי (זהה ל-M13-c61):
  build מקומי עם `NEXT_PUBLIC_APP_URL` שמתחיל ב-`http://`, לכן
  `src/lib/security/frame-policy.ts` משמיט את הדירקטיבה בכוונה —
  תוצר build מקומי, לא דריפט קוד, [[site-url-baked-at-build-time]].

**אפס פער נמצא, אפס תיקון קוד או טסט נדרש.** שערים: `type-check` נקי,
`lint` נקי (biome 2028 קבצים, 12 שערים ירוקים), `test` המלא 610/610
קבצים 7296/7308 (12 דולגים, 56.09s), `build` רץ בפועל עד סוף (לא רק
נבדק חי) — כל הנתיבים כולל `/`, `/checkout`, `/login`,
`/redeem/[token]` נבנו. קובץ קוד שונה: אין. תיעוד: `STATE.md` +
`docs/STATE-ARCHIVE.md`.

**M12-c62 (ארכיון מלא ב-`docs/STATE-ARCHIVE.md`, כווץ לשורה הזו ב-M13-c62
לשמירה על תקרת 300 שורות).** SEO נבדק מחדש אחרי `RecentlyViewedRail`
(M18-c61), אפס דריפט בקובצי ה-SEO עצמם (`generateMetadata`, JSON-LD,
canonical, sitemap, robots). ארבעת השערים ירוקים, `build` רץ בפועל.

**M11-c62 (ארכיון מלא ב-`docs/STATE-ARCHIVE.md`, כווץ לשורה הזו ב-M12-c62
לשמירה על תקרת 300 שורות).** axe נבדק מחדש אחרי `RecentlyViewedRail`
(M18-c61), שתי סוויטות Playwright אמיתיות מול `pnpm start`, 0 הפרות
`serious`/`critical` (ולמעשה 0 מכל סוג), WCAG 2.1 AA נשמר. ארבעת
השערים ירוקים.

**M10-c62 (ארכיון מלא ב-`docs/STATE-ARCHIVE.md`, כווץ לשורה הזו ב-M11-c62
לשמירה על תקרת 300 שורות).** כיסוי טסטים נבדק מחדש, שש הקטגוריות
הקריטיות עדיין ב-100% ענפים כל אחת (354/354), אפס טסט חדש נדרש.

**M09-c62 (ארכיון מלא ב-`docs/STATE-ARCHIVE.md`, כווץ לשורה הזו ב-M11-c62
לשמירה על תקרת 300 שורות).** STATE CLEAN, כל 28 הסעיפים הפתוחים דורשים
פעולה שרק אופיר מחזיק.

**M08-c62 (ארכיון מלא ב-`docs/STATE-ARCHIVE.md`, כווץ לשורה הזו
ב-M10-c62 לשמירה על תקרת 300 שורות).** docs/BACKLOG.md נבדק מחדש, עדיין
15 פריטים, אפס פריט חדש, אין phase 1 זמין למשימת התור.

**M07-c62 (ארכיון מלא ב-`docs/STATE-ARCHIVE.md`, כווץ לשורה הזו ב-M09-c62
לשמירה על תקרת 300 שורות).** route audit הורץ מחדש במלואו, 241 שורות,
אפס כשל אמיתי, זהה ל-M07-c61; אימת במפורש ש-`RecentlyViewedRail`
(M18-c61) לא מכניס שגיאת console/hydration ל-PDP.

**M06-c62 (ארכיון מלא ב-`docs/STATE-ARCHIVE.md`, כווץ לשורה הזו ב-M07-c62
לשמירה על תקרת 300 שורות).** Lighthouse mobile נמדד שוב אחרי הוספת
`RecentlyViewedRail` ל-PDP, כל שמונת הציונים 90+, זהה ב-100% ל-M06-c61.

**M05-c62 (ארכיון מלא ב-`docs/STATE-ARCHIVE.md`, כווץ לשורה הזו ב-M06-c62
לשמירה על תקרת 300 שורות).** advisors נמדדו שוב דרך ה-management API,
44 WARN זהים ב-100% לאחת-עשרה המדידות הקודמות, אפס מיגרציה חדשה נדרשת.

**M04-c62 (ארכיון מלא ב-`docs/STATE-ARCHIVE.md`, כווץ לשורה הזו ב-M05-c62
לשמירה על תקרת 300 שורות).** תברואת תלויות: `pnpm audit` אפס חולשות,
`pnpm outdated` 14 מיושנות ו-14 מתוך 14 `wanted`==`current` (כל שאר
ה-bump הוא מייג'ור, חסום). אפס שינוי ל-`package.json`/`pnpm-lock.yaml`.
שערים ירוקים.

**M03-c62 (ארכיון מלא ב-`docs/STATE-ARCHIVE.md`, כווץ לשורה הזו ב-M08-c62
לשמירה על תקרת 300 שורות).** שער ירוק הורץ מחדש במלואו, `type-check`/
`lint`/`test` (610/610, 7296/7308)/`build` כולם נקיים, אפס תיקון קוד.

**M02-c62 (ארכיון מלא ב-`docs/STATE-ARCHIVE.md`, כווץ לשורה הזו ב-M08-c62
לשמירה על תקרת 300 שורות).** שער פריטיות הורץ מחדש בחזית: בית 8.51%/
9.02%/3.95%, מוצר 4.96%/4.56%/3.25%, כל שש המדידות PASS מתחת ל-11%.

**M01-c62 - BLOCKED (ארכיון מלא ב-`docs/STATE-ARCHIVE.md`, כווץ לשורה
הזו ב-M03-c62 לשמירה על תקרת 300 שורות).** בדיקת פרודקשן בפעם התשיעית:
DNS/HTTP תקינים (`www.kenyonexpress.co.il` 200, `NS` `vercel-dns.com`),
פריסת HEAD עדיין חסומה באותה סיבה (Cardcom env חסר + `ALLOW_INCOMPLETE_ENV`
ב-Production, ראה "חוסמים פתוחים" סעיף 2), דילוג על ניסיון נוסף לפי כלל
"goal שנתקע פעמיים". SHOWABLE: yes (בית/מוצר, שני הדפים מתחת ל-11%).

**S03 (ארכיון מלא ב-`docs/STATE-ARCHIVE.md`, כווץ לשורה הזו ב-M05-c62
לשמירה על תקרת 300 שורות).** בקצרה: reference חדש למוצר יחיד של Electro
v7 התבקש בשמות שלא קיימים בריפו; מה שכבר קיים (`refs/electro_product_
{380,768,1440}.png`, מ-Q05b) עושה בדיוק את אותה עבודה. הופעל מול
`barbecue-2`: 380 5.61% / 768 4.92% / 1440 2.99%, כולם PASS, אפס דריפט.
לא מקדם את `RESUME FROM:`.

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

**M14-c59 ו-M13-c59 (ארכיון מלא ב-`docs/STATE-ARCHIVE.md`, שני הראשים
המקוריים כווצו לשורה הזו ב-M13-c62 לשמירה על תקרת 300 שורות).** M14-c59
— ביצועים, bundle/צנרת תמונות/תגיות ISR/כותרות cache אומתו מחדש מול
build אמיתי, אפס דריפט מ-M14-c58. M13-c59 — אבטחה, CSP/HSTS/
X-Frame-Options/Referrer-Policy ומגבלות קצב Upstash אומתו מחדש, אפס
דריפט מ-M13-c58. ארבעת השערים ירוקים בשניהם, אפס שינוי קוד.

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
