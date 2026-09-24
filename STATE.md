Updated: 2026-09-25 (סשן `audit/final-audit`, Fable 5.1, תור `~/ke-goals/final-queue.txt`)

## המשך מ:

**Q14 DONE (25.09).** הבא בתור: **Q15** (בטבלה OPEN, חלקי: crons קיימים;
חסר ראיה ל-T-7/T-1 ב-pg_cron, club tiers, cashback לארנק).

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

## Q14 - DONE (25.09) - קופון במתנה במייל, מיידי או מתוזמן, עם ברכה; העברת קופון למשתמש אחר; צ'יפים: פתוח בסופ"ש, משלוח חינם, קרוב אליי בהסכמה

**שני שלישים היו עשויים, השליש השלישי לא.** נמדד על העץ לפני שנכתבה שורה:

- **מתנה במייל בקופה, מיידי או מתוזמן, עם ברכה: קיים.** `giftSchema` ב-`validations/checkout.ts`
  (מייל, שם, ברכה עד 500, `gift_deliver_at`, אריזה), `sendOrderGifts` ב-`payments/gift-vouchers.ts`
  ממנטף token מגובב, כותב `voucher_gifted` ל-outbox עם `next_attempt_at` כתזמון (226 ממתינה;
  בלעדיה נשלח מיד), `/gift/[token]` + `claimGift` מעבירים בעלות. 108 מוחלת (עמודות ה-gift
  ב-`database.ts`).
- **העברת קופון למשתמש אחר: לא היה.** `actions/gifts.ts` הכיל רק `claimGift` ו-`loadGiftPreview`;
  לא היה שום מסלול לבעל קופון לשלוח אותו הלאה. **נכתב עכשיו.**
- **צ'יפים: היו רק קישורי קטגוריה** (`CategoryChips`, `dda866a5a`). "קרוב אליי" היה כפתור בשורת
  הערים מתחת לגריד, לא צ'יפ. "פתוח בסופ"ש" ו-"משלוח חינם" לא היו. **נכתבו עכשיו.**

**מה נכתב:**

- **העברת קופון.** `lib/gifts/transfer.ts` (טהור): `transferEligibility` (issued, בתוקף, ואין קישור
  שטרם נאסף), `giftTransferSchema` (zod, אותם גבולות כמו בקופה). `transferVoucher` ו-`revokeVoucherTransfer`
  ב-`actions/gifts.ts`: אותו מנגנון של מתנה מהקופה (token מגובב, `voucher_gifted`, הבעלות עוברת רק
  ב-`claimGift`), עם השומרים **בתוך ה-UPDATE** (`user_id`, `status=issued`, `or(hash.is.null, claimed.not.is.null)`)
  כך שמרוץ מוכרע ב-Postgres. `dedupe_key` פר קישור (`gift:<id>:<hash16>`), כי קופון יכול לעבור
  יותר מפעם אחת. אם ה-outbox נכשל, השורה מוחזרת למצבה. ביטול מנקה את ה-hash ומסמן שורת outbox
  ממתינה כ-`dead`, ומשאיר `gift_sent_at` (שומר ה-idempotency של finalize). מגבלה 20/שעה למשתמש.
  `gift_deliver_at` (226) לא נכתב: 42703 בפרודקשן. דף `/account/coupons/[id]/gift` (טופס, מצב
  "נשלח וממתין" עם ביטול, סירוב), קישורים "העברה במתנה"/"המתנה בדרך" ברשימת הקופונים. הקוד וה-QR
  נעלמים מהמסכים של השולח ברגע שיש token (`withholdGiftedCode`, קיים).
- **צ'יפים.** `lib/catalogue/filter-chips.ts` (טהור): פרסרים, `toggleChipHref`, `applyChipFilters`,
  `isMissingShippingColumn`. `FilterChips` (שרת, קישורים) + `NearMeChip` (לקוח, כפתור, הסכמה בלחיצה)
  בשני דפי הארכיון, אותן מחלקות CSS של שורת הקטגוריות. `useNearMe` חולץ מ-`CityTags` ומשותף לשניהם.
  **הנתונים, וזו ההחלטה המרכזית:** "פתוח בסופ"ש" הוא התג `open-weekend` ב-`products.tags` (עמודה
  שקיימת בפרודקשן), עם תיבת סימון בטופס המוצר לכל סוג מוצר; לא עמודה חדשה, כי עמודה הייתה יושבת
  ב-`pending` והצ'יפ היה 42703 בכל לחיצה. "משלוח חינם" = `requires_shipping` ו-`shipping_price_agorot=0`
  (243 ממתינה); ב-42703 השאילתה רצה שוב בלי העמודה, וזה אותו סט שורות כל עוד הכול נשלח חינם
  (הכותרת של 243 אומרת זאת). נמדד על ה-build: האזהרה `catalogue.shipping_column_missing` נרשמה
  והדף ענה 200. "קרוב אליי" הוא ה-`?near=` הקיים, נשאל בלחיצה ולעולם לא ב-mount.
