RESUME FROM: M17-c37
Updated: 2026-09-28 (סשן `audit/final-audit`, Sonnet 5, פריט M13-c51)

## המשך מ:

## M13-c51 - DONE (28.09): כותרות אבטחה ותקרות — CSP, HSTS, X-Frame-Options, Referrer-Policy, Upstash על login/checkout/redeem: אומת מול build ירוק, שני פערי טסט נסגרו

**הפריט:** אימות CSP, HSTS, X-Frame-Options, Referrer-Policy ותקרות Upstash על
login, checkout ו-redeem. תיקון כל פער שנמצא, עם טסטים. **`RESUME FROM` נשאר
`M17-c37` בכוונה**, כמו ב-M11-c51/M12-c51: מספר זה כבר עמד בעץ העבודה כשהפריט
נפתח, כלומר סשן אחר כבר קידם את התור; הפריט הזה הושלם משום סדר.

**הכותרות: תשתית קיימת ומקיפה, נבדקה בפועל ולא רק בקונפיג.** `next.config.ts`
+ `src/lib/security/frame-policy.ts` כבר בונים CSP תלוי-נתיב, HSTS
(`max-age=63072000; includeSubDomains; preload`), X-Frame-Options תלוי-נתיב,
Referrer-Policy (`strict-origin-when-cross-origin`), COOP/CORP ו-Permissions-Policy,
עם שער יחידה (`frame-policy.test.ts`, `csp-turnstile.test.ts`,
`frame-policy-matches-provider.test.ts`). מה שחסר היה אימות שהן אכן יוצאות על
תגובה אמיתית: `pnpm build` + `pnpm start` על 3517, ואז `curl -sD -` על `/`,
`/login`, `/checkout`, `/redeem/abc` — כל ארבע הכותרות נוכחות בכל ארבעתם, ועל
`/checkout/frame-return` X-Frame-Options הופך ל-SAMEORIGIN ו-frame-ancestors
ל-`'self'` כמתועד (התיק היחיד שמותר להיפרם, לצורך חזרת Cardcom).

**Upstash: `UPSTASH_REDIS_REST_URL` אינו מוגדר באף סביבה שהריפו רואה
(`docs/RATE-LIMITS.md` §7), כך שהמסלול החי הוא Postgres fallback, במכוון
(כשל פתוח).** login, checkout ו-redeem שלושתם כן קוראים ל-rate limit:
`login:{ip}` ו-`login-account:{email}` ב-`auth.ts`, `begin_checkout:user:{id}`
(10/דקה) ב-`checkout.ts`, `redeem:{ip}` (60/שעה) ב-`redeem/[token]/page.tsx`.

**שני פערי טסט נמצאו ונסגרו — שלושת הראוטים היו "רשומים" בתיעוד אבל
לא נבדקו על ענף הדחייה:**

1. `src/server/actions/auth.test.ts` לא היה קיים. נוסף: דוחה על תקרת ה-IP
   ולפני שהחשבון נבדק, ודוחה על תקרת החשבון גם כשה-IP מתחת לתקרה (עם
   lower-case על המייל).
2. `checkout.test.ts` נעל את `checkRateLimit` ל-`async () => true` קבוע — ענף
   הדחייה של `begin_checkout` לא נבדק אף פעם. הוחלף ב-mock נשלט
   (`vi.hoisted`), ונוסף טסט שמוודא סירוב לפני שנוגעים בעגלה/כתובת/מוצר
   (רק קריאת `feature_flags` רצה קודם).
3. `src/app/redeem/[token]/page.test.tsx` לא היה קיים. `RedeemTokenBody`
   יוצא עכשיו לבדיקה ישירה (היה רק ברירת מחדל); נוסף טסט שמוודא סירוב לפני
   בדיקת החתימה, ושאין קריאה כלל כשאין כתובת לקבוע לפיה.

**`pnpm type-check`, `pnpm lint` (627/627 i18n, 116 he-IL, כל שאר השערים
ירוקים), `pnpm test` (604 קבצים, 7182 עברו) ו-`pnpm build` ירוקים.** לא נדרש
שער השוואה חזותי — אין שינוי UI.

**קבצים:** `src/server/actions/auth.test.ts` (חדש), `payments/checkout.test.ts`
(mock נשלט + טסט), `src/app/redeem/[token]/page.tsx` (export יחיד),
`src/app/redeem/[token]/page.test.tsx` (חדש), `STATE.md`.

**הבא בתור: לפי `RESUME FROM`, M17-c37.**

## M12-c51 - DONE (28.09): SEO — מטא, canonical, og, schema.org Product/Offer, sitemap, robots: אומת מול build ירוק, אין drift

