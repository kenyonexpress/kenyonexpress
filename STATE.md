Updated: 2026-09-25 (סשן `audit/final-audit`, Fable 5.1, תור `~/ke-goals/final-queue.txt`, M06-c1)

## המשך מ:

**M06-c1 DONE (25.09): Lighthouse mobile בבית ובמוצר.** נגישות, Best Practices
ו-SEO **100 / 100 / 100 בשני הדפים** (BP היה 96, שני גורמים מקומיים תוקנו).
ביצועים: **96 / 98** (בית / מוצר) תחת החנק שלייטהאוס מצהיר עליו כשהוא מוחל באמת
(`--throttling-method=devtools`), **91 / 90** ב-alias הפרודקשן (`a388118f1`),
ו-**79-83 / 75-84** בסימולציית Lantern המקומית, שהיא תכונת המדידה ולא של הדף
(פירוט ברשומה למטה). ארבעה תיקונים נמדדו: CSP בלי `upgrade-insecure-requests`
ב-build של http, תגי Vercel רק ב-Vercel, supabase-js מחוץ לרשימת הסקריפטים
הראשונית של כל דף חנות (69KB gz), ו-`sizes` של כרטיס הדיל שתיאר גריד של שני
טורים שכבר אינו קיים (טלפון קיבל 288px לחריץ של 550 פיקסלים). ארבעת השערים
ירוקים (test 601 / 7,165 / 12, build `0huX_YMa8cuIRP85Cz5Hv`) ושער ההשוואה
**8.43 / 9.08 / 3.82** בבית, **2.79** במוצר, ללא רגרסיה.

**התור `final-queue.txt` הושלם: M06-c1 היה הפריט האחרון.** אין goal הבא.
מה שנשאר פתוח הוא בידי אופיר בלבד: הרשם (NS), משתני הסביבה ב-Vercel לפריסת
HEAD (M01-c1), והמיגרציות הממתינות (218 בראשן). ראו "חוסמים פתוחים" ו"ידני
לאופיר" למטה.

ההיסטוריה המלאה (Q01..Q24, B01, B03..B10, M01-c1..M05-c1, תור 23.09, וכל מה שקדם)
ב-`docs/STATE-ARCHIVE.md`, החדש למעלה. הקובץ הזה מחזיק רק את מה שחי.

## SHOWABLE: no

**Q06 (25.09): נבדק מול הרשת, מול Vercel, מול git ומול שער ההשוואה, לא מול
הרישומים הקודמים.** Q03, Q04 ו-Q05 עשויים ומאומתים בקוד; Q02 חסום. לכן לא
`yes`. מה שחסר, במדויק, לפי פריט:

| פריט | מה יש (ראיה) | מה חסר ל-SHOWABLE |
|---|---|---|
| Q02 | build ירוק ב-Vercel, פריסת פרודקשן `dpl_EMtv9KbPfdGq75JLSNysp1wx3DQa` READY מ-git sha `a388118f1`, ‏200 על `https://kenyonexpress.vercel.app/` (נמדד עכשיו). | (א) **הדומיין לא מתרגם**: `dig +short A kenyonexpress.co.il @1.1.1.1` ריק, `www` ריק ב-8.8.8.8, `curl https://kenyonexpress.co.il/` ו-`www` מחזירים exit 6. הרשם (`dig NS @ns1.ns.il`) עדיין מאציל ל-`ns1.vercel.com`/`ns2.vercel.com`; ה-zone הנכון עונה SOA ב-`ns1.vercel-dns.com`. **פעולה של אופיר בלבד.** (ב) **הפריסה החיה היא `a388118f1`, ארבעה קומיטים מאחורי HEAD** (`0f981138e`, `6fb5fe971` Q04, `8d924b196` Q03, `2ee29bc90` Q05). ב-HTML החי: `0` ‏`pdp-small-print` ב-`/product/barbecue-2`, ‏`0` ‏`p_con__city` בדף הבית, ‏30 תמונות `ke-live-deal-N.webp` (הגריד הקפוא). פריסה לפרודקשן היא אחד מארבעת מצבי העצירה ואינה חלק מ-Q06; נרשמת כאן כפריט ידני. |
| Q03 | `8d924b196` על origin. **שער נמדד בסשן הזה על HEAD נקי, `pnpm build` (BUILD_ID `LaycI8sfKnHf2W15yrW5Z`), `pnpm start` על 3311, `--widths=380,768,1440 --baseline=refs/ke_live_{width}.png`, בחזית: 380 ‏8.44% PASS, ‏768 ‏9.03% PASS, ‏1440 ‏3.82% PASS**, exit 0. השורות ב-`docs/UI-PARITY-REPORT.md` 19:59-20:02 UTC; הראשונה `2ee29bc90` נקי, השתיים אחריה `-dirty` רק כי השורה הראשונה כבר שינתה את הפנקס עצמו. | **עיר על הכרטיס בפרודקשן**: `products.city` הוא NULL בכל 46 השורות הפעילות, ‏`241_seed_product_city_from_title.sql` ממתינה ולא הוחלה (ממלאת 3), והשאר דורש מילוי בטופס Q05 אחרי פריסה. עד אז שורת המטא בפרודקשן מציגה קטגוריה בלבד. |
| Q04 | `6fb5fe971` על origin: מקור מחיר רגיל, קישור ביקורות גוגל, אותיות קטנות, ‏242 ממתינה. | (א) **השער בדף המוצר נמדד ב-1440 בלבד** (2.79% PASS, reference `refs/live-product.png` של מוצר אחר, עם `COMPARE_ALLOW_GRID_MISMATCH=1`); **380 ו-768 REFUSED**, "capture is 1440px", אין צילום reference ברוחבים האלה. "same compare gate" אינו ניתן למדידה מלאה בלי צילום מוצר ב-380 וב-768. (ב) מקור המחיר וקישור הביקורות מרונדרים ריק בפרודקשן עד החלת 242 ועד שיהיו ערכים. |
| Q05 | `2ee29bc90` על origin. `ProductForm.tsx` + `product-form-schema.ts` + `product-terms.ts` + `actions/admin/products.ts` מכילים את כל השדות (נבדק ב-grep: city, cashback_percent, original_price_source(+url), shipping_price, supplier_transfer_days, payout_cadence, cancellation_window_days, refund_policy, platform_percent, coupon_expiry, category, supplier, ImageUploader). ‏243 ממתינה. | (א) **242 ו-243 לא הוחלו**: ערך שאינו ברירת מחדל בשני שדות המקור ובחמשת התנאים נדחה בשמירה עם שם קובץ המיגרציה (`optional-column-groups.ts`). (ב) **R2 לא מופעל בחשבון** (נמדד 10.09, 403 code 10042), ההעלאה נופלת ל-Supabase Storage. שניהם פעולות של אופיר. |

