Updated: 2026-09-25 (סשן `audit/final-audit`, Fable 5.1, תור `~/ke-goals/final-queue.txt`)

## המשך מ:

**Q17 DONE (25.09).** הבא בתור: **Q18** (בטבלה DONE, לאמת על העץ), ואחריו
**Q19** (OPEN, חלקי).

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

## Q16 - DONE (25.09) - תוכנית שותפים: שיתוף דילים עם קוד, עמלה פר קמפיין שהאדמין קובע, זיכוי לארנק, בדיקות הונאה

**נמדד על העץ לפני שנכתבה שורה.** מה שהיה: קונסולת אדמין ל-`affiliates` (010,
`fc9da36dc`: אישור/דחייה/השעיה, מונים) **בלי אף דרך להצטרף, בלי קוד שנכתב לאיש,
בלי ייחוס** (`orders.affiliate_code` קיים מ-010 ואף שורה בקוד לא כתבה אליו),
בלי קמפיין, בלי עמלה ובלי תשלום; ותוכנית חבר-מביא-חבר שלמה (098: `?ref=`,
עוגייה, `fn_claim/complete/pay_referral`, `fn_referral_fraud_signals`, תור).
`2410c879d` הוסיף רק UTM לקישור ההפניה.

**מה נכתב, ומה ההחלטה המרכזית: קוד אחד לשתי התוכניות.** קוד השותף הוא
`profiles.referral_code`; הקישור `?ref=` והעוגייה `ke_ref` (proxy, 30 יום, מגע
אחרון) משרתים את שתיהן, וה-DB יחד עם `decideConversion` מכריעים מי משלמת.
- **שיתוף:** `useShareAttribution` (לקוח; שואל את השרת רק כשיש session) +
  `attributedShareUrl` (טהור); ארבעת ערוצי `ProductShareRow` והדף `/account/affiliate`
  מוציאים את הקוד על הקישור. `getMyShareCode` מחזיר קוד רק לשותף מאושר או
  כשתוכנית ההפניות פעילה. השורה זהה חזותית; רק ה-href משתנה.
- **ייחוס:** `snapshotAffiliateAttribution` בקופה (משפט UPDATE נפרד מה-INSERT,
  מאותה סיבה כמו עמודות המתנה) כותב `orders.affiliate_code` ומטביע device/IP
  של הקונה ב-`referral_signals`.
- **עמלה פר קמפיין:** `244_affiliate_campaigns.sql` (pending): `affiliate_campaigns`
  (`commission_bp` 0..5000, מינימום, תקרה, תקציב, מכסה יומית, אישור ידני, חלון,
  היקף לקטגוריה/מוצר) ו-`affiliate_conversions` (אחת להזמנה, UNIQUE). לשונית
  "קמפיינים ועמלות" + "מכירות שותפים" ב-`/admin/affiliates` (`requireSection('affiliates','write')`,
  audit לכל כתיבה). **ההחלטה כולה ב-`lib/affiliates/commission.ts`**, טהור, דרך
  `applyBp`; אין plpgsql שני. הצטרפות: `joinAffiliateProgram` (ממנטף דרך
  `fn_ensure_referral_code` על service key, uuid מה-session, שורה `pending_review`).
- **זיכוי לארנק:** `payAffiliateConversion` דרך `fn_wallet_transfer` מ-`platform:cashback_reserve`
  (אותו חשבון של `fn_pay_referral`), reason `affiliate_commission` (תווית בפנקס),
  idempotency `affiliate:<id>`; העברה לפני עדכון סטטוס; משלם אחד לשני הקוראים
  (finalize ותור האדמין). `finalize` קורא אחרי `completeReferralForOrder`.
- **בדיקות הונאה** (`docs/FRAUD-RULES.md` §2): `self_purchase` ו-`referral_bonus_paid`
  נדחים ונרשמים; `same_device/ip/card` (098, מוזן עכשיו בהצטרפות, בקופה ובתשלום),
  `velocity`, `manual_approval` מנתבים לתור; `budget_exhausted`/`below_minimum` לא
  נרשמים. תקציב שלא נקרא = תקציב שנגמר.
- **בלי 244 הקוד רץ:** 42P01 נתפס בכל קורא; דף החשבון אומר "התוכנית עדיין לא
  פתוחה" ומאפשר להצטרף; finalize רושם `affiliates.campaigns_table_missing`.
- **טסטים:** +49 (`commission.test.ts` 17, `affiliate-campaigns.test.ts` 9, `share-url.test.ts` 4,
  `affiliates/wired.test.ts` 13, ועוד). `fn_ensure_referral_code` סווג לקורא שני,
  244 נרשמה ב-inventory, `affiliate-join` ב-policies + `RATE-LIMITS.md`,
  `/account/affiliate` ב-`redirect-map.json`.

**נמדד על ה-build המקומי** (BUILD_ID `XtgFWxZ_EHrOtw8UYlQyW`, `pnpm start` על 3314, אומת
לפי ה-BUILD_ID ב-HTML): `/account/affiliate` אנונימי 307 ל-`/login?next=%2Faccount%2Faffiliate`.