**הפריט:** אימות מטא, canonical, og tags, schema.org Product ו-Offer בדפי מוצר,
טריות ה-sitemap ו-robots. תיקון כל סטייה שנמצאת. **`RESUME FROM` נשאר `M17-c37`
בכוונה**, כמו ב-M11-c51: המספר הזה כבר עמד בעץ העבודה לפני שהפריט הזה נפתח, כלומר
סשן אחר כבר קידם את התור מעבר לכאן; הפריט הזה הושלם משום סדר.

**מה נבדק, מול Q21 (25.09, בארכיון) שכבר בנה את התשתית הזו:** `pnpm build` +
`pnpm start` על 3311, ואז:

1. **שער יחידה**, 9 קבצים / 166 בדיקות: `src/lib/seo/**`, `src/app/sitemap*`,
   `src/app/robots.test.ts`, `src/lib/product-seo.ts` — כולם ירוקים.
2. **`src/__tests__/canonical-coverage.test.ts`, `sitemap-canonicals.test.ts`,
   `sitemap-robots-agree.test.ts`** (95 בדיקות): מוודאים שכל דף ציבורי נושא
   canonical משלו (לא יורש מהשורש), שכל כתובת ב-sitemap עקבית עם ה-canonical
   שלה, ושכל כתובת שה-sitemap פולט גם מותרת ב-`robots.ts` — ירוקים.
3. **`e2e/seo-markup.spec.ts` בזמן ריצה, על ה-build האמיתי (`E2E_BASE_URL=
   http://localhost:3311`, לא `pnpm dev`)**: JSON-LD `Product`+`BreadcrumbList`
   בדף מוצר, canonical מוחלט שמצביע על עצמו, `/products` ו-`/category/*`
   מקבלים canonical יחיד, `/redeem/<token>` ו-`/account/wishlist` נושאים
   `noindex`. 5/5 עברו.
4. **בדיקה ידנית על ה-HTML המוגש** (`curl` על `/product/barbecue`): `<title>`,
   `<meta name="description">`, `<link rel="canonical">` מוחלט, כל שבעת תגי
   `og:*` (כולל `og:image` **מהראוט המיוצר** ולא מתמונת המוצר — התיעוד בקובץ
   מסביר שזו תקלה שכבר קרתה וכבר תוקנה), JSON-LD `Product` עם `offers.price`,
   `priceSpecification` (`StrikethroughPrice`) ו-`availability` הנגזרים
   מאותו נתון שהעמוד מציג, ו-`BreadcrumbList` בית/קטגוריה/מוצר.
5. **`/robots.txt`**: 12 נתיבים אסורים (כולל `/redeem/`, `/coupon/`, `/checkout`,
   `/cart`), שורת `Sitemap:` לאינדקס בלבד. **`/sitemap.xml`**: `<sitemapindex>`
   על חמישה קבצים. **`/sitemap/products.xml`**: 46 כתובות פעילות, `lastmod` לפי
   `updated_at` אמיתי מה-DB (לא שעון-רגע). **`/sitemap/regions.xml`**: 17
   כתובות, תואם את הרישום ב-`docs/STATE-ARCHIVE.md` (SECTIONS 79).

**לא נמצאה סטייה.** אפס שינוי קוד. `pnpm type-check`, `pnpm lint` (627/627
i18n, 116 he-IL, כל שאר השערים ירוקים), `pnpm test` ו-`pnpm build` ירוקים
ללא שינוי בעץ. לא נדרש שער השוואה חזותי — הפריט לא נגע ב-UI.

**קבצים:** אין. שינוי יחיד הוא `STATE.md` (הרשומה הזו) ו-`docs/STATE-ARCHIVE.md`
(העברת הפירוט המלא של M11-c51/Q05b/Q06/M09-c1 לארכיון, כדי להישאר מתחת ל-300
שורות).

**הבא בתור: לפי `RESUME FROM`, M17-c37.**

ההיסטוריה המלאה (Q01..Q24, B01..B10, M01-c1..M11-c51, תור 23.09, וכל מה שקדם)
ב-`docs/STATE-ARCHIVE.md`, החדש למעלה. הקובץ הזה מחזיק רק את מה שחי.


## SHOWABLE: no

פירוט מלא (Q05b/Q06 עם טבלת "מה חסר") בארכיון. אין שינוי ב-M12-c51: Q02 (DNS) עדיין חוסם, ראו "חוסמים פתוחים" למטה.

## טבלת מצב לתור `final-queue.txt` (ראיה מ-`git log`, מהעץ ומהרשת, 25.09)