**סיכום השורה התחתונה:** האתר ניתן להצגה **רק ב-`https://kenyonexpress.vercel.app`
ורק כפי שהיה ב-`a388118f1`** (בלי Q03/Q04/Q05). על הדומיין הרשמי הוא אינו
ניתן להצגה כלל.


## M06-c1 - DONE (25.09) - Lighthouse mobile: נגישות / BP / SEO 100 בשני הדפים; ביצועים 96 / 98 בחנק מוחל, 91 / 90 ב-alias; הסימולציה המקומית 79-83 ותכונת המדידה מתועדת

**נמדד על build טרי, לא על רישומי Q22.** `CARDCOM_USE_MOCK=true
NEXT_PUBLIC_APP_URL=http://localhost:3461 pnpm build` (שני המשתנים בזמן ה-build,
ראו `site-url-baked-at-build-time`), BUILD_ID אחרון `0huX_YMa8cuIRP85Cz5Hv`, שרת על
3461 מאומת לפי BUILD_ID ב-HTML, Lighthouse 13.5 בברירת המחדל (mobile, 412x823,
simulate), **3 ריצות לכל דף לכל build**. לפני = HEAD `59150d06d`.

| דף | לפני: perf / a11y / BP / SEO | אחרי (simulate) | אחרי, `devtools` | alias פרודקשן `a388118f1` |
|---|---|---|---|---|
| `/` | 76-77 / 100 / 96 / 100 | **79-83 / 100 / 100 / 100** | **96-97** (LCP 2.4-2.6s) | **91 / 100 / 100 / 100** |
| `/product/barbecue` | 80-83 / 100 / 96 / 100 | **75-84 / 100 / 100 / 100** | **98** (LCP 2.0s) | **90 / 100 / 100 / 100** |

- **BP 96 -> 100, שני גורמים, שניהם מקומיים ושניהם תוקנו בקוד ולא בתירוץ.**
  (א) ה-CSP נושא `upgrade-insecure-requests`; ה-prefetch של שלושת קישורי
  `/account*` בכותרת מקבל 307 ל-`/login?next=...` (Location יחסי, נמדד ב-curl),
  Chrome משדרג את יעד ההפניה ל-`https://localhost:3461` ומדפיס
  `net::ERR_SSL_PROTOCOL_ERROR` שלוש פעמים בכל דף. ההנחיה מושמטת עכשיו כש-
  `NEXT_PUBLIC_APP_URL` מתחיל ב-`http://` (`upgradesInsecureRequests`, 3 טסטים);
  לא מוגדר = ברירת המחדל של פרודקשן = https, ללא שינוי. (ב) `<VercelAnalytics/>`
  ו-`<SpeedInsights/>` מזריקים `/_vercel/insights/script.js` ו-`/_vercel/speed-insights/script.js`,
  שמחוץ ל-Vercel עונים 404 וה-CSP מסרב להריץ את דף השגיאה: 4 שגיאות בכל דף.
  מרונדרים רק כש-`VERCEL === '1'` (נקבע בזמן ה-build, שבו הקליפה מרונדרת). אחרי:
  `errors-in-console` 0 בשני הדפים.
