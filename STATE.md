RESUME FROM: M13-c54
Updated: 2026-09-29 (סשן `audit/final-audit`, Sonnet 5, פריט M12-c54)

## המשך מ:

**M12-c54 - docs(seo): מטא-דאטה, canonical, og, schema.org Product/Offer,
עדכניות sitemap ו-robots נמדדו מחדש, אפס דריפט (29.09).** המשימה: לוודא
metadata, canonical, og tags, schema.org Product ו-Offer בדפי מוצר, עדכניות
ה-sitemap ו-robots, ולתקן דריפט. **נבדק קודם מה השתנה מאז האימות האחרון
(M12-c53, `7773958a2`)**: `git diff 7773958a2..HEAD --stat` על 23 קבצים —
אף אחד לא נוגע ל-SEO (layout/sitemap/robots/json-ld); השינוי הקרוב ביותר
היה `next.config.ts` (ייבוא Sentry לא-מיושן, M03-c54), לא רלוונטי. **אומת
בכל זאת ישירות מול build אמיתי** (`pnpm build` נקי, `PORT=3513 pnpm start`):
`robots.txt` (Disallow על admin/checkout/cart/auth/api/redeem/coupon/account/
supplier/scan/reset-password/forgot-password, Host+Sitemap תקינים),
`sitemap.xml` (5 סקשנים: content/categories/products/regions/suppliers,
זהה ל-M12-c53), `sitemap/products.xml` (46 `loc`/`lastmod`, זהה), דף מוצר
(`/product/barbecue`): canonical נכון, כל תגי `og:*` (title/description/
url/locale/image עם type+width+height+alt/type=website), JSON-LD תקין —
`Product` (name/url/category/image/brand/offers עם `Offer` מלא: price,
priceCurrency, availability, seller, priceSpecification להצגת המחיר
המקורי) ו-`BreadcrumbList` (3 שלבים) — ו-`aggregateRating` נעדר כראוי
למוצר בלי ביקורות (כמדד גם ב-M12-c53 וב-`json-ld.test.ts`). עמוד הבית
נבדק גם: canonical, title, `og:type=website`, JSON-LD `Organization`+
`WebSite`. **אפס דריפט, אפס שינוי קוד.** שערים: `type-check` נקי, `lint`
נקי (biome 2020 קבצים + 12 שערי תוכן, i18n 627/627, locale 116/116), `test`
605/605 קבצים, 7217/7229 (12 skipped, זהה), `build` `exit 0`. אין שער חזותי
נדרש (אין שינוי UI). **קובץ יחיד שונה מלבד `STATE.md`: אין** (פריט מדידה/
תיעוד בלבד).

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

## M02-c54 (ארכיון)

**M02-c54 - DONE (29.09): שער חזותי נמדד מחדש, בית ומוצר, שלושה רוחבים,
אפס רגרסיה.** הרצה בפורגראונד על שרת `pnpm start` על פורט 3311
(`BUILD_ID=ucTZms1q6GMwozCalBEsz`, תואם ל-HEAD `7a57c8049`). הבסיס
ל-`--page=home` נשאר `refs/ke_live_{width}.png` (התקציב לפני חיתוך ה-DNS,
09.09) לפי ההחלטה התיעודית ב-`docs/PARITY-REFERENCE.md` (מסלול 3: שער
רגרסיה מול צילום קפוא, לא מול הדומיין החי — הדומיין החי עכשיו מגיש את
הבנייה שלנו עצמה ומסרב עם exit 5, נמדד גם כאן: `REFUSING to measure`).
הבסיס ל-`--page=product` נשאר `refs/electro_product_{width}.png` (Electro
v7 אמיתי, שלוש רוחבים, מ-25.09). **תוצאות, כולן PASS מתחת ל-11%:**

| עמוד | 380 | 768 | 1440 |
|---|---|---|---|
| בית | 8.51% | 9.02% | 3.95% |
| מוצר | 4.96% | 4.56% | 3.25% |

