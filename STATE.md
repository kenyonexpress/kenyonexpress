RESUME FROM: M17-c37
Updated: 2026-09-29 (סשן `audit/final-audit`, Sonnet 5, פריט M15-c51)

## המשך מ:

## M15-c51 - DONE (29.09): סנכרון תיעוד — STATE.md, docs/LAUNCH-READINESS.md ו-docs/BACKLOG.md, רשימת "ידני לאופיר" אחת במקום שתיים סוטות

**הפריט:** רענון טבלת המצב בשלושת הקבצים מול `git log` וראיית קוד, ואיחוד
רשימות "ידני לאופיר" לרשימה יחידה בסדר קריטיות, בלי כפילויות. **`RESUME FROM`
נשאר `M17-c37` בכוונה**, כמו ב-M11..M14: המספר הזה כבר עמד בעץ העבודה כשהפריט
נפתח, סשן אחר כבר קידם את התור, והפריט הזה הושלם משום סדר.

**`docs/BACKLOG.md` לא היה קיים.** תשעה פריטים בתור (B02..M08-c1, בארכיון)
מדדו את זה שוב ושוב והחליטו **לא** ליצור אותו, מהסיבה הרשומה ב-M08-c1:
"קובץ חדש ב-`docs/` מפעיל את שערי המלאי בלי תוכן שמצדיק אותו". M08-c1 גם
רשם מראש: "`M15-c1` מבקש לרענן את `docs/BACKLOG.md`; כשיגיע תורו, יצירת
הקובץ תהיה תוצר של אותו פריט ולא של זה" — זה אותו פריט (מספור שונה,
`-c51` במקום `-c1`), וזה עכשיו התוצר שלו.

**מה שהשוואה בין `STATE.md` ל-`docs/LAUNCH-READINESS.md` מצאה: שתי הרשימות
סטו זו מזו, לא רק בניסוח.** רשימת המיגרציות הממתינות בשתי הרשומות "ידני
לאופיר" (25.09 בשתיהן) הייתה **קבוצה שונה של מספרי קבצים** — STATE.md נקב
ב-218, 245, 246, 204, 240-244; LAUNCH-READINESS.md נקב ב-204, 223, 224,
234-236, 239-244 — חפיפה חלקית בלבד, כל אחת חסרה קבצים שהשנייה מנתה. שני
פריטים היו ב-LAUNCH-READINESS.md ונעדרו לגמרי מרשימת הפעולה של STATE.md
(הכרעת 25 שורות הקטלוג, ואי-ההתאמה של `scripts/cron-jobs.json` ב-`main`
מול HEAD). שני פריטים אחרים היו ברשימת ה**חוסמים** של STATE.md אך מעולם לא
עברו לרשימת ה**פעולה** שלו (`RESEND_API_KEY`, שורת ח.פ). כל ארבעת אלה
תוקנו ב-`docs/BACKLOG.md`, שממזג את שתי הרשימות ל-15 סעיפים ומצטט מקור לכל
אחד.

**`docs/BACKLOG.md` כתוב, לא רק נוצר ריק:** 15 סעיפים בסדר קריטיות, כל אחד
עם המקור (STATE.md חוסם N / LAUNCH-READINESS.md שורה/סעיף N) ועם רשימת
המיגרציות המאוחדת (17 קבצים: 204, 209, 218, 220, 223, 224, 234, 235, 236,
239-246 — האיחוד של שתי הרשימות שסטו). `STATE.md` ו-`docs/LAUNCH-READINESS.md`
מפנים אליו במקום לשמור עותק כל אחד.

**`docs-index-gate` ו-`docs-path-audit` תפסו את ההשלכה בפועל, לא רק
תיאורטית.** הקובץ החדש נפל מחוץ ל-`docs/INDEX.md` (282 מסמכים, לא 281) —
תוקן, נוסף לאשכול "Operations, release and infrastructure". ורשומת
`docs/STATE-ARCHIVE.md` שציינה שהקובץ עדיין לא קיים (מ-M08-c1) הפכה לנתיב
תקף — `docs-path-audit --write` הסיר את השורה מהפנקס.

