# KenyonExpress State

## Current Phase
**Phase 5 storefront + commerce מחווט**. branch `phase5/homepage`.
רץ מרתון 20 יעדי /goal (סשן 2026-07-23): יעדים 1-3 הושלמו.

## ענף feat/account-wallet (worktree `ke-account`, 2026-07-24)

אזור אישי + ארנק דיגיטלי. מסמך מלא: `docs/ARCHITECTURE-ACCOUNT-WALLET.md`.

| קומיט | תוכן |
|---|---|
| `33e4dd1` | מסמך הארכיטקטורה של הדומיין |
| `79693b6` | מיגרציה `052_account_wallet.sql`, **הוחלה על המרוחק ואומתה** |
| `a673f6f` | 8 מסכי `/account` |
| `ae974e4` | בדיקות + harness ל-RLS + תיקון באג התוויות |

**ההכרעה המרכזית**: לא נוצרה צורת ארנק חמישית. בבסיס הנתונים כבר היו ארבע
(`wallets` מ-001, `wallet_balances`+`wallet_transactions` מ-006, הגרסה של 026,
ו-`wallet_accounts`+`wallet_entries` מ-046). רק 046 מוחלת ויש בה נתונים, והיא
בדיוק המבנה שנדרש: חשבון פר משתמש + פנקס append-only ברישום כפול. 052 מרחיבה
אותה ומסמנת את הנטושות כ-DEPRECATED.

**מה 052 הוסיפה**: `cashback_rules` (הכלל של 5% בכל רכישה חמישית הפך משורת קוד
לשורת דאטה, עם אחוז / `every_nth_order` / מינימום / תקרה / קטגוריה / חלון
תאריכים), `fn_wallet_cashback_percent` ו-`fn_wallet_cashback_amount`,
`v_wallet_ledger` (עם `security_invoker`) ו-`v_wallet_balance_drift`, טריגר
שמבטיח חשבון ארנק לכל פרופיל, **ושני חורי RLS אמיתיים**: משתמש לא יכול היה
לקרוא את הפנקס של עצמו בכלל, ולכרטיסים שמורים לא הייתה מדיניות DELETE.

**באג שנמצא ותוקן**: `WALLET_REASON_LABELS` הכיל קודים מומצאים בעוד
`finalize.ts` כותב `order_cashback` / `order_spend`. עמוד הארנק היה מציג
ללקוחות קוד גולמי. נוספה בדיקה שקוראת את הקודים מתוך `finalize.ts` כדי שהשניים
לא יתפצלו שוב.

**אומת מול ה-DB החי**: בעלים רואה 2 שורות פנקס, זר רואה 0 (וגם 0 כתובות, 0
כרטיסים, 0 קופונים), ניסיון INSERT לפנקס נדחה, UPDATE ו-DELETE נגעו ב-0 שורות,
היתרה נשארה 1.80 ולא 9999, drift = 0. הרצה חוזרת:
`tests/sql/account_wallet_rls.sql`. סוויטה: 162 בדיקות עוברות, build נקי עם
כל 8 הראוטים.

**פתוח בענף הזה**: `cashback_rules` עדיין לא מחוברת ל-`finalize.ts` (הקאשבק
מחושב מ-`order_items.cashback_amount_agorot`); החיבור שייך ל-`ke-payments`.
`order_refund` ו-`admin_credit` מתועדים אך לא ממומשים.

## סיכום מצב 2026-07-24

### מה הושלם ועובד
| תחום | מצב | ראיה |
|---|---|---|
| החלטות עסקיות | **הוכרעו וננעלו** ב-`docs/CONTRADICTIONS.md` (C1-C10) | המסמך גובר על כל נוסח סותר |
| עמלת פלטפורמה | `platform_percent` פר-מוצר, חובה, **בלי ברירת מחדל** בשום מקום | מיגרציה 050, `settlement.ts` זורק בלי אחוז מפורש |
| עמוד מוצר | מאומת מול האתר החי | `77fb030` |
| Checkout | עגלה → `/checkout` → ספק → success + QR → זיכוי ארנק. מיגרציות 046/047 הוחלו על המרוחק | `0f5228e`, אומת E2E בדפדפן |
| Cardcom | ה-API הישן (`/Interface/*.aspx`), webhook לא חתום ומאומת דרך סוד ב-URL + GetLpResult, refund | `docs/CARDCOM-ARCHITECTURE.md` (בעץ, טרם בקומיט) |
| חיפוש | `/search` + API + hook, כולל escape ל-LIKE ול-metachars של PostgREST | `ba177b6`, `876aae0` |
| WhatsApp | כפתור צף, שיתוף מוצר/קופון, קישורי עדכון הזמנה | `76631d1` |
| Storage ותמונות | R2 presigned + pipeline webp/avif/blur + alt עברית חובה + `media_assets` (049) | `fc25aac`, `d6817fb` |
| E2E | Playwright 24/24 | `25430c1` |
| אדמין | שדות תוכן/לוגיסטיקה/SEO (048), פעולות bulk, תיקוני QA: open redirect, user enumeration, נעילה עצמית של role, גישת content_uploader, soft-delete לווריאציות, יצירת ספק | `9a7672a` + סדרת `fix(...)` |
| בדיקות | vitest 150/150, type-check נקי | הורץ 2026-07-24 |

### מה פתוח
1. **עבודה בעץ שטרם בקומיט**: מנוע Cardcom הישן + refund (`src/server/{actions/payments,domain/orders}/refund.ts`), פעולות bulk, `docs/DEPLOY.md`. צריך סבב בדיקות ואז קומיט משלה.
2. **מיגרציה 050 לא הוחלה על המרוחק** ובכוונה: היא זורקת אם קיים מוצר חי בלי `platform_percent`. צריך למלא את הערך פר מוצר באדמין קודם.
3. **טופס האדמין עדיין לא חושף `platform_percent` ולא `coupon_expiry_days`** - בלעדיהם אי אפשר לעמוד בדרישת "שדה חובה".
4. **מודל מחיר הקופון (C4)**: הקוד עדיין גוזר את המקדמה כאחוז. אין עמודת מחיר קופון פר-מוצר.
5. **מנוע payout**: T+3 ומינימום 100 ש"ח מתועדים, לא ממומשים.
6. ה-header הנעול קצר ב-70px מה-masthead החי, `redirect_to` של Google OAuth, `supabase db push` אסור (רק MCP).

### 3 המשימות הבאות לפי סדר
1. **עמוד קטגוריה 1:1 מול החי** - `compare.mjs --page=category` מ-23.7% אל מתחת ל-7%.
2. **`platform_percent` כשדה חובה באדמין** + `coupon_expiry_days`, ואז החלת 050 על המרוחק.
3. **קומיט מנוע Cardcom + refund** אחרי אימות ה-endpoint מול המסוף החי.

## Last Completed
Session 2026-07-24 (המשך) - יעד 3/20: פעולות bulk באדמין (קומיט feat(admin/bulk)):
- ‏actions חדשים ב-`src/server/actions/admin/products.ts`: ‏bulkAssignCategory
  (uuid או ללא קטגוריה), ‏bulkAdjustPrices (אחוזים: מכפיל גם את full_price לשמירת
  יחס ההנחה; קביעת מחיר: מדלג על מוצרים עם full_price נמוך ומדווח), ‏bulkSoftDeleteProducts
  (deleted_at + archived). ‏bulkUpdateProductStatus היה קיים.
- ‏ProductsTable: עמודת checkbox + בחר-הכל-בעמוד, סרגל bulk צף (פרסום/הסתרה,
  שיוך קטגוריה, עדכון מחירים percent/set, מחיקה עם confirm), ‏router.refresh
  וניקוי בחירה אחרי כל פעולה. העמוד מזרים רשימת קטגוריות.
- ‏ProductBulkClient הרדום (סטטוס בלבד, לא היה מחווט) נמחק.
- אומת: vitest ‏128/128, ‏Playwright ‏24/24, ‏type-check ו-biome נקיים.

Session 2026-07-24 - יעד 2/20: pipeline תמונות (קומיט feat(images)):
- `src/lib/images/process.ts`: ‏sharp - המרה ל-webp (1600/800/400, q80) + avif לרוחב
  הגדול (q55), בלי upscale, ‏blur placeholder ‏16px base64. ‏9 בדיקות vitest.
- `src/lib/images/validate.ts` (client-safe): סוגי קובץ, 8MB, ‏isValidHebrewAlt
  (לפחות 3 תווים + אותיות עבריות).
- `processAndUploadImage` ‏action: ‏staff-only, מעבד בשרת, מעלה כל rendition ל-R2
  (PUT חתום מהשרת) או ל-Supabase Storage כשאין R2 env, רושם ב-`media_assets`.
- מיגרציה 049 `media_assets` (הוחלה על המרוחק דרך MCP): ‏url ייחודי, ‏alt_he חובה,
  ‏blur, מידות, ‏renditions jsonb, ‏RLS: קריאה ציבורית, כתיבה staff.
- ‏ImageUploader: שלב staging עם שדה alt עברי חובה פר תמונה; ההעלאה חסומה עד
  שכל ה-alts תקינים.
- ‏ProductGallery עבר ל-next/image עם blur+alt מ-media_assets (עמודי מוצר ישנים
  בלי רשומה מקבלים fallback לשם המוצר); ‏PDP שולף metadata לפי URL.
- ‏sharp הועבר ל-dependencies; ‏next.config: ‏bodySizeLimit 10mb ל-server actions,
  ‏remotePatterns ל-R2/CDN.
- אומת: vitest ‏109/109, ‏Playwright ‏24/24, ‏type-check ו-biome נקיים.

Session 2026-07-23 (המשך 2) - כריית ה-repo הכפול (`/Users/ofir/kenyonexpress/kenyonexpress 0.48.20`,
נבנה בטעות בלילה) ופורט מה ששווה. דוח מלא: `docs/PORT-FROM-DUP-REPO.md`.
- נלקח (4 קומיטים): חיפוש `/search`+API+hook (`ba177b6`); ‏4 E2E specs מותאמים + תיקון
  auth.spec, סוויטה 24/24 (`25430c1`); שכבת R2 presigned + fallback (`fc25aac`);
  מיגרציה 048 שדות תוכן/מלאי/לוגיסטיקה/SEO למוצר, הוחלה על המרוחק דרך MCP,
  טופס+action+טיפוסים+מטא PDP (`9a7672a`).
- נזרק: Drizzle schema, checkout/cardcom של העותק, מודל split 70%, RLS ציבורי על
  suppliers, פסי בית מונעי-DB, HeaderSearch (header נעול), seed-demo, ועוד - נימוקים בדוח.

Session 2026-07-23 (המשך) - יעד 1/20: אינטגרציית WhatsApp (קומיט feat(whatsapp)):
- `src/lib/whatsapp.ts` + בדיקות (9): נרמול טלפון ישראלי ל-wa.me (מקומי/בינלאומי/קווי),
  waChatLink/waShareLink, בוני טקסט בעברית לשיתוף מוצר/קופון/פניית הזמנה/עדכון אדמין.
- `WhatsAppIcon` (SVG inline, אין brand icons ב-lucide), `WhatsAppFloat` (צף bottom-end,
  נסתר כש-NEXT_PUBLIC_WHATSAPP_PHONE ריק), `WhatsAppShareButton` (client, מוסיף URL נוכחי).
- חיווט: float ב-layouts של (store)+(main); שיתוף מוצר ב-ProductInfo ליד המק"ט;
  שיתוף קופון + קישור עדכוני הזמנה בעמוד checkout/return; קישור "שליחת עדכון הזמנה
  בוואטסאפ" באדמין ליד טלפון הלקוח עם טקסט סטטוס מוכן.
- `NEXT_PUBLIC_WHATSAPP_PHONE` נוסף ל-.env.example + .env.local (placeholder 0501234567,
  להחליף למספר האמיתי).
