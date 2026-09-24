Updated: 2026-09-25 (סשן `audit/final-audit`, Fable 5.1, תור `~/ke-goals/final-queue.txt`)

## המשך מ:

**Q11 DONE (אומת 25.09).** הבא בתור: **Q12** (בטבלה DONE; לא אומת בנפרד:
5% או 100 ש"ח בטקסט. לאמת על העץ ולרשום).

ההיסטוריה המלאה (Q01..Q09, תור 23.09, וכל מה שקדם) ב-`docs/STATE-ARCHIVE.md`,
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

## Q11 - DONE (אומת 25.09) - דף "הצטרפו כעסקים" עם הסכם click-wrap: hash גרסה, timestamp ו-IP

**הפריט כבר היה עשוי ב-`185b904a4` (09.09, ‏SECTIONS 76) ובקישור `1e9b4f0e2` (24.09).**
מה שהיה חסר בטבלה, "לא אומת: timestamp + IP", אומת עכשיו על העץ ונעול בטסט.
נכתב: טסט אחד לפעולה ושורת כותרת אחת.

**מה נבדק (נמדד, לא צוטט):**
- **הדף:** `/suppliers/apply` (`(store)`, `instant=false`), דורש התחברות
  (`redirect('/login?next=/suppliers/apply')`), מרנדר את `CONTRACT_TEXT` בתוך
  `SupplierApplyWizard` עם `contract_version` נסתר ותיבת `accept_contract`
  חובה. על ה-build המקומי `GET /suppliers/apply` 200. הקישורים אליו: פוטר
  `footer.suppliers` = "הצטרפו כעסקים", ו-CTA "להצטרפות והסכם דיגיטלי"
  ב-`/suppliers`.
- **הכותרת לפי STATE.md:** `metadata.title` וה-`h1` של הדף היו
  "הצטרפות כבית עסק"; שונו ל-**"הצטרפו כעסקים"**, אותו טקסט של תווית הפוטר
  שהתור מפנה אליה. ערוץ הפנייה ב-`lib/contact/channels.ts` נשאר
  "הצטרפות כבית עסק" (זה שם ערוץ, לא כותרת דף; `e2e/wa-contact.spec.ts`
  בודק אותו).
- **hash של הגרסה:** `src/lib/suppliers/contract.ts`, `CONTRACT_VERSION =
  'v1-2026-09-09'`, `contractHash()` = SHA-256 hex של `CONTRACT_TEXT`,
  מחושב בשרת מהקבוע ולעולם לא מהטופס. גרסה שאינה תואמת נדחית לפני כל כתיבה.
- **timestamp:** `migrations/pending/204_supplier_onboarding.sql` שורה 272,
  `accepted_at timestamptz NOT NULL DEFAULT now()`. הפעולה אינה שולחת
  `accepted_at` בכלל, כך שהשעה היא של ה-DB ולא של הדפדפן.
- **IP:** `supplier-onboarding.ts` שורות 192-198: `getClientIp()`
  (`x-forwarded-for` הראשון, ואז `x-real-ip`) נכתב ל-`client_ip inet`;
  `'unknown'` הופך ל-NULL כי `inet` דוחה מחרוזת שאינה כתובת. הכתובת אמינה
  רק מאחורי Vercel שדורס את הכותרת (הערה ב-`rate-limit.ts`).
- **הרשומה:** `supplier_contract_acceptances` (`application_id`,
  `accepted_by`, `contract_version`, `contract_sha256` עם CHECK
  `^[0-9a-f]{64}$`, `accepted_at`, `client_ip`), RLS: קריאה לבעלים ולצוות,
  ‏INSERT/UPDATE/DELETE נשללים מ-`anon` ומ-`authenticated`; הכתיבה דרך
  service role בלבד.
- **טסט חדש** `src/server/actions/supplier-onboarding.test.ts`, 9 טסטים:
  השורה שנכתבת שווה בדיוק ל-`{application_id, accepted_by, contract_version,
  contract_sha256: contractHash(CONTRACT_TEXT), client_ip}`; hash שהדפדפן
  שולח נזרק; `accepted_at` מהטופס נזרק; `unknown` → NULL; גרסה ישנה ותיבה לא
  מסומנת נדחות בלי שום כתיבה (לא vault, לא שורת בקשה); כשל ברישום ההסכם לא
  מפיל בקשה שכבר נשלחה ונרשם ב-log; ושני טסטים על טקסט 204 (DEFAULT now(),
  ‏inet, CHECK של ה-hash).

**שערים על העץ:** `pnpm type-check` נקי, `pnpm lint` נקי (i18n 628/628,
locale-format 138/138, docs-index 280, docs-path-audit 155), `pnpm test`
**579 קבצים, 6,999 ירוקים, 12 מדולגים** (+1 קובץ, +9 טסטים), `pnpm build`
ירוק (BUILD_ID `wDvbkx7fkV8GCwUm-xqGd`). **שער ההשוואה בחזית, `pnpm start`
על 3311, `--baseline=refs/ke_live_{width}.png`:**

| דף | רוחב | תוכן | מצב |
|---|---|---|---|
| home | 380 | 8.44% | PASS |
| home | 768 | 9.03% | PASS |
| home | 1440 | 3.82% | PASS |

השורות ב-`docs/UI-PARITY-REPORT.md` 21:40-21:43 UTC על `d1f6dd0a8-dirty`
(מלוכלך בגלל הטסט והכותרת שלמעלה). דף ההצטרפות עצמו אינו נמדד בשער: אין לו
צילום reference (הוא לא קיים באתר החי).

**חסום ולא בידי הסוכן (ללא שינוי):** 204 לא הוחלה בפרודקשן, ולכן שליחת
הטופס עונה "טופס ההצטרפות עדיין לא פעיל" עד שאופיר מאשר (חוסם 3, יש להוסיף
את 204 לרשימה שם). ה-IP נרשם נכון רק מאחורי proxy שדורס `x-forwarded-for`.

**החלטות שהתקבלו לבד:**
- "title per STATE.md" פורש כתווית הפוטר "הצטרפו כעסקים" (פריט 10 בארכיון,
  `messages/he.json` `footer.suppliers`), והיא הוחלה על הכותרת ועל ה-`h1`
  של `/suppliers/apply`. לא נוצר דף חדש: הדף קיים, מקושר ומרונדר.
- `docs/BACKLOG.md` עדיין לא קיים; `packages/money.ts` לא קיים (המסלול הוא
  `src/lib/money.ts`), כמו ב-Q06..Q10. לא נגעתי בכסף.

## Q10 - DONE (אומת 25.09) - סל, קופה ודף תודה בסגנון Electro v7: קופת אורח, Google בסוף, תשלום מאחורי ממשק, מינימום 0

**הפריט כבר היה עשוי ב-`f6392ed6e` (29.07, "guest checkout on measured Electro
geometry").** לא נכתב קוד UI. הפריט אימת על העץ ועל ה-build, ותיקן את שער
ההשוואה כדי שהסל והקופה יימדדו שוב מול הצילומים הקפואים.

**מה נבדק (נמדד, לא צוטט):**
- **קופת אורח:** `src/proxy.ts` שורה 170, `/checkout` אינו ברשימת `needsAuth`
  (רק תתי-הנתיבים). על ה-build המקומי (`nbkSvg5_JlRxh7h-gds98`, `pnpm start`
  על 3311), `GET /checkout` אנונימי 200, `/cart` 200, `/checkout/return` 307
  ל-`/login?next=…` (דף התודה קורא את ההזמנה של הקונה עצמו ודורש session,
  בכוונה).
- **Google בסוף:** `CheckoutForm.tsx` שורות 156-166 (`signInWithGoogle` דרך
  `useActionState`, טופס נסתר עם `next=/checkout?resume=1`), שורות 377-414
  (הזהות נדרשת בלחיצת התשלום; תשובות האורח נשמרות ב-`sessionStorage` תחת
  `RESUME_KEY`), שורה 349 (מילוי מחדש אחרי החזרה). הכפתור: "יש ללחוץ כאן כדי
  להתחבר".
- **תשלום מאחורי ממשק:** `src/lib/payments/types.ts` שורה 151,
  `interface PaymentProvider` (`createLowProfile`, `chargeWithToken`,
  `verifyLowProfile`, `refundByTransactionId`, `createDocument`,
  `listTransactions`). `getPaymentProvider` ב-`index.ts` שורה 38 מחזיר
  `MockCardcomProvider` כש-`CARDCOM_USE_MOCK=true`, אחרת `CardcomProvider`.
  לא נגעתי בשום ספק תשלום.
- **מינימום הזמנה 0:** אין שער סכום מינימלי ב-`submitCheckout` (grep על
  `MIN_ORDER|minimum|total < N` ב-`checkout.ts` וב-`lib/checkout/*`: אפס
  תוצאות). ה-`min_order_agorot` היחיד בריפו הוא סף תוכנית ההפניות, לא הקופה.
  שורה פיזית במחיר 0 נדחית (שורה 593) כשגיאת נתונים של אדמין, כלל אחר.
- **גאומטריית Electro:** `src/styles/checkout-page.css` מצטט
  `refs/checkout-measured.json` (מיכל 1165, טור חיוב 650 מימין, פאנל הזמנה
  466 משמאל, כפתור 397x64 רדיוס 50), `src/styles/checkout-tokens.test.ts`.
  דף התודה `checkout/return/page.tsx` מייבא את אותו גיליון; הסל דרך
  `cart-page.css` מה-layout הראשי.

**שערים על העץ:** `pnpm type-check` נקי, `pnpm lint` נקי (i18n 628/628,
locale-format 138/138, docs-index 280, docs-path-audit 154), `pnpm test`
**578 קבצים, 6,990 ירוקים, 12 מדולגים**, `pnpm build` ירוק (BUILD_ID
`nbkSvg5_JlRxh7h-gds98`). **שער ההשוואה בחזית, `pnpm start` על 3311:**

| דף | רוחב | תוכן | מצב | reference |
|---|---|---|---|---|
| home | 380 | 8.44% | PASS | `refs/ke_live_380.png` |
| home | 768 | 9.03% | PASS | `refs/ke_live_768.png` |
| home | 1440 | 3.82% | PASS | `refs/ke_live_1440.png` |
| cart | 1440 | 1.47% | PASS | `refs/live-cart.png` (1440x4033, 09.09), סל מקומי מלא |
| checkout | 1440 | 0.94% | PASS | `refs/live-checkout.png` (1440x2600, 07.09), נחת על `/checkout` בלי הפניה |

השורות ב-`docs/UI-PARITY-REPORT.md` 21:24-21:30 UTC על `29b782c2d-dirty`
(מלוכלך רק בגלל עריכת `compare.mjs` שלמטה). **380 ו-768 בסל ובקופה לא נמדדו:
אין צילומי reference ברוחבים האלה** (חוסם 5). לא נכתבה שורה מומצאת.

**החלטות שהתקבלו לבד:**
- **`scripts/compare.mjs`, שתי עריכות** כדי ש-`--baseline` יעבוד גם בסל
  ובקופה (הפנקס רשם ב-09.2x "unmeasurable at any width"): (א) בדיקת הזהות
  של הצד החי ו-`seedCart('live')` מדולגות כשיש צילום קפוא, כי הדומיין לא
  מתרגם ושניהם מתו על ה-goto לפני שהגיעו לצילום; (ב) שער "שני סלים במצב
  שונה" רץ רק כשהצד החי צולם בפועל (`undefined !== false` דחה כל ריצה קפואה
  עם ההודעה "filled"). הזריעה המקומית עדיין רצה; מצב הצילום הקפוא נרשם
  בלוג ולא מאומת.
- הקופה עברה את שער "לא הופנה מ-`/checkout`" עם סל אנונימי זרוע, וזו ראיה
  שנייה לקופת האורח, מעבר ל-curl.
- `docs/BACKLOG.md` עדיין לא קיים; `packages/money.ts` לא קיים, מסלול הכסף
  הוא `src/lib/money.ts` (כמו Q06..Q09).

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
| Q12 | DONE | `(legal)/legal`, `terms-and-conditions`, `privacy-policy`, `refund_returns`, `accessibility`, `c03a59f6b`. לא אומת בנפרד: 5% או 100 ש"ח בטקסט. |
| Q13 | DONE | `bf0effa2e`, `02cb65fb3`, כפתור שאלה על המוצר `ace712504`. |
| Q14 | OPEN, חלקי | `(store)/gift` + תזמון (`078a3de6d`), צ'יפים `dda866a5a`. אין ראיה להעברת קופון למשתמש אחר. |
| Q15 | OPEN, חלקי | crons קיימים (`expire-vouchers`, `notifications`, `weekly-digest`). אין ראיה ל-T-7/T-1 ב-pg_cron, club tiers, cashback לארנק. |
| Q16 | OPEN, חלקי | `fc9da36dc`, `2410c879d`. אין ראיה ל-commission per campaign ול-fraud checks. |
| Q17 | OPEN, חלקי | passkey (`c6dff8dc2`, `9b8c215f8`), 2FA (`af64d96e7`), מתג "הכל באפליקציה" עם הסכמה (`719fc6dff`, 240 pending). אין ראיה לאימות טלפון/OTP. |
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
   כותרות), 242 (מקור מחיר + ביקורות גוגל), 243 (תנאי מוצר). סדר והתנאים
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