**ראיה שקדמה לפריט הזה, נבדקה ולא נמדדה מחדש:** רשימת המיגרציות שנבנתה ב-
`docs/BACKLOG.md` היא איחוד של רשימות קיימות (STATE.md, `docs/LAUNCH-READINESS.md`,
`migrations/pending/APPLY-ORDER.md`), לא מדידה חדשה מול פרודקשן — הפריט הזה
הוא סנכרון תיעוד, לא ביקורת DB. **מספר הקומיטים שפרודקשן מאחור מ-HEAD עודכן
מ-22 (25.09) ל-47 (`git rev-list --count a388118f1..HEAD`, מקומי בלבד, לא
נבדק מול הפריסה החיה).** הפער בין הענפים (`audit/final-audit` מול
`origin/main`) עודכן מ-396 ל-**421** קומיטים לפנים; הפער ההפוך (autopilot
ב-`main`) נשאר **109**, ללא שינוי.

**`pnpm type-check` נקי, `pnpm lint` נקי (i18n 627/627, he-IL 116, docs-index
282 מסמכים, docs-path-audit 152 ללא dangling חדש), `pnpm test` (604 קבצים,
7182 עברו, 12 דולגו) ו-`pnpm build` ירוקים.** אין שינוי UI, לא נדרש שער
השוואה חזותי.

**קבצים:** `docs/BACKLOG.md` (חדש), `docs/INDEX.md` (שורה + ספירה),
`docs/known-dangling-paths.json` (`docs-path-audit --write`), `STATE.md`,
`docs/LAUNCH-READINESS.md`.

**הבא בתור: לפי `RESUME FROM`, M17-c37.**

## M14-c51 - DONE (29.09): ביצועים, גודל bundle, פלט צנרת התמונות, תגיות ISR וכותרות cache: ממצא אחד תוקן, ממצא כוזב אחד נשלל אחרי בדיקה כפולה

**הפריט:** בדיקת ארבעה תחומי ביצועים ותיקון הרגרסיה הגדולה ביותר שנמצאת. **`RESUME
FROM` נשאר `M17-c37` בכוונה**, כמו ב-M11..M13: המספר הזה כבר עמד בעץ העבודה כשהפריט
נפתח, סשן אחר כבר קידם את התור, והפריט הזה הושלם משום סדר.

**1. גודל bundle: אין רגרסיה, יש שיפור.** מול הבייסליין הכתוב ב-`docs/PERFORMANCE-REPORT.md`
(‏09.09, `b8aac3855`, 331 קומיטים אחורה): ה-JS של הבית ירד מ-382.2kB ל-341.2kB gzip,
קופה מ-384.7kB ל-344.9kB gzip, ובסה"כ 26 chunks ב-405.5kB -> 27 chunks ב-365.9kB.
`scripts/bundle-report.mjs` על build טרי, `pnpm start`.

**2. פלט צנרת התמונות: הממצא ותיקונו.** ‏`CategoryStrip.tsx` (4 אייקוני קטגוריה
100x100px בהירו, שני עותקים מורכבים, דסקטופ ומובייל) השתמש ב-`fill` עם
`sizes={`100px`}`. ‏next/image מקצץ את רשימת ה-srcset רק כשה-`sizes` מכיל יחידת
`vw` שה-regex שלו (`get-img-props.js:getWidths`) מזהה; ערך px גולמי נופל
לרשימה המלאה `imageSizes`+`deviceSizes`: **17 מועמדים, 16w עד 3840w, לאייקון
100x100**. תוקן ל-`width`/`height` מפורשים (בלי `fill`), שמפעיל את ה-branch
הקומפקטי 1x/2x: **2 מועמדים**. נמדד: HTML גולמי של הבית 686,292 -> 673,858
בייט (‏-12,434B, ‏-1.8%), משוכפל על שני builds עצמאיים.

**ממצא כוזב שנשלל בבדיקה כפולה.** ריצת `compare.mjs --page=home` הראשונה
בסשן (על build עם התיקון) החזירה 380px **14.05% FAIL** (תקרה 11%), ונראתה
כרגרסיה מהתיקון. נבדק ביסודיות: **6 ריצות עוקבות על שני builds עצמאיים** (עם
התיקון ובלעדיו, כל אחד built טרי ומופעל מחדש, כל אחד נמדד פי 3 ברצף) נתנו
תוצאה **זהה ויציבה: 8.51% PASS**, בלי יוצא מן הכלל. ה-14.05% היה מדידה חד-פעמית
לא ניתנת לשחזור (כנראה רינדור ראשון על cache קר), לא קשורה לקוד שהשתנה. מצב
סופי עם התיקון: **380 8.51% PASS, 768 9.02% PASS, 1440 3.95% PASS**, כולם ירוקים.

