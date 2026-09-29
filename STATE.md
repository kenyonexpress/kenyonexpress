RESUME FROM: M11-c53
Updated: 2026-09-29 (סשן `audit/final-audit`, Sonnet 5, פריט M14-c53)

## המשך מ:

M11-c53: עדיין לא קיים ב-`HEAD`/`origin` (נבדק שוב עם `git fetch` ב-M14-c53).
פריטים M12-c53, M13-c53 ו-M14-c53 בוצעו מחוץ לסדר לפי הקצאה מפורשת, כמו
שתועד בכל אחד.

## M14-c53 - DONE (29.09): ביצועים — bundle ירד (לא רגרסיה), שני מופעים נוספים של באג `fill`+px `sizes` נמצאו ותוקנו באדמין, ISR וכותרות cache ללא רגרסיה

**בדיקת ארבעת התחומים, מול הבייסליין הכתוב ב-M14-c52 (`fed81240e`):**

1. **גודל bundle: אין רגרסיה, שיפור.** `scripts/bundle-report.mjs` על build
   טרי, `pnpm start` על 3512: בית 341.7kB -> **320.4kB** gzip, קופה
   345.4kB -> **324.1kB** gzip, סה"כ 366.4kB -> **345.1kB** על אותם 27
   chunks. השיפור תואם עדכוני תלויות שקרו בין M14-c52 ל-HEAD (M04-c53,
   13 חבילות patch/minor) ולא נדרש תיקון — כיוון חיובי, לא רגרסיה.
2. **פלט צנרת התמונות: הממצא ותיקונו.** אותו דפוס שתוקן פעמיים (`CategoryStrip.tsx`
   ב-M14-c51, `ProductGallery.tsx` ב-M14-c52) נמצא בשני קבצי אדמין שלא
   נבדקו קודם: `src/components/admin/ImageUploader.tsx` (`w-24 h-24` = 96px,
   `fill sizes="160px"`) ו-`src/components/admin/CouponDealForm.tsx`
   (`relative h-40` בכרטיס `max-w-xs`=320px, `fill sizes="320px"`). ערך px
   שטוח לא נכנס ל-regex `getWidths` (`node_modules/next/dist/shared/lib/get-img-props.js:53`,
   `/(^|\s)(1?\d?\d)vw/g`) שמזהה רק `vw`, כך שהרשימה המלאה `imageSizes`+`deviceSizes`
   יוצאת: 17 מועמדים, 16w עד 3840w, לתמונות ממוזערות קטנות. `ImageUploader`
   הוא הגדול מבין השניים (נצרך משבעה טפסי אדמין — `SupplierForm`,
   `VendorForm`, `CategoryDialog`, `ProductForm`, `CategoryForm`,
   `BulkImageMatchClient`, וגם `CouponDealForm` עצמו — וכל תמונה מוצג
   ממופה, לא רק אחת), ולכן **הגדול מבין שני הממצאים**; תוקן יחד עם השני
   כי שניהם אותו תיקון חד-שורתי. `ImageUploader`: `width={96} height={96}`
   במקום `fill sizes="160px"`. `CouponDealForm`: `width={320} height={160}`
   + `className="h-full w-full object-cover"` במקום `fill sizes="320px"`.
   שני הקבצים אדמין-בלבד, לא מופיעים ב-home/product/cart/checkout שנמדדים
   ב-`compare.mjs`, ולכן לא נדרשה מדידת HTML לפני/אחרי (ללא לקוח מחובר
   באדמין בסביבה הזו) — ההתנהגות אומתה נכון ישירות מול קוד המקור של
   next/image, אותה לוגיקה דטרמיניסטית שכבר אומתה פעמיים במדידה חיה.
3. **תגיות ISR: אין רגרסיה.** `node scripts/cache-invalidation-gate.mjs`:
   "clean" — כל כתיבה לטבלה שמורה בקאש מבטלת אותה, כל scope שמור נושא
   תגית.