- **טסטים:** +41 (`filter-chips.test.ts` 9, `filter-chips.test.tsx` 2, `transfer.test.ts` 7,
  `gifts-transfer.test.ts` 10 עם admin client מדומה, ועוד).

**נמדד על ה-build המקומי** (BUILD_ID `S_Fasw94DSP0GjUV9P6Nt`, `pnpm start` על 3312): `/products`
ו-`/category/hot-deals` 200 עם שורת הצ'יפים (שלוש תוויות, `aria-pressed="false"` על קרוב אליי);
`?open=weekend` מסמן `aria-current="true"` ומחזיר גריד ריק (אף מוצר עדיין לא מתויג);
`?shipping=free` מסמן ומחזיר את כל הקטלוג אחרי ה-fallback. `/account/coupons/<id>/gift` אנונימי:
307 ל-`/login?next=`.

**שערים על העץ:** `pnpm type-check` נקי, `pnpm lint` נקי (i18n 628/628, כל המחרוזות החדשות ב-`messages`),
`pnpm test` **583 קבצים, 7,027 ירוקים, 12 מדולגים**, `pnpm build` ירוק. **שער ההשוואה בחזית,
`--baseline=refs/ke_live_{width}.png`, exit 0:**

| דף | רוחב | תוכן | מצב |
|---|---|---|---|
| home | 380 | 8.44% | PASS |
| home | 768 | 9.03% | PASS |
| home | 1440 | 3.82% | PASS |

השורות ב-`docs/UI-PARITY-REPORT.md` 22:34-22:37 UTC על `c42099d58-dirty`. **שלוש השורות שלפניהן
(22:28-22:31) נמדדו בטעות מול השרת הזר על 3311 שמגיש build ישן** (ראה החלטות); הן נשארות בפנקס כי
השער כותב בעצמו, אבל הראיה היא 22:34-22:37. דפי הקטגוריה והחנות אינם נמדדים (חוסם 5).

**החלטות שהתקבלו לבד:**
- שרת `pnpm start` זר על 3311 (מ-Q13) עדיין חי ומגיש את ה-`.next` הישן; `pnpm start` שלי נפל עם
  EADDRINUSE בשקט וריצת ההשוואה הראשונה מדדה אותו. זוהה לפי `_buildManifest` חסר ו-0 צ'יפים ב-HTML,
  ונמדד שוב על 3312. לא נעצר (לא שלי). מי שמודד: לבדוק את ה-log של `pnpm start` לפני שקורא מספרים.
- לא נכתב SQL: כל העמודות שהתכונה נשענת עליהן קיימות בפרודקשן. תזמון להעברה מהחשבון לא נבנה
  (קיים בקופה בלבד), כי ביטול של שליחה מתוזמנת היה דורש כתיבה ל-`gift_deliver_at` שאינה קיימת.
- `docs/BACKLOG.md` עדיין לא קיים; `packages/money.ts` לא קיים (המסלול `src/lib/money.ts`). לא נגעתי בכסף.

## Q13 - DONE (אומת 25.09) - דף צור קשר בחמישה ערוצים, wa.me ו-support@ בלבד, בלי טלפון; כפתור שאלה על המוצר עם נפילה לשירות לקוחות

**הפריט כבר היה עשוי.** חמשת הערוצים והבורר ב-`bf0effa2e` (22.09), תיבת
`support@` והסרת כל טלפון של הפלטפורמה ב-`02cb65fb3` (23.09), וכפתור
"שאלה על המוצר" ב-`ace712504` (24.09). לא נכתב קוד. הטבלה אמרה DONE בלי
ראיה מהעץ ומה-build; זה מה שנמדד עכשיו.

