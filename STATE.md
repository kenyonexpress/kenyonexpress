Updated: 2026-09-25 (סשן `audit/final-audit`, Fable 5.1, תור `~/ke-goals/final-queue.txt`)

## המשך מ:

**Q23 DONE (25.09, נמדד ב-git).** הבא בתור: **Q24**, ואחריו **B01**.

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

## Q23 - DONE (נמדד 25.09) - docs/AUTOPILOT-DIFF.md: מה יש ב-autopilot וב-phase5/homepage-closeout שאין כאן

**נקרא דרך git בלבד, בלי merge ובלי cherry-pick.** בסיס משותף `a3df275ed` (09.09).
`autopilot` (`69bcbd5c7`, 17.09): **96** קומיטים שאין ב-HEAD, 18 מהם `autopilot residual`;
HEAD מחזיק 395 שאין שם. `phase5/homepage-closeout` = autopilot + **קומיט אחד**
(`7b2e5795b`, 24.09) שקיים רק ב-worktree המקומי ועל אף remote. **כל autopilot כבר
בתוך `origin/main`** (0 קומיטים של autopilot חסרים שם, ועוד 13 מעליו). ברמת קבצים:
181 קבצים שונו בשני הצדדים, 269 קיימים רק ב-autopilot, 805 רק ב-HEAD.

- **22 קבצי מיגרציה תחת מספרים ש-HEAD כבר השתמש בהם** (210, 211, 212, 215, 217,
  223, 224, 226 עד 242), תוכן שונה על כל מספר. שום דבר לא עובר כקובץ; כל מועמד
  צריך מספר מ-245 ודריי-ראן מגולגל. הטענות "223 ו-224 הוחלו" סותרות את הדריי-ראן
  של 21.09 (`docs/GO-LIVE-DRY-RUN.md`), ו-`src/types/database.ts` ריק מכל
  האובייקטים של הרשימה.
- **crons ב-`vercel.json`** (25 שם, 0 כאן): HEAD מתזמן 21 מ-Actions, והפרויקט
  ב-Hobby (שני crons ביום לכל היותר). לא לקחת.
- **קוד רק שם** (219 קבצים): תור עבודות + DLQ, seams לסקיילביליות (replica, QStash,
  Redis, Worker), gift cards, cashback tracker, מספור חשבוניות, חיפוש facets
  (סותר את הכלל "אין שדה חיפוש"), `/scan` בנתיב שכבר הוזז. רובו קיים ב-HEAD
  בצורה אחרת; הפירוט בטבלה במסמך.
- **הקומיט של ה-closeout**: 59 קבצי טסט (19,242 שורות), צנרת blue-green
  (מכוונת לפרויקט Vercel שמקושר לריפו אחר), Percy ו-LHCI (אין חשבונות), **ורגרסיות**:
  `pnpm lint` קוצץ ל-3 שערים מתוך 12, שני workflows נמחקו, 11 סקריפטים ירדו
  מ-`package.json`.
- **מה שווה לשמור, לפי סדר:** (1) תשעה קבצי טסט של actions שמודולים שלהם קיימים
  ב-HEAD **בלי אף טסט שמייבא אותם** (admin/cashback, categories, discounts, fraud,
  product-import, suppliers, vendors, newsletter, reviews), להעביר ידנית מול
  החתימות של HEAD, מודול לפריט; (2) תיקון הפנקס: תשעת הקבצים החיים בפרודקשן
  עדיין ב-`migrations/pending/`; (3) ערוץ Telegram + UptimeRobot, קטן ומותנה env;
  (4) docs/RLS-AUDIT-2026-09-09 כמדידה מתוארכת.

**החלטות שהתקבלו לבד:** (א) `docs/BACKLOG.md` לא קיים (הפריט מבקש לקרוא אותו);
נרשם, לא נוצר, ההחלטה נשארת ל-B01. (ב) שער ההשוואה **לא הורץ**: הפריט הוא מסמך
בלבד, אפס שינוי ב-UI; המספרים האחרונים על העץ הזה נותרו 8.44 / 9.03 / 3.82 PASS
(שורות 02:12-02:15 ב-`docs/UI-PARITY-REPORT.md`). (ג) נתיבים שקיימים רק
ב-autopilot נכתבו במסמך בלי backticks, כדי לא לפתוח שורות בפנקס הנתיבים התלויים;
שורה אחת (`docs/STATE-ARCHIVE.md :: docs/AUTOPILOT-DIFF.md`) ירדה מהפנקס כי
הנתיב קיים עכשיו. (ד) `README.md` מונה 281 מסמכים במקום 280 (הטסט
`ci-docs-inventory` דורש שוויון לשער).

