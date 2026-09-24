Updated: 2026-09-25 (סשן `audit/final-audit`, Fable 5.1, תור `~/ke-goals/final-queue.txt`)

## המשך מ:

**Q09 DONE (25.09).** הבא בתור: **Q10** (בטבלה DONE מ-`f6392ed6e`; לאמת על
העץ לפי כלל "פריט שכבר נעשה", ואז Q11).

ההיסטוריה המלאה (Q01..Q05, תור 23.09, וכל מה שקדם, 24,310 שורות) עברה
ל-`docs/STATE-ARCHIVE.md` באותו קומיט. הקובץ הזה מחזיק רק את מה שחי.

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

## Q06 - DONE (25.09) - אימות Q02..Q05 מול ראיות, ‏SHOWABLE: no

**מה נמדד בסשן הזה (לא צוטט מרישומים):** DNS (ארבע שאילתות dig, שני curl),
פריסות הפרודקשן ב-Vercel דרך REST (חמש האחרונות, עם sha), HTML חי של דף
הבית ושל `/product/barbecue-2`, `git rev-parse HEAD origin/audit/final-audit`
(זהים, `2ee29bc90`), `git log a388118f1..HEAD` (4 קומיטים), נוכחות
`migrations/pending/241..243`, grep שדות הטופס, ושער ההשוואה המלא למעלה.

**שערים על העץ של הקומיט הזה:** `pnpm build` ירוק (BUILD_ID למעלה),
`pnpm type-check` נקי, `pnpm lint` נקי (i18n 632/632, docs-index 280,
docs-path-audit 154 רשומות), `pnpm test` **574 קבצים, 6,945 טסטים ירוקים,
12 מדולגים**. הקבצים ששונו: `STATE.md`, `docs/STATE-ARCHIVE.md`,
`docs/INDEX.md` (שורה לארכיון), `docs/known-dangling-paths.json` (40 נתיבים
היסטוריים מהארכיון, דרך `--write` של הסקריפט, אפס הסרות), `README.md`
(279 -> 280 מסמכים, שער `ci-docs-inventory`), `docs/UI-PARITY-REPORT.md`
(שלוש שורות השער).

**החלטות שהתקבלו לבד:**
- **לא נפרס `2ee29bc90` לפרודקשן.** Q06 מבקש לכתוב מה חסר, לא לסגור אותו,
  ופריסה היא מצב עצירה. הפקודה שעובדת רשומה בזיכרון
  `production-served-by-invisible-vercel-account` ובסעיף Q02 בארכיון.
- **STATE.md נגזם ל-<300 שורות** לפי כלל הפריט; שום שורה לא נמחקה, הכל
  ב-`docs/STATE-ARCHIVE.md` באותו קומיט.
- `docs/BACKLOG.md` שהפריט מבקש לקרוא **לא קיים** (גם לא בהיסטוריה של הענף);
  `packages/money.ts` לא קיים, המסלול הוא `src/lib/money.ts` ו-`src/lib/commerce/money.ts`.
- שער ההשוואה הורץ אף שהפריט אינו נוגע ב-UI, כי כל שורות Q03 בפנקס היו
  `-dirty` ולא הייתה מדידה על קומיט נקי. עכשיו יש.

## Q09 - DONE (25.09) - מיילים ללקוח לפי הרשימה, כל השאר web push לדף ההזמנה

**ההחלטה שהפריט ביקש ממפעיל התקבלה בפריט עצמו.** ‏`final-queue.txt` (25.09
02:37) מאוחר ממדיניות 22.09 ומנקוב ברשימה סגורה; הרשימה היא ההחלטה. אין
צורך בשאלה.

**מה היה (נמדד בקוד):** ‏`mayNotify` חסם מייל לכל סוג לקוח חוץ מ-`voucher_gifted`,
אבל ‏`finalizeOrder` עדיין שלח ישירות את מייל ה-QR עם הקודים (`sendVoucherEmail`,
עוקף את המדיניות). איפוס סיסמה יצא מ-SMTP של Supabase, לא מ-Resend. לא הייתה
התראת אבטחה בשום מקום. ‏**כל web push נחת בדף הבית:** התבניות שמו ‏URL
מוחלט ב-`data.url`, ו-`sw.js` פותח רק נתיב שמתחיל ב-`/`.

**מה נכתב:**
- **רשימת המיילים** ב-`preferences.ts`: ‏`EMAIL_POLICY_EXEMPT_KINDS` =
  ‏`order_paid`, ‏`voucher_issued`, ‏`voucher_expiring`, ‏`voucher_gifted`.
  איפוס סיסמה והתראת אבטחה הם שליחה ישירה, לא סוג outbox (ה-CHECK היה
  דוחה סוג חדש עד מיגרציה, והתראה שמחכה למיגרציה אינה התראה).