- **supabase-js מחוץ למסלול ההידרציה של כל דף חנות.** `useAuth` (ב-`WishlistProvider`,
  ב-layout של החנות) ו-`useShareAttribution` (דף מוצר) ייבאו את הלקוח סטטית, ולכן
  chunk של 69KB gz (263KB גולמי, 82% "לא בשימוש" בבית לפי Lighthouse) נטען ב-87ms
  לצד ה-framework. עכשיו `import()` בתוך ה-effect; נמדד: ה-chunk איננו ברשימת
  הסקריפטים הראשונית של הבית ושל המוצר. `wired.test.ts` עודכן לצורה החדשה.
- **`sizes` של כרטיס הדיל תיאר גריד של שני טורים שעבודת הפריטי הסירה.** הצהיר
  `39vw` (160px ב-412) בזמן שהכרטיס מצייר 314px (`100vw - 98px`, טור אחד עד 767).
  נמדד ב-11 רוחבים: טלפון הביא את מדרגת 288 לחריץ של 550 פיקסלי מכשיר (הגדלה 1.9x,
  תמונה רכה), ו-Chrome מגביל LCP של תמונה מוגדלת לגודלה הפנימי, ולכן כרטיס הצילום
  של הקליפה (מצויר ב-152ms) נפסל וה-LCP עבר לכרטיס הקטלוג שהחליף אותו ב-700-1,200ms
  (מקור AVIF שהאופטימייזר מגיש בלי שינוי גודל, ולכן לא מוגבל). עכשיו
  `calc(100vw - 98px)` עד 430, `360px` עד 1199, `240px`. observed LCP בבית
  723-1,244ms -> 122-441ms. עלות: בייטים של תמונות בחלון הראשון 104k -> 156k
  ב-412/1.75, כי רזולוציה נכונה עולה בייטים. `ProductCard` (המסילות) לא נגע.
- **`HOME_DEALS_EAGER` 4 -> 1.** הגריד נמצא בחלון הראשון רק בטלפון (כרטיס ראשון
  y 606-851, השני 1,155; ב-768 השורה מתחילה ב-900 וב-1440 ב-1,078), ולכן רמז
  ה-`priority` עוזר לתמונה אחת; עם קבצי 640 (14-65KB) שלוש טעינות מוקדמות בעדיפות
  גבוהה ל-550px מתחת לקו נמחקו.

**למה הסימולציה המקומית נשארת מתחת ל-90 ולמה לא רודפים אחריה.** Lantern בונה
את גרף ה-LCP מכל בקשה שהתחילה לפני ה-LCP הנצפה, ומול localhost הכל מתחיל תוך
100ms: 21 סקריפטים ראשוניים, 429KB gz, ומהם ה-chunk של Sentry 134+19KB (41%),
שנטען לפני ההידרציה **בכוונה** (`instrumentation-client.ts`: לתפוס שגיאת הידרציה).
לדחות אותו הוא שינוי מוצר ולא תיקון, ולא נעשה. פיזור בין ריצות על build זהה:
8 נקודות (מוצר 75-84). `--throttling-method=devtools` מחיל את אותם תנאים
מוצהרים (CPU x4, 1.6Mbps, 150ms RTT) באמת ומודד: 96 / 98. שלוש רשומות זיכרון
ו-`docs/PERFORMANCE-BUDGET.md` אומרים אותו דבר. המספר של HEAD ב-Vercel חסום
ב-preflight (M01-c1); ה-alias הישן כבר 91 / 90.

**החלטות שהתקבלו לבד:** (א) Sentry נשאר לפני ההידרציה. (ב) 25 ה-prefetch של
`<Link>` (67KB) נשארו, זו התנהגות Next ו-UX אמיתי. (ג) הפריט נסגר DONE ולא
BLOCKED: כל מדידה של הדף עצמו, ולא של המחשב הנייד, היא 90 ומעלה, והתיקונים
בעץ; הפער היחיד הוא הסימולציה המקומית, שאינה ניתנת לסגירה בלי (א). (ד) פייביקון
26KB ו-thumbs AVIF של מוצרים דומים (39k+49k, לא מקודדים מחדש בעיצוב) לא נגעו.