**שערים:** `pnpm type-check` נקי, `pnpm lint` נקי (docs-index-gate 281,
docs-path-audit 154 ללא שינוי), `pnpm test` 599 קבצים / 7,149 ירוקים / 12 מדולגים
(הכשל היחיד היה ספירת המסמכים ב-README, תוקן), `pnpm build` ירוק (BUILD_ID
`OnR3EZ-PGGO1TQ1Zcm32v`).

## Q22 - DONE (נמדד 25.09) - E2E גלישה, מוצר, סל, קופת אורח עד ה-stub; Lighthouse mobile

**כל מספר כאן נמדד על build טרי עם ‏mock** (`CARDCOM_USE_MOCK=true
NEXT_PUBLIC_APP_URL=http://localhost:3331 pnpm build`, BUILD_ID
`vAlm2GJMPCfXqWiv00WJL`, שרת על 3331, ‏`frame-src ... 'self'` מוגש). שני
המשתנים חייבים להיות בזמן ה-build: ה-CSP של ה-iframe נאפה ב-`routes-manifest`
(`frame-policy.ts`), וה-canonical (`site-url.ts`) נאפה ב-shell הסטטי. build בלי
`NEXT_PUBLIC_APP_URL` מגיש canonical של פרודקשן ב-HTML ו-localhost בהידרציה,
ו-Lighthouse קורא ‏SEO ‏92 ("Multiple conflicting URLs"). נמדד; ב-Vercel שני
הזמנים חולקים env ואין סתירה.

- **E2E, ‏`--workers=1`, שני הפרויקטים (Desktop Chrome + Pixel 5):**
  `home`+`category`+`product` ‏**82/82**; `cart`+`checkout`+`purchase-flow`
  ‏**40 עברו, 3 דולגו** (שלושתם מותנים ב-viewport, בעיצוב);
  `full-purchase-redeem` על chromium ‏**2/2**: סל אורח ← `/checkout` פתוח
  לאורח ← כניסה בלחיצת התשלום (מייל, אותו מסלול `mergeGuestCart` של Google) ←
  ה-stub ‏`/checkout/frame-return` בתוך ה-iframe ← `/checkout/return` עם
  "התשלום הצליח!" ← שובר + QR ← `/account/coupons` ← מימוש בקופת הספק.
  הריצות כתבו שורות אמיתיות לפרודקשן על לקוח הבדיקות (3 הזמנות mock, 3 שוברים
  מומשו), כמו ב-21.09 וב-22.09. אין staging.
- **כשל אחד באצווה, לא בקוד:** בריצת האצווה השלמה גוף הקופה לא הגיע תוך 5 שניות
  (ה-snapshot מראה כותרת ופוטר בלבד) בזמן שהשרת רשם ‏1,834 ‏`db.query_failed`
  מרענון הרקע של דף הבית (הרעש הידוע, ‏`docs/FINAL-REPORT-V2.md` §1). ריצה
  לבד מיד אחר כך: ‏2/2.