**מה נבדק (נמדד, לא צוטט):**
- **חמישה ערוצים, בקוד ובטבלה:** `src/lib/contact/channels.ts`
  `DEFAULT_CONTACT_CHANNELS`: שירות לקוחות, הצעות ורעיונות, שיתופי פעולה,
  תקלה באתר, הצטרפות כבית עסק. אותם חמישה זורעים ב-`236_contact_channels.sql`
  (pending); עד ההחלה `listActiveContactChannels()` נופל לברירות המחדל
  בקוד, ולכן הדף מלא גם בלי המיגרציה. לכל ערוץ פותח משלו, `number: null`
  נפתר ל-`storeWhatsAppNumber()`.
- **`/contact` על ה-build המקומי** (BUILD_ID `tv1yIApZ_-SntVQ-_yU4P`, `pnpm start`
  על 3312): 200. ב-HTML המוגש: `contact-picker-contact_page` פעם אחת, כל אחת
  מחמש התוויות פעמיים (בורר + פוטר), `support@kenyonexpress.co.il` 4 פעמים,
  25 קישורי `wa.me/972524635550`, **0 `href="tel:"`**. המספר המודפס ליד
  "אפשר גם בוואטסאפ" מקושר ל-wa.me ולא ל-tel, ושניהם נגזרים מ-`lib/whatsapp`.
- **מייל:** `contactEmail()` ב-`src/lib/contact-address.ts`, ברירת מחדל
  `support@kenyonexpress.co.il`; ארבעת המסמכים המשפטיים, `LegalContactBlock`
  וטופס צור קשר קוראים אותה. `info@` נשאר רק בהערה ובטסט של `markup`.
- **בלי טלפון של הפלטפורמה:** ה-`tel:` היחידים ב-src הם טלפון של בית העסק
  (`supplier-contact.ts` ל-`SupplierInfo`, `SupplierStorefrontHeader`,
  `/coupon/[id]`), נתון עסק ולא ערוץ שירות; ההחלטה נרשמה ב-`02cb65fb3`
  ונשמרת. `ContactForm` בלי שדה טלפון.
- **דף מוצר** (`/product/עוזרת-אישית-שירותי-משרד`, 200): `ProductInfo.tsx`
  שורה 459 מרנדר `ProductQuestionLink` (`product-question-link`, "שאלה על
  המוצר בוואטסאפ", פותח `contact.productQuestionMessage` עם שם המוצר וכתובת
  הדף). ליד פרטי הספק `AskBusinessButton`: `askBusinessHref()` בוחר את
  הוואטסאפ של הספק רק כשהמוצר הפעיל אותו ויש מספר, אחרת שירות לקוחות עם שם
  המוצר בפותח, והתווית משתנה בהתאם ("שאלה לשירות הלקוחות בוואטסאפ"). על
  המוצר שנמדד: `data-via="customer_service"`, כלומר הנפילה עובדת.
- **טסטים קיימים:** `channels.test.ts` (137 שורות), `inquiry-links.test.ts`,
  `SupplierInfo.test.tsx`, `e2e/wa-contact.spec.ts`.

**שערים על העץ:** `pnpm type-check` נקי, `pnpm lint` נקי (i18n 628/628,
locale-format 138/138, input-dir 23, docs-index 280, docs-path-audit 155),
`pnpm test` **579 קבצים, 6,999 ירוקים, 12 מדולגים**, `pnpm build` ירוק.
**שער ההשוואה בחזית, `--baseline=refs/ke_live_{width}.png`, exit 0:**

| דף | רוחב | תוכן | מצב |
|---|---|---|---|
| home | 380 | 8.44% | PASS |
| home | 768 | 9.03% | PASS |
| home | 1440 | 3.82% | PASS |

השורות ב-`docs/UI-PARITY-REPORT.md` 22:02-22:05 UTC על `106846187` (הראשונה
נקייה, השתיים אחריה `-dirty` רק כי הפנקס עצמו השתנה). דף צור קשר ודף המוצר
ב-380/768 אינם נמדדים: אין להם צילום reference (חוסם 5).

**החלטות שהתקבלו לבד:**
- שרת `pnpm start` זר על 3311 (PID 23687, מהפריט הקודם) לא נעצר; השער רץ
  על 3312 מול ה-build הטרי ונעצר בסיום. הרצת `pnpm build` תחת שרת ישן
  משאירה אותו עם `.next` שהוחלף; מי שמשתמש ב-3311 צריך להפעיל מחדש.
- `docs/BACKLOG.md` עדיין לא קיים; `packages/money.ts` לא קיים (המסלול הוא
  `src/lib/money.ts`), כמו ב-Q06..Q12. לא נגעתי בכסף.
- סעיף Q11 הועבר לארכיון כדי לשמור על STATE.md מתחת ל-300 שורות.

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
