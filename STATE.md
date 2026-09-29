RESUME FROM: M02-c53
Updated: 2026-09-29 (סשן `audit/final-audit`, Sonnet 5, פריט M01-c53)

## המשך מ:

M01-c53 היה בדיקת פרודקשן: להריץ build+deploy לפרודקשן ואז `dig`/`curl` על
שני הדומיינים. **DNS: עדיין תקין** (RESOLVED מ-M01-c52, נמדד שוב) —
`kenyonexpress.co.il` -> `64.29.17.1`/`64.29.17.65`, NS `ns1/ns2.vercel-dns.com`,
`curl https://www.kenyonexpress.co.il` **200** עם HTML אמיתי (`lang="he"
dir="rtl"`), `https://kenyonexpress.co.il` **308** לכיוון `www` (הפניה
תקינה, לא כשל). **לא DNS BLOCKER** — אין מה לכתוב שם. **פריסה: נוסתה
בפועל דרך Vercel MCP** (`create_deployment`, `gitSource` github,
`audit/final-audit`@`99b2079cb6`, target production, פרויקט `kenyonexpress`
`prj_v49dZbPUpk1UxyHbXTCiIJlQ7opP`) **וסורבה שוב**, אותו קוד שגיאה בדיוק:
`dpl_CUUU98iiF1RiU1qxHojWyGbT8JuQ`, `BUILD_UTILS_SPAWN_1`, `"node
scripts/deploy-preflight.mjs && pnpm build" exited with 1`. `filter_project_envs`
(קריאה בלבד) מאשר שהסיבה לא זזה: `CARDCOM_MERCHANT_ID`/`CLIENT_ID`/`API_KEY`
עדיין קיימים ב-Production במקום `CARDCOM_TERMINAL_NUMBER`/`API_NAME`/`API_PASSWORD`
שהקוד קורא, ו-`ALLOW_INCOMPLETE_ENV` עדיין מוגדר שם. פרודקשן נשאר על
`a388118f1` (`dpl_EMtv9KbPfdGq75JLSNysp1wx3DQa`, READY), עכשיו **70** קומיטים
מאחורי HEAD (היה 48 ב-M01-c52, 66 לפי M15-c52). אין שינוי קוד, אין שער
חזותי נדרש (לא UI). פירוט מלא למטה.

## M01-c53 - DONE (29.09): DNS עדיין תקין, פריסת HEAD סורבה שוב (אותה סיבה, נמדד עם MCP)

**מה נבדק:** `CLAUDE.md`, `STATE.md`, `docs/BACKLOG.md` ו-`git log -20`
נקראו במלואם. חוסם 1 (DNS) היה רשום RESOLVED מ-M01-c52; חוסם 2 (פריסת HEAD)
היה רשום BLOCKED על סביבת Cardcom חסרה.

**מה נמדד:**
1. `dig +short kenyonexpress.co.il` -> `64.29.17.1`, `64.29.17.65`;
   `dig +short NS` -> `ns1.vercel-dns.com.`, `ns2.vercel-dns.com.`;
   `dig +short www.kenyonexpress.co.il` -> `216.198.79.1`, `64.29.17.1`.
2. `curl -o /dev/null -w "%{http_code}" https://www.kenyonexpress.co.il` ->
   `200`, גוף אמיתי (`lang="he" dir="rtl"`, לוגו קניון EXPRESS).
   `curl .../kenyonexpress.co.il` (בלי www) -> `308` עם
   `location: https://www.kenyonexpress.co.il/` — הפניה תקינה של Vercel,
   לא כשל DNS/TLS.