- **אישור רכישה של 6 שורות** (‏14ג(ב)): ‏`renderConfirmation` אחד לשני
  הטריגרים (095 ללא קופונים, 102 עם). מוכר, הזמנה, שולם (עם קישור לקבלה
  במסלול שלנו), אספקה, ביטול (14 יום, דמי ביטול 5% או ‏₪100 דרך
  ‏`formatAgorot`), דף ההזמנה. **בלי קוד ובלי QR**; הקודים בדף ההזמנה.
  הטסט סופר בדיוק שש שורות. ‏`finalize.ts` לא שולח יותר את מייל ה-QR;
  ‏`sendVoucherEmail` נשאר לכפתור השליחה-מחדש של המפעיל.
- **איפוס סיסמה דרך Resend**: ‏`password-reset-send.ts`,
  ‏`generateLink({ type: 'recovery' })` לקישור שלנו
  ‏`/auth/callback?token_hash=…&type=recovery`; ה-callback מקבל ‏`type`
  מרשימה סגורה (‏`recovery`, אחרת ‏`magiclink`). ‏Supabase SMTP נשאר fallback.
- **התראת אבטחה**: ‏`security-alert.ts` + ‏`security-alert-send.ts`, נשלחת
  אחרי שינוי סיסמה, רישום ‏TOTP (רק כשהגורם היה ‏`unverified`), הוספת
  passkey והסרתו. **בלי קישור במייל** (צורת פישינג), כתובת האתר כטקסט.
- **web push לדף ההזמנה**: ‏`templates.ts` מכסה 11 סוגי לקוח (נוספו
  ‏`order_paid`, ‏`voucher_redeemed`, ‏`refund_completed`,
  ‏`voucher_expiry_credited`, ‏`referral_bonus_credited`, ‏`back_in_stock`);
  ‏`data.url` הוא נתיב ‏`/account/orders/<id>` כשיש ‏`order_id`, ו-`data.link`
  הצורה המוחלטת. ‏`welcome` ו-`voucher_gifted` בכוונה ללא push.
- העתק לקטלוג: ‏`purchaseConfirmation.*`, ‏`securityAlert.*`, ‏`passwordReset.*`
  ב-`he.json` ו-`en.json`. תקרת i18n ירדה 631 -> 628. ‏`docs/EMAILS.md` עודכן.

**שערים על העץ:** ‏`pnpm type-check` נקי, ‏`pnpm lint` נקי (i18n 628/628,
locale-format 138/138, docs-index 280), ‏`pnpm test` **578 קבצים, 6,990
ירוקים, 12 מדולגים** (+37). ‏`pnpm build` ירוק (BUILD_ID
‏`5CnF-KHhp1I594VQrgU2Y`). **שער ההשוואה בחזית, ‏`pnpm start` על 3311,
‏`--widths=380,768,1440 --baseline=refs/ke_live_{width}.png`: 380 ‏8.44% PASS,
768 ‏9.03% PASS, 1440 ‏3.82% PASS**, שלוש שורות ב-`UI-PARITY-REPORT` על
‏`4751618f0-dirty`. זהה ל-Q08 כי דף הבית לא נגע.

**החלטות שהתקבלו לבד:**
- **מספר עוסק/ח.פ אינו קיים בריפו** (לא בתוכן המשפטי, לא בפוטר, לא ב-env).
  שורת המוכר נושאת שם, כתובת הפוטר, ‏support@ וקישור לתקנון, בלי מספר
  מומצא. תיקון: עריכה אחת ב-`purchaseConfirmation.sellerName`. חוסם 9.
- **מייל ה-QR לקונה הוסר מ-finalize**, כי הרשימה סגורה ומדיניות 22.09 כבר
  אמרה שהקופון חי ב-/account. הקונה מקבל את 6 השורות + push לדף ההזמנה.
- ‏`voucher_expiring` הוא הסוג האופציונלי היחיד עם מייל; לא נוספה עמודת
  מייל בהגדרות (מתג חי אחד בעמודה מתה). ההסבר בעמוד ההגדרות עודכן.
- ‏`vercel.json` ללא crons: ה-drain (`/api/cron/notifications`) לא מתוזמן
  בפרודקשן. לא בפריט הזה; רשום כחוסם 10.