- תיקון סביבה אגבי: `createAdminClient` מקבל גם `SUPABASE_SECRET_KEY` (השם החדש שקיים
  ב-.env.local); בלעדיו כל דף עם admin client נפל 500 בדב. נמחק `.next/types/validator.ts`
  ישן שהפיל type-check על ראוטים שלא קיימים.
- אומת: vitest 93/93, type-check נקי, biome נקי על הקבצים שנגעו, curl על /products,
  עמוד מוצר ודף הבית מראה את הכפתור הצף ואת כפתור השיתוף.

## Previous Last Completed
Session 2026-07-23 - Phase 5 pixel/token + migration debt (לא בקומיט, לפי הוראה):

**מספרי diff (compare.mjs):** home מול ה-single-file `refs/ke_live_singlefile.html` = 22.5%;
home מול האתר החי האמיתי = 27.96% (baseline). **מסקנה מאומתת: יעד <3% pixel לא בר-השגה** דרך
tokens/layout: (1) ה-single-file הוא snapshot מנוון (header קרוס ל-1px מול 110px אמיתי, hero 422
מול 370), כך ש-<3% מולו ידרוש למחוק את ה-header; (2) מול האתר החי התוכן שונה (מוצרים, תמונות,
פרסום, גובה 5492 מול 5274) כך שרצפת ה-pixel-diff גבוהה ללא קשר ל-CSS. ה-"6.69%" הקודם היה section
בודד (רצועת USP), לא overall. ה-drift מצטבר: רק 51px עד רצועת ה-USP, השאר מתחת.

**נמסר בסשן:**
- `scripts/compare.mjs` תומך `--page=home|product`, home מכוון לאתר החי.
- `scripts/measure-electro.mjs` + `scripts/measure-live.mjs` (טבלאות `| Element | CSS | ref | Local | Match |`
  ל-`refs/`; נכתבו, לא הורצו: electro מאחורי Cloudflare + צריך localhost).
