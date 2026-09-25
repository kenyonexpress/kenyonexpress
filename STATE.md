Updated: 2026-09-25 (סשן `audit/final-audit`, Fable 5.1, תור `~/ke-goals/final-queue.txt`)

## המשך מ:

**Q19 DONE (25.09).** הבא בתור: **Q20** (בטבלה DONE, לאמת על העץ), ואחריו
**Q21** (OPEN, חלקי).

ההיסטוריה המלאה (Q01..Q11, תור 23.09, וכל מה שקדם) ב-`docs/STATE-ARCHIVE.md`,
החדש למעלה. הקובץ הזה מחזיק רק את מה שחי.

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

## Q19 - DONE (25.09) - הונאה ואמון: מימוש חד-פעמי ב-DB, מגבלות קצב, בדיקות מהירות, תג ספק מאומת ומונה "נרכשו השבוע" מנתונים אמיתיים בלבד

**נמדד על העץ ועל פרודקשן לפני שנכתבה שורה.** הטבלה אמרה "לא אומת" על ארבעה
מתוך חמישה; שלושה מהם היו קיימים ושניים לא:

- **מימוש חד-פעמי ב-DB: קיים ופרוס.** `redeem_voucher` (074/085) מעדכן
  `WHERE status='issued'` במשפט אחד (אין חלון קריאה-ואז-כתיבה), ו-166 מוסיפה
  טריגר `tg_vouchers_status_guard` שמסרב לכל מעבר מ-`redeemed` חזרה. **נמדד
  בפרודקשן** (read-only דרך ה-management API): `pg_trigger` מחזיר 1 לטריגר,
  `pg_proc` 1 לפונקציה, 2 מימושים בסך הכל.
- **מגבלות קצב על כניסה, קופה ומימוש: קיימות.** `login` 10/h ל-IP +
  `login-account` 20/h לחשבון, `begin_checkout` 10/min, `redeem` 60/h ל-IP,
  `voucher-redeem` 120/h לספק (`lib/rate-limit/policies.ts`, `docs/RATE-LIMITS.md`
  עם טסט סחיפה).
- **בדיקות מהירות: קיימות.** `lib/fraud/velocity.ts` (`declined_payments` 5/h,
  `distinct_cards` 5/יום, `card_across_accounts`), נקרא ב-`checkout.ts` לפני
  שההזמנה קיימת; רשימת חסימה 234; ציון סיכון שמנתב לבדיקה. `docs/FRAUD-RULES.md`.
- **תג ספק מאומת: לא היה.** אין עמודה, אין רכיב, אין מחרוזת.
- **"נקנה השבוע": לא היה.** אפס התאמות ל-`this_week`/`השבוע` בקוד ובקטלוג.

**מה נכתב, ומה ההחלטה המרכזית: ראיה או שתיקה, לעולם לא דגל.**

- **`ספק מאומת`** (`lib/suppliers/verification.ts`, טהור, 7 טסטים): מאומת רק
  ספק `active` לא מחוק **וגם** אחד משניים: בקשת הצטרפות שאדם אישר
  (`supplier_applications.status='approved'` עם `supplier_id`, חי אחרי 204) **או**
  מימוש אמיתי אחד לפחות (`vouchers.status='redeemed'` אצלו). **לא נחשב:**
  `status='active'` לבדו, כי 027 עשה אותו DEFAULT וכל שורה זרועה נושאת אותו;
  `business_id`, כי **0 מ-7** הפעילים מחזיקים אחד. `verification-read.ts`: שני
  head counts דרך service role (vouchers ללא policy ציבורית), 42P01 על הטבלה של
  204 הוא "אין ראיה" בלי לוג. נקרא בתוך `loadSupplierPublicContact` ו-
  `loadSupplierStorefront` (שניהם `'use cache'`, שעה). `VerifiedSupplierBadge`
  ליד שם הספק ב-`SupplierInfo` (דף מוצר) וב-`SupplierStorefrontHeader` (`/s/[id]`).
  **נמדד בפרודקשן: 1 מ-7 ספקים פעילים** עונה לכלל היום.