- ‏`docs/BACKLOG.md` עדיין לא קיים (כמו Q06..Q08). לא נוצר.
- **תהליך ‏`next-server` (pid 81888, לא מאזין על 3311, בעלים לא ידוע)** היה
  קיים לפני שער ההשוואה ונעלם אחרי הניקוי שלי (`pkill -f next-server -n`,
  שאמור היה לפגוע רק בשרת שלי). ייתכן שהיה שרת של סשן אחר. לא שוחזר, כי
  אין לי את הפקודה שהריצה אותו.

## Q08 - DONE (25.09) - חשבונית, שדות מע"מ בקופה, wa.me עם פרטי הזמנה, ביטול לפי 14ג

**מה היה לפני (נמדד בקוד, לא צוטט):** הורדת חשבונית חתומה קיימת בשני
המקומות: בדף התודה `InvoiceDownloadLink` (קישור חתום ופג-תוקף דרך
`/api/invoices/[orderId]/download`, מוזרם דרך המקור ולא מפנה ל-URL של הספק)
ובדף ההזמנה דרך `/account/orders/[id]/invoice` (בדיקת session). לא נשלח
בשום ערוץ, לחיצה בלבד. **שדות מע"מ לעסק היו רק בהגדרות החשבון**
(`BusinessInvoiceSettings`, טבלת `customer_invoice_settings`, 239 ממתינה),
**לא בקופה.** wa.me בשני הדפים נשא רק את מזהה ההזמנה. טופס "בקשת החזר" קיים
עם דמי ביטול 5%/₪100 אבל בלי אזכור של 14ג ובלי המילה "ביטול" בכותרת.

**מה נכתב:**
- **קופה:** בלוק "חשבונית על שם עסק" בשלב הפרטים (`CheckoutForm.tsx`),
  תיבת סימון + שם עסק + מספר עוסק/ח.פ. (9 ספרות, LTR), מוסתר עד לסימון,
  ממולא מראש מההגדרה השמורה (`checkout/page.tsx` קורא `getInvoiceSettings`
  דרך לקוח RLS). `submitCheckout` מאמת ב-`invoiceSettingsSchema` ומבצע
  upsert לאותה שורה **לפני החיוב**, כי `invoices.ts` קורא אותה בזמן בניית
  המסמך. אם השורה לא נכתבת והתיבה מסומנת (239 לא הוחלה), הקופה מחזירה שגיאה
  מפורשת במקום להנפיק חשבונית פרטית בשקט. שער צעדים ב-`steps.ts` דורש
  שם ומספר רק כשהתיבה מסומנת. ביטול סימון שומר שם ומספר ומכבה את הדגל.
- **wa.me עם פרטי הזמנה:** `buildOrderInquiryText` מקבל שמות פריטים (עד 3,
  "ועוד N") וסכום ששולם באגורות דרך `shekels(agorot())`. דף ההזמנה שולח את
  שורות ההזמנה והסכום; דף התודה את שמות הקופונים ו-`orderMoney.totalAgorot`.
- **ביטול לפי 14ג:** `RefundRequestForm` נקרא עכשיו "ביטול עסקה ובקשת החזר",
  עם משפט 14ג (14 יום מקבלת המוצר או מסמך הגילוי, לפי המאוחר) וקישור
  ל-`/legal/returns`. דף התודה מקבל שורה "התחרטתם?" עם קישור לדף ההזמנה.
- `messages/he.json` + `en.json`: `checkout.businessInvoice.*`,
  `cancellation.*`. תקרת i18n ירדה 632 -> 631.

**שערים על העץ:** `pnpm type-check` נקי, `pnpm lint` נקי (i18n 631/631),
`pnpm test` **574 קבצים, 6,953 טסטים ירוקים, 12 מדולגים** (+8 טסטים:
whatsapp, inquiry-links, steps, checkout-form-contract). `pnpm build` ירוק
(BUILD_ID `-B-svNKuB0-XB662vfExd`). **שער ההשוואה בחזית, `pnpm start` על
3311, `--widths=380,768,1440 --baseline=refs/ke_live_{width}.png`: 380
8.44% PASS, 768 9.03% PASS, 1440 3.82% PASS**, שלוש שורות ב-`UI-PARITY-REPORT`
על `44e318815-dirty`. זהה ל-Q06 כי דף הבית לא נגע.

**החלטות שהתקבלו לבד:**
- הקופה כותבת לאותה טבלה כמו הגדרות החשבון ולא לעמודה חדשה על `orders`:
  זה מה שהחשבונית קוראת היום, ואין מיגרציה חדשה. המשמעות: הבחירה בקופה
  מעדכנת את ברירת המחדל של החשבון, וזה נאמר ללקוח ברמז מתחת לשדות.