| פריט | מצב | ראיה |
|---|---|---|
| Q01 | DONE | סדר בעץ, טבלה זו. פירוט בארכיון. |
| Q02 | BLOCKED, DNS אצל הרשם | build ירוק, פרוס מ-git (`a388118f1`, READY), 200 על vercel.app. הדומיין לא מתרגם: NS ברשם `ns1/ns2.vercel.com` במקום `ns1/ns2.vercel-dns.com`. נמדד שוב 25.09 (Q06), ללא שינוי. |
| Q03 | DONE (25.09) | `8d924b196`. גריד מהקטלוג, עיר בשורת המטא. שער על קומיט נקי (Q06): 380 8.44%, 768 9.03%, 1440 3.82%, PASS. |
| Q04 | DONE (25.09) | `6fb5fe971`. שער ב-25.09 בבוקר: 1440 2.79% PASS (reference של מוצר אחר, grid override); 380/768 REFUSED. **ב-Q05b:** 5.65 / 4.95 / 2.92 PASS מול Electro v7, בלי override. 242 pending. |
| Q05 | DONE (25.09) | `2ee29bc90`. כל השדות בטופס, Zod (`productExtrasSchema`), RLS דרך user client, 243 pending. +26 טסטים. |
| Q05b | DONE (25.09) | הרשומה למעלה. Electro v7 single product נלכד ב-380/768/1440 (`refs/electro_product_*`); שער על `barbecue-2` בלי override: 5.65 / 4.95 / 2.92 PASS; בית 8.43 / 9.03 / 3.82 PASS באותו build. `compare.mjs`: guard הגריד לא סופר צד קפוא. SHOWABLE נשאר `no` בגלל Q02. |
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
| M06-c1 | DONE (25.09) | הרשומה למעלה. a11y / BP / SEO 100 בבית ובמוצר (BP 96 -> 100). perf: devtools 96 / 98, alias `a388118f1` 91 / 90, simulate מקומי 79-83 / 75-84 (תכונת Lantern, מתועד). 4 תיקונים נמדדו. שער 8.43/9.08/3.82 PASS, מוצר 2.79 PASS. פירוט בארכיון. |
| M07-c1 | DONE (25.09) | הרשומה למעלה. 241 נתיבים בארבעה תפקידים, 239 PASS / 2 NO DATA / 0 FAIL; אפס שגיאות קונסולה, אפס אזהרות הידרציה, RTL ב-167/167. חמישה פגמים תוקנו (תאריכים בהידרציה, CSP wss, מצלמת הסריקה, תצוגת הבית באדמין, prefetch חשבונית) + הלוגר. שער 8.43/9.03/3.82 PASS, מוצר 2.79 PASS. |
| M08-c1 | DONE (25.09) | **BACKLOG EMPTY**, נמדד בפעם העשירית: `docs/BACKLOG.md` אינו קיים בשום ref; שלושת תנאי הפתיחה מחדש נבדקו ולא התקיימו. אפס שינוי קוד. שער 8.43/9.08/3.82 PASS, מוצר 5.61/4.92/2.99 PASS. |
| M09-c1 | BLOCKED, דמו Electro מסרב | הרשומה למעלה. `--add-to-cart` בסקריפט הלכידה +6 טסטים; `/cart/` ו-`/checkout/` 403 עם seed ובלי, המוצר 200 באותו סשן. חוסם 5 נשאר. שער 8.43/9.03/3.82 PASS, מוצר 5.65/4.95/2.92 PASS, סל 1.47 וקופה 0.94 ב-1440 PASS. |
| M11-c51 | DONE (28.09) | הרשומה למעלה. axe על 121 בדיקות (סבב ציבורי + 80 נתיבים מחוברים בשלושה תפקידים); 77 נכשלו בסבב ראשון, כולם תוקנו (7 סוגי ממצא: `text-gray-400`, `text-black/40`/`50`, `text-brand` כקישור, קישור תלוי צבע, שני `select` בלי שם, `text-red-600`, `text-gray-500`), ממצא אחד נוסף התברר כארטיפקט עכבר-תקוע בבדיקה עצמה ותוקן שם. ‏0 ממצאים נותרים, מאומת בשלוש ריצות נקיות עוקבות. שער 8.43/9.06/3.88 PASS. |
| M12-c51 | DONE (28.09) | הרשומה למעלה. מטא/canonical/og/JSON-LD Product+Offer/sitemap/robots אומתו מול build אמיתי (166 טסטי יחידה, 95 טסטי canonical-coverage/sitemap-robots-agree, 5 e2e על `pnpm start`, בדיקה ידנית על HTML מוגש). אפס drift, אפס שינוי קוד. |

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