**3. תגיות ISR: לא נמצאה רגרסיה.** `cache-invalidation-gate` נקי. כל פונקציות
קריאת הנתונים של הבית/קטגוריה/מוצר (`lib/homepage/{deals,rails}.ts`,
`category-page.ts`, `product-detail.ts`) עקביות: `cacheLife('hours')` +
`cacheTag(CATALOGUE_TAG)`. **`docs/ARCHITECTURE-PERFORMANCE.md` מתעד ערכי יעד
מיושנים** (`revalidate` 120/300/180 שניות ברמת ה-route) מלפני המעבר ל-Next 16
`cacheComponents`, שדורש `cacheLife`/`use cache` במקום זאת ונכשל build על
`export const revalidate`. המדיניות המיושמת בפועל (`cacheLife('hours')`,
כ-3600/86400 שניות) גוברת על המסמך; המסמך לא תוקן בפריט הזה (תיעוד בלבד,
מחוץ להיקף).

**4. כותרות cache: לא נמצאה רגרסיה הניתנת לתיקון מקומית.** `/images/*` נושא
בפועל את `public, max-age=0, s-maxage=86400, stale-while-revalidate=604800`
המתועד. דפי הבית/מוצר מחזירים `Cache-Control: private, no-cache, no-store...`
תחת `pnpm start` למרות שיש להם shell סטטי (`x-nextjs-prerender:1`). נבדק מול
`node_modules/next/dist/docs/.../ppr-platform-guide.md`: זו התנהגות **צפויה**
עבור "Origin-Only" serving (מה ש-`next start` עושה כברירת מחדל) - ה-shell
וחורי ה-Suspense החיים (‏`StockScarcity`/`BoughtThisWeek` בדף המוצר, מכוונים
להישאר חיים לפי הערת הקוד) מתמזגים לתגובה סטרימינג אחת שלא ניתן לסמן כ-cacheable.
ה-`s-maxage` שמתועד ב-`ARCHITECTURE-PERFORMANCE.md` דורש CDN שמיישם את פרוטוקול
"shell + resume" של Next (Vercel), ולא ניתן לאמת מ-localhost. לא רגרסיה ברת-תיקון.

**`pnpm type-check`, `pnpm lint` (627/627 i18n, 116 he-IL), `pnpm test` (604
קבצים, 7182 עברו) ו-`pnpm build` ירוקים, פעמיים (עם ובלי התיקון, לבדיקת הממצא
הכוזב).**

**קבצים:** `src/components/store/CategoryStrip.tsx`, `docs/UI-PARITY-REPORT.md`
(שורות מדידה, כולל 4 סירובים וריצה חד-פעמית חריגה מהחקירה, נשמרו כרשומה
מדויקת לפי מוסכמת הפנקס), `STATE.md`.

**הבא בתור: לפי `RESUME FROM`, M17-c37.**

**M13-c51 ו-M12-c51 פירוט מלא בארכיון** (`docs/STATE-ARCHIVE.md`): M13-c51 —
CSP/HSTS/X-Frame-Options/Referrer-Policy אומתו על build אמיתי, שני פערי טסט
נסגרו. M12-c51 — SEO (מטא, canonical, og, schema.org Product/Offer, sitemap,
robots), 261 בדיקות, אפס drift.

ההיסטוריה המלאה (Q01..Q24, B01..B10, M01-c1..M13-c51, תור 23.09, וכל מה שקדם)
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
| M13-c51 | DONE (28.09) | הרשומה למעלה. CSP/HSTS/X-Frame-Options/Referrer-Policy אומתו על `curl` מול build אמיתי בארבעה נתיבים; Upstash לא מוגדר, Postgres fallback פעיל; שני פערי טסט נסגרו (`auth.test.ts`, `checkout.test.ts` חדשים). |
| M14-c51 | DONE (29.09) | הרשומה למעלה. Bundle ירד (382.2kB->341.2kB בית), `CategoryStrip.tsx` מ-17 מועמדי srcset ל-2 (HTML -1.8%), ISR ו-cache headers נבדקו ללא רגרסיה בת-תיקון. ממצא כוזב (14.05% חד-פעמי) נשלל בשש ריצות. שער 8.51/9.02/3.95 PASS. |
| M15-c51 | DONE (29.09) | הרשומה למטה. `docs/BACKLOG.md` נוצר כרשימת "ידני לאופיר" יחידה, ממוזגת מ-STATE.md ומ-LAUNCH-READINESS.md; שני חוסרים אמיתיים נמצאו בכל אחד מהם ותוקנו. אין שינוי UI, לא נדרש שער השוואה חזותי. |

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