תואם בתוך רעש למדידה הקודמת (M02-c53: 8.51/9.19/3.95 בית,
4.96/4.56/3.25 מוצר) — אפס רגרסיה, אין צורך בתיקון UI. השער כתב שש שורות
חדשות ל-`docs/UI-PARITY-REPORT.md` בעצמו (כולל שורת REFUSED אחת על ניסיון
ראשון ללא `--baseline`, exit 5 תקין). שערים: `type-check` נקי, `lint` נקי
(ביומי + 12 שערי תוכן, i18n 627/627), `test` 605/605 קבצים, 7213/7225 (12
skipped, זהה), `build` `exit 0`. אין שינוי קוד נדרש. **קובץ יחיד שונה מלבד
`STATE.md`: `docs/UI-PARITY-REPORT.md`** (נכתב אוטומטית ע"י השער).

## M01-c54 (ארכיון)

M01-c54 היה בדיקת פרודקשן: build+deploy לפרודקשן, ואז `dig`/`curl` על שני
הדומיינים. **DNS: עדיין תקין**, נמדד שוב היום — `kenyonexpress.co.il` ->
`216.198.79.1`/`216.198.79.65`, NS `ns1/ns2.vercel-dns.com`,
`www.kenyonexpress.co.il` -> `64.29.17.1`/`64.29.17.65`.
`curl https://www.kenyonexpress.co.il` **200** עם HTML אמיתי (`lang="he"
dir="rtl"`, לוגו קניון EXPRESS); `curl https://kenyonexpress.co.il` (בלי
www) **308** ל-`https://www.kenyonexpress.co.il/` (הפניה תקינה של Vercel,
לא כשל). **לא DNS BLOCKER** — אין מה לכתוב שם. **פריסה: נוסתה בפועל**
דרך Vercel MCP `create_deployment`, `gitSource` github,
`audit/final-audit`@`0bcbdac18` (HEAD), `target=production`, פרויקט
`kenyonexpress` (`prj_v49dZbPUpk1UxyHbXTCiIJlQ7opP`) — **וסורבה שוב**, אותו
קוד שגיאה בדיוק: `dpl_BjMEzT55uBAcYWotmvpZkAuzmNdR`, `state=ERROR`,
`errorCode=BUILD_UTILS_SPAWN_1`, `errorMessage="Command \"node
scripts/deploy-preflight.mjs && pnpm build\" exited with 1"`.
`filter_project_envs` (קריאה בלבד, אין שינוי) מאשר שהסיבה לא זזה:
`CARDCOM_MERCHANT_ID`/`CLIENT_ID`/`API_KEY` עדיין קיימים ב-Production במקום
`CARDCOM_TERMINAL_NUMBER`/`API_NAME`/`API_PASSWORD` שהקוד קורא, ו-
`ALLOW_INCOMPLETE_ENV` עדיין מוגדר שם. **זו הפעם הרביעית** שאותו חוסם נמדד
(M01-c1, M01-c52, M01-c53, ועכשיו M01-c54) — אין פעולה חדשה לנסות, הפתרון
תלוי אך ורק בעדכון סביבת Vercel בידי אופיר (`docs/BACKLOG.md` סעיף 3).
נבדק גם שפרודקשן לא נפגע: `dpl_EMtv9KbPfdGq75JLSNysp1wx3DQa` עדיין
`READY` ומחזיק את כל ה-aliases (`www.kenyonexpress.co.il` וכו'), עדיין על
`a388118f1`, עכשיו **87** קומיטים מאחורי HEAD (היה 83 ב-M01-c53/M15-c53).
אין שינוי קוד, אין שער חזותי נדרש (לא UI). פריט תיעוד/מדידה בלבד, קובץ
יחיד שונה: `STATE.md`.

## M11-c53..M18-c53 (ארכיון)

M11-c53: עדיין לא קיים ב-`HEAD`/`origin` (נבדק שוב עם `git fetch` ב-M16-c53).
פריטים M12-c53..M18-c53 בוצעו מחוץ לסדר לפי הקצאה מפורשת, כמו שתועד בכל אחד.

**M18-c53 - DONE (29.09): בדיקת אפס-פעילות (idle check) — המחזור לא היה
אפס-פעילות, אין שיפור מומחש.** המשימה: אם כל פריטי המחזור (c53) לא הפיקו
שינוי קוד, לכתוב "MAINTENANCE IDLE" ואז לחפש שיפור המרה אחד אמיתי בעמוד
הבית או המוצר לפי Electro v7. **נמדד ישירות מול `git log`, לא הונח:**
ארבעה קומיטים ב-c53 כן הפיקו שינוי קוד אמיתי — `f920dc5ec` (M04, שדרוגי
תלות), `27b03f812` (M10, 18 טסטים חדשים ל-`refund.ts`, 67.1%→100% ענפים),
`e371afd2f` (M14, תיקון באג `fill`+px `sizes` בשני רכיבי אדמין, bundle
ירד), `15c97abff` (M17, שלושה תיקוני קופי אמיתיים כולל שינוי קוד ב-
`CheckoutForm.tsx`). תנאי ה-idle הוא `false` — **לא** נכתב MAINTENANCE
IDLE, ולפי הניסוח המותנה של המשימה השיפור המומחש רלוונטי רק לענף ה-true.
עמוד הבית ועמוד המוצר נסקרו בכל זאת (`src/app/(store)/page.tsx`,
`ProductInfo.tsx`, `ProductCard.tsx`, `product/[slug]/page.tsx`) לוודא
שאין החמצה: שניהם כבר נושאים כוכבי דירוג, מחסור מלאי חי, "נקנה השבוע",
wishlist, שיתוף, related products, ותגי הנחה — כל תוספת חזותית נוספת
דורשת מדידת שער חזותי (11%) שקומיטים קודמים (M14-c53 ועוד) מראים שהיא
שוברת בקלות (שורת ה-city ב-`page.tsx` שורה ~90: 9.77%→21.65% מאותה תוספת
50px בודדת). לא הוספתי UI לא-נמדד כדי "למלא" את הענף השגוי של תנאי.
שערים: `type-check` נקי, `lint` נקי (biome + 12 שערי תוכן, i18n 627/627),
`test` 605/605 קבצים, 7213/7225 (12 skipped, זהה), `build` `exit 0`. אין
שינוי קוד, אין שער חזותי נדרש (אין שינוי UI). **קובץ יחיד שונה: `STATE.md`.**

**M12-c53..M17-c53 פירוט מלא בארכיון** (`docs/STATE-ARCHIVE.md`, הועברו ב-M17-c53 לשמירה על תקרת 300 שורות; שום שורה לא נמחקה, רק הוזזה).

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

## ידני לאופיר, לפי סדר קריטיות

הרשימה המלאה, ממוזגת עם `docs/LAUNCH-READINESS.md` וללא כפילויות, עברה
ל-`docs/BACKLOG.md` (M15-c51). לא נשמר עותק כאן, כדי שלא ייסטה שוב.