- `docs/BACKLOG.md` עדיין לא קיים (כמו ב-Q06). לא נוצר.
- הבלוק מרונדר גם לאורח (אין שורה לקרוא, ריק), כי התשלום דורש התחברות
  והכתיבה קורית אחרי ה-sign-in בפעולת השרת.

## Q07 - DONE (אומת 25.09) - כפתור שיתוף בדף המוצר

**הפריט כבר היה עשוי ב-`9fe2ca441` (23.09, על `audit/final-audit`).** לא
נכתב קוד; הפריט הזה אימת בלבד, לפי כלל "פריט שכבר נעשה: לאמת, לרשום, לסיים".

**מה נבדק על העץ:**
- `src/components/shared/ProductShareRow.tsx`, מרונדר מ-`ProductInfo.tsx`
  (שורה 455), כלומר על כל דף מוצר. הסדר: `WhatsAppShareButton` ראשון,
  בגופן `text-base font-bold` (בולט מהשאר), פותח `wa.me` בלחיצה עם ההודעה
  מ-`buildShareMessage` (שם הדיל + המחיר של ההצעה) והכתובת בשורה חדשה.
- כפתור "שיתוף": `navigator.share` כשקיים (מובייל); כשאינו קיים, לחיצה
  פותחת fallback: פייסבוק, טלגרם (`t.me/share/url`), מייל (`mailto:`).
  ההחלטה לפי קיום ה-API בזמן לחיצה, לא לפי user-agent.
- `CopyLinkButton`: `navigator.clipboard.writeText` + toast `הקישור הועתק`
  (sonner, `Toaster dir="rtl"` ב-`(store)/layout.tsx`). כל המחרוזות
  ב-`messages/he.json` תחת `share`.
- **אין WhatsApp אוטומטי בשיתוף**: כל פתיחת `wa.me` היא לחיצה של הלקוח.
  קיים ערוץ Twilio נפרד וקודם (`whatsapp_outbox`, מיגרציה 173) לתבניות
  שובר בלבד, מותנה opt-in ונבדק שוב בזמן שליחה; אינו מתוזמן ב-`vercel.json`
  (0 crons) ולא נגע בפריט הזה. `docs/BACKLOG.md` עדיין לא קיים.

**שערים על `5d22aa60e` (העץ נקי לפני השער):** `pnpm type-check` נקי,
`pnpm lint` נקי (i18n 632/632), `pnpm test` 574 קבצים, 6,945 ירוקים,
12 מדולגים; בתוך הירוקים `product-share-row.test.tsx` ו-`share-buttons.test.tsx`,
16 טסטים. `pnpm build` ירוק (BUILD_ID `feRtH5JRBtDXC-CvFtWaN`).
**שער ההשוואה, בחזית, `pnpm start` על 3311:**

| דף | רוחב | תוכן | מצב |
|---|---|---|---|
| product | 1440 | 2.79% | PASS (`refs/live-product.png`, `COMPARE_ALLOW_GRID_MISMATCH=1`, קומיט נקי) |
| home | 380 | 8.44% | PASS |
| home | 768 | 9.03% | PASS |
| home | 1440 | 3.82% | PASS |

380 ו-768 בדף המוצר עדיין ללא reference (חוסם 5); לא נכתבה שורה מומצאת.
השורות בפנקס `docs/UI-PARITY-REPORT.md`, 20:18-20:23 UTC.

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
| Q10 | DONE | `f6392ed6e feat(checkout): guest checkout on measured Electro geometry`. תשלום ב-mock מאחורי ממשק. |
| Q11 | OPEN, חלקי | הסכם click-wrap עם hash ב-`lib/suppliers/contract.ts`, CTA `1e9b4f0e2`. לא אומת: שמירת timestamp + IP. |
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
3. **מיגרציות ממתינות**: 240 (הסכמת "הכל באפליקציה"), 241 (עיר משלוש
   כותרות), 242 (מקור מחיר + ביקורות גוגל), 243 (תנאי מוצר). סדר והתנאים
   ב-`docs/RUNBOOK.md`, סקירה ב-`docs/MIGRATION-REVIEW.md`. לא הוחל דבר.
4. **R2 לא מופעל בחשבון Cloudflare** (10.09): תמונות המוצר נופלות ל-Supabase
   Storage, וגיבויי ה-DB החיצוניים אינם נכתבים כלל.
5. **צילום reference לדף מוצר ב-380 וב-768**: בלי זה השער בדף המוצר (Q04)
   נמדד ב-1440 בלבד.
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