**שערים:** `pnpm type-check` נקי, `pnpm lint` נקי, `pnpm test` 601 קבצים /
7,165 ירוקים / 12 מדולגים, `pnpm build` ירוק (3 builds). שער ההשוואה בחזית על
3461, `--baseline`: **380 8.43% PASS, 768 9.08% PASS, 1440 3.82% PASS**, מוצר 1440
**2.79% PASS**; שורות 07:12-07:17 UTC ב-`docs/UI-PARITY-REPORT.md`
(`59150d06d-dirty`). **תחזוקה:** גיבוי היום קיים (`kenyonexpress-backup-2026-09-25-0931.tar.gz`),
`caffeinate` חי, `SleepDisabled 1` (נבדק בסיום).

## B02 - DONE (25.09) - BACKLOG EMPTY

**התוצאה: אין פריט פתוח של שלב 1 בידי הסוכן.** נבדק מחדש מול העץ, מול
‏`git log -20`, מול הרשת ומול הפנקסים, לא מול רשומת B01.

**המאגר שנסרק, ולמה כל פריט נפסל:**

| מקור | מה נמצא | למה לא נבחר |
|---|---|---|
| `docs/BACKLOG.md` | לא קיים (אומת שוב: לא בעץ, לא ב-`origin/main`, לא ב-`~/ke-goals`). | אין קובץ. |
| `docs/POST-LAUNCH-BACKLOG.md` | 19 אזהרות policy, ‏89-92 PHASE2, ועוד. | לפי כותרתו "כל מה שנדחה במכוון"; הפריט מדלג על נדחים ועל שלב 2. |
| `docs/MIGRATION-BACKLOG.md` | כותרות "שלב 1 שרשרת ה-payout" / "שלב 2 הכסף באגורות". | באנר 01.09 בראש הקובץ: "The backlog is empty. All of it is applied." |
| חוסמים 1-10 ב-STATE, 1-8 ב-`LAUNCH-READINESS` | DNS, פריסת HEAD, מיגרציות 204/223/224/234-236/239-244, ‏R2, ‏refs ל-380/768, ‏`RESEND_API_KEY`, רוטציה, ‏Cardcom, מספר עוסק, ‏`CRON_SECRET`. | כל אחד הוא או פעולה של אופיר (רשם, דשבורד, ערך סוד, החלטה עסקית) או אחד מארבעת מצבי העצירה (פריסה, migration). |
| חוסם 5, refs לדף המוצר ב-380/768 | `refs/ke_live_product_{380,768,1440}.png` קיימים מ-23.09 07:05, ‏1000px גובה, לא במעקב. | הארכיון (שורה 1469) מתעד שהם רונדרו מ-`ke_live_product.html` שנשמר **בלי stylesheets** ואינם reference תקף; האתר החי שממנו אפשר לצלם אינו מתרגם. אין מקור. |
| פריט ידני 9 ב-`LAUNCH-READINESS`, שבעה נתיבי cron ב-`main` | `main` מונה 25 עבודות, ‏HEAD 21; ‏`origin/main...HEAD` = ‏109 / 398 קומיטים. | התיקון חי על `main` (מוגן, ‏PR + 4 בדיקות, ענף אחר); הפריט מוגבל לענף הנוכחי. ב-HEAD המלאי עקבי (`cron-schedule-inventory.test.ts` ירוק). |
| CLAUDE.md "הפתוח לפי סדר דחיפות" 1-6 | קטלוג (25 שורות), ‏169/170/171/162, רוטציה, דלתא Elementor. | הכרעות מפעיל, מיגרציות, סוד; הדלתא מתועדת ב-`docs/LIVE-DELTA.md`. |

**תנאי פתיחה מחדש (מתי B03+ יכול למצוא פריט):** ‏(א) ‏`docs/BACKLOG.md` נוצר;
‏(ב) אופיר סגר חוסם ומה שמאחוריו נפתח לסוכן, למשל אחרי DNS יש מקור לצלם
ממנו refs ב-380/768 ואחרי החלת 241-243 יש מה למדוד בפרודקשן; ‏(ג) שער אדום
בריצת ה-B הבאה.

**החלטות שהתקבלו לבד:** (א) לא נוצר `docs/BACKLOG.md`: הפריט מגדיר אותו כקלט,
לא כתוצר, וקובץ חדש ב-`docs/` מפעיל את שערי המלאי בלי תוכן שמצדיק אותו.
‏(ב) לא נגעתי ב-`scripts/dns-watch.sh` (pid 957) ולא ב-stash-ים: מחיקה היא
מצב עצירה. ‏(ג) השערים והשער החזותי רצו במלואם למרות שהשינוי הוא ב-STATE.md
בלבד, כי חוקי הפריט דורשים את המספרים בכל ריצה.