3. פריסת production הופעלה דרך כלי ה-Vercel MCP (זמין לראשונה בסשן הזה,
   לא REST גולמי כמו ב-M01-c1/M01-c52): `create_deployment` עם `gitSource`
   github על `audit/final-audit`@`99b2079cb6` (HEAD), `target=production`,
   פרויקט `kenyonexpress` (לא `kenyonexpress-prod`, שמחזיק רק `.vercel.app`).
   תוצאה: `dpl_CUUU98iiF1RiU1qxHojWyGbT8JuQ`, `state=ERROR`,
   `errorCode=BUILD_UTILS_SPAWN_1`, `errorMessage="Command \"node
   scripts/deploy-preflight.mjs && pnpm build\" exited with 1"` —
   זהה בדיוק לניסיון הקודם (`dpl_GoCto2TvUmPDPkTNYQ5wBxdR5d5j` על `1083b8d8d`,
   אותו קוד שגיאה, כשלושים דקות קודם, כנראה מ-M01-c52 או מסשן אחר באותו
   ריצה).
4. `filter_project_envs` (קריאה בלבד, אין שינוי) על אותו פרויקט: `Production`
   מחזיק `CARDCOM_MERCHANT_ID`, `CARDCOM_CLIENT_ID`, `CARDCOM_API_KEY`
   (השמות הישנים), לא `CARDCOM_TERMINAL_NUMBER`/`CARDCOM_API_NAME`/
   `CARDCOM_API_PASSWORD` (השמות שהקוד קורא בפועל), ו-`ALLOW_INCOMPLETE_ENV`
   עדיין קיים כמפתח נפרד. אין ערכים שנקראו (`decrypted: false` בכל שורה) —
   רק קיום/היעדר השם, כפי שדווח גם ב-M01-c1/M01-c52.
5. `list_deployments` מאשר שהפריסה החיה כיום היא `dpl_EMtv9KbPfdGq75JLSNysp1wx3DQa`
   (`a388118f1`, `READY`, `target=production`) — לא זזה. HEAD (`99b2079cb6`)
   נמצא 70 קומיטים אחריה (`git rev-list --count a388118f1..HEAD`).

**מסקנה:** אין DNS BLOCKER לכתוב — הדומיין עובד. החוסם היחיד הוא חוסם 2
הקיים (סביבת Cardcom בפרודקשן), עכשיו עם ראיית פריסה טרייה מה-MCP במקום
REST גולמי. אין פעולה אסורה בוצעה: לא נקרא/נכתב ערך סוד, לא שונה env,
ה-deploy עצמו הוא הפעולה שהפריט ביקש לבצע ("להריץ... deploy") וכבר בוצעה
פעמיים בעבר (M01-c1, M01-c52) באותו אופן. עודכן חוסם 2 למטה עם המספרים
הטריים.