**שערים על העץ:** `pnpm type-check` נקי, `pnpm lint` נקי (i18n 628/628; locale-format
הורד 138→134 אחרי שדף האדמין עבר ל-`formatDateShort`/`formatNumber`), `pnpm test`
**590 קבצים, 7,091 ירוקים, 12 מדולגים**, `pnpm build` ירוק. **שער ההשוואה בחזית,
`--baseline=refs/ke_live_{width}.png`, exit 0:**

| דף | רוחב | תוכן | מצב |
|---|---|---|---|
| home | 380 | 8.44% | PASS |
| home | 768 | 9.03% | PASS |
| home | 1440 | 3.82% | PASS |
| product | 1440 | 2.79% | PASS (`refs/live-product.png`, grid override) |

השורות ב-`docs/UI-PARITY-REPORT.md` 23:45-23:51 UTC על `2826d983b-dirty`. דף המוצר ב-380/768
ודף החשבון אינם נמדדים (חוסם 5).

**החלטות שהתקבלו לבד:**
- אין אימייל/פוש על עמלה: kind חדש ב-outbox היה שורה מתה עד מיגרציה, והארנק
  מציג את הזיכוי עם התווית. אין מעקב קליקים (`total_clicks` נשאר 0): כתיבה בכל
  לנדינג ב-proxy אינה חלק בפריט.
- `lsof` לא קיים במכונה; בדיקת הפורטים הראשונה הדפיסה ריק. השרת שלי אומת לפי
  ה-BUILD_ID בתגובה, ונעצר לפי PID. שני `next-server` זרים (23704, 46984) לא נגעתי.
- סעיף Q14 הועבר לארכיון (STATE.md 162 שורות לפני הרשומה הזו).

## Q17 - DONE (25.09) - כניסה: סיסמה ומפתח גישה, אימות טלפון, OTP כגיבוי, מתג "הכל באפליקציה" עם הסכמה מתועדת, באנר מפתח גישה ופוש אחרי הקנייה הראשונה, נדחה ל-30 יום

**הטבלה אמרה "אין ראיה לאימות טלפון/OTP" והיא טעתה.** נמדד על העץ לפני שנכתבה שורה:

- **סיסמה, Google, מפתח גישה, קישור קסם: קיימים.** `(auth)/login/LoginForm.tsx`: Google,
  ‏`PasskeyLoginButton` (WebAuthn, `lib/auth/passkeys/*`, `actions/passkeys.ts`; כשל Face ID
  פותח את טופס קישור-הקסם, `c6dff8dc2`), מייל+סיסמה, קישור קסם. ‏2FA לאדמין: TOTP ו-aal2
  (`af64d96e7`, `(auth)/mfa`, `admin-mfa`).
- **אימות טלפון ו-OTP: קיימים** (`67bc68025`, `d52fc7827`, `8be6be014`). ‏`PhoneOtpForm`
  ישירות מתחת ל-Google: שליחת קוד ב-SMS (`sendPhoneOtp`, E.164 דרך `toE164Israeli`, נייד
  בלבד `isSmsCapableIsraeli`), אימות (`verifyPhoneOtp`, `autoComplete="one-time-code"`), ומיזוג
  לחשבון קיים לפי הטלפון (`lib/auth/phone-merge.ts`, `decidePhoneMerge`). הרשמה במייל דורשת טלפון
  נייד ישראלי (`SignupForm`, `phone` חובה). **מאחורי `PHONE_AUTH_ENABLED` בשרת בלבד**: בלי ספק SMS
  בהגדרות ה-auth של Supabase (פעולת דשבורד, לא קוד) הכפתור מוסתר והכניסה במייל/Google/מפתח עובדת.
  זו ה-OTP כגיבוי: מי שאין לו Google ולא רוצה סיסמה.
- **מתג "הכל באפליקציה" עם הסכמה מתועדת: קיים** (`719fc6dff`): `EverythingInAppToggle` בדף
  ההתראות, `setEverythingInApp` כותב אירוע ב-`record_app_consent` (auth.uid בלבד, גרסת נוסח, מקור,
  IP, user-agent) **לפני** שינוי ההעדפות, ‏240 pending. בלי 240 המתג מדווח שהתכונה עדיין לא זמינה.
- **באנר מפתח גישה ופוש אחרי הקנייה הראשונה: היה, בלי "נדחה ל-30 יום".** ‏`FirstPurchaseBanner`
  ב-`/checkout/return` על ההזמנה הראשונה ששולמה (`isFirstPaidOrder`), בלי כפתור דחייה ובלי חלון;
  ‏`PostPurchasePushPrompt` נרשם כ"הוצג" **לצמיתות** ברגע שנראה; ‏`PasskeyRegisterPrompt`
  ב-`/account` נדחה **לצמיתות** ב-"לא עכשיו". שלוש דגלים, שלוש מדיניות, אף אחת 30 יום.

**מה נכתב:**