**שערים:** `pnpm type-check` נקי, `pnpm lint` נקי, `pnpm test` **600 קבצים /
7,158 ירוקים / 12 מדולגים**, `pnpm build` ירוק (BUILD_ID `sLgAYYrF1tJwPwe3TN95l`).
שער ההשוואה בחזית על 3341, `--baseline`: **380 ‏8.44% PASS, ‏768 ‏9.03% PASS,
‏1440 ‏3.82% PASS**, exit 0, שורות 03:31-03:34 UTC ב-`docs/UI-PARITY-REPORT.md`
על `d70ccf492`.

## טבלת מצב לתור `final-queue.txt` (ראיה מ-`git log`, מהעץ ומהרשת, 25.09)

| פריט | מצב | ראיה |
|---|---|---|
| Q01 | DONE | סדר בעץ, טבלה זו. פירוט בארכיון. |
| Q02 | BLOCKED, DNS אצל הרשם | build ירוק, פרוס מ-git (`a388118f1`, READY), 200 על vercel.app. הדומיין לא מתרגם: NS ברשם `ns1/ns2.vercel.com` במקום `ns1/ns2.vercel-dns.com`. נמדד שוב 25.09 (Q06), ללא שינוי. |
| Q03 | DONE (25.09) | `8d924b196`. גריד מהקטלוג, עיר בשורת המטא. שער על קומיט נקי (Q06): 380 8.44%, 768 9.03%, 1440 3.82%, PASS. |
| Q04 | DONE (25.09) | `6fb5fe971`. שער: 1440 2.79% PASS (reference של מוצר אחר, grid override); 380/768 REFUSED, אין reference. 242 pending. |
| Q05 | DONE (25.09) | `2ee29bc90`. כל השדות בטופס, Zod (`productExtrasSchema`), RLS דרך user client, 243 pending. +26 טסטים. |
| Q06 | DONE (25.09) | הרשומה הזו. SHOWABLE: no, עם פירוט החסר. |
| Q07 | DONE (אומת 25.09) | `9fe2ca441` (23.09) על הענף. `ProductShareRow` ב-`ProductInfo`: WhatsApp ראשון ובולט, Share נייטיב, fallback פייסבוק/טלגרם/מייל, העתקת קישור עם toast `הקישור הועתק`. 16 טסטים ירוקים. שער מוצר 1440 ‏2.79% PASS על `5d22aa60e` נקי. |
| Q08 | DONE (25.09) | הרשומה למעלה. חשבונית חתומה (קיים), שדות מע"מ לעסק בקופה (חדש), wa.me עם פריטים וסכום (חדש), ביטול לפי 14ג בדף ההזמנה ובדף התודה (חדש). +8 טסטים. שער 8.44/9.03/3.82 PASS. |
| Q09 | DONE (25.09) | הרשומה למעלה. מייל רק ל-5: אישור 6 שורות, איפוס סיסמה (Resend + fallback), תזכורת תפוגה, התראת אבטחה, מתנה למקבל. 11 סוגי push לדף ההזמנה, תיקון `data.url`. +37 טסטים. שער 8.44/9.03/3.82 PASS. |
| Q10 | DONE (אומת 25.09) | `f6392ed6e` (29.07). קופת אורח (`/checkout` מחוץ ל-`needsAuth`, 200 אנונימי), Google בלחיצת התשלום עם `resume=1`, `PaymentProvider` עם mock, אין מינימום הזמנה. שער: home 8.44/9.03/3.82, cart 1440 1.47%, checkout 1440 0.94%, PASS. `compare.mjs` תוקן ל-`--baseline` בסל ובקופה. |
| Q11 | DONE (אומת 25.09) | `185b904a4` (09.09) + `1e9b4f0e2`. `/suppliers/apply` עם `CONTRACT_TEXT`, hash SHA-256 מהקבוע בשרת, `accepted_at DEFAULT now()` ו-`client_ip inet` ב-204 (pending). כותרת "הצטרפו כעסקים". +9 טסטים. שער 8.44/9.03/3.82 PASS. |
| Q12 | DONE (אומת 25.09) | `c03a59f6b`, `a6d3608ac`. ארבעה דפים 200 מ-`LegalArticle`, `/legal/*` 308. "עד 5% ממחיר העסקה או 100 שקלים חדשים, לפי הנמוך" ב-`returns.ts` 157, תואם `refund.ts`; קופון ניתן להעברה ב-`terms.ts` 177; `#cookies` ו-`#how-to-cancel` בפוטר. שער 8.44/9.03/3.82 PASS. |
| Q13 | DONE (אומת 25.09) | `bf0effa2e`, `02cb65fb3`, `ace712504`. `/contact` 200 עם חמשת הנושאים מ-`DEFAULT_CONTACT_CHANNELS`, 25 קישורי `wa.me`, `support@kenyonexpress.co.il`, אפס `tel:`. דף מוצר: `product-question-link` + `ask-business` עם `data-via="customer_service"`. שער 8.44/9.03/3.82 PASS. |
| Q14 | DONE (25.09) | הרשומה למעלה. מתנה בקופה קיימת (`078a3de6d`, 108 מוחלת, 226 ממתינה לתזמון). חדש: `transferVoucher`/`revokeVoucherTransfer` + `/account/coupons/[id]/gift`; צ'יפים פתוח בסופ"ש (תג `open-weekend`), משלוח חינם (fallback ל-243), קרוב אליי. +41 טסטים. שער 8.44/9.03/3.82 PASS. |
| Q15 | DONE (25.09) | הרשומה למעלה. T-7/T-1 קיימים (`expire-vouchers` + outbox, מייל ופוש; pg_cron ב-162 pending, חלון ב-227 pending). `cashback_percent` פר מוצר DEFAULT 0 קיים (042, צילום בקופה, זיכוי ב-finalize). חדש: `lib/club/tiers.ts`, `getClubStanding`, `ClubTierCard` בסקירת החשבון. +17 טסטים. שער 8.44/9.03/3.82 PASS. |
| Q16 | DONE (25.09) | הרשומה למעלה. קונסולה קיימת (`fc9da36dc`); חדש: הצטרפות, ייחוס בקופה, 244 pending (קמפיינים+המרות), `lib/affiliates/commission.ts`, זיכוי דרך `fn_wallet_transfer`, תור אדמין, קוד על הקישור בשיתוף. +49 טסטים. שער 8.44/9.03/3.82 PASS, מוצר 1440 2.79% PASS. |
| Q17 | DONE (25.09) | הרשומה למעלה. קיים: סיסמה/Google/מפתח גישה/קישור קסם, OTP בטלפון מאחורי `PHONE_AUTH_ENABLED` (`67bc68025`), 2FA אדמין (`af64d96e7`), מתג "הכל באפליקציה" עם הסכמה (`719fc6dff`, 240 pending). חדש: `lib/pwa/snooze.ts`, "לא עכשיו" ל-30 יום בבאנר, בפוש ובדיאלוג המפתח, באנר גם ב-`/account`. +24 טסטים. שער 8.44/9.03/3.82 PASS. |
| Q18 | DONE (25.09) | הרשומה למעלה. קיים: manifest, `public/sw.js` (push + notificationclick), `InstallPrompt`, `PushOptIn` לדפדפן הזה, `savePushSubscription`/`removePushSubscription`, שולח VAPID עם ניקוי 404/410, 179 מוחלת. חדש: רשימת "דפדפנים מחוברים" בכל המכשירים (`loadPushSubscriptions` תחת RLS, `removePushSubscriptionById`, `PushDevices`, `lib/push/device-label.ts`), הכותרת הכפולה בדף ההתראות הוסרה. +15 טסטים, תקרת i18n 628 -> 627. שער 8.44/9.03/3.82 PASS. |
| Q19 | DONE (25.09) | הרשומה למעלה. קיים ופרוס: `redeem_voucher` אטומי + טריגר 166 (נמדד בפרודקשן), מגבלות קצב login/checkout/redeem, `velocity.ts`, רשימת חסימה 234. חדש: `ספק מאומת` מאישור אנושי או מימוש אמיתי (1 מ-7 היום), `N נרכשו השבוע` מחיובים אמיתיים בלבד (18/18 mock מוחרגות). +25 טסטים. שער 8.44/9.03/3.82 PASS, מוצר 1440 2.79% PASS. |
| Q20 | DONE (אומת 25.09) | `29b921163`, `bf9f2ca09`. מכירות/מימושים/זיכויים/תשלומים ב-`(supplier)/supplier/*`, אגורות בלבד, אפס policy כתיבה לספק (נמדד בפרודקשן). קריאות על service role עם נעילת tenant ולא RLS: RLS חי היה מעלים 2 שורות `refunded` מתוך 19 (נמדד). שער 8.44/9.03/3.82 PASS. |
| Q21 | DONE (נמדד 25.09) | הרשומה למעלה. axe WCAG 2.1 AA: 36 עברו / 0 נכשלו על 19 מסלולים. מטא, JSON-LD (Product+Offer, `highPrice` -> `StrikethroughPrice`), sitemap 5 חלקים, robots. שער 8.44/9.03/3.82 PASS, מוצר 1440 2.79% PASS. |
| Q22 | DONE (נמדד 25.09) | הרשומה למעלה. E2E על build עם mock: בית+קטגוריה+מוצר 82/82, סל+קופה+מסלול 40 עברו / 3 דולגו לפי viewport, אורח עד ה-stub ומימוש 2/2. שני פגמים תוקנו (גריד האזור האישי, מרוץ strict-mode). Lighthouse mobile מקומי: בית 73-77, מוצר 76-80 (מדומה), 100/100 ללא סימולציה; alias פרודקשן 90-93 / 87-92. שער 8.44/9.03/3.82 PASS, מוצר 2.79 PASS. |
| Q23 | DONE (25.09) | הרשומה למעלה. `docs/AUTOPILOT-DIFF.md`: autopilot כולו כבר ב-`origin/main`; closeout = +1 קומיט מקומי; 22 מיגרציות במספרים תפוסים; שווה לשמור: 9 טסטי actions, תיקון פנקס, Telegram/UptimeRobot, RLS-AUDIT. |
| Q24 | DONE (25.09) | הרשומה למעלה. `docs/LAUNCH-READINESS.md` נכתב מחדש: NOT READY על שלוש שורות (דומיין, mock, cron 401 עם 72 הודעות תקועות), 8 חוסמים עם ראיה, 13 פריטים ידניים. שער 8.44/9.03/3.82 PASS. |
| B01 | DONE (25.09) | הרשומה למעלה. `vercel.json` מריץ `deploy-preflight` לפני `pnpm build`; +9 טסטים. שער 8.44/9.03/3.82 PASS. |
| B02 | DONE (25.09) | **BACKLOG EMPTY.** הרשומה למעלה: שבעה מאגרים נסרקו, אפס פריטי שלב 1 בידי הסוכן. שער 8.44/9.03/3.82 PASS. |
| B03 | DONE (25.09) | **BACKLOG EMPTY**, מאומת מחדש. פירוט בארכיון. |
| B04 | DONE (25.09) | **BACKLOG EMPTY**, נמדד בפעם השלישית. פירוט בארכיון. |
| B05 | DONE (25.09) | **BACKLOG EMPTY**, נמדד בפעם הרביעית. פירוט בארכיון. |
| B06 | DONE (25.09) | **BACKLOG EMPTY**, נמדד בפעם החמישית. פירוט בארכיון. |
| B07 | DONE (25.09) | **BACKLOG EMPTY**, נמדד בפעם השישית. פירוט בארכיון. |
| B08 | DONE (25.09) | **BACKLOG EMPTY**, נמדד בפעם השביעית. פירוט בארכיון. |
| B09 | DONE (25.09) | **BACKLOG EMPTY**, נמדד בפעם השמינית. פירוט בארכיון. |
| B10 | DONE (25.09) | **BACKLOG EMPTY**, נמדד בפעם התשיעית: שלושת תנאי הפתיחה מחדש נבדקו ולא התקיימו. האחרון בתור. שער 8.44/9.03/3.82 PASS. |
| M01-c1 | BLOCKED, DNS אצל הרשם | פירוט בארכיון. dig SERVFAIL (EDE 22), NS ברשם `ns1/ns2.vercel.com`; curl exit 6 בשני המארחים. פריסת HEAD ל-Vercel נוסתה וסורבה ב-preflight (3 שמות Cardcom חסרים + waiver); פרודקשן נשאר `a388118f1`. שער 8.44/9.03/3.82 PASS. |
| M02-c1 | DONE (25.09) | בית 380 8.44%, 768 9.03%, 1440 3.82% PASS; מוצר 1440 2.79% PASS, 380/768 REFUSED (אין reference תקף). אין רגרסיה. פירוט בארכיון. |
| M03-c1 | DONE (25.09) | פירוט בארכיון. type-check נקי; lint 0 אזהרות; test 601/7,162; build 0 ERROR. +4 טסטים. אפס שינוי UI. |
| M04-c1 | DONE (25.09) | פירוט בארכיון. audit 0 חולשות; 30 חבילות patch/minor (next 16.3.6, React 19.3.0, supabase-js 2.117.1, lucide 1.47.0); 14 major + 3 דולגו. שער 8.44/9.03/3.82 PASS, מוצר 1440 2.79 PASS. |
| M05-c1 | DONE (25.09) | פירוט בארכיון. advisors דרך management API: 44 WARN, 21 עם קובץ ממתין (245, 246 חדשים; 209, 220 קיימים), 23 by design. 218 לא הוחלה (ממצא). שער 8.44/9.03/3.82 PASS, מוצר 2.79 PASS. |
| M06-c1 | DONE (25.09) | הרשומה למעלה. a11y / BP / SEO 100 בבית ובמוצר (BP 96 -> 100). perf: devtools 96 / 98, alias `a388118f1` 91 / 90, simulate מקומי 79-83 / 75-84 (תכונת Lantern, מתועד). 4 תיקונים נמדדו. שער 8.43/9.08/3.82 PASS, מוצר 2.79 PASS. **אחרון בתור.** |