- **`{count} נרכשו השבוע`** (`lib/commerce/social-proof.ts`, טהור, 8 טסטים;
  `bought-this-week.ts`, שתי קריאות; `BoughtThisWeek.tsx` ב-Suspense משלו עם
  `connection()`, כמו `StockScarcity`): יחידות ב-`order_items` על הזמנות
  `paid`/`fulfilled`/`partially_fulfilled`/`platform_settled` ששולמו ב-7 ימים,
  **ורק עם חיוב אמיתי**: `payments.status='succeeded'`, `kind='charge'`, ומזהה
  שאינו `mock-`. **נמדד בפרודקשן: 18 מ-18 ההזמנות ששולמו בשבוע האחרון הן
  mock** (`mock-txn-`/`mock-tok-`/`mock-canc`), על 2 מוצרים; הספירה הנאיבית
  הייתה מציגה "18 נרכשו השבוע" על מוצר שאיש לא קנה. רצפת תצוגה 3; מתחתיה
  השורה נעדרת ולא מעוגלת. הקידומת קבוע אחד ב-`lib/payments/mock-transaction-id.ts`
  ש-`MockCardcom` עצמו קורא (חמשת המזהים שלו עברו לקבוע).
- מחרוזות: `pdp.supplierVerified`, `pdp.boughtThisWeek` (he+en). CSS: `--pdp-verified`
  בבלוק הטוקנים (שער ה-hex תפס `#1f8a4c` גולמי, ותוקן), `.pdp-verified`,
  `.pdp-summary__proof`. `docs/FRAUD-RULES.md` §5. **+25 טסטים.**

**נמדד על ה-build המקומי** (BUILD_ID `tsta1aFOQ0CB_e0omPoAV`, `pnpm start` על 3313,
אומת לפי ה-BUILD_ID ב-HTML): `/s/<הספק עם המימושים>` 200 עם
`data-testid="supplier-verified"`; דף מוצר שלו 200 עם התג; `מוצר-לדוגמא` בלי תג
ובלי מונה (הספק שלו ללא מימוש; אפס חיובים אמיתיים בשבוע). המונה אינו מופיע על
אף דף בפרודקשן היום, וזו התוצאה הנכונה של הכלל.

**שערים על העץ:** `pnpm type-check` נקי, `pnpm lint` נקי (i18n 627/627,
locale-format 134/134 אחרי תיקון אגבי: Q18 הכניס `toLocaleDateString('he-IL')`
ב-`PushDevices.tsx` והשער עמד על 135; הוחלף ב-`formatDate`), `pnpm test`
**599 קבצים, 7,149 ירוקים, 12 מדולגים**, `pnpm build` ירוק (הריצה הראשונה נפלה
על `new Date()` ב-prerender; `connection()` לפני הקריאה). **שער ההשוואה בחזית,
`--baseline`, exit 0:**

| דף | רוחב | תוכן | מצב |
|---|---|---|---|
| home | 380 | 8.44% | PASS |
| home | 768 | 9.03% | PASS |
| home | 1440 | 3.82% | PASS |
| product | 1440 | 2.79% | PASS (`refs/live-product.png`, grid override) |

השורות ב-`docs/UI-PARITY-REPORT.md` 00:49-00:55 UTC (26.09) על `13091a782-dirty`.

**החלטות שהתקבלו לבד:**
- אין מיגרציה: `verified` נגזר ולא מאוחסן, כי עמודה שמפעיל מסמן היא טענה ולא
  ראיה, וכי pending מת עד החלה. אחרי 204 האישור האנושי נכנס לבד.
- `status='active'` אינו אימות. זה אומר ש-6 מ-7 הספקים הפעילים בלי תג היום; זו
  אמת ולא פגם.
- הזמנות mock מוחרגות מהמונה גם כשהאתר רץ על mock: מונה שסופר חזרות הוא
  בדיוק "נתונים לא אמיתיים".
- סעיפי Q16 ו-Q17 הועברו לארכיון (STATE.md 271 שורות לפני הרשומה הזו).
- שני `next-server` זרים על 3311/3312 לא נגעתי; השרת שלי על 3313 נעצר לפי PID.

## Q18 - DONE (25.09) - התקנת PWA ופוש עם ניהול מנויים