**שערים:** אין שינוי קוד (בדיקת production בלבד) — `pnpm
type-check`/`lint`/`test`/`build` לא נדרשו, כמו בפריטי "אין שינוי קוד"
קודמים (M08-c52, M09-c52 וכו'). אין שער חזותי נדרש (לא UI).

**קבצים:** `STATE.md` בלבד.

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

**M14-c52..M01-c52 פירוט מלא בארכיון** (`docs/STATE-ARCHIVE.md`): M14-c52:
bundle ללא רגרסיה, `ProductGallery.tsx` תוקן (אותו באג `fill`+px `sizes`
שתוקן ב-`CategoryStrip.tsx` ב-M14-c51), שער מוצר 5.61/4.92/2.99 PASS.
M13-c52: אבטחה (CSP/HSTS/X-Frame-Options/Referrer-Policy/rate-limit) נמדדה
מחדש, אפס דריפט. M12-c52: SEO נמדד מחדש מול build אמיתי, אפס דריפט.
M11-c52: axe 160 סריקות, אפס הפרות WCAG. M10-c52: כיסוי ענפים 100% על
`rls-report-fetch.ts` (81.1%->100%), +7 טסטים. M09-c52: STATE CLEAN, אין
פריט חדש. M08-c52: BACKLOG EMPTY בפעם ה-11. M07-c52: שער נתיבים 244
שורות, 239 PASS/5 NO DATA/0 FAIL. M06-c52: Lighthouse mobile 98-100 בכל
שמונה הציונים. M05-c52: advisors 44 WARN זהה ל-M05-c1, `node_modules`
תוקן. M03-c52: green check מחדש נקי. M02-c52: שער חזותי בית+מוצר PASS
בשלושת הרוחבים. M01-c52: DNS ברשם תוקן (חוסם 1 RESOLVED), פריסת HEAD
עדיין מסורבת (חוסם 2/3), שלושת פרויקטי Vercel זוהו.

**M18-c51..M12-c51 פירוט מלא בארכיון** (`docs/STATE-ARCHIVE.md`): M18-c51:
טופס ניוזלטר בפוטר חובר ל-`subscribeToNewsletter` האמיתי. M17-c51: מעבר
משפטי ולשוני מלא (LTR, placeholder, קישורים שבורים, טעויות כתיב). M16-c51:
תברואת ריפו, git status נקי, 9 ענפים נדחפו, 23 PRs פתוחים ו-81 ענפים ישנים
רשומים (22 בטוחים למחיקה, 59 בלי PR). M15-c51: `docs/BACKLOG.md` נוצר
כרשימת "ידני לאופיר" יחידה. M14-c51: bundle ירד, `CategoryStrip.tsx` תוקן.
M13-c51: CSP/HSTS/X-Frame-Options/Referrer-Policy אומתו על build אמיתי.
M12-c51: SEO, 261 בדיקות, אפס drift.

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
| M18-c51 | DONE (29.09) | הרשומה למעלה. טופס ניוזלטר בפוטר חובר ל-`subscribeToNewsletter` האמיתי במקום `/api/newsletter` שלא היה קיים מעולם (404 שקט על כל שליחה). type-check/lint/test (604/7182, זהה)/build נקיים; שער 8.51/9.02/3.95 PASS, זהה למדידה הקודמת. |
| M01-c52 | DONE (29.09) | הרשומה למעלה. חוסם 1 (DNS ברשם) RESOLVED; חוסם 2/3 (פריסת HEAD) נשאר פתוח מאותה סיבה. פירוט בארכיון. |
| M02-c52 | DONE (29.09) | הרשומה למעלה. שער חזותי בית+מוצר בשלושת הרוחבים: 8.51/9.02/3.95 ו-5.65/4.95/2.92, כולם PASS, אפס רגרסיה. ברירת המחדל של compare.mjs מסורבת (הדומיין הוא בנייתנו עצמה); נעשה שימוש ב-`--baseline` עם הצילומים הקפואים. |
| M03-c52 | DONE (29.09) | הרשומה למעלה. type-check/lint/test/build מחדש על `d0b811f07`: כולם נקיים, 604/7182 זהה, build exit 0. אפס תיקון נדרש; ה-warn היחידים בפלט ה-build הם לוגים של האפליקציה (מיגרציה 242 pending, זמן תגובה DB), לא אזהרות build. אין שינוי קוד. |
| M05-c52 | DONE (29.09) | הרשומה למעלה. advisors נמדדו שוב דרך ה-management API (MCP דורש OAuth שלא זמין): 44 WARN, זהה ל-M05-c1 (25.09) בדיוק, כולם עדיין מכוסים על ידי 209/220/245/246 pending או by design. אפס WARN חדש, אין קובץ מיגרציה חדש. `node_modules` תוקן (`rm -rf` + `pnpm install` מהחנות המקומית) אחרי שנמצא חלקי. |
| M06-c52 | DONE (29.09) | הרשומה למעלה. Lighthouse mobile devtools-throttled, בית ומוצר: 98/100/100/100 ו-99/100/100/100, כולם 90+, דומה ל-M06-c1 ואף מעט גבוה יותר. אפס תיקון נדרש, אפס שינוי קוד. |
| M07-c52 | DONE (29.09) | הרשומה למעלה. שער נתיבים מלא: 244 שורות ייחודיות, 239 PASS / 5 NO DATA / 0 FAIL. תיקון תזמון אחד בתשתית הבדיקה בלבד. |
| M08-c52 | DONE (29.09) | **BACKLOG EMPTY**, נמדד בפעם האחת-עשרה: כל 15 הסעיפים ב-`docs/BACKLOG.md` הם פעולות אסורות על הסוכן (DNS/סודות/Vercel env, פריסה, מיגרציה על פרודקשן, Cardcom אמיתי, הכרעת קטלוג, מחיקת נתונים, ערך שרק אופיר מחזיק). אין שינוי קוד. |
| M09-c52 | DONE (29.09) | **STATE CLEAN**, נמדד בפעם השתים-עשרה, עם בדיקה ישירה נוספת: `git fetch` מול origin (HEAD זהה), `docs/POST-LAUNCH-BACKLOG.md` (כולו דחיות מנומקות) ו-`grep TODO/FIXME` ב-`src/` (שתי תוצאות, שתיהן Cardcom אמיתי, אסור). אין פריט חדש, אין שינוי קוד. |
| M10-c52 | DONE (29.09) | הרשומה למעלה. נמדד (לא הוערך) שהנמוך מבין ששת המועמדים הוא `src/lib/supabase/rls-report-fetch.ts`, 81.1% ענפים; שאר החמישה כבר ב-95%+. שבעה טסטים נוספו, 100% ענפים אומת. `vitest.config.ts` הורחב זמנית למדידה בלבד והוחזר בדיוק (diff ריק). שערים נקיים, 604/7188. |
| M11-c52 | DONE (29.09) | הרשומה למעלה. axe נמדד מחדש על 160 סריקות (פומבי 80/2 דולג, לקוח 16/16, אדמין 57/57 עם `E2E_ADMIN_EMAIL` הנכון, ספק 7/7), אפס הפרות WCAG 2.1 A/AA. אין שינוי קוד. |
| M12-c52 | DONE (29.09) | הרשומה למעלה. SEO נמדד מחדש מול build אמיתי: robots.txt/sitemap.xml (46 מוצרים)/canonical/og/JSON-LD Product+Offer+BreadcrumbList על דף מוצר והבית, כולם תקינים. 180 טסטי SEO ייעודיים ירוקים, 604/7188 זהה. אין שינוי קוד. |
| M13-c52 | DONE (29.09) | הארכיון. CSP/HSTS/X-Frame-Options/Referrer-Policy נמדדו מחדש ב-`curl` על חמישה נתיבים כולל חריג `/checkout/frame-return`; rate-limit על login/checkout/redeem מכוסה בטסטים ירוקים. Upstash לא מוגדר מקומית, Postgres fallback פעיל. אין שינוי קוד. |
| M14-c52 | DONE (29.09) | הרשומה למעלה. bundle: אין רגרסיה (341.2->341.7kB בית, 344.9->345.4kB קופה, רעש). תמונות: `ProductGallery.tsx` נשא את אותו באג `fill`+px `sizes` שתוקן ב-`CategoryStrip.tsx` ב-M14-c51, לא נתפס אז; תוקן ל-`width`/`height`, HTML מוצר -2.6%. ISR ו-cache headers: אין רגרסיה. שער מוצר בחזית: 5.61/4.92/2.99 PASS, זהה לבייסליין. |
| M15-c52 | DONE (29.09) | הרשומה למעלה. סנכרון תיעוד: מספר הקומיטים שפרודקשן מאחורי HEAD עודכן 47->66, פער `origin/main` עודכן 421->440 (109 ל-פנים ללא שינוי), ספירת טסטים ב-`docs/LAUNCH-READINESS.md` עודכנה ל-604/7188. אין כפילות או פריט חדש ברשימת "ידני לאופיר" (15 סעיפים, ללא שינוי תוכני). אין שינוי קוד. |

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