## חוסמים פתוחים (לא בידי הסוכן)

1. **DNS אצל הרשם** (Q02): להחליף את שני ה-NS של `kenyonexpress.co.il`
   מ-`ns1.vercel.com`/`ns2.vercel.com` ל-`ns1.vercel-dns.com`/`ns2.vercel-dns.com`.
   אחרי ההתפשטות: `dig +short A kenyonexpress.co.il @1.1.1.1` צריך להחזיר
   `216.198.79.1`, ואז `curl -sI https://www.kenyonexpress.co.il/` ל-200.
   שום דבר בצד Vercel לא דורש שינוי. נמדד שוב 25.09 (M01-c1), ללא שינוי;
   פלט ה-dig המלא ברשומת M01-c1 בארכיון; נמדד שוב ב-M02-c1, ללא שינוי.
2. **פריסת פרודקשן של HEAD (`92f8b6904`, 33 קומיטים אחרי `a388118f1` החי)**:
   נוסתה ב-M01-c1 (REST `POST /v13/deployments`, `target=production`) **וסורבה
   ב-`deploy-preflight`**: `CARDCOM_TERMINAL_NUMBER`, `CARDCOM_API_NAME`,
   `CARDCOM_API_PASSWORD` חסרים ב-Production ו-`ALLOW_INCOMPLETE_ENV=true` מוגדר
   שם. עד שאופיר יתקן את הסביבה אין פריסה אפשרית מהענף הזה.