4. **כותרות cache: אין רגרסיה.** `/images/*` עדיין `public, max-age=0,
   s-maxage=86400, stale-while-revalidate=604800`. בית/מוצר/קופה עדיין
   `private, no-cache, no-store, max-age=0, must-revalidate` עם
   `x-nextjs-prerender:1`, זהה בדיוק ל-M14-c51/M14-c52 (Origin-Only
   serving תחת `next start`, צפוי).

**שער חזותי בית (הדף היחיד שיכול היה להיפגע, כי `next.config.ts`/`imageSizes`
משותפים לכל האתר), בחזית, שלושת הרוחבים מול `refs/ke_live_{width}.png`:**

| רוחב | both-painted | סטטוס |
|---|---|---|
| 380 | 8.51% | PASS |
| 768 | 9.02% | PASS |
| 1440 | 3.95% | PASS |

זהה בדיוק לבייסליין (M02-c53, M14-c52). שורות ב-`docs/UI-PARITY-REPORT.md`.

**שערים:** `pnpm type-check` נקי, `pnpm lint` נקי (12 שערים), `pnpm test`
**605/7213** (זהה), `pnpm build` `exit 0`.

**קבצים:** `src/components/admin/ImageUploader.tsx`,
`src/components/admin/CouponDealForm.tsx`, `docs/UI-PARITY-REPORT.md`
(שורות מדידה), `docs/STATE-ARCHIVE.md` (טבלת `final-queue.txt` הישנה
הוזזה לשם), `STATE.md`.

## M10-c53 - DONE (29.09): פירוט מלא בארכיון