- `lib/pwa/snooze.ts` (טהור): `SNOOZE_DAYS = 30`, הערך המאוחסן הוא **רגע הסיום** באלפיות שנייה,
  ‏`isSnoozed` מקבל רק מספר שלם חיובי, ולכן דגל `'1'` הישן אינו דחייה: מי שדחה תחת הכלל הישן
  נשאל פעם אחת נוספת ומכאן נכנס לחלון של 30 יום. ‏localStorage ולא עוגייה או עמודה: מפתח גישה,
  מנוי פוש והרשאת התראות הם פר מכשיר, וכך גם ה"לא עכשיו" שלהם.
- `FirstPurchaseBanner` הפך ל-client עם "לא עכשיו" (30 יום, `ke:first-purchase-banner:snoozed-until`),
  מוסתר בשרת ומוכרע אחרי hydration (כמו הפוש; חלופה של רינדור ואז הסתרה מהבהבת באנר שכבר נדחה).
  קישור המפתח נעלם כשיש מפתח (`hasPasskeys`). **מותקן גם בסקירת החשבון** (`/account`) ללקוח עם
  הזמנה ששולמה (`orders.some(paidAt)`), כי דף האישור נראה פעם אחת ו"נדחה ל-30 יום" חסר משמעות
  בלי מקום לחזור אליו. ‏`listPasskeys` best-effort, אותו catch כמו ב-side nav.
- `PostPurchasePushPrompt`: "לא עכשיו" ולחיצה על הקישור דוחות ל-30 יום (`ke:push-invite:snoozed-until`);
  צפייה בלבד אינה תשובה עוד. ‏`granted`/`denied` עדיין משתיקים לתמיד, כי ההרשאה עצמה כבר הוצאה.
- `PasskeyRegisterPrompt`: אותו מפתח (`ke_passkey_prompt_seen:<uid>`), הערך הפך מדגל לרגע סיום.
  ה-e2e (`passkey-register-prompt.spec.ts`, reload אחרי דחייה) נשאר תקף.
- מחרוזות: `firstPurchase.dismiss`, `common.push_invite.dismiss` (he+en).
- **טסטים:** +24 (`snooze.test.ts` 13, `first-purchase-banner.test.tsx` 4,
  `passkey-register-prompt.test.tsx` 4, פוש +3 והחלפת "פעם אחת למכשיר" ב"חוזר בהזמנה הבאה").

**נמדד על ה-build המקומי** (BUILD_ID `RcW67BAIZE_KSt0OxnBU0`, `pnpm start` על 3313, אומת לפי
ה-BUILD_ID ב-HTML): `/account` אנונימי 307 ל-`/login?next=%2Faccount`; `/checkout/return` בלי
`order_id` 307.

**שערים על העץ:** `pnpm type-check` נקי, `pnpm lint` נקי (i18n 628/628, locale-format 134),
`pnpm test` **593 קבצים, 7,115 ירוקים, 12 מדולגים**, `pnpm build` ירוק. **שער ההשוואה בחזית,
`--baseline=refs/ke_live_{width}.png`, exit 0:**

| דף | רוחב | תוכן | מצב |
|---|---|---|---|
| home | 380 | 8.44% | PASS |
| home | 768 | 9.03% | PASS |
| home | 1440 | 3.82% | PASS |

השורות ב-`docs/UI-PARITY-REPORT.md` 00:03-00:06 UTC (26.09) על `721fe00e3-dirty`. דף האישור ודף
החשבון אינם נמדדים: דורשים הזמנה/התחברות ואין להם צילום reference (חוסם 5).

**החלטות שהתקבלו לבד:**
- לא נגעתי בדף הכניסה: כל ארבעת המסלולים קיימים והפער היחיד היה מדיניות הדחייה. אימות טלפון
  בפרודקשן דורש ספק SMS בדשבורד Supabase ו-`PHONE_AUTH_ENABLED=true` ב-Vercel (שניהם פעולות
  של אופיר, לא נמדדו בפריט הזה, נרשמו כפריט ידני).
- דחיית הבאנר אינה דוחה את דיאלוג המפתח ולהפך: שני מפתחות, שני שאלות; חיבור ביניהם היה קופלינג
  בין דף האישור ל-layout של החשבון בלי צורך נמדד.
- `docs/BACKLOG.md` עדיין לא קיים; `packages/money.ts` לא קיים (המסלול `src/lib/money.ts`).
  לא נגעתי בכסף.
- סעיף Q15 הועבר לארכיון (STATE.md 230 שורות לפני הרשומה הזו).
- שני `next-server` זרים (23704 על 3311, 46984 על 3312) לא נגעתי; השרת שלי על 3313 נעצר לפי PID.

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
| Q18 | DONE | `f08a701d1`, `86af4a7c3`, `be736f10f`. |
| Q19 | OPEN, חלקי | `58f920f8f feat(fraud)`, rate limit 10/h. לא אומת: single-use ב-DB, velocity, verified badge, "נקנה השבוע". |
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