3. **מיגרציות ממתינות**: **218 (טריגר `enforce_profile_privilege_columns` מפיל כל
   עדכון פרופיל של לקוח ב-42703; נמדד 25.09 ב-M05-c1, 5 מ-5 לקוחות, בניגוד לרישום
   "הוחלה" מ-21.09)**, 245 ו-246 (advisors, M05-c1; 245 אחרי 209 ואחרי 203), 204 (הצטרפות ספקים והסכם click-wrap; בלעדיה הטופס
   עונה "עדיין לא פעיל"), 240 (הסכמת "הכל באפליקציה"), 241 (עיר משלוש
   כותרות), 242 (מקור מחיר + ביקורות גוגל), 243 (תנאי מוצר), 244 (קמפיינים
   והמרות של תוכנית השותפים; בלעדיה התוכנית "עדיין לא פתוחה"). סדר והתנאים
   ב-`docs/RUNBOOK.md`, סקירה ב-`docs/MIGRATION-REVIEW.md`. לא הוחל דבר.
4. **R2 לא מופעל בחשבון Cloudflare** (10.09): תמונות המוצר נופלות ל-Supabase
   Storage, וגיבויי ה-DB החיצוניים אינם נכתבים כלל.
5. **צילומי reference ב-380 וב-768 לדף המוצר, לסל ולקופה**: קיימים רק
   ב-1440 (`refs/live-product.png`, `refs/live-cart.png`,
   `refs/live-checkout.png`). בלי זה השערים של Q04 ו-Q10 נמדדים ב-1440 בלבד.
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