כיסוי טסטים: `refund.ts` (server action) מ-67.1% ל-100% ענפים, 18 טסטים
נוספו (38 בסה"כ). שערים ירוקים, 605/7213 (+18). קובץ יחיד שונה:
`src/server/actions/payments/refund.test.ts`.

## M13-c53 - DONE (29.09): אבטחה נמדדה מחדש — CSP/HSTS/X-Frame-Options/Referrer-Policy/rate-limit על login+checkout+redeem, אפס דריפט

נבדק ישירות: `git log e5197b512..HEAD -- next.config.ts src/lib/security src/lib/rate-limit src/server/actions/auth.ts src/server/actions/payments/checkout.ts src/app/redeem docs/RATE-LIMITS.md`
ריק — אפס שינוי בכל קובץ רלוונטי מאז M13-c52 (`e5197b512`, אותו יום).

בכל זאת נמדד מחדש מול build אמיתי, לא רק מול הקוד: `pnpm build` נקי,
שרת `pnpm start` נפרד על פורט 3553 (לא נגעתי בשרת סשן מקביל).

- **`curl -D -` על חמישה נתיבים** (`/`, `/login`, `/checkout`,
  `/checkout/frame-return`, `/redeem/abc`): כל אחד עם `Content-Security-
  Policy`, `Strict-Transport-Security: max-age=63072000; includeSubDomains;
  preload`, `X-Frame-Options`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy`.
  `/checkout/frame-return` הופך נכון ל-`frame-ancestors 'self'`/
  `X-Frame-Options: SAMEORIGIN`; ארבעת האחרים ב-`'none'`/`DENY`.
- **rate-limit**: שלושת קבצי הטסט (`auth.test.ts`, `payments/checkout.test.ts`,
  `api/supplier/vouchers/redeem/route.test.ts`) רצו ישירות — 45/45 ירוקים.
- **Upstash**: `UPSTASH_REDIS_REST_URL` עדיין נעדר מ-`.env.local`, fallback
  ל-Postgres פעיל — זהה ל-M13-c52.

**שערים:** `pnpm type-check` נקי, `pnpm lint` נקי (12 שערים), `pnpm test`
**605/7213** (זהה), `pnpm build` `exit 0`. אין שינוי UI, לכן `scripts/compare.mjs`
לא רץ (תואם לתקדים ב-M12-c53 ובכל פריט re-verify קודם ללא שינוי קוד).

**קבצים:** `STATE.md` בלבד.

## M12-c53 - DONE (29.09): SEO נמדד מחדש בפעם הרביעית — מטא/canonical/og/JSON-LD Product+Offer/sitemap/robots, אפס דריפט

נבדק מה השתנה מאז M12-c52 (‏`c379eeb15`): `git log c379eeb15..HEAD` על נתיבי
SEO מצא קומיט אחד רלוונטי, `99b2079cb` (M18-c52), שחיבר את דירוג הכוכבים
ל-`aggregateRating` ב-JSON-LD (`src/lib/seo/json-ld.ts`,
`src/app/(store)/product/[slug]/page.tsx`) — לא היה קיים בבדיקה הקודמת.
ארבעת השערים נקיים: type-check, lint (biome + 12 שערי תוכן, i18n
627/627), 605/7213 (זהה למדוד ב-M10-c53), `build` `exit 0`. נבדק חי מול
build אמיתי על `PORT=3311 pnpm start`: `robots.txt` (12 `Disallow`, host
+ sitemap תקינים), `sitemap.xml` (5 חלקים), `sitemap/products.xml` (46
`<loc>`, 46 `<lastmod>`, כולם עם timestamp תקין), דף מוצר (`/product/barbecue`):
canonical נכון, `og:title/description/url/locale/image*` נכונים, JSON-LD
`Product`+`Offer` (מחיר, `priceCurrency`, `availability`,
`priceSpecification` עם `StrikethroughPrice`) ו-`BreadcrumbList` תקינים,
**`aggregateRating` נעדר נכון** למוצר בלי ביקורות (הענף הנגדי — מוצר עם
ביקורות — מכוסה ב-`src/lib/seo/json-ld.test.ts`, לא נמדד חי כי אין מוצר
עם ביקורות זמין כרגע). דף הבית: canonical, `og:*`, כותרת — תקינים. אפס
דריפט, אפס תיקון נדרש. אין שינוי קוד, אין שער חזותי נדרש. **`RESUME FROM`
נשאר `M11-c53`**: אין קומיט `M11-c53` ב-`HEAD`/`origin` (נבדק עם
`git fetch` לפני ואחרי), כלומר עדיין פתוח (סביר שסוכן מקביל אחר עליו) —
הפריט הזה (`M12-c53`) בוצע מחוץ לסדר לפי הקצאה מפורשת.

## M09-c53 - DONE (29.09): פירוט מלא בארכיון

STATE CLEAN, backlog נבדק שוב באופן ישיר (grep TODO/FIXME, test.skip/it.todo,
POST-LAUNCH-BACKLOG מלא) — אפס פריט בר-ביצוע בפעם השלוש-עשרה. שערים ירוקים,
605/7195 (12 skipped). אין שינוי קוד.

## M08-c53 - DONE (29.09): פירוט מלא בארכיון

BACKLOG EMPTY נמדד בפעם השתים-עשרה: 15 הסעיפים זהים ל-M08-c52, כולם חוסמים
לפי CLAUDE.md. שערים ירוקים (605/7195). אין שינוי קוד.

## M07-c53 - DONE (29.09): פירוט מלא בארכיון

שער נתיבים מלא נמדד שוב: 241 נתיבים ייחודיים, 239 PASS, 2 NO DATA
(רשימות בלי מה לקשר), 0 FAIL, 0 שגיאת קונסולה, 0 אזהרת הידרציה. תוצאה
דומה ל-M07-c52, ללא רגרסיה. אפס תיקון נדרש, אין שינוי קוד.

## M06-c53 - DONE (29.09): פירוט מלא בארכיון

Lighthouse mobile נמדד שוב: בית ומוצר 99/100/100/100, כל שמונת הציונים
90+, דומה ל-M06-c52. אפס תיקון נדרש, אפס שינוי קוד.

## M05-c53 - DONE (29.09): פירוט מלא בארכיון

advisors נמדדו שוב דרך ה-management API: 44 WARN, זהה ב-100% ל-M05-c52
בכל מדד (28/197/167/9). כל ה-44 מכוסים בקבצים קיימים ב-`migrations/pending/`
(209, 220, 245, 246) או by design. אפס קובץ מיגרציה חדש נדרש. אין שינוי
קוד.

## M04-c53 - DONE (29.09): תברואת תלויות — audit אפס, 13 חבילות patch/minor, אפס major

13 חבילות patch/minor אומתו מ-WIP קיים בעץ (`@aws-sdk/*`, `@sentry/*`,
`@supabase/ssr`+`supabase-js`, `lucide-react`, `next-intl`, `posthog-js`,
`react-hook-form`, `sharp`, `tailwind-merge`, ועוד), אפס major הוחל
(13 חבילות major + 2 `0.x` דולגו). `pnpm audit` אפס חולשות. ארבעת השערים
ירוקים, 605/7195. אין שינוי קוד יישומי. פירוט מלא בארכיון.

## M03-c53 - DONE (29.09): פירוט מלא בארכיון

green check מחדש: כל ארבעת השערים נקיים ללא תיקון (`type-check`, `lint`,
605/7195, `build` exit 0). זהה ל-M03-c52, אפס דריפט. אין שינוי קוד.

## M02-c53 - DONE (29.09): פירוט מלא בארכיון

שער חזותי בית+מוצר בשלושת הרוחבים: 8.51/9.19/3.95 (בית) ו-4.96/4.56/3.25
(מוצר), כל שש המדידות PASS, אפס רגרסיה מול הבייסליין. אין שינוי קוד.

## M01-c53 - DONE (29.09): פירוט מלא בארכיון

DNS עדיין תקין (200 עם תוכן אמיתי, NS `vercel-dns.com` תקין). פריסת HEAD
(`99b2079cb6`) נוסתה דרך כלי ה-Vercel MCP (`create_deployment`, לא REST
גולמי) וסורבה שוב באותו `BUILD_UTILS_SPAWN_1` (סביבת Cardcom חסרה
בפרודקשן, `ALLOW_INCOMPLETE_ENV` עדיין מוגדר). פרודקשן נשאר `a388118f1`,
70 קומיטים מאחורי HEAD. אין שינוי קוד, אין שער נדרש.

## M18-c52 - DONE (29.09): פירוט מלא בארכיון

idle-check (הסבב לא היה idle) + דירוג בכוכבים חובר לדף המוצר
(`RatingStars.tsx` חדש, `ratingSummary` מ-`loadProductBySlug`, JSON-LD
`aggregateRating`). ממצא לוואי: ל-`anon` אין הרשאת SELECT על
`public.reviews` מעולם, דף הביקורות הציבורי נכשל תמיד מאז 23.09 בשקט;
תוקן ב-`migrations/pending/247_reviews_grant_anon_select.sql` (GRANT
בלבד, לא הוחל). שערים נקיים, 605/7195 (+7). שער 8.51/9.02/3.95 PASS,
מוצר 5.65/4.95/2.92 PASS, זהה לבייסליין.

## M17-c52 / M16-c52 - DONE (29.09): פירוט מלא בארכיון

M17-c52: מעבר משפטי ולשוני חזר בשלישית, שני פגמים חיים נמצאו בפוטר
(`SiteFooter.tsx`, "Newsletter" זר ו-`$` בודד) ותוקנו; שער 8.51/9.02/3.95
PASS. M16-c52: תברואת ריפו — git status נקי, כל הענפים דחופים (בדיקת SHA),
24 PRs פתוחים, 26 ממוזגים-בלי-PR, 83 רדומים; אין שינוי קוד.

## M15-c52 - DONE (29.09): פירוט מלא בארכיון

סנכרון תיעוד: מספר הקומיטים שפרודקשן מאחורי HEAD עודכן 47->66 (`a388118f1`),
פער `origin/main` עודכן 421->440 (109 ל-פנים ללא שינוי), ספירת טסטים
ב-`docs/LAUNCH-READINESS.md` עודכנה ל-604/7188. אין כפילות או פריט חדש
ברשימת "ידני לאופיר" (15 סעיפים). אין שינוי קוד.

**M14-c52..M01-c52 ו-M18-c51..M12-c51 פירוט מלא בארכיון** (`docs/STATE-ARCHIVE.md`),
כותרות השורה בכל רשומה שם.

ההיסטוריה המלאה (Q01..Q24, B01..B10, M01-c1..M13-c51, תור 23.09, וכל מה שקדם)
ב-`docs/STATE-ARCHIVE.md`, החדש למעלה. הקובץ הזה מחזיק רק את מה שחי.


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
2. **פריסת פרודקשן של HEAD (`99b2079cb6`, 70 קומיטים אחרי `a388118f1` החי)**:
   נוסתה שוב ב-M01-c53 (הפעם דרך כלי ה-Vercel MCP, `create_deployment` עם
   `gitSource` github, לא REST גולמי) **וסורבה שוב ב-`deploy-preflight`**
   באותה סיבה בדיוק: `dpl_CUUU98iiF1RiU1qxHojWyGbT8JuQ`,
   `BUILD_UTILS_SPAWN_1`. `CARDCOM_TERMINAL_NUMBER`, `CARDCOM_API_NAME`,
   `CARDCOM_API_PASSWORD` עדיין חסרים ב-Production (קיימים במקומם
   `CARDCOM_MERCHANT_ID`/`CLIENT_ID`/`API_KEY` שהקוד לא קורא) ו-
   `ALLOW_INCOMPLETE_ENV=true` עדיין מוגדר שם (נמדד עם `filter_project_envs`,
   קריאה בלבד). עד שאופיר יתקן את הסביבה אין פריסה אפשרית מהענף הזה;
   פרודקשן נשאר על `a388118f1` (`dpl_EMtv9KbPfdGq75JLSNysp1wx3DQa`, READY)
   ולא נפגע מהניסיון. **DNS אינו קשור לחוסם הזה** — נמדד שוב ב-M01-c53,
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
    25 ממצאים על 44-46 מוצרים פעילים לפי המדידה): שלוש שורות `מאסטר`, חמש
    `-copy`/`-העתק`/`-לדוגמא`, שמות שסותרים slug, מחיר שסותר את הטקסט של
    עצמו. **לא היה רשום כחוסם ב-STATE.md עד M15-c51** (נמדד ב-`docs/LAUNCH-READINESS.md`
    שורה חוסמת 6 ו-`CLAUDE.md` §"מצב נוכחי"); שער `pnpm test src/lib/catalogue`
    ירוק מול הפנקס — הפנקס הוא הכרעת מפעיל, לא תקלה שנמדדת.
12. **`scripts/cron-jobs.json` ב-`main` מכיל שבעה נתיבים ש-HEAD אינו מגיש**
    (`search-reindex`, `job-dlq`, `search-outbox`, `cashback-settlement`,
    `email-retry`, `expire-cashback`, `expire-coupons`), כל אחד עונה 404 גם
    אחרי שחוסם 10 נסגר. נפתר מעצמו במיזוג הענף הזה ל-`main`. **לא היה רשום
    ב-STATE.md עד M15-c51** (נמדד ב-`docs/LAUNCH-READINESS.md` ידני 9).

## ידני לאופיר, לפי סדר קריטיות

הרשימה המלאה, ממוזגת עם `docs/LAUNCH-READINESS.md` וללא כפילויות, עברה
ל-`docs/BACKLOG.md` (M15-c51). לא נשמר עותק כאן, כדי שלא ייסטה שוב.