- **שני פגמים אמיתיים נמצאו ותוקנו:**
  1. **גריד האזור האישי שבור מ-09.09.** ‏`AccountSideNav` ב-`(account)/layout.tsx`
     החזיר fragment של שלושה תאים (prompt, פעמון, nav) לתוך גריד של שתי עמודות
     (`260px 1fr`), ולכן ה-nav נחת בעמודה הרחבה והתוכן של כל דף ירד לשורה השנייה
     של עמודת ה-260. נמדד ב-`/account/coupons`: תוכן ברוחב ‏260 בתוך shell של
     ‏1250, שורה ברוחב ‏218, ופסקת הקוד ברוחב ‏**0** מאז ש-Q14 הוסיף כפתור פעולה
     שני. ה-fallback של ה-Suspense היה תא אחד, ולכן ה-shell נראה נכון עד שה-nav
     הגיע. תוקן: תא אחד `.account-side`, ו-fallback שמשקף אותו
     (`.account-side__bell-pending` ‏44+12px). אחרי התיקון: תוכן ‏960, קוד ‏338.
  2. **מרוץ strict-mode בשני טסטים של הקטגוריה:** `getByText` תפס את העותק המוסתר
     שריאקט חונה בסוף ה-body לרגע לפני ה-swap של הגריד המוזרם. ה-snapshot בזמן
     הכשל כבר הראה פסקה אחת בתוך `main`. ה-locator מוגבל ל-`#main-content`.
- **Lighthouse mobile** (13.4.1, ברירת מחדל: simulate, ‏412x823), 3 ריצות לכל דף
  על ה-build הזה:

  | דף | perf | a11y | BP | SEO | LCP מדומה | `provided` |
  |---|---|---|---|---|---|---|
  | `/` | 73 / 77 / 77 | 100 | 96 | 100 | 6.0-6.4s | **100** (LCP 0.48s) |
  | `/product/barbecue` | 76 / 80 / 80 | 100 | 96 | 100 | 5.0-5.8s | **100** (LCP 0.13s) |

  **alias הפרודקשן** (`kenyonexpress.vercel.app`, ‏`a388118f1`, לפני Q03 והתיקון):
  ‏`/` ‏**93 / 90**, מוצר ‏**87 / 92**. ‏BP ‏96 מקומי מול ‏100 בפרודקשן הוא http
  מול https.
- **תיקון LCP בדף הבית, נמדד:** אלמנט ה-LCP הוא תמונת הכרטיס הראשון של הגריד
  המוזרם מהקטלוג (לא ה-fixture ב-shell), ורשימת הגילוי של Lighthouse נכשלה
  בשלוש השורות (בלי fetchpriority, לא ניתן לגילוי ב-HTML, ‏`loading=lazy`), עם
  ‏525-634ms ‏`resourceLoadDelay`. ‏`priority` על ארבעת הכרטיסים הראשונים של
  הגריד האמיתי בלבד (`ProductDealCard` ‏`priority`, ‏`DealsGrid` ‏`eagerCount`;
  ה-fallback נשאר lazy כי כרטיסיו מוחלפים). אחרי: גילוי ‏2/3 (Next 16 פולט
  preload בלי fetchpriority), ‏delay ‏359-475ms, ‏`provided` LCP ‏0.48s.
  **הציון המדומה לא זז**, בדיוק כפי ש-`docs/PERFORMANCE-BUDGET.md` מתעד: מול
  localhost הגרף הפסימי של Lantern מכיל את כל הדף (30 סקריפטים / 423KB, ‏25
  prefetch של RSC, 3 פונטים) לפני ה-LCP הנצפה.
- **החלטות שהתקבלו לבד:** (א) יעד ה-90+ המדומה על localhost לא הושג ולא נרדף
  הלאה: ה-124KB ה"לא בשימוש" הם chunks של ריאקט/Next, וה-25 prefetch הם התנהגות
  ה-`<Link>` של Next; קיצוץ שניהם אינו בגדר הפריט ולא היה מזיז 6.3s ל-2.5s. המספר
  שנחשב הוא על ההפרסה של HEAD אחרי הפריסה (חוסם 2), וה-alias הישן כבר ב-90-93 בבית.
  (ב) רעש ה-`db.query_failed` בזמן רענון דף הבית לא סונן (מתועד, מחוץ לפריט).

**שערים:** `pnpm type-check` נקי, `pnpm lint` נקי (docs-index-gate OK), `pnpm test`
599 קבצים / 7,149 ירוקים / 12 מדולגים, `pnpm build` ירוק. שער ההשוואה בחזית על
3331, `--baseline`: **380 ‏8.44% PASS, ‏768 ‏9.03% PASS, ‏1440 ‏3.82% PASS**,
מוצר 1440 ‏**2.79% PASS**, שורות 02:12-02:17 ב-`docs/UI-PARITY-REPORT.md`.
תחזוקה: גיבוי `kenyonexpress-backup-2026-09-25-0931.tar.gz` (780MB) נוצר, הישן
מארבעה נמחק (כלל: שלושה); ‏`caffeinate` חי (pid 959), ‏`SleepDisabled 1`.