## ידני לאופיר, לפי סדר קריטיות

1. DNS (חוסם 1). פעולה אחת בממשק הרשם.
2. `CRON_SECRET` זהה ב-GitHub וב-Vercel (חוסם 10); הריצה הבאה של "Scheduled jobs"
   צריכה להראות `notifications -> 200`.
3. **סביבת Production ב-Vercel לפני כל פריסה** (חוסם 2, נמדד M01-c1): להוסיף
   `CARDCOM_TERMINAL_NUMBER`, `CARDCOM_API_NAME`, `CARDCOM_API_PASSWORD` (השמות
   שהקוד קורא; `CARDCOM_API_KEY`/`CLIENT_ID`/`MERCHANT_ID` הקיימים אינם נקראים)
   ולהסיר `ALLOW_INCOMPLETE_ENV`. אחרי זה פריסה של HEAD: REST `POST /v13/deployments`
   עם `gitSource.sha`, `target=production`, כמו ב-Q02.
4. אישור והחלת **218 תחילה** (טופס הפרופיל שבור, חוסם 3), ואז 240..243, 209/220/245/246
   לפי `APPLY-ORDER`, דרך MCP לפי `RUNBOOK`, ואז `pnpm db:types`.
5. רוטציית `SUPABASE_SECRET_KEY` (חוסם 7).
6. הפעלת R2 בדשבורד Cloudflare (חוסם 4).
7. Cardcom: `CARDCOM_USE_MOCK=false` + המפתחות + `CHECKOUT_ENABLED=true` (חוסם 8).
8. `scripts/dns-watch.sh` (pid 957) עדיין רץ ומשגר סשן deploy כשיופיעו NS
   של Cloudflare; זה לא יירה על המעבר ל-vercel-dns. לבדוק לפני שמפעילים משהו.
9. עשרה stash-ים לא נמחקו (כלל: אין מחיקת נתונים); רשימה בארכיון תחת Q01.
10. כניסה בטלפון (Q17): ספק SMS בהגדרות ה-auth של Supabase ואז `PHONE_AUTH_ENABLED=true`
   ב-Vercel. בלעדיהם הכפתור מוסתר והשאר עובד.