**נמדד על העץ לפני שנכתבה שורה.** שלושת הקומיטים שהטבלה ציינה (`f08a701d1`,
`86af4a7c3`, `be736f10f`) הם אבות של HEAD, ומה שחי איתם: `src/app/manifest.ts`
(id, shortcuts, maskable), `public/sw.js` עם `push` ו-`notificationclick`,
`ServiceWorkerRegistrar` ו-`InstallPrompt` ב-layout, `PushOptIn` בדף ההתראות
(הרשאה רק מלחיצה, שמירה בשרת לפני "פעיל", ביטול בדפדפן אם השמירה נכשלה),
`savePushSubscription`/`removePushSubscription` (service role, מסונן על
`user_id`, rate limit 30/h), שולח VAPID ב-`lib/push/web-leg.ts` שמוחק 404/410,
179 מוחלת (`migrations/applied`), 215 (יומן משלוחים) ממתינה.

**מה חסר, ונבנה:** ניהול מנויים מעבר לדפדפן הנוכחי. 179 שמרה `user_agent`
"ל-UI ניהול עתידי" ואף אחד לא בנה אותו: לקוח שאיבד טלפון לא יכול היה להפסיק
אליו התראות. חדש: `server/queries/push-subscriptions.ts` (קריאה דרך הלקוח של
הבקשה תחת `push_subscriptions_select_own`, בלי המפתחות), `removePushSubscriptionById`
(uuid בלבד, מסונן על `user_id`, `revalidatePath`), `components/pwa/PushDevices.tsx`
(סימון "הדפדפן הזה" לפי endpoint בצד הלקוח, הסרה לשורה), `lib/push/device-label.ts`
(UA -> "Chrome, Android", לעולם לא המחרוזת הגולמית). העתקים ב-`messages/*.json`
תחת `pushDevices.*`. תיקון אגבי: דף ההתראות עטף את `PushOptIn` בכרטיס עם אותה
כותרת שהרכיב מרנדר בעצמו, והכותרת הופיעה פעמיים.

**החלטות שהתקבלו לבד:** (א) הסרת דפדפן רחוק מוחקת את השורה ולא את המנוי
בדפדפן הרחוק (רק הוא יכול), וזה מספיק כי בלי שורה אין שליחה. (ב) הרשימה
מוסתרת כשאין שורות; המצב הריק כבר מוסבר ב-`PushOptIn`. (ג) תקרת ה-i18n ירדה
628 -> 627 (הכותרת הכפולה יצאה, הרכיב החדש קורא מהקטלוג); לא הועלתה.

**שערים:** `pnpm test` 596 קבצים / 7129 ירוקים, `type-check` נקי, `lint`
אזהרה אחת קיימת מראש ב-`SecurityClient.tsx`, `pnpm build` ירוק
(BUILD_ID `rTuGZExcxmTJq2wUkNe7g`). שער ההשוואה בחזית על 3347 (3311 ו-3312
תפוסים על ידי סשנים אחרים): **380 ‏8.44% PASS, ‏768 ‏9.03% PASS, ‏1440 ‏3.82%
PASS**, שורות 00:25-00:28 UTC ב-`docs/UI-PARITY-REPORT.md`.

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
| Q20 | DONE | `29b921163`, `bf9f2ca09`, `(supplier)/supplier/*`. |
| Q21 | OPEN, חלקי | sitemap, robots, `0f42ef81a`, `b591ba19a`. אין קומיט שמכריז WCAG 2.1 AA מלא. |
| Q22 | OPEN, חלקי | `e2e/` קיים, `31ada5313`. Lighthouse: `docs/LIGHTHOUSE-AUDIT.md`. אין ראיה ל-90+ mobile על דף מוצר. |
| Q23 | OPEN | `docs/AUTOPILOT-DIFF.md` לא קיים. |
| Q24 | OPEN | `docs/LAUNCH-READINESS.md` הוא צילום היסטורי (09.09, NOT READY). דורש כתיבה מחדש. |
| B01-B10 | OPEN, חסום | `docs/BACKLOG.md` לא קיים. מועמדים: `docs/POST-LAUNCH-BACKLOG.md`, `docs/MIGRATION-BACKLOG.md`. החלטה ב-B01. |

## חוסמים פתוחים (לא בידי הסוכן)