## Q21 - DONE (נמדד 25.09) - WCAG 2.1 AA, מטא SEO, schema.org Product/Offer, sitemap, robots

**נמדד על build טרי (`fyau7_b1Flj5STr-YW69a`) על 3321, לא על הרישומים.**

- **WCAG 2.1 AA**: `e2e/a11y.spec.ts` (axe-core, תגיות `wcag2a/wcag2aa/wcag21a/wcag21aa`,
  19 מסלולים ציבוריים, מקלדת, `lang="he" dir="rtl"`, באנר הסכמה ב-320/640/1440)
  בחזית, `--grep-invert=@writes`: **36 עברו, 1 דולג (באנר לא מוצג, בעיצוב), 0 נכשלו**,
  11.8s. ארבעת ה-`@writes` (סל, קופה, אשף, פאנל סל) לא רצים בלי DB שאינו פרודקשן,
  כמו שכתוב ב-`docs/ACCESSIBILITY-GATE.md`; זה הפער היחיד והוא ידוע.
- **מטא**: דף מוצר `/product/barbecue` מגיש `<title>`, `description`, `canonical`
  מוחלט, `og:title/description/url/image/locale=he_IL`, `twitter:card`. בית וקטגוריה
  עם canonical ו-description. `<html lang="he" dir="rtl">`.
- **schema.org**: דף מוצר מגיש `Product` + `Offer` (`priceCurrency: ILS`, `price`,
  `availability`, `seller`, `url`) + `BreadcrumbList`; בית `WebSite`+`Organization`;
  קטגוריה, ספק (`LocalBusiness`), FAQ, בלוג עם צמתים משלהם (`lib/seo/json-ld.ts`).
  **תוקן**: `highPrice` על `Offer` אינו מאפיין schema.org (שייך ל-`AggregateOffer`
  בלבד), ולכן המחיר המחוק לא הגיע לתוצאות החיפוש. הוחלף ב-`priceSpecification`
  מסוג `UnitPriceSpecification` עם `priceType: StrikethroughPrice`, הקידוד שגוגל
  מתעדת למחיר מחירון. נמדד בשירות אחרי build: `price 49.50`, מחיר מחוק `99.00`.
- **sitemap**: `/sitemap.xml` אינדקס עם 5 חלקים (content, categories, products,
  regions, suppliers); `products.xml` 46 כתובות מוחלטות מקודדות. `/robots.txt`
  מתיר `/`, חוסם 13 נתיבים פרטיים, מצביע על ה-sitemap.

**החלטות שהתקבלו לבד:** הפריט הוא אימות ותיקון אחד; לא נכתב שום דבר חדש
שכבר קיים (`0f42ef81a`, `b591ba19a`, `b36955eb3`, `cf567236f`, `d1adea146`).

**שערים:** `pnpm type-check` נקי, `pnpm lint` נקי (i18n 627/627), `pnpm test`
599 קבצים / 7,149 ירוקים / 12 מדולגים, `pnpm build` ירוק. שער ההשוואה בחזית על
3321, `--baseline`: **380 ‏8.44% PASS, ‏768 ‏9.03% PASS, ‏1440 ‏3.82% PASS**,
שורות 01:22-01:26 ב-`docs/UI-PARITY-REPORT.md`; מוצר 1440 ‏2.79% PASS (01:29).

## Q20 - DONE (אומת 25.09) - לוח ספק: מכירות, מימושים, זיכויים ותשלומים, קריאה בלבד

**נמדד על העץ ועל פרודקשן לפני שנכתבה שורה.** `29b921163` (Phase 13: מכירות
לפי מוצר ולפי יום ישראלי) ו-`bf9f2ca09` (פנקס תשלומים) הם אבות של HEAD. מה שחי:

- **מכירות**: `/supplier` (`(supplier)/supplier/page.tsx`): מימושים היום, גבייה
  בקופה היום, עמלת פלטפורמה, מגיע לספק, סה"כ מימושים, שיעור פקיעה (רק כשיש
  נתון); לפי מוצר (8) ולפי יום (7); גרף חודשי. `lib/supplier/dashboard.ts`
  מוריד שורות `refunded`/`cancelled` מכל סכום (`isReversedLine`,
  `supplierDueAgorot` מחזיר 0), `IncompleteDataNotice` כשהקריאה נחתכה.
- **מימושים**: `/supplier/redemptions` + CSV (`api/supplier/redemptions/csv`),
  היום ו-30 יום, סיכום להדפסה לקופה.
- **זיכויים**: `/supplier/payouts` מציג `זיכויים שקוזזו` (`reversedPayoutAgorot`)
  רק כשיש מה להסביר, ותווית `זוכה` בפירוט לפי סטטוס התחשבנות.
- **תשלומים**: `/supplier/payouts` (owner בלבד, `requireSupplierRole`), פירוט לפי
  `platform_percent` של כל שורה כפי שצולם ב-`order_items`, CSV מלא, דוח חודשי
  PDF/CSV (`api/supplier/statement`). כסף באגורות דרך `lib/money` בלבד.
- **קריאה בלבד, נמדד בפרודקשן**: אפס policies של INSERT/UPDATE/DELETE לחברי
  ספק על `order_items`, `orders`, `vouchers`, `payout_statements`,
  `payout_statement_lines`. הדפים אינם מייבאים אף action כתיבה.

**"per RLS", בדיוק מה נכון ומה לא.** שער החברות `requireSupplierMember` קורא
`supplier_members` דרך לקוח הבקשה תחת RLS. **קריאות הכסף עצמן רצות על service
role עם נעילת `supplier_id` מפורשת** (`server/queries/supplier.ts`), לא תחת
RLS. נמדד בפרודקשן (read-only, rolled back, כחבר הספק הפעיל היחיד): תחת
ה-policies החיות (`order_items_select_unified`, `orders_select_unified`,
`vouchers_select_unified`, RLS דלוק על שלוש הטבלאות) הספק רואה **17** שורות
הזמנה והקריאה הנוכחית מחזירה **19**. השתיים החסרות הן שורות על הזמנות
`refunded`: ה-policy של `orders` מגבילה ספק ל-`paid/partially_fulfilled/fulfilled`
וה-`!inner` join היה מוחק אותן. מעבר ל-RLS כמות שהיא היה מעלים בדיוק את
הזיכויים שהפריט דורש. מימושים: 2 = 2 (`redeemed_by_supplier_id` שווה
ל-`supplier_id` בכל שורה).

**החלטות שהתקבלו לבד:**
- הקריאות נשארות על service role עם שני מנעולים (`supplier_members` תחת RLS
  נותן את ה-id, `.eq('supplier_id')` על כל שאילתה). מעבר ל-RLS דורש הרחבת
  `orders_select_unified` ל-`refunded`/`cancelled` לחברי ספק, וזו מיגרציה בלי
  צרכן עד שהקריאות יוחלפו; לא נכתבה. אין שינוי קוד, הפריט הוא אימות.
- שלוש שורות FAIL בפנקס ההשוואה 01:05-01:08 (13.76/15.45/6.55) הן **ריקות**:
  `pnpm start` על 3311 נפל ב-`EADDRINUSE` (שרת של סשן אחר, רץ 3h19m) והשער מדד
  build זר. סומנו VOID בפנקס. הריצה התקפה על 3319 עם BUILD_ID מאומת ב-HTML.

**שערים:** `pnpm type-check` נקי, `pnpm lint` נקי (i18n 627/627, locale-format
134/134), `pnpm test` 599 קבצים / 7,149 ירוקים / 12 מדולגים, `pnpm build` ירוק
(BUILD_ID `Mua1dGRsNvKAGBt_VWnCK`). שער ההשוואה בחזית על 3319, `--baseline`:
**380 ‏8.44% PASS, ‏768 ‏9.03% PASS, ‏1440 ‏3.82% PASS**, שורות 01:11-01:14
ב-`docs/UI-PARITY-REPORT.md`.

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