- `DESIGN-MEASURED.md` (פלטת #fed700 אמיתית, טיפוגרפיה, ריווח; מחליף את הגנרי).
- `src/styles/tokens.ts` (primary תוקן ל-#fed700, לא #FDD700; #B0E0E9 sky-blue סומן שגוי).
- `BenefitBar` + `CategoryStrip` ממקור tokens (`ELECTRO_HERO.uspBar/categoryStrip`), RTL logical, אפס hex/px.
- **SupplierInfo חדש** נרנדר על כל מוצר (coupon ופיזי), שם ספק public-safe דרך admin client (RLS של
  suppliers = admin-only), fallback חינני. אומת על מוצר פיזי.
- **Migration debt:** 002/003/004/005/011 מתועדים/idempotent (רובם כבר תוקנו ב-025). באג app תוקן:
  `admin/audit-log/page.tsx` עבר מ-`admin_audit_log` (נמחקה ב-025) ל-`audit_log` עם enum audit_action
  ופתרון actor דרך שאילתה שנייה (אין FK ל-profiles). **לא אומת על branch** (create_branch מריץ
  היסטוריה מרוחקת שנכשלת על 025 מסיבות לא קשורות; אומת בניתוח סטטי).

Session 2026-07-21 - יום עבודה אוטונומי מלא: קטגוריה, חנות, עגלה, merge checkout, חיווט תשלום.

**MEASURED-LIVE.md (לא בקומיט, לפי הוראה)**: `scripts/measure-live.mjs` מדד את
kenyonexpress.co.il ב-1440x900 + 375x812 עם getComputedStyle+getBoundingClientRect
(מוצר, קטגוריה, עגלה עם פריט אמיתי, header, footer; 1,025 שורות; צילומים ב-`shots/`).
כל ערכי העיצוב בסשן נלקחו מהקובץ הזה.

**שלב א - דף קטגוריה (`1af2de7`)**: `/category/[slug]` נבנה מחדש ל-Electro החי:
breadcrumb 25/22.4px, h1 25px/500 מימין + ספירת תוצאות משמאל, בר מיון #efefef
radius 9 עם מחליף תצוגה ו-select מעוגל 174x34, grid flex של כרטיסי 234px
(תגית 12px #768b9e, מחיר 20px ins #dc3545 del 12px, כותרת 14/700/#0062bd,
תמונה 186, badge ‎#44b81b בפינת תחתית-imline-start, כפתור עגלה עגול 37x34),
pagination צהוב #fed700, sidebar סינון חדש (`CategoryFilterSidebar`: קטגוריות +
טווח מחיר min/max, עמודה 234 ב-inline-end). מיון ברירת מחדל -> name_he asc
(תואם menu_order החי). `compare-category-live.mjs` מול קטגוריית המסעדות החיה:
**23.7%** (מתחת ליעד 30%; השארית נשלטת ע"י ה-header הנעול שקצר ב-70px מהחי).

**שלב ב - `/products` (`239600c`)**: ארכיון "חנות" כמו live /shop/ - אותם רכיבים,
`getShopProducts` עם 24 לעמוד. `compare-shop-live.mjs`: **26.07%** (לחי 44 מוצרים
מול 31 אצלנו - השוני תוכן, לא layout).

**שלב ג - עגלה (`7964b2b`)**: **מיגרציה 045_restore_carts הוחלה על המרוחק** -
public.carts חסרה שם (001 נעצרה מוקדם) וכל add-to-cart של אורח נפל ב-PGRST205.
עיצוב `/cart` יושר ל-Electro הנמדד (h1 40/500/#333e48, שורות 17px, qty pill 14,
מחיקה #a7a7a7, checkout צהוב pill 22, רוקן-עגלה אפור #efecec). commitCart עטוף
ב-startTransition. אומת E2E כאורח: הוספה, drawer, כמות, הסרה; פיצול מעורב
קופון 18/162 + פיזי 230 => באתר 248, עמלה 41, לספק 207.

**שלב ד - merge (`bad5548`+`1e7e027`)**: ה-WIP הלא-מקומט מ-worktree
`kenyon-checkout` קומט על `phase6/checkout` ומוזג פנימה: payments provider
(Cardcom Low Profile + mock + HMAC), דומיין orders (state machine, escrow,
redemption, settlement + 41 בדיקות), webhook + supplier redeem routes, עגלת
Zustand (useCart API נשמר), admin orders, טיפוסי DB, zustand+qrcode.
קונפליקט יחיד: CartProvider -> גרסת ה-store. build נקי, vitest 84/84.

**שלב ה - חיווט checkout (`0f5228e`)**: `/checkout` (סקירת הזמנה, פיצול פר שורה,
טופס כתובת לפיזי -> user_addresses, ארנק, תקנון) -> `submitCheckout` ->
`beginCheckout` -> ספק (mock אוטומטי בפיתוח, אין קרדנצ׳יאלס sandbox ב-env) ->
`/checkout/return` עם reconcile שרת (verifyLowProfile + בדיקת סכום + finalize
אידמפוטנטי), עמוד הצלחה עם כרטיסי קופון (קוד 8 ספרות + QR + סכום לתשלום בעסק +
תוקף) והודעת קאשבק; `/checkout/failed`. finalizeOrder: זיכוי ארנק
מ-platform:cashback_reserve (idempotency `order:<id>:cashback`), ניקוי עגלה,
תיקון supplier_payout_ils (NOT NULL מ-007). **מיגרציות שהוחלו על המרוחק דרך MCP**:
`046_checkout_runtime.sql` (גשר: payments, payment_webhook_events, coupon_codes,
payment_tokens, wallet_accounts+wallet_entries+fn_wallet_transfer service-only,
products.platform_percent, snapshots ל-order_items, stub is_supplier_member, RLS)
+ `047_checkout_settlement.sql` (הטיוטה מה-merge, ממוספרת מחדש).
אומת E2E בדפדפן (משתמש בדיקה checkout-e2e@kenyonexpress.test בסיסמה):
הזמנת קופון (שולם 18 מ-180, קופון+QR הונפק, escrow held, קאשבק 0.90 נזקף,
reserve ‎-0.90 כפול-רישום) והזמנה מעורבת עם כתובת (817 שולם, split 759.05/39.95,
מלאי ועגלה עודכנו).

**החלטות דאטה בסשן (dev)**: מוצרי restaurants-cafes סומנו is_coupon_enabled=true
(דילים של מסעדות = קופונים באופיים); ל"ארוחה בשרית" נקבע cashback_percent=5
להדגמת הזיכוי. משתמש בדיקה חדש ב-auth.

**הערת מודל - הוכרעה 2026-07-24**: אין ברירת מחדל לעמלה. `platform_percent`
פר-מוצר הוא הידית היחידה ו-`commission_percent` יצא משימוש. פירוט מלא
ב-`docs/CONTRADICTIONS.md`.

## In Progress
nothing

## Blocking Issues
- ה-header הנעול קצר ב-70px מה-masthead החי (topbar+masthead 148px בחי מול 95px
  אצלנו) - מגביל כל compare מול האתר החי; נדרש אישור Ofir לגעת בקבצים הנעולים.
- redirect_to של Google OAuth נבנה עם `undefined` כשה-NEXT_PUBLIC_APP_URL חסר
  בקונטקסט הפעולה (נצפה בלוגי E2E) - לא חוסם checkout, כן חוסם התחברות Google
  אמיתית מקומית.
- `supabase db push` עדיין אסור; החלות רק דרך MCP apply_migration.

## Next Task
ראה "3 המשימות הבאות" בסיכום המצב למעלה. אחריהן ממשיך מרתון ה-/goal:
cron, כתובות, ביטול הזמנה, דוחות ספק, Q&A, סל נטוש, גלריה, פילטרים, Cmd+K,
feature flags, Redis cache, API layer, webhooks, פרטיות, DB opt,
visual regression, RTL sweep.
(משימה קודמת שנדחתה: מימוש קופון אצל הספק + דף הזמנות ללקוח.)

## Working Directory
/Users/ofir/kenyonexpress-web/kenyonexpress

## Supabase Project URL
https://ixvwfbuvfxxsjiywhbbb.supabase.co (dev)

---

## History (סשנים קודמים)

Session 2026-07-20 (ערב) - `ARCHITECTURE-PERFORMANCE-SEO.md` (שורש, design only):
- מסמך מאוחד מחייב לביצועים + SEO בזמן ריצה. בולע/מיישר את
  `docs/ARCHITECTURE-PERFORMANCE.md` ומחבר ל-CATALOG §3, GROWTH §1,
  WP M8, TESTING-CICD D8/D26, ANALYTICS §7.
- כיסוי: מיפוי 301 (proxy בלבד, לא vercel.json), sitemap/robots/canonical,
  אין hreflang (סיגנלי he/he_IL/he-IL), JSON-LD בלי ratings, meta עברית +
  OG סטטי ראשי / `@vercel/og` משני, CWV + תמונות + Heebo + PPR + bundle,
  cacheLife/tags, טבלת רינדור לכל route (כולל supplier/admin), RUM +
  Lighthouse nightly warn, 8 שאלות פתוחות.
- מצביעים עודכנו בראש PERFORMANCE ו-GROWTH-SEO. אין קוד, אין מיגרציה.

מה בנוי נכון ל-2026-07-20 (רקע, לא השתנה בסשן הזה):
- Homepage 1:1, PDP `/product/[slug]`, Cart E2E, commerce engine + 042 draft,
  Admin Phase 3, מיגרציות מרוחקות עד 025 (+019/020/021), build ירוק.

Session 2026-07-20 (לילה, המשך) - קישור מוצרים ל-6 ה-vendors הקיימים (044):
- **מיגרציה** `supabase/migrations/044_link_products_to_vendors.sql` (idempotent): משקפת את 6 ה-vendors (אלקטרו פלוס, סטייל הבית, ביוטי לאב, ספורט מקס, טעמים גורמה, טק וורלד) לתוך `public.suppliers` עם אותם UUIDs (כיוון האיחוד המתוכנן של 036; `products.supplier_id` מפנה ל-suppliers, לא ל-vendors), מקשרת את כל 31 המוצרים לפי קטגוריה (electronics->אלקטרו פלוס, phones-computers->טק וורלד, restaurants-cafes+professionals->טעמים גורמה, beauty-health->ביוטי לאב, vacation->ספורט מקס, השאר->סטייל הבית), ומוחקת את 3 ספקי הדמו הזמניים של 043.
- **הוחל על המרוחק** דרך `scripts/apply-044-link-vendors.mjs` (PostgREST). הרצה חוזרת = 0 שינויים. אימות: 31/31 supplier_id, 31/31 תמונות, חלוקה 4/4/6/6/8/3, suppliers=6.
- **תמונות**: המציאות כבר מיושרת מ-043 - `products.images` jsonb (מקור, Unsplash demo URLs) + `product_images` (הוקרנה, 31 שורות). אין תמונות ב-buckets.

Session 2026-07-20 (לילה) - Data Integrity Audit + Seed Repair (`17dbca0`):
- **אודיט מציאות מול סכימה** (`scripts/audit-data-integrity.mjs`, קורא דרך PostgREST עם service role): במרוחק products=31 (כולם physical/active), categories=12, suppliers=0, vendors=6, product_images=0. התמונות חיות ב-`products.images` jsonb (עמודה מ-016, כרגע URLs של Unsplash), לא ב-`product_images` ולא ב-bucket. ה-DB המרוחק חסר את עמודות 027 על suppliers (אין status/legal_name) ואת 042 (אין platform_percent, אין wallet_accounts/commission_ledger), אבל כן יש products.cashback_percent+coupon_expiry_days.
- **מיגרציה חדשה** `supabase/migrations/043_seed_suppliers_link_products.sql` (idempotent, עמודות 005 בלבד כך שרצה על המרוחק): 3 ספקי דמו עבריים עם UUID קבועים (אלקטרו סחר / חופשות ישראל / בית ומשפחה), קישור round-robin דטרמיניסטי לפי slug של כל מוצר עם supplier_id NULL, והקרנת `products.images` jsonb אל `product_images` (ראשונה=ראשית, לפי המודל הכפול של ARCHITECTURE-WP-DATA-MIGRATION).
- **הוחל בפועל על המרוחק** דרך `scripts/apply-043-seed.mjs` (PostgREST, אין SQL ישיר; אין SUPABASE_DB_URL ואין MCP). הרצה חוזרת = 0 שינויים.
- **אימות** (`scripts/verify-data-integrity.mjs`): 31/31 עם supplier_id, 31/31 עם תמונה (jsonb וגם product_images), חלוקה 11/10/10. VERIFICATION PASSED. type-check ירוק, push בוצע.
- **הערת סדר**: על DB שבו 042 טרם הוחלה יש להריץ 043 לפני 042 (ה-preflight של 042 דורש supplier_id לכל המוצרים). אחרי 042 היא no-op בטוח.

Session 2026-07-20 (ערב) - תיקוני RTL, build והרשאות:
- **Hero RTL** (`8c36a52`): `HeroSlider.tsx` הוחלף לכיוון electro - תמונה ב-`start-0` (ימין תחת RTL), כל תיבות הטקסט ב-`end-0` עם `text-end` (שמאל), הזחות `ps->pe`, פסקאות מחיר `dir=ltr` קיבלו `text-start`, תג החנויות `ms-auto`. אושר על ידי Ofir.
- **פיצול rbac** (`971ac6b`): `src/lib/admin/roles.ts` חדש (ROLE_LABELS/ROLE_ORDER/isAdminRole/isStaffRole client-safe); `rbac.ts` מייצא מחדש ושומר את ה-guards. `UsersTable.tsx` + `UserRoleClient.tsx` מייבאים מ-roles. תיקן שבירת build (supabase/server בתוך client).
- **CartProvider ב-(main)** (`1fd3a5f`): `(main)/layout.tsx` עוטף ב-CartProvider+CartDrawer+Toaster כי Header->MastheadNav->CartNavLink קורא useCart; תיקן קריסת prerender של /coupons. build ירוק מקצה לקצה.
- **הרשאות Claude Code**: ב-`.claude/settings.json` נוסף `ask: ["Bash(git push:*)"]` ו-defaultMode הוחזר מ-acceptEdits ל-default, לפי בקשת Ofir שדחיפות יידרשו אישור. הגלובלי (`~/.claude/settings.json`) נשאר bypassPermissions - גובר עליו ה-project בפרויקט הזה.
- **ניתוח compare.mjs** (משווה את דף הבית מול `refs/ke_live_singlefile.html`, מתעלם מ---page): OVERALL 22.66% ב-2600px הראשונים. הרצועות הגרועות (y900-1200 עד 55%) הן היסט אנכי ~56px שמקורו ב-masthead שמוסתר בלכידת ה-singlefile (ארטיפקט מתועד בסשן 2026-07-09) - לא לתקן על ידי הסתרת ה-masthead שלנו. פער אמיתי שנותר: רוחב קונטיינר ~1290px אצלנו מול 1170px ב-live (בר USP וגריד הדילים), וגובה אזור hero גבוה בכ-60px.


Session 2026-07-20 - `ARCHITECTURE-ANALYTICS-BI.md` (שורש הפרויקט, design only, v3):
- מקור האמת המאוחד החדש לדומיין האנליטיקה. בולע את `docs/ARCHITECTURE-ANALYTICS-BI.md` (v2, קיבל הודעת האחדה בראשו) ומיושר מול טיוטות 033+034 (לא הוחלו).
- תוספות v3: שדה `source_app` (shop/delivery/taxi) לאירועים ול-rollup (מוכנות superapp); session stitching אורח-למחובר בשלוש שכבות (עוגיית anonymous_id יציבה + טבלת `analytics_identity_links` חדשה + שאילתות stitched אד-הוק בלבד); אירועי client חדשים `checkout_step` ו-`web_vital`; דייג'סט מייל יומי 08:00 (`/api/cron/daily-digest`, ממוזג עם SEV3 של OBS-15, שלב A ב-Resend); `v_repeat_purchase_monthly` + `v_web_vitals_daily` + הרחבת `v_funnel_daily`.
- הכרעות: דשבורד אדמין מ-views בזמן אמת (לא matview שעתי; שער 200ms p95 למעבר); Vercel Speed Insights כן / Vercel Web Analytics לא; web_vital בדגימת 25% תחת gate ההסכמה; retention raw 13 חודשים (12 + חפיפת YoY); שאילתות איטיות דרך pg_stat_statements חודשי עם ספים 200ms/100ms.
- הדלתא נכנסת לטיוטות 033/034 עצמן לפני החלה (סעיף 11 במסמך), לא מיגרציה חדשה. לא נכתב קוד, לא הוחלה מיגרציה. 6 שאלות פתוחות.
- **הכרעות בעלים נסגרו (2026-07-20, עדכון בתוך המסמך):** ייחוס = **UTM בלבד** (עוגיית 30 יום first/last; referrer/click-IDs/`ref` נדחו לפרסום בתשלום, הרחבה = שינוי SDK בלי מיגרציה); דייג'סט יומי לאדמין **ב-07:00 ישראל** (Vercel cron כפול 04:00+05:00 UTC עם guard שעה ישראלית + idempotency `owner_digest:<il_date>`); **חלוקת cron: Vercel Cron לכל job אפליקטיבי (מייל, התראות, workers, reconcile), pg_cron רק ל-SQL פנימי ל-DB** (expire_coupons 01:50, ביטול pending תקועות כל 15 דק', rollup 02:10, matviews 02:40, partitions חודשי, purges).

Session 2026-07-20 - `ARCHITECTURE-AI-AGENTS.md` (שורש הפרויקט, design only):
- תכנון מאוחד ל-5 סוכני המשימה: support, supplier_ops (onboarding), catalog_enrichment (content), fraud_watch, pricing_analyst. ממופה ל-agent_key הקנוני של 028 + docs V1/V2.
- נשען על התשתית הקיימת (028, V1, V2 runtime) בלי לשכתב; גובר על V2 רק בשתי תוספות המשימה: יומן שיחת תמיכה (`support_conversations`/`support_messages`) וגרידת מתחרים (`competitor_sources`/`competitor_price_observations`) עם גבולות חוקיים (robots.txt, facts-only, ToS, ללא PII).
- כיסוי: runtime (Anthropic SDK server-side, ANTHROPIC_API_KEY env-only, SSE, prompt templates ב-DB admin-editable, cost tracking דרך agent_runs+v_agent_costs_daily, kill switch דו-שלבי), מטריצת הרשאות + PII + אין card data, השקה מדורגת עם מדד הצלחה פר סוכן, 7 פקודות עבודה (WO-A..G), 8 שאלות פתוחות.
- לא נכתב קוד, לא נכתבה מיגרציה, לא שונה DB.

Session 2026-07-20 - `ARCHITECTURE-WP-MIGRATION.md` (שורש הפרויקט, design only):
- עדכון מחייב של `docs/ARCHITECTURE-WP-DATA-MIGRATION.md` (M1-M17) לסכימת 042: המרת אגורות (W2), commission_ledger accrual לשוברי legacy (W6), cashback_percent=0 למיובאים.
- הכרעות חדשות W1-W8: שיוך ספק = שער curation חוסם (042 NOT NULL, גובר על M6); קוד שובר 8 ספרות או הנפקה חדשה עם מיפוי ב-id_map (W7); coupon_expiry_days חובה ב-curation (W8); Google auto-link לפי אימייל + מייל מעבר יחיד למשתמשי סיסמה (W3).
- 032 מאושררת + תוספת שתי עמודות curation (`approved_supplier_slug`, `approved_coupon_expiry_days`) בגוף הטיוטה (W5, טרם הוחלה).
- כיסוי מלא: data inventory (mysqldump), מיפוי שדה-שדה, staging pipeline (resumable+dry-run), לקוחות ל-Auth, שוברים חיים ל-coupon_codes, integrity gates, cutover + parallel-run, 8 שאלות פתוחות.

Session 2026-07-20 - `ARCHITECTURE-CHECKOUT-PAYMENT.md` (שורש הפרויקט, design only):
- מכונת מצבים מלאה: cart → identity → address → Cardcom → webhook → finalize → fulfillment.
- Guest flow, Cardcom Low Profile, `checkout_finalize` idempotent, refunds, payment_attempts, error recovery, security.
- ER + sequence diagrams + 10 open questions. מרחיב COMMERCE/API-CONTRACTS; `ARCHITECTURE-CART-CHECKOUT.md` עדיין חסר.

## Last Completed (המשך סשן 2026-07-20 ערב)
- **בר USP + שורת קטגוריות יושרו ל-live**: `BenefitBar.tsx` קונטיינר 1170px (x135-1305), `CategoryStrip.tsx` הוזז ל-x577-1305 (`me-[517px]`). אומת ויזואלית 1:1 מול הרפרנס. compare דף הבית: 22.5% (השארית = ארטיפקט masthead).
- **עמוד מוצר נמדד מול האתר החי** (`compare-product-live.mjs`, slug 'מוצר-לדוגמא'): OVERALL 24.44% ב-2600px. רצועות פתוחות לתיקון: y400 (50%), y900-1100 (65-77%), y1500 (63%), y2100 (53%). לא 1:1 עדיין.
- **מדיניות סוכנים**: manual mode גלובלי + ask על git commit/push (גלובלי ופרויקט), חוק 4 ב-CLAUDE.md שוכתב ל"commit ו-push רק באישור".

## In Progress
nothing

## Blocking Issues
`ARCHITECTURE-CART-CHECKOUT.md` עדיין חסר (handoff עגלה מצוין ב-Q2 של מסמך התשלומים).
מיגרציה 042 מוקצית גם ל-Admin Ops וגם ל-Supplier Portal. היסטוריית המיגרציות
במרוחק לא מסונכרנת; אסור `supabase db push`; החלה רק דרך MCP `apply_migration`.
Docker מקומי לא רץ (רלוונטי ל-harness D6).

## Next Task
דף קטגוריה 1:1 - grid מוצרים, סינון, pagination לפי `refs/ke_live_singlefile.html` (הוראת Ofir 2026-07-20).
במקביל/אחרי: סגירת רצועות עמוד המוצר (y400, y900-1100, y1500, y2100) מול האתר החי.
בהמשך: Phase 0 של CI (`ci.yml`) או `ARCHITECTURE-CART-CHECKOUT.md`.

## Working Directory
/Users/ofir/kenyonexpress-web/kenyonexpress

## Supabase Project URL
https://ixvwfbuvfxxsjiywhbbb.supabase.co (dev)

---

Session 2026-07-17 - מסמך אבטחה מחייב + מיגרציית הקשחה 036 (design only, לא הוחל):
- **`docs/ARCHITECTURE-SECURITY.md` (חדש)**: מסמך ההכרעות המחייב לאבטחה. גובר על כל מסמך אחר בבקרות אבטחה. מבוסס על סקירת כל docs/ + כל 001-035 + הקוד החי ב-src/. כולל: רישום ממצאים SEC-01..SEC-17 ממוין לפי חומרה; STRIDE פר 7 זרימות (עגלת אורח, Google login בתשלום, Cardcom + webhook, סריקת/מימוש קופון, ארנק פנימי, payout ספק, פאנל אדמין); תרחישי תקיפה + מיטיגציה (מרוץ מימוש כפול, webhook replay/forgery, מניפולציית ארנק, עקיפת RLS, IDOR, גניבת טוקן כרטיס, escalation אדמין); אודיט RLS מלא עם החלטות; ניהול סודות + תוכנית רוטציה (כולל rotation מבוסס qr_key_id ל-Ed25519); rate limiting דיפרנציאלי (fail-closed לכסף/קופון, fail-open ל-UX); ניתוח חוק הגנת הפרטיות + תיקון 13, והכרעת PCI-DSS = SAQ-A (Cardcom hosted Low Profile, אין PAN אצלנו, טוקן revoked מכל תפקידי דפדפן; הפער היחיד ל-SAQ-A הוא הוספת CSP/security headers שחסרים); מיפוי דרישות אודיט מול audit_log.
- **הממצא הקריטי (SEC-01)**: `fn_wallet_transfer` (טיוטה 026) עושה רק `REVOKE ... FROM anon`, כלומר נשאר PUBLIC EXECUTE הכולל `authenticated`. הפונקציה SECURITY DEFINER בלי בדיקת בעלות/is_admin, וחשבונות platform פטורים מ-CHECK של יתרה אי-שלילית -> כל משתמש מחובר יכול לחייב את `platform:cashback_reserve` ולזכות את הארנק שלו בכל סכום (wallet minting). אומת ישירות מול 026:335 וגוף הפונקציה. שאר הפונקציות הכספיות (redeem_coupon, payouts) עושות נכון `REVOKE FROM PUBLIC, anon`.
- **`supabase/migrations/036_security_hardening.sql`** (טיוטה, idempotent, **לא הוחלה**): מספור אחרי כל הטיוטות הקיימות (הגבוה בפועל 035, אין 034). מגונן-קיום לחלוטין: בטוח להחלה על ה-DB החי (~025) בין אם 026-035 הוחלו ובין אם לא; תיקונים על אובייקטים מוחלים (SEC-02/03/04/06/09/17) רצים מיד, ותיקונים תלויי-טיוטה (SEC-01/10/11/12 + wrapper) מופעלים בהרצה חוזרת אחרי החלת הטיוטות. תוכן: נעילת fn_wallet_transfer ל-service_role (SEC-01); ביטול execute מ-fn_redeem_coupon הישן (SEC-10); הסרת affiliates_user_update (SEC-02); recreate של "profiles: admin all" עם WITH CHECK + טריגר enforce_role_change_privilege שחוסם escalation לדרגת admin/super_admin ו-self-elevation (SEC-03); pinning של supplier_id ב-"profiles: owner update" נגד דליפת קופונים חוצת-ספקים (SEC-17); הסרת coupons_supplier_mark_used (SEC-04); הסרת policies ישנות מדי products/variants/categories/vendors + policy מת של 014, ו-product_images מקבל policies מפורשים פר פקודה (SEC-06); הידוק WITH CHECK של carts (SEC-09); טריגר enforce_supplier_member_role שמגביל self-service ל-manager/scanner (SEC-11); check_my_rate_limit מבוסס auth.uid() + נעילת check_user_rate_limit ל-service_role (SEC-05); נעילת cleanup_* ל-service_role (SEC-07); טריגר audit ייעודי ל-supplier_bank_accounts שמסתיר account_number/holder_id_number מ-audit_log (SEC-12); טבלת security_events append-only + fn_log_security_event (SEC-13); assert_seeds_allowed נגד seed בפרודקשן (SEC-14).
- **לא שונה שום קוד רץ, שום מיגרציה מוחלת, שום דאטה**. חובות קוד שנשארו (מתועדים במסמך, לא SQL): rate-limit.ts עדיין fail-open וצריך לעבור fail-closed בנתיבי כסף + לחווט את הלימיטר ל-checkout (SEC-08); הוספת CSP/security headers ל-proxy.ts (נדרש ל-SAQ-A); env.ts עם zod fail-fast.

Session 2026-07-17 - מסמך אנליטיקה/BI מאוחד v2 + מיגרציית הרחבה 035 (design only, לא הוחל):
- **`docs/ARCHITECTURE-ANALYTICS-BI.md` (חדש, v2)**: מקור האמת המאוחד לדומיין האנלייטיקה. בולע את `ANALYTICS-BI-ARCHITECTURE.md` (שקיבל הודעת איחוד בראשו ונשאר תיעוד 033), סוגר שאלות פתוחות ומוסיף: טקסונומיית אירועים מלאה עם סכימות payload (מיפוי הדרישה העסקית: wallet_credit = wallet_earn הקנוני; coupon_redeemed ו-supplier_payout נוספו כ-derived), אישרור אחסון first-party ב-Supabase (partitioning חודשי, retention 13 חודשים ל-raw, תיקון 13 + הפרדת PII מבנית), דשבורד ספקים RLS-scoped, BI אדמין (take-rate לפי platform_percent, cohort retention, דוח התחייבות פקיעת קופונים), אסטרטגיית אגרגציה בשלוש מדרגות עם לוח רענון, ואינטגרציית סוכני AI.
- **`supabase/migrations/035_analytics_bi.sql`** (טיוטה, idempotent, **לא הוחלה**): prereq קשיח 026+027+033 (028 אופציונלית, מזוהה דינמית); 2 אירועי registry חדשים (coupon_redeemed, supplier_payout); אינדקסים (coupon_codes(expires_at) WHERE issued, coupon_codes(supplier_id,status), order_items(supplier_id)); 4 views לפורטל ספקים (v_supplier_sales_daily, v_supplier_redemptions_monthly, v_supplier_scans_daily, v_supplier_payouts; כולם security_invoker על RLS של 027); 2 views אדמין (v_take_rate_monthly, v_coupon_expiry_liability עם דלי overdue_not_swept כבקרת cron); 2 matviews service-role-only (mv_cohort_retention_monthly, mv_take_rate_monthly; REVOKE מ-anon/authenticated כי אין RLS על matviews) + fn_refresh_analytics_matviews (REFRESH רגיל בכוונה: CONCURRENTLY אסור בתוך פונקציה); ממשק סוכנים: fn_agent_kpi_snapshot() (service בלבד, jsonb של KPI מטבלאות אמת) + v_agent_costs_daily (מותנה בקיום agent_runs).
- **מספור**: קבצים בפועל עד 033; 034 נשארת שמורה ל-034_vendors_unification.sql (הכרעות 1.19/1.38 במסמך האב), לכן הדומיין הזה = 035. אין תלות של 035 ב-034.
- **הכרעות מדיניות חדשות (סעיף 8 במסמך)**: קופון שפג בלי מימוש = אין החזר אוטומטי, breakage מוכר ביום הפקיעה, זיכוי מחווה רק דרך תמיכה כ-manual_adjust; cashback פוקע אחרי 12 חודשים עם תזכורת 30 יום מראש (מימוש אצל דומיין הארנק); דשבורד ספק לא חושף leaderboard/התנהגות גולשים/פירוט wrong_supplier; בדיוק 2 matviews עם רענון לילי 02:40 (אחרי rollup 02:10), אין עוד בלי בעיית ביצועים נמדדת.
- **שאלה פתוחה שנשארה**: קונפליקט מנועי הסליקה 026 (supplier_payouts) מול 027 (payout_statements); ה-BI בנוי על payout_statements בהתאם להכרעת מסמך האב.

Session 2026-07-17 - מסמך הפעלה מחייב למיגרציית ה-WP (design only, לא הוחל דבר):
- **נוצר `docs/ARCHITECTURE-WP-DATA-MIGRATION.md`**: מאחד את `docs/WP-DATA-MIGRATION-ARCHITECTURE.md` (2026-07-09) עם הסכימה החיה והכרעות MASTER, גובר עליו בכל סתירה. 17 החלטות (M1-M17). כיסוי מלא: מלאי טבלאות WP לחילוץ (כולל HPOS + טבלאות plugin שוברים), הכרעת שיטת חילוץ (mysqldump מלא + rsync uploads; WP-CLI נדחה כמקור, מותר רק כעטיפה ל-db export), מיפוי שדה-שדה מול הסכימה החיה (כולל כתיבה כפולה kenyon_price + price_ils כי price_ils עדיין NOT NULL, ואיסור type='service' בגלל drift אפשרי ב-enum), אסטרטגיית לקוחות ל-Auth (Admin API, בלי סיסמאות, בלי קמפיין reset המוני; כניסה ראשונה Google/magic link + מייל מעבר תפעולי יחיד), כללי ניקוי C1-C10, עיצוב סקריפטים scripts/wp-import/00-09 (idempotent, dry-run, דוח reconciliation, purge לפי batch), תוכנית cutover מלאה (DNS Vercel, TTL 300, ציר T-30 עד T+14), והכרעת הזמנות היסטוריות: ארכיון קריא ב-wp_import, לא מיגרציה ל-public.orders (חריג יחיד: שוברים חיים).
- **באג "עיר: נהריה" תועד ונקבע כלל C1**: כל ערך עיר מ-meta של מוצר בוורדפרס הוא ברירת מחדל שגויה של התבנית ולא מוקרן לעולם (לא ל-products.attributes ולא ל-suppliers.city); עיר אמיתית רק מרשומת ספק מאומתת (027). issue ‏`city_default_bug` פר מוצר. הבאג לא נוגע ל-billing_city של לקוחות.
- **הוכרעו 4 השאלות שהמתינו לאישור** (בהוראת הרצה אוטונומית "להכריע הכול"): שאלה 2: הקפאת מכירת שוברים T-30 + עידוד מימוש, חריג השוברים החיים נשאר כ-contingency; שאלה 4: כן למייל מעבר תפעולי יחיד דרך סאב-דומיין txn, בלי תוכן שיווקי; שאלה 5: ראיות opt-in היסטוריות לא מכובדות, re-opt-in באתר החדש; שאלה 6: store credit אם יימצא מיובא כתנועות פתיחה דרך fn_wallet_transfer מ-platform:adjustments עם idempotency_key ‏legacy_opening:<wp_user_id>.
- **הכרעת מנגנון 301 (M8)**: כל ה-redirects כולל הדפוסים הקבועים חיים ב-seo_redirects ונאכפים ב-src/proxy.ts עם 301 מדויק; אין redirects() ב-next.config.ts (מחזיר 308, לא סופר hits, מפצל את מקור האמת).
- לא שונה שום קוד, שום מיגרציה ושום דאטה; 032 נשארת טיוטה לא מוחלת. המשימה החוסמת של המסלול: השגת גישה SSH/DB לאתר הישן + הרשאת GSC (שלב 0).

Session 2026-07-17 - מסמך בדיקות ו-CI/CD מחייב (design only, אין קוד ואין מיגרציות):
- **`docs/ARCHITECTURE-TESTING-CICD.md`**: מחליף את `TESTING-CICD-ARCHITECTURE.md` (2026-07-09) ומיושר למודל העסקי המעודכן של `BUSINESS-MODEL.md` + `ARCHITECTURE-COMMERCE.md` (2026-07-17). הכרעות חדשות D13-D22, המרכזיות: מודל קופון לפי `coupon_price` חופשי (לא נגזרת platform_percent) עם מקרי K1-K8; enum הקופון הקנוני נשאר `coupon_status` מ-008 (issued/used/expired/refunded), `coupons_issued` מהמסמך החדש ממומש על `coupon_codes`; שכבת component חדשה (Testing Library + jsdom, רינדור עברית/RTL של קומפוננטות כסף); E2E על Vercel Preview כ-workflow נפרד read-only בלבד (`@preview`); מנוי: idempotency פר `(subscription_id, cycle_number)`, כשל חיוב = 3 ניסיונות אז paused (S1-S7); **אין טבלאות בדיקה במיגרציות** - תמיכת בדיקות ב-`supabase/seed.sql` + `tests/sql/90_test_support.sql` (CI בלבד, לא נוצר קובץ מיגרציה); Node 22 ננעל; קידום פרודקשן git-based בלבד + Vercel Instant Rollback + DB forward-only; kill switch `CHECKOUT_ENABLED`; סדר deploy מחייב מיגרציה לפני קוד (expand/contract).
- **4 workflows מתוכננים**: `ci.yml` (static/unit+component/build/integration/migrations-shadow-x2/e2e-smoke, חוסמים merge על `cursor/add-supabase-3c830`), `preview-e2e.yml` (deployment_status), `nightly.yml` (e2e מלא + חוזה Cardcom sandbox אמיתי + visual), `db-backup.yml` (pg_dump יומי עד Pro). מטריצת המסלול הקריטי המלאה: P1-P12, W1-W10, R1-R8, C1-C11, WL1-WL8, G1-G4, K, S.
- **לא כלול (נכתב כשמתחילים Phase 2/3)**: קבצי ה-workflows עצמם, seed.sql, fake-cardcom, קוד הבדיקות. המסמך מדפיס את עץ הקבצים המלא בסעיף 7.

Session 2026-07-09 - עבודת פיקסלים על סקשן שלושת הטורים מול רפרנס מתוקן:
- **נוצר `refs/ke_live_threecol.html`** (gitignored, כמו שאר ה-refs): עותק של ה-singlefile עם הסרת sf-hidden כירורגית מסקשן שלושת הטורים בלבד (23 הסרות: עמודת התפריט, tp-bullets, שלושת ה-da). **ממצא מרכזי**: SingleFile מחק את התוכן של האלמנטים המוסתרים, כך שהטורים הצדדיים ברפרנס מרונדרים ריקים (עמודת התפריט div ריק, באנרים קליפות בלי תמונות). לכן יעד "מתחת 2%" בסקשן לא בר-השגה כשיש תוכן אמיתי בטורים.
- **מדידות**: מול הרפרנס המתוקן התחלה 14.97% (ב-2600px הראשונים), סיום 7.89%. מול הרפרנס הישן: 6.67% התחלה.
- **תוקן ב-`CategoryStrip.tsx`**: קופסת אייקון קבועה 100x100 (הייתה נדחסת לרוחב הטקסט), הבלוק הוצמד לטור האמצעי של הרפרנס x336-1064 (ms-auto + me-276px על הורה max-w-page=1320), יישור אנכי אחיד y479 (justify-start + pt-16 + whitespace-nowrap), טייל "עד 99" טקסט בלבד כמו ברפרנס. תוצאה: התאמה עד ±2px, הרצועה ירדה מ-23.2% לרעש.
- **תוקן ב-`ke-live-deals-data.ts`**: שני מוצרים (צימר שוויץ 8898, אחוזת דניאל) הצביעו על POOL_IMG כי ke-live-deal-2/9.avif לא חולצו; התמונות האמיתיות יושבות ב-singlefile כ-background-image בקידוד base64 (lazy-load של WP Rocket, ה-extractor קורא רק img.src) - חולצו ל-`public/images/products/ke-live-deal-2.avif` + `-9.avif`.
- **שאריות מעל 2% (מתועד, לא נמשך)**: רצועות hero y0-400 (14-28%, טורים עם תוכן מול טורים ריקים ברפרנס + כותרת 39px ברפרנס כי ה-masthead הוסתר בלכידה); רצועות תמונות בגריד 6-9% (רעש קידוד: next/image דוגם מחדש, ויזואלית זהה); שורה 4 של הגריד מסודרת אחרת ברפרנס מסדר ה-DOM של ה-extractor.
- אומת: dir=rtl lang=he, תפריט צהוב #fed700 מימין עם 11 קטגוריות בעברית, 3 באנרים משמאל, קרוסלה במרכז rs-19. צילום סקשן: /tmp/three-column-final.png.
- ידוע ולא טופל (מחוץ לסקופ): שגיאת type-check ב-`Footer.tsx` (lucide-react בלי Facebook/Instagram exports) - קדמה לסשן הזה.

Session 2026-07-09 - טריאז' 8 השאלות הפתוחות של מיגרציית ה-WP (סעיף 7 של docs/WP-DATA-MIGRATION-ARCHITECTURE.md):
- **הוכרעו אוטומטית (DECIDED auto, בלי tradeoff עסקי)**: שאלה 1 (זיהוי plugin השוברים ייעשה מה-dump בשלב 0 דרך 00-preflight, לא מנחשים; השאלה העובדתית פתוחה עד שיש dump), שאלה 3 (השגת גישה SSH/phpMyAdmin + GSC היא משימת הפעולה המיידית שחוסמת את שלב 0), שאלה 7 (לפני ה-flip נכתב רק המינימום המחויב: תקנון, פרטיות, משלוחים והחזרות, צור קשר; השאר אחרי, 301 זמני לדף הבית), שאלה 8 (לא מנגישים חשבוניות PDF ישנות באתר החדש; ארכיון + מענה ידני במייל).
- **ממתינות לאישור (tradeoff כספי/משפטי/לקוחות, לא הוחל דבר)**: שאלה 2 (הקפאת מכירת שוברים 30 יום לפני ה-flip כדי לשאוף לאפס שוברים פתוחים ולבטל את חריג 1.4), שאלה 4 (מייל מעבר תפעולי חד-פעמי ללקוחות, נוסח יובא בנפרד), שאלה 5 (האם לכבד ראיות opt-in היסטוריות; המלצה: לא, re-opt-in באתר החדש; ברירת המחדל בתוקף ממילא), שאלה 6 (אם יימצא store credit ב-Woo: ייבוא כרשומות פתיחה בארנק או זיכוי ידני).
- מענה בפורמט "X מאשר" / "X לא מאשר" יסגור כל אחת מ-2/4/5/6.

Session 2026-07-09 - שכתוב מלא של מסמך האב (reconciliation של כל מסמכי הארכיטקטורה + טיוטות 026-033):
- **`docs/MASTER-ARCHITECTURE.md` (גרסה 2)**: מאחד את כל 11 המסמכים (commerce, suppliers, agents, accounts, catalog, notifications, WP-import, analytics, ops, testing-cicd, superapp, product-page) ואת 001-025 המוחלות + טיוטות 026-033. 38 סתירות עם הכרעה: חלק א ליבת המסחר (1.1-1.18), חלק ב מספור/חשבונות/התראות (1.19-1.24), חלק ג דומיינים חדשים (1.25-1.35), חלק ד אנליטיקה וייבוא WP (1.36-1.38). הכרעות מרכזיות: המספור הפיזי גובר, תוכנית שינוי השמות של הגרסה הקודמת בטלה; 032=wp_import, 033=analytics, **איחוד vendors=034** (קובץ חדש, טרם נכתב); payout_status של 027 (5 ערכים) קנוני, סעיף 8 של 026 (supplier_payouts) נמחק לטובת payout_statements; redeem_coupon של 027 = נקודת המימוש היחידה + INSERT ל-coupon_redemptions בהצלחה; products.platform_percent בבעלות 026 בלבד, nullable (נמחק מ-027 ומ-030); notification_status נוצר עם 6 ערכים ב-029 וה-ALTER TYPE נמחק מ-031; CHECK ערוצים כולל whatsapp ב-029; supplier_members = מודל ההרשאה היחיד, is_supplier_member_compat נמחקת מ-028; סריקה 30/דקה; fail-closed ל-begin_checkout+coupon_scan; /products/ ברבים; consent: מצב בהעדפות + ראיה ב-consent_events, הצעת superapp נדחתה; push_subscriptions למיגרציה עתידית; **עריכה חדשה ל-026: שורות פתיחה ב-ledger ליתרות שהיגרו** (v_wallet_ledger_drift של 033); retention של search_queries עלה ל-6 חודשים. סדר קנוני: 026→027→028→029→030→031→032→033→034, סשן החלה אחד דרך MCP apply_migration, harness בדיקות לפני החלה. כולל ERD מלא, סדר בנייה שלבים 2-5 + מסלולים C (קטלוג) / A (אנליטיקה) / W (ייבוא WP), ורישום חוצה-מערכת (RBAC, enums, אירועים, rate limits, retention).
- **הטיוטות 026-033 לא שונו** (כמתחייב); סעיף 2 במסמך האב הוא checklist העריכות לפני החלה.
- משמעת מספור נקבעה (סתירה 1.19): לפני יצירת קובץ מיגרציה בודקים ls ולוקחים את הפנוי הבא + מעדכנים את מסמך האב באותו commit.

Session 2026-07-09 - תכנון דומיין אנליטיקה ו-BI (design only, לא הוחל):
- **`docs/ANALYTICS-BI-ARCHITECTURE.md`**: עיקרון שני מישורים (כסף רק מטבלאות ledger: orders/order_items/payments/wallet_transactions/coupon_codes; התנהגות רק ב-analytics_events; אסור לסכום כסף מאירועים), טקסונומיה קנונית עם registry ב-DB (analytics_event_definitions: 12 אירועים, snake_case, required_props, schema_version; purchase/refund/coupon_scan/wallet_earn/wallet_spend/search הם derived ונקראים מטבלאות המקור, בלי כתיבה כפולה), הוכרע איסוף first-party לתוך Supabase בלי כלי חיצוני (טריגרים לפתיחה מחדש: פרסום בתשלום או ~200K אירועים/חודש), צנרת: לקוח batch+sendBeacon -> /api/a -> fn_ingest_analytics_events (service, ולידציה מול registry, דה-דופ על PK (occurred_at,event_id), סימון בוטים, קיטום IP ל-/24), partitioning חודשי, retention 13 חודשים ל-raw + rollup יומי לנצח, הסכמה לפי תיקון 13 לחוק הגנת הפרטיות: אירועי דפדפן רק אחרי opt-in (עוגיית ke_consent + wording_version), רשומות עסקיות לא מותנות, מודל הכנסות מ-snapshot בלבד (GMV / תקבולים באתר / הכנסת פלטפורמה כ-3 מספרים נפרדים; החזרים כשורה שלילית ביום ההחזר, בלי שכתוב עבר), התחייבות ארנק = sum יתרות user + view drift מול ה-ledger, משפך קופונים (issued=paid באותו רגע; scan rate = used/(used+expired) + median days to scan), דשבורד בעלים אחד (v_owner_dashboard שורה אחת + v_money_alarms; נקרא עם service client אחרי requireAdminSession כי RLS ישן חסר policies אדמין למשל על carts), עיון שבועי: v_funnel_daily / v_cohort_ltv_monthly / v_supplier_leaderboard_30d / v_channel_revenue_weekly (ייחוס דרך orders.attribution, last-touch), איכות: סינון בוטים + תנועת צוות מה-rollup, זמן עסקי Asia/Jerusalem דרך fn_il_date בלבד, clamp שעון לקוח.
- **`supabase/migrations/033_analytics.sql`** (טיוטה, idempotent, **לא הוחלה**): prereq קשיח 026+027 (exception אם חסרים, בדפוס 031), fn_il_date/fn_is_bot_ua, analytics_event_definitions + seed 12 אירועים + audit trigger, analytics_events (partitioned RANGE חודשי, PK (occurred_at,event_id), RLS גם פר partition) + default partition + fn_ensure_analytics_partitions(חודש קודם עד +2) + fn_drop_old_analytics_partitions(13), fn_ingest_analytics_events (service בלבד, batch עד 50, props עד 4KB, clamp occurred_at לחלון [now-7d,now+5m]), analytics_daily + fn_rollup_analytics_daily (מסנן בוטים וצוות admin/super_admin/content_uploader), orders.attribution jsonb (ייכתב על ידי beginCheckout), אינדקסי דוחות (orders(paid_at), coupon_codes(status,created_at), coupon_scan_events(created_at), wallet_transactions(created_at)), 11 views עם security_invoker: v_revenue_daily, v_refunds_daily, v_wallet_liability, v_wallet_ledger_drift, v_coupon_funnel_monthly, v_supplier_leaderboard_30d, v_cohort_ltv_monthly, v_channel_revenue_weekly, v_funnel_daily, v_money_alarms, v_owner_dashboard + v_search_quality_daily מותנה בקיום search_queries (030).
- **מספור**: 032 נתפסה על ידי wp_import staging; איחוד vendors->suppliers (מסמך האב 2.4) יקבל מספר עתידי. 033 תלויה רק ב-026+027 (לא ב-028-032). להחיל רק דרך MCP apply_migration, אחרי 026 ו-027.
- **ממצא חוצה-דומיין**: העתקת יתרות הארנק ההיסטוריות ב-026 (INSERT ישיר מ-wallet_balances בלי שורת ledger) תגרום ל-v_wallet_ledger_drift לסמן כל חשבון ותיק. לפני החלת 026 יש להמיר את ההעתקה לרשומות פתיחה ב-ledger (manual_adjust מ-platform:adjustments, idempotency key בסגנון opening:<user_id>).
- **לא כלול**: קוד אפליקציה (SDK צד לקוח, route /api/a, באנר הסכמה, UI דשבורד, פליטת begin_checkout + כתיבת orders.attribution בתוך beginCheckout), תזמון crons (pg_cron: rollup לילי 02:10 + partitions חודשי; Vercel cron: התראות v_money_alarms), purge של coupon_scan_events (90 יום) / search_queries (6 חודשים) שבבעלות הדומיינים שלהם.

Session 2026-07-09 - תכנון אסטרטגיית בדיקות, איכות ו-CI/CD (design only, אין קוד ואין מיגרציות):
- **`docs/TESTING-CICD-ARCHITECTURE.md`**: 12 הכרעות (D1-D12). המרכזיות: סביבת אינטגרציה = Supabase מקומי (Docker) שנבנה מאפס בכל ריצת CI (לא Supabase branch, לא פרויקט dev המשותף; ה-drift הופך את dev לבלתי-אמין, ו-stack נקי מוודא בכל PR את bootstrap הפרודקשן העתידי); כל אריתמטיקת כסף במודול טהור יחיד `src/lib/money/` (אגורות integer) שנולד עם 22 מקרי בדיקה (M1-M22: אחוזי קצה 0/0.01/12.5/33.33/99.99/100, round-half-up מול banker's, עיגול פעם אחת לשורה ולא ליחידה, הקצאת ארנק O5); Cardcom אמיתי לא משתתף ב-PR CI (adapter יחיד + fake; sandbox אמיתי רק לילי/ידני); E2E בלי Google OAuth אמיתי (משתמשי בדיקה מקומיים); מטריצת RLS הצהרתית (9 personas על ~28 טבלאות, כולל בדיקה שלילית על ה-runner עצמו); harness מיגרציות = apply מלא פעמיים על stack נקי + אימות pg_policies יציב; 10 מקרי replay/התקפה ל-webhook (W1-W10) + 8 מקרי refund (R1-R8); visual regression ב-Playwright snapshots על 390/360/768/1440 (compare.mjs נשאר כלי 1:1 ידני); צינור ci.yml עם 9 jobs, חוסם merge: static/unit/build/integration/migrations(path-filter)/e2e-smoke, מזהיר: e2e-full/visual/Lighthouse; רשימת 14 אינברינטים סגורה (סעיף 2.0) שכל אחד חייב בדיקה; DoD לכל שלב (עגלה, checkout, ארנק, ספקים).
- **חוב בדיקות T1-T12**, החמורים: T1 אין CI בכלל; T2 rate-limit.ts fails open (מתועד); T3 mergeGuestCart race (מתועד); T4 policy שבורה 014; T5 payment_tokens עדיין תחת policy ישנה של 001 (אסור token אמיתי עד 029).
- **לא כלול**: קבצי workflow, קוד בדיקות, seed.sql, fake של Cardcom - נכתבים כשמתחילים Phase 2/3 לפי המסמך.

Session 2026-07-09 - תכנון מיגרציית דאטה מוורדפרס/WooCommerce (design only, לא הוחל):
- **`docs/WP-DATA-MIGRATION-ARCHITECTURE.md`**: ארכיטקטורת ייבוא מלאה מהאתר החי kenyonexpress.co.il. הכרעות מרכזיות: מקור חילוץ = mysqldump מלא + העתק wp-content/uploads (נדחו REST/WXR); סכימת `wp_import` = ארכיון קבוע + staging בפרויקט היעד, לא חשופה ל-PostgREST; **הזמנות היסטוריות = ארכיון בלבד, לא מיובאות ל-public.orders** (סמנטיקת snapshot כספי של 026 לא ניתנת לשחזור, ledger כפול, הזמנות אורח מול NOT NULL user_id), חריג יחיד: שוברים חיים לא-ממומשים מקבלים שרשרת מינימלית orders+order_items+coupon_codes כדי שמימוש/QR יעבדו; לקוחות דרך Auth Admin API (הטריגרים handle_new_user/prefs רצים), בלי סיסמאות (phpass לא נתמך + מדיניות Google/OTP), dedupe לפי אימייל; **כל המיובאים marketing_*=false** (חוק הספאם 30א, אין ייבוא consent בלי ראיות והכרעה); מוצרי Woo נכנסים ל-products בלבד (coupon_deals נשארת admin-curated); slugs חדשים לטיניים + 301 לכל URL ישן דרך seo_redirects (source='wordpress_import', יעד /products/ ברבים); תמונות: מקור -> WebP 1600px + נגזרת OG -> bucket product-images תחת wp/<id>/, דה-דופ sha256, מפת שכתוב ב-wp_import.media; ביצוע one-shot חזרתי idempotent (id_map + batches), הקפאת קטלוג 48h, dump סופי T-24h, DNS flip לפי PRODUCTION-OPS, dump הזמנות משלים T+7; rollback = DNS חזרה + purge לפי batch; שערי אימות: ספירות+checksums, spot-check 20+10+5, 100% כיסוי url_inventory. מיפוי שדה-שדה מלא (products/variants/categories/customers/orders) + כללי ניקוי (HTML, מחירים, טלפונים 05X-XXXXXXX, כתובות) + תכנון סקריפטים scripts/wp-import/00-09.
- **`supabase/migrations/032_wp_import_staging.sql`** (טיוטה, idempotent, **לא הוחלה, staging בלבד**): סכימת wp_import עם 12 טבלאות (import_batches, id_map עם snapshot projected, products כולל וריאציות ועמודות curation, categories עם manual_target_slug, customers עם ראיות opt-in גולמיות, orders+order_items ארכיון עם תמיכת HPOS, coupons, vouchers, media עם צנרת סטטוסים, url_inventory עם שער 301, issues עם unique פתוח) + 2 views (v_reconciliation, v_open_issues) + RLS admin-read-only + grants ל-service_role בלבד. עצמאית לחלוטין, בלי תלות ב-026-031, לא נוגעת ב-public.
- **שאלות פתוחות מרכזיות**: זהות plugin השוברים באתר הישן ומיקום הטבלה שלו; כמות שוברים פתוחים ב-cutover (קובע אם החריג של 1.4 בכלל נדרש); גישה בפועל לאחסון/DB הישן + GSC; האם שולחים מייל מעבר תפעולי; יתרות store credit ישנות; עמודי תוכן לכתיבה מחדש.

Session 2026-07-08 - תכנון דומיין התראות, הודעות ואוטומציית שיווק (design only, לא הוחל):
- **`docs/NOTIFICATIONS-MARKETING-ARCHITECTURE.md`**: הפרדה קשיחה טרנזקציוני/שיווקי (חוק הספאם 30א: opt-in בלבד, בלי חריג לקוח קיים, "פרסומת" בכותרת, הסרה בלי login שנאכפת גם ב-send-time), בחירת ספקים לישראל: וואטסאפ Meta Cloud API ישיר כערוץ ראשי, מייל Resend עם הפרדת סאב-דומיין txn/mkt, SMS אגרגטור ישראלי לטרנזקציוני בלבד + מודל עלויות (פחות מ-10 אגורות להזמנה), צנרת דו-שלבית: triggers -> notification_events (עובדות) -> fanout (מדיניות) -> notifications_outbox של 029 -> worker עם claim אטומי (SKIP LOCKED) -> ספקים -> delivery events, retry מעריכי + dead-letter אחרי 5 ניסיונות + סטטוס skipped נפרד, תבניות versioned (אחת active פר key/channel/locale, חתימת גרסה על כל שליחה) עם כללי RTL מחייבים, consent_events append-only כראיה משפטית, שעות שקט לשיווק (09:00-21:00 Asia/Jerusalem, לא בשבת), מסעות: עגלה נטושה (2 נגיעות, דיכוי על רכישה), win-back רבעוני, פקיעת קופונים נשארת ב-029, מכסות תדירות (שיווקית 1/יום, 3/שבוע), ייחוס הכנסות last-touch (notification_conversions, order_id ייחודי) + views.
- **`supabase/migrations/031_notifications.sql`** (טיוטה, idempotent, **לא הוחלה**): מרחיבה את 029 (exception אם 029 חסרה): enum notification_status מקבל dead/skipped (ADD VALUE IF NOT EXISTS, בלי שימוש ב-DDL באותה טרנזקציה), הרחבת notifications_outbox (attempts/next_attempt_at/locked_at/locked_by/provider/provider_message_id/delivered_at/to_address/is_marketing/journey_key/template_key/template_id/event_id + ערוץ whatsapp), notification_events + fn_emit_notification_event + טריגרים על orders (paid/refunded), order_items (shipped/delivered), coupon_codes (delivered/refunded), notification_templates + fn_activate_template, הרחבת user_notification_preferences (3 עמודות whatsapp, ברירת מחדל false), consent_events + fn_set_marketing_consent (משתמש, rate-limited) + fn_unsubscribe_marketing (service), channel_suppressions, notification_delivery_events + fn_ingest_delivery_event (bounce -> suppression, תלונה -> opt-out אוטומטי), fn_fanout_notification_events, fn_claim_notification_batch, fn_mark_notification_sent/failed/skipped, fn_requeue_dead_notification (admin), fn_in_marketing_window/fn_next_marketing_window/fn_marketing_frequency_ok, fn_enqueue_abandoned_cart_reminders, fn_enqueue_winback_reminders, notification_conversions, v_notification_kpis + v_journey_revenue (security_invoker), RLS מלא + audit על templates.
- **תנאים מוקדמים ל-031**: 029 חובה (נבדק ב-exception), וגם 011+025 (audit) ו-019 (rate limit). אין תלות ב-026/027/028/030 (אין טריגר על payments; order_paid מכסה קבלה). להחיל רק דרך MCP apply_migration, אחרי 029.
- **לא כלול**: קוד אפליקציה (worker שליחה, adapters לספקים, routes של webhooks וקישור הסרה חתום, דף העדפות), תוכן תבניות, סגירת מחירונים (המספרים הערכה), שינוי fn_enqueue_coupon_expiry_reminders של 029, price-drop (אין היסטוריית מחירים/wishlist), לוח חגים לשעות שקט.

Session 2026-07-08 - תכנון דומיין קטלוג, חיפוש עברית ו-SEO (design only, לא הוחל):
- **`docs/CATALOG-SEARCH-SEO-ARCHITECTURE.md`**: עץ קטגוריות עומק 2 עם הפרדת taxonomy/collection (אוספים חכמים עם `rule` jsonb ל"עד 99"/"חדש"/"דילים חמים"), וריאציות עם `variant_axes` + `option_values` (מחיר: variant.price ואז kenyon_price; price_modifier הוכרז DEPRECATED), מערכת מאפיינים attribute_definitions/category_attributes עם ערכים ב-jsonb + GIN, חוקי תצוגת הנחה (badge רק כש-full_price > kenyon_price, CHECK ב-DB), 5 מצבי מלאי נגזרים (untracked/in_stock/low_stock/out_of_stock/sold_out). חיפוש: FTS עם config simple + הרחבת שאילתה he_tsquery (הסרת אותיות שימוש ונרדפות) + trigram fallback לשגיאות כתיב, נוסחת דירוג 0.55 רלוונטיות / 0.15 fuzzy / 0.15 טריות / 0.10 מרג'ין / 0.05 featured, autocomplete, אפס-תוצאות עם לוג search_queries; ספי מעבר ל-Meilisearch: 12% zero-results או p95>250ms או 30k מוצרים. SEO: **הוכרע slugs לטיניים** (לא עברית ב-URL), URLs שטוחים (/products/[slug], /category/[slug], /coupons/[slug]), seo_redirects לרציפות מוורדפרס + trigger אוטומטי על שינוי slug (כולל קריסת שרשראות), JSON-LD בלי aggregateRating (אין ביקורות), canonical: פילטרים noindex+canonical לקטגוריה, pagination self-canonical, OG לוואטסאפ (תמונה <300KB + מידות מוצהרות). Listing: עימוד ממוספר (לא infinite scroll), URL הוא ה-state, קאשינג עם Cache Components של Next 16 (cacheTag פר מוצר/קטגוריה + revalidateTag ממוטציות אדמין).
- **`supabase/migrations/030_catalog.sql`** (טיוטה, idempotent, **לא הוחלה**): עמודות brand/search_keywords/seo_title/seo_description/low_stock_threshold/variant_axes/has_variants, search_vector generated על products + coupon_deals + אינדקסי GIN (FTS, trigram, attributes), טבלאות product_categories/attribute_definitions/category_attributes/search_synonyms/search_queries/seo_redirects, פונקציות he_tsquery/search_products/autocomplete_products/category_facets/log_search_query/touch_seo_redirect/record_slug_redirect, trigger עומק קטגוריות + backfill קטגוריות collection, RLS מלא. לא תלויה ב-026/027/028/029 (platform_percent מגונן בנוסח 027).
- **תנאים מוקדמים ל-030**: 016 (kenyon_price/name_he), 025 (audit fn). להחיל רק דרך MCP apply_migration.
- **שאלות פתוחות מרכזיות**: /product/[slug] (קיים בקוד) מול /products/[slug] (הוחלט: רבים; ה-trigger ב-030 כותב /products/); נדרש crawl מלא + ייצוא GSC של האתר הוורדפרסי הישן לפני מילוי seo_redirects; אישור שנשארים על אותו דומיין.

Session 2026-07-08 - ארכיטקטורת Super-App מובייל (design only, מסמך בלבד, אין מיגרציה):
- **`docs/SUPERAPP-MOBILE-ARCHITECTURE.md`**: החלטת פלטפורמה: PWA על ה-Next הקיים (לא React Native, לא native), עטיפות חנות בשלב מאוחר (TWA ל-Google Play, Capacitor ל-App Store רק כשמדדי iOS יצדיקו); ארכיטקטורת ורטיקלים plug-in עם ליבה משותפת: orders כמעטפת תשלום אוניברסלית (עמודת vertical עתידית), ארנק רק דרך fn_wallet_transfer עם wallet_reason + idempotency key בעלי namespace פר ורטיקל, memberships פר ורטיקל בתבנית supplier_members, registry ורטיקלים עם kill switch; ארנק קופונים offline-first (IndexedDB cache, רינדור QR מקומי מ-qr_token, סנכרון דלתא לפי updated_at, אימות Ed25519 offline בסורק וחד-פעמיות online בלבד, עקבי עם 027 ועם ACCOUNT-IDENTITY 4.2); push: נבנה על notifications_outbox + user_notification_preferences מ-029, תוספות עתידיות push_subscriptions + audit הסכמת שיווק לפי סעיף 30א לחוק התקשורת (חוק הספאם; שיווקי opt-in בלבד, תפעולי ברירת מחדל); deep links https בלבד + שיתוף WhatsApp דרך /r/[code] עם ייחוס 010 (לעולם לא משתפים qr_token); מסלול מיגרציה מדורג 0-4 בלי שכתוב קומרס באף שלב. 10 החלטות (D1-D10) + 8 שאלות פתוחות במסמך.
- אין תשתית PWA קיימת בריפו (אין manifest, אין service worker); מדריך PWA רשמי קיים ב-node_modules/next/dist/docs/01-app/02-guides/progressive-web-apps.md.

Session 2026-07-08 - תכנון דומיין חשבון לקוח וזהות (design only, לא הוחל):
- **`docs/ACCOUNT-IDENTITY-ARCHITECTURE.md`**: Google OAuth (PKCE) עם התחברות רק בלחיצת תשלום, אסטרטגיית session (proxy.ts + getUser בלבד), מיזוג עגלת אורח race-safe דרך RPC עם advisory lock, מחיקת חשבון לפי דין ישראלי (פסאודונימיזציה + שמירת רשומות כספיות 7 שנים + ניקוי PII מ-audit_log), מפרט האזור האישי (/account: הזמנות, ארנק, קופונים עם QR + offline, אמצעי תשלום, פרופיל/כתובות, העדפות התראות), הקשחת payment_tokens (שלילת הרשאת עמודה על cardcom_token), תזכורות פקיעת קופון דרך notifications_outbox, מודל איומים.
- **`supabase/migrations/029_accounts.sql`** (טיוטה, idempotent, **לא הוחלה**): 3 טבלאות חדשות (user_notification_preferences, account_deletion_requests, notifications_outbox) + 2 enums + 7 פונקציות (fn_merge_guest_cart, fn_request/cancel/execute_account_deletion, fn_set_default_payment_token, fn_enqueue_coupon_expiry_reminders, create_default_notification_prefs) + הקשחת payment_tokens + unique חלקי על carts.profile_id + RLS מלא + audit. תלויות: 001/003/008/009/019/025 בלבד, אין תלות ב-026/027/028.
- **ממצא אבטחה ב-001**: policy בשם "payment_tokens: owner all" מאפשר ללקוח לקרוא cardcom_token גולמי ולכתוב שורות. 029 מחליפה אותו.
- **ממצא race ב-cart.ts**: mergeGuestCart הקיים הוא read-merge-write בלי נעילה; 029 מחליפה ב-fn_merge_guest_cart.
- הערה: הריפו על Next 16.2.4 (proxy.ts במקום middleware.ts), בניגוד לבריפים שמדברים על Next 15.

Session 2026-07-08 - תכנון מלא של פורטל ספקים ומימוש קופונים (design only, לא הוחל):
- **`docs/SUPPLIER-REDEMPTION-ARCHITECTURE.md`**: מודל כסף (platform_percent פר מוצר עם fallback ל-suppliers.commission_percent), onboarding עם supplier_applications + אישור אדמין, חברות דרך supplier_members (owner/manager/scanner) במקום role, פרטי בנק ישראליים בטבלה נפרדת (owner בלבד), מימוש קופון עם QR חתום Ed25519 + UPDATE אטומי יחיד כהגנת מרוץ, coupon_scan_events append-only, מנוע payout חודשי עם snapshot בלבד, reconciliation מול Cardcom, מודל איומים מלא.
- **`supabase/migrations/027_suppliers.sql`** (טיוטה, idempotent, **לא הוחלה**): 9 טבלאות/הרחבות + 8 enums + 12 פונקציות (redeem_coupon, update_shipping_status, approve_supplier_application, generate_payout_statement ועוד) + RLS מלא + audit triggers + bucket supplier-docs.
- **באג שהתגלה ב-014**: policy בשם "products: vendor read own" משווה products.supplier_id (מפנה ל-suppliers) מול vendors.id. לא מחזיר שורות. 027 מחליפה אותו ב-policy מבוסס supplier_members.
- **תנאים מוקדמים ל-027**: 016 (name_he), 019 (rate limit), 025 (audit fn) חייבים להיות מוחלים. להחיל רק דרך MCP apply_migration.

Session 2026-07-08 - מיגרציה 025 קונסולידציה הוחלה על המרוחק (Phase 3 סגור):
- **`025_consolidation.sql` הוחל** דרך Supabase MCP `apply_migration` על `ixvwfbuvfxxsjiywhbbb` (ACTIVE_HEALTHY). idempotent, מקור אמת ל-RLS: `003_rbac.sql`.
- **created_by** מאומת קיים על `products`, `categories`, `coupons`, `coupon_deals` (products/categories כבר היו איתו מ-005; ל-coupons ה-ALTER היה no-op כי כבר קיים).
- **content_uploader RLS**: `products` עם SELECT/INSERT/UPDATE own (בלי DELETE, מחיקה admin-only דרך 014); `categories` עם SELECT own בלבד (INSERT/UPDATE/DELETE נשארים admin-only לפי 012). 4 policies מאומתות ב-`pg_policies`.
- **איחוד audit**: 58 שורות (51 INSERT + 7 UPDATE) הוגרו מ-`admin_audit_log` ל-`audit_log` עם מיפוי enum (INSERT->created, UPDATE->updated); `admin_audit_log` נמחקה (DROP CASCADE); `audit_log_trigger_fn()` שוכתבה לכתוב ל-`audit_log` **לפני** ה-DROP כדי לא לשבור כתיבות עתידיות. אפס איבוד שורות.
- **12 storage policies** מאומתות קיימות (product-images / vendor-logos / category-icons x4), כולל תוספת האדמין מ-020 על product-images.
- **DRIFT שהתגלה**: בניגוד לקבצי המיגרציה (008 מוחקת `coupons`), ב-DB החי הטבלה `coupons` **קיימת** ועם `created_by`. יש פער בין קבצי המיגרציה למצב הפרודקשן. שווה בדיקה נפרדת.

Session 2026-06-26 — Phase 3 (Admin Panel) הושלם + מבנה דף מוצר סופי הוחלט:
- **Phase 3 (Admin Panel) הושלם** — כל דפי הניהול מחווטים ועובדים.
- **מבנה דף המוצר הסופי הוחלט:** מבוסס Groupon (AMC) + Electro. מקורות ייחוס שמורים ב-`refs/groupon_amc_deal.mhtml` + `refs/electro_product_page.mhtml` (gitignored, מקומיים בלבד — לא בריפו).
- **הבהרה:** קבצי ה-refs הם ייחוס **עיצובי בלבד** — אין לייבא מהם דאטה. טבלת `products` נשארת כמות שהיא (31 מוצרים). בונים את דף המוצר לפי המבנה, לא מייבאים את AMC/Electro.
- **קובץ אב למילוי:** `docs/product-page/KenyonExpress_קובץ_אב_דף_מוצר.docx` (tracked בריפו). Ofir ממלא אותו ואז commit מחדש עם הגרסה המלאה.
- **Next:** Ofir ממלא את קובץ האב → בונים `/products/[slug]` לפי המבנה שיתקבל.
- **שדות חדשים שיידרשו בטבלת `products`** (טרם קיימים — ראו סכמה חיה בת 26 עמודות): `city`, `business_whatsapp`, `promo_code`, `options[]`, `sold_count`, `redemption_steps`, `business_hours`, `waze_coords`, + supplier fields.

Session 2026-06-26 — Phase 3 admin dashboard wired:
- פאנל הניהול מחווט ועובד ב-`/admin/dashboard` (קובץ `src/app/(admin)/admin/dashboard/page.tsx`; `(admin)` הוא route group ולכן לא ב-URL).
- StatsCards מציגים נתונים אמיתיים מ-DB (8 קופונים, 31 מוצרים).
- RBAC guard פעיל: `(admin)/layout.tsx` עבר מ-`requireStaffSession` ל-`requireAdminSession` (admin/super_admin בלבד). אומת: `GET /admin/dashboard` → 307 → `/login?next=%2Fadmin%2Fdashboard`. commit `b4539d8`, pushed.

Session 2026-06-26 — פתרון 401 (מפתחות Supabase):
- ב-`.env.local` היה `NEXT_PUBLIC_SUPABASE_ANON_KEY` חתוך ומשובש (32 תווים, בלי נקודות, header פגום) → גרם ל-401.
- אחרי `Claude Code /login`: הוחלף ה-anon במפתח JWT מלא ותקין (role=anon, ref `ixvwfbuvfxxsjiywhbbb`, exp 2036), ונוסף `SUPABASE_SERVICE_ROLE_KEY` מלא (role=service_role) — **בלי** קידומת `NEXT_PUBLIC_` (סוד server-side בלבד).
- אומת: `git check-ignore .env.local` → מוגנן ב-gitignore (לא נכנס ל-git).
- אומת נקי: `pnpm dev` → `✓ Ready` על `localhost:3000`, `GET /` → 200, probe ישיר ל-Supabase REST עם ה-anon → 200. אין 401.

Session 2026-06-23 — שחזור פרויקט + שיטוח מבנה:
- הקוד שוחזר מ-`origin/phase5/homepage` (commit `92b858a`) אחרי איבוד מקומי. עץ העבודה היה מקונן (`kenyonexpress/kenyonexpress/`) — **שוטח**: כל הקבצים הועברו לשורש `/Users/ofir/kenyonexpress-web/kenyonexpress`, ה-scaffold הישן (13 tsx, eslint) הוסר. כעת מבנה יחיד ושטוח.
- `.env.local` שוחזר מגיבוי (פרויקט Supabase `ixvwfbuvfxxsjiywhbbb`) → השורש; מוגנן ב-gitignore.
- **אישור pnpm builds:** `pnpm-workspace.yaml` תוקן ל-`allowBuilds: {biome,parcel/watcher,swc/core,esbuild,sharp: true}` (pnpm 11.1.2 משתמש ב-`allowBuilds`, לא `onlyBuiltDependencies`). אזהרת `ERR_PNPM_IGNORED_BUILDS` נעלמה; `pnpm dev` עובד ישירות.
- אומת: `pnpm dev` → `localhost:3000` HTTP 200, כותרת "קניון EXPRESS", `.env.local` נטען.
- **חוקי פרויקט קבועים נוספו ל-CLAUDE.md** (נתיב יחיד, אין עותקים כפולים, pwd לפני כל פעולה, push מיידי אחרי commit).

Session 2026-06-22 — Admin dashboard shell:
- `(admin)/layout.tsx`: RBAC `requireStaffSession` (admin/super_admin/content_uploader) → `/login`, sidebar, RTL, Heebo via `font-sans`, צבע `#fed700`
- `(admin)/dashboard/page.tsx`: StatsCard עם ספירה חיה מ-`products`, `orders`, `coupon_deals`
- `requireStaffSession` + `isStaffRole` ב-`lib/admin/rbac.ts`; `/admin` מפנה ל-`/dashboard`
- AdminSidebar + StatsCard עודכנו ל-`#fed700`

Session 2026-06-22 — החלת 019/020/021 על המרוחק דרך Supabase MCP:
- הפרויקט `ixvwfbuvfxxsjiywhbbb` כבר ACTIVE_HEALTHY (לא INACTIVE כפי שתועד). יש דאטה: 12 קטגוריות, 31 מוצרים.
- `019` הוחל: טבלת `public.user_rate_limits` + `check_user_rate_limit` + `cleanup_user_rate_limits` (verified `to_regclass` not null).
- `020` הוחל: policies אדמין ל-bucket `product-images` (idempotent).
- `021` הוחל: buckets `products` + `coupons` נוצרו (buckets עכשיו: category-icons, coupon-images, coupons, product-images, products, vendor-logos) + policies.
- הוחל דרך `apply_migration` ולא `db push`: היסטוריית המיגרציות במרוחק מכילה רק 2 רשומות (auth_rate_limits, storage_buckets) בעוד שהסכמה כבר קיימת — `db push` היה נכשל על "already exists".
- git: עץ העבודה נקי, אין commits לא-דחופים. 021 כבר committed (בניגוד לתיעוד הקודם).

Session 2026-06-20 — מיגרציות rate-limit + storage:
- `019_user_rate_limits.sql` (commit `77cf701`, pushed): טבלת `public.user_rate_limits` + `check_user_rate_limit(user_id, action, limit, window)` SECURITY DEFINER, RLS ללא policies; helper `checkUserRateLimit()` ב-rate-limit.ts + טיפוס ב-database.ts. additive ל-002 (IP-keyed).
- `020_storage_product_images_admin.sql` (commit `a1aa413`, pushed): הוספת `public.is_admin()` ל-policies של bucket `product-images` (admin ProductForm). במקום עריכת 004 שכבר רץ.
- `021_products_coupons_buckets.sql` (לא committed עדיין): buckets חדשים `products` + `coupons`, public read, גישה `has_role('content_uploader') OR is_admin()`. נכתב כתחליף נכון לניסיונות לשכתב את 004 (באג `auth.role()='content_uploader'` = deny-all).
- כל ניסיונות `migration up`/`db push` נכשלו: אין DB נגיש (Docker down מקומית; remote unlinked + paused). 002/003/004 לא שונו (שכתובים שבורים נדחו).

Session 2026-06-20 — דף קטגוריה (commit `b5139e8`):
- `(store)/category/[slug]/page.tsx`: resolve לפי slug, breadcrumb עם הורה, צ'יפים לתת-קטגוריות, גריד מוצרים
- מיון `?sort=` (newest/price_asc/price_desc/name) דרך `components/category/CategorySort.tsx` (client)
- pagination `?page=` עם `count: 'exact'` ו-`components/category/Pagination.tsx` (חלון עמודים קומפקטי)
- empty state + `notFound()` לקטגוריה חסרה/לא פעילה
- `type-check` + `biome` נקיים. בדיקה חיה חסומה: פרויקט Supabase במצב INACTIVE (queries עושים timeout → 404)

Session 2026-06-20 — Admin refactor (commit `6f96164`):
- `DataTable` גנרי (מיון/חיפוש) + `CategoriesTable`/`CouponsTable`/`ProductsTable`/`UsersTable`/`CouponForm`
- shell עבר מ-`(admin)/admin/layout.tsx` ל-`(admin)/layout.tsx`
- `lib/admin/page-params.ts` עם סכמות zod
- rename מיגרציה `007_categories_icon_url` → `0075` (התנגשות prefix עם `007_orders`)
- `type-check` עובר נקי

Session 2026-06-19 — Homepage 1:1 מול `ke_live_singlefile.html`:
- `scripts/compare.mjs` משתמש ב-`ke_live_singlefile.html`; `refs/live.png` מול `refs/mine.png` ב-1440px
- `HeroSection`: סליידר בלבד 422px, `HERO_SINGLEFILE_SLIDES`, rs-19 פעיל; בלי סיידבר/באנרים (sf-hidden במקור)
- `HeroSlider`: active slide = rs-19 (אפליקציה בקרוב)
- `CategoryStrip`: 5 קטגוריות בלבד
- `BenefitBar`: 5 פריטים מ-`.features-list`, מסגרת `#ddd` radius 8px
- `DealsOfTheDay`: גריד 4 עמודות, 6 מוצרים סטטיים מ-`KE_LIVE_DEALS` + השלמה מ-DB, בלי כותרת "דילים של היום"
- `(store)/page.tsx`: hero → categories → benefits → grid (בלי `CategoryProductSection`)
- `ke-live-deals-data.ts`: 6 מוצרים בסדר DOM (כולל קופון טסט 8836)
- Header/TopBar: לוגו + ₪0 + עגלה; TopBar 4 פריטים (בלי חיפוש, לפי החלטת פרויקט)

commit: `feat: homepage 1:1 match with live source`

(סטטוס ישן שהיה כפול כאן קופל לרשומת ההיסטוריה: ה-Next Task שלו התייחס למספור הישן 034=vendors; המקור העדכני הוא הסעיפים בראש הקובץ. חוקי הנתיב היחיד וה-push המיידי חיים ב-CLAUDE.md.)

---
## History

### 2026-07-08 - מיגרציה 025 consolidation הוחלה על המרוחק
- הוחל דרך Supabase MCP `apply_migration` על `ixvwfbuvfxxsjiywhbbb` (ACTIVE_HEALTHY)
- created_by re-assert (products/categories/coupons) + content_uploader RLS (products CRUD-minus-delete, categories select-only) + איחוד audit (58 שורות admin_audit_log -> audit_log, טבלה ישנה נמחקה, trigger fn שוכתבה) + 12 storage policies - הכול verified
- drift התגלה: `coupons` קיימת ב-DB החי למרות ש-008 מוחקת אותה בקבצים

### 2026-06-22 — מיגרציות 019/020/021 הוחלו על המרוחק
- הוחל דרך Supabase MCP `apply_migration` (לא `db push`, בגלל היסטוריה לא מסונכרנת)
- user_rate_limits + buckets products/coupons + product-images admin policies — verified
- DB מרוחק ACTIVE עם דאטה (12 קטגוריות, 31 מוצרים); חסם ה-DB הקודם בוטל

### 2026-06-19 — Homepage 1:1 match with live singlefile
- מבנה דף, hero rs-19, 5 קטגוריות, benefits, גריד מוצרים לפי faf8583
- compare loop: `node scripts/compare.mjs` (PLAYWRIGHT_BROWSERS_PATH ל-cache מקומי)

### 2026-06-12 — CategoryNav removed, BenefitBar frame, ProductCard electro values
- commits על `phase5/homepage` לפני סגירת 1:1

### 2026-06-09 — Product catalog + hero 5 slides + foundation
- 31 מוצרים ב-DB, `scripts/compare.mjs` הוקם

### 2026-07-19 — Supplier Portal architecture complete
- נוצר מסמך design-only מלא בשורש: `ARCHITECTURE-SUPPLIER-PORTAL.md`
- כיסוי: Auth/RLS, staff, scanner PWA/offline, orders, weekly finance,
  product visibility, notifications, route map, RTL/Electro ו-open questions
- לא נכתב קוד, לא נכתבה מיגרציה ולא שונה DB

### 2026-07-20 - WP Migration architecture v2 (root doc)
- נוצר `ARCHITECTURE-WP-MIGRATION.md` (design only, שורש הפרויקט)
- יישור מסלול W לסכימת 042 (אגורות, commission_ledger); הכרעות W1-W8
- 032 נשארת טיוטה לא מוחלת; אין קוד, אין דאטה

### 2026-07-20 - Performance + SEO architecture (root doc)
- נוצר `ARCHITECTURE-PERFORMANCE-SEO.md` (design only, שורש הפרויקט)
- איחוד PERFORMANCE + מכניקת SEO בזמן ריצה; מצביעים ב-docs/
- אין קוד, אין מיגרציה

### 2026-07-20 - Checkout + Payment Engine architecture
- נוצר `ARCHITECTURE-CHECKOUT-PAYMENT.md` (design only, שורש הפרויקט)
- pipeline מלא: identity gate, Cardcom Low Profile, webhook HMAC,
  `checkout_finalize`, coupon vs physical fulfillment, refunds, payment_attempts
- אין קוד יישום; מרחיב COMMERCE / API-CONTRACTS / SECURITY