1. **DNS אצל הרשם** (Q02): להחליף את שני ה-NS של `kenyonexpress.co.il`
   מ-`ns1.vercel.com`/`ns2.vercel.com` ל-`ns1.vercel-dns.com`/`ns2.vercel-dns.com`.
   אחרי ההתפשטות: `dig +short A kenyonexpress.co.il @1.1.1.1` צריך להחזיר
   `216.198.79.1`, ואז `curl -sI https://www.kenyonexpress.co.il/` ל-200.
   שום דבר בצד Vercel לא דורש שינוי.
2. **פריסת פרודקשן של `2ee29bc90`** (מצב עצירה, אישור נדרש): REST
   `POST /v13/deployments` עם `gitSource.sha`, `target=production`, כמו ב-Q02.
3. **מיגרציות ממתינות**: 204 (הצטרפות ספקים והסכם click-wrap; בלעדיה הטופס
   עונה "עדיין לא פעיל"), 240 (הסכמת "הכל באפליקציה"), 241 (עיר משלוש
   כותרות), 242 (מקור מחיר + ביקורות גוגל), 243 (תנאי מוצר), 244 (קמפיינים
   והמרות של תוכנית השותפים; בלעדיה התוכנית "עדיין לא פתוחה"). סדר והתנאים
   ב-`docs/RUNBOOK.md`, סקירה ב-`docs/MIGRATION-REVIEW.md`. לא הוחל דבר.
4. **R2 לא מופעל בחשבון Cloudflare** (10.09): תמונות המוצר נופלות ל-Supabase
   Storage, וגיבויי ה-DB החיצוניים אינם נכתבים כלל.
5. **צילומי reference ב-380 וב-768 לדף המוצר, לסל ולקופה**: קיימים רק
   ב-1440 (`refs/live-product.png`, `refs/live-cart.png`,
   `refs/live-checkout.png`). בלי זה השערים של Q04 ו-Q10 נמדדים ב-1440 בלבד.
6. **`RESEND_API_KEY` בפרודקשן**: לא נמדד בפריט הזה (הזיכרון אומר שמשתני
   הסביבה מפוצלים בין שלושה פרויקטים ב-Vercel). בלי המפתח כל חמשת המיילים
   נופלים בשקט ל-`skipped`, ואיפוס סיסמה חוזר ל-SMTP של Supabase.
7. **`SUPABASE_SECRET_KEY` חשוף ודורש רוטציה** (CLAUDE.md, `RUNBOOK`);
   `deploy-preflight` מסרב לבנות איתו.
8. **Cardcom בפרודקשן**: `CHECKOUT_ENABLED=false`, ספק התשלום ב-mock;
   שלוש credentials החיוב לא קיימות באף פרויקט Vercel.
9. **מספר עוסק/ח.פ לשורת המוכר** באישור הרכישה (Q09): אינו קיים בריפו.
   עריכה אחת ב-`messages/he.json`, `purchaseConfirmation.sellerName`.
10. **ה-drain של ההתראות אינו מתוזמן**: `vercel.json` ללא `crons`, ולכן
    אף מייל או push מה-outbox לא יוצא בפרודקשן עד שיתווסף cron ל-
    `/api/cron/notifications` (וגם ל-`expire-vouchers`).

## ידני לאופיר, לפי סדר קריטיות

1. DNS (חוסם 1). פעולה אחת בממשק הרשם.
2. אישור פריסה של HEAD (חוסם 2).
3. אישור והחלת 240..243 דרך MCP לפי `RUNBOOK`, ואז `pnpm db:types`.
4. רוטציית `SUPABASE_SECRET_KEY` (חוסם 7).
5. הפעלת R2 בדשבורד Cloudflare (חוסם 4).
6. Cardcom: `CARDCOM_USE_MOCK=false` + המפתחות + `CHECKOUT_ENABLED=true` (חוסם 8).
7. `scripts/dns-watch.sh` (pid 1033) עדיין רץ ומשגר סשן deploy כשיופיעו NS
   של Cloudflare; זה לא יירה על המעבר ל-vercel-dns. לבדוק לפני שמפעילים משהו.
8. עשרה stash-ים לא נמחקו (כלל: אין מחיקת נתונים); רשימה בארכיון תחת Q01.
9. כניסה בטלפון (Q17): ספק SMS בהגדרות ה-auth של Supabase ואז `PHONE_AUTH_ENABLED=true`
   ב-Vercel. בלעדיהם הכפתור מוסתר והשאר עובד.
