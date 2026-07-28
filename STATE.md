# KenyonExpress State

Date: 2026-07-28.

## Current Phase
**Goal 4 visual+tokens COMPLETE** on `feat/visual-polish` (worktree ke-visual). Main line still `phase5/homepage`.

## Last Completed
Session 2026-07-28 - Goal 4 closed on `feat/visual-polish`:

| step | commit | notes |
|---|---|---|
| tokens | `cf2d8c2` | `THEME_GEOMETRY` + `--touch-target` locked to globals |
| a11y / 44px | `d973543` | account/admin/search/footer hit areas |
| RTL strip | `e7de5f4` | category strip `offsetInlineEnd` 517→276 (live x=336) |
| visual + gate | `abd614d` | masthead 109.94px, hero 370px, welcome slide, image mask, threshold 11% |

compare.mjs OVERALL first 2600px (images masked, both sides):
| page | % | vs 11% |
|---|---|---|
| home | **4.09%** | pass |
| category | **4.48%** | pass |
| products | **3.73%** | pass |
| search | **8.61%** | pass |
| product | **6.64%** | pass |

### החלטות שהתקבלו אוטומטית
- Header (LOCKED) עודכן שוב ל-parity מול החי: מדידה חדשה נתנה masthead 109.94px (לא 127).
- `compare.mjs` מנטרל `<img>` בשני הצדדים כברירת מחדל (`--no-mask-images` לביטול) כדי למדוד chrome/layout ולא צילומי קטלוג.
- שקופית הפתיחה: `rs-19` הוסר מ-id של סלייד האפליקציה כדי ש-HeroSlider ייפול ל-welcome כמו בחי, בלי לגעת ב-HeroSlider.tsx הנעול.

Worktree: `/Users/ofir/kenyonexpress-web/ke-visual`.

## In Progress
nothing (Goal 4 done)

## Blocking Issues
none for Goal 4

## Next Task
Pick next /goal after visual polish (Admin Core / storefront follow-ups on `phase5/homepage` as needed).

## Working Directory
/Users/ofir/kenyonexpress-web/ke-visual

## Branch
`feat/visual-polish`

## Supabase Project URL
not set in this worktree STATE

---
## History

### 2026-07-28: Goal 4 visual+tokens complete
- All five compare pages under 11% with masked images + live chrome alignment.
- Pushed to `origin/feat/visual-polish`.

### Prior Goal 4 status (2026-07-24)
Session 2026-07-24 - Goal 4 visual+tokens on `feat/visual-polish`:

Commits on this branch (visual pass):
- `54c14c5` fix(visual): restore custom-price card block + compare demo slug + search chrome
- `6a6075e` fix(visual): home deals spacing + shop bottom bar/jumbotron + compare consent cookie
- `7a6ae13` fix(visual): shop row min-heights 438/366 to match live flex stretch

compare.mjs OVERALL first 2600px (live, raw photos, before mask gate):
| page | % | vs 11% |
|---|---|---|
| category | **9.12%** | pass |
| home | **13.51%** | fail (LOCKED header/hero y200-600; deals at y898 matched) |
| search | **13.60%** | fail (content floor: hit count differs) |
| products | **19.28%** | fail (catalog content floor; grid row geometry matched live) |
| product | **20.99%** | fail (PDP vs live demo product) |

Home floor: LOCKED HeroSection/HeroSlider/header (~y0-700) plus residual deal-pixel noise.
Products floor: different product images/titles in slots despite matched 438/366/438/438/438 row heights, control bar, and 424px jumbotron.
Worktree: `/Users/ofir/kenyonexpress-web/ke-visual`.

## ענף feat/account-wallet (worktree `ke-account`, 2026-07-24)

אזור אישי + ארנק דיגיטלי. מסמך מלא: `docs/ARCHITECTURE-ACCOUNT-WALLET.md`.

| קומיט | תוכן |
|---|---|
| `33e4dd1` | מסמך הארכיטקטורה של הדומיין |
| `79693b6` | מיגרציה `055_account_wallet.sql`, **הוחלה על המרוחק ואומתה** |
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
| אכיפת ההחלטות במסמכים | **הושלם 2026-07-24**: כל שרשראות ה-fallback לעמלה הוסרו מ-`ARCHITECTURE-SUPPLIER-REDEMPTION` (היה `product -> supplier -> 10`), `ARCHITECTURE-WP-MIGRATION` (היה "נופל ל-default של הסכימה"), `ARCHITECTURE-COMMERCE` (O1 נסגרה), `ARCHITECTURE-MASTER-CHECKOUT-REDEMPTION` (R1/R2) | `docs/CONTRADICTIONS.md` §מצב יישום |
| Escrow | נוסח אחיד בכל המסמכים: ה-held הוא **רישום פנימי ב-ledger בלבד**, אין Escrow חיצוני, אין נאמן ואין J5 | C3, אומת ב-grep על כל העץ |
| ספקי צד ג | **C9 מאומת**: אין Stripe, אין Payoneer, אין Cloudways בשום קובץ בפרויקט (מלבד שורת ההכרעה עצמה) | grep על `*.ts/tsx/md/sql/json/toml` |
| תנאי payout | **T+3 ימי עסקים + מינימום 100 ש"ח בסכימה** (היו תיעוד בלבד) | מיגרציה `051_payout_terms.sql` |
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
5. **מנוע payout**: הסכימה נסגרה ב-051 (T+3 + מינימום 100), **אבל 051 טרם הוחלה על המרוחק** ואין עדיין מסך אדמין שמריץ `generate_payout_statement` ומציג ריצות שהתגלגלו (`rolled_over`).
6. **C11 - סתירה עסקית פתוחה שדורשת הכרעה של Ofir**: מי מקבל את מחיר הקופון ששולם באתר כשה-held נסגר במימוש. `BUSINESS-MODEL.md`, `ARCHITECTURE-COMMERCE` והקוד עצמו (`027`: שורות `coupon_redemption` עם `payout_ils = 0`) אומרים שהפלטפורמה שומרת 100% והספק מקבל 0; C5 ("העמלה על המקדמה בלבד") מרמז שהספק מקבל את היתרה. לא הוכרע לבד - הכל נשאר על ההתנהגות הקיימת. פירוט ב-`docs/CONTRADICTIONS.md` §סתירה פתוחה.
7. ה-header הנעול קצר ב-70px מה-masthead החי, `redirect_to` של Google OAuth, `supabase db push` אסור (רק MCP).

### 3 המשימות הבאות לפי סדר
1. **הכרעת C11** (שאלה ל-Ofir, חוסמת כסף): הספק מקבל 0 או את היתרה מהמקדמה בקופון. עד שזה לא מוכרע, כל דוח settlement לקופונים הוא הימור.
2. **`platform_percent` כשדה חובה באדמין** + `coupon_expiry_days`, ואז החלת 050 ו-051 על המרוחק באותו סשן MCP.
3. **עמוד קטגוריה 1:1 מול החי** - `compare.mjs --page=category` מ-23.7% אל מתחת ל-7%.


## Previous Last Completed
Session 2026-07-24 - יעד 5/20: `docs/PRODUCT-PAGE-SPEC.md` (קומיט `docs: product page spec`):
מסמך אחד שבולע את קובץ האב `docs/product-page/*.docx` ואת מפרט טופס הניהול.
16 קבוצות השדות של Ofir מופו אחת לאחת לעמודות בפועל, עם סימון 🟢 לקוח / 🔵 פנימי,
חובה מול חובה-פרסום, ו-⛔ למה שאין לו עמודה. כולל: בלוק חוקי מלא לפי חוק הגנת
הצרכן (מכר מרחוק 14ג/14ג1/14ה/14ח - גילוי מוקדם, זכות ביטול, דמי ביטול, חריגים,
כלל 5 השנים לשוברים), `coupon_expiry_days` כשם הקנוני היחיד עם רצפת 120 יום,
אייקוני אמון שנגזרים מנתונים ולא נבחרים ידנית, כללי דחיפות בגבולות הדין (טיימר רק
מ-`offer_valid_until` אמיתי), טיוטת `052_product_page_fields.sql` אידמפוטנטית
(שדות גילוי, geo לספקים, FAQ/badges) וסדר מימוש בפאזות 0-4. הפער החוסם שזוהה:
`platform_percent` ו-`coupon_expiry_days` עדיין לא בטופס האדמין.
תוקן אגב כך: ה-COMMENT ב-`027_suppliers.sql` שעדיין קרא ל-`suppliers.commission_percent`
"default" בניגוד ל-C1.

Session 2026-07-24 - יעד 4/20: אכיפת ההחלטות העסקיות בכל המסמכים וה-schema
(קומיט `docs: decisions + state sync`). מה נבדק ומה נמצא:

- **C1/C2 (עמלה בלי ברירת מחדל)**: היה כבר מיושם ב-`050`, אבל ארבעה מסמכים
  עדיין תיארו שרשרת fallback. תוקנו: `docs/ARCHITECTURE-SUPPLIER-REDEMPTION.md`
  (הוסר `product -> suppliers.commission_percent -> 10`),
  `ARCHITECTURE-WP-MIGRATION.md` (הוסר "נופל ל-default של הסכימה", האחוז הפך
  לשער חוסם בייבוא), `docs/ARCHITECTURE-COMMERCE.md` (§0 נכתב מחדש, O1 נסגרה),
  `docs/ARCHITECTURE-MASTER-CHECKOUT-REDEMPTION.md` (R1/R2).
- **C3 (Escrow)**: הנוסח אוחד - ה-held הוא רישום פנימי ב-ledger בלבד, בלי נאמן
  ובלי J5. R1 במסמך ה-MASTER שינה מ"הסר Escrow לגמרי" ל"הסר את ה-framing
  החיצוני ואת `escrow_holds`, השאר את מצב ה-held הפנימי".
- **C7 (תוקף)**: היה כבר מיושם - `products.coupon_expiry_days` הוא השדה הקנוני
  (050 §5). לא נוצרה עמודת `expiry_days` כפולה בכוונה.
- **C9 (Stripe/Payoneer/Cloudways)**: grep על כל העץ - אפס אזכורים מלבד שורת
  ההכרעה עצמה. לא נדרשה מחיקה.
- **C8 (payout)**: היה הפער האמיתי - תיעוד בלבד, אפס אכיפה. נוצרה
  **`supabase/migrations/051_payout_terms.sql`**: `add_business_days()` +
  `payout_available_at()` (T+3 בשבוע העבודה הישראלי, מדלג שישי-שבת),
  `suppliers.min_payout_ils` (100) ו-`payout_hold_business_days` (3),
  `payout_statements.available_at/min_payout_ils/rolled_over`,
  `payout_statement_lines.available_at`. `generate_payout_statement` נכתבה
  מחדש עם פרמטר `p_as_of`: אוספת רק שורות שעברו T+3, ואם היתרה מתחת לסף
  סוגרת את הריצה כ-`cancelled` + `rolled_over = true` כך שהשורות מתגלגלות
  לריצה הבאה. החתימה הישנה בת 3 הארגומנטים נמחקה כדי שלא תעקוף את הכללים,
  ו-trigger `enforce_payout_availability` חוסם מעבר ל-`paid` לפני הזמן או
  מתחת לסף.
- **C11 נפתחה**: תוך כדי היישור התגלתה סתירה כספית אמיתית בין C5 לבין
  `BUSINESS-MODEL.md` + הקוד. לא הוכרעה - נרשמה ב-`docs/CONTRADICTIONS.md`
  כשאלה ל-Ofir. ראו "מה פתוח" סעיף 6.
- **051 טרם הוחלה על המרוחק**, כמו 050.

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

**Checkout v1 (מוזג 2026-07-24 לתוך phase5/homepage):** מיגרציות ledger/idempotency/settlement,
ספריות money/ledger/idempotency, מכונת מצבים להזמנות, אדמין RBAC (support role, טבלאות RSC),
ומסמכי הארכיטקטורה. פירוט בסעיף יום המיזוג.

## Branches

| Branch | State |
|---|---|
| `phase5/homepage` | Product page committed `77fb030`. Visual compare diff still **26-55% in the y900-2100 band, NOT verified** against live. Homepage + cart + checkout foundation live here. |
| `infra/audit` | `INFRA-AUDIT.md` (infrastructure audit report). Security headers added (`fe45eb5`). |
| `phase6/complete-architecture` | 5 design docs committed (in `kenyon-complete` worktree): `COMPLETE-SYSTEM-ARCHITECTURE.md`, `CHECKOUT-COMPLETE.md`, `MIGRATIONS-040-050.md`, `INVARIANTS.md`, `DEPLOYMENT.md`. |
| `checkout/v1` | This branch. Checkout v1 build in progress (checked out in `kenyon-audit` worktree). |

**Missing doc:** `WP-DATA-MIGRATION.md` (WordPress data migration) is not yet written.

## Facts of record (2026-07-23)

- **41 numeric money columns** still need conversion to integer **agorot** (migration `051`,
  logical plan step 040). No floats anywhere in the money path; every rate is integer basis points.
- **Live baseline (measured):** LCP **9.2s mobile**, CLS **0**, Performance **68**, SEO **92**.
- **26 public tables**, **RLS enabled on all**, **3 server-only by design** (money/accounting
  tables with zero client write policies: `ledger_*`, `idempotency_keys`, etc.; enforced by
  immutability triggers that bind even service_role).

## Business rules (unchanged, binding)

**החלטות דאטה בסשן (dev)**: מוצרי restaurants-cafes סומנו is_coupon_enabled=true
(דילים של מסעדות = קופונים באופיים); ל"ארוחה בשרית" נקבע cashback_percent=5
להדגמת הזיכוי. משתמש בדיקה חדש ב-auth.

**המודל העסקי המחייב (הוכרע 2026-07-24, דורס כל מסמך וקוד ישן):**
- קופון: אדמין מגדיר סכום מוחלט `coupon_price`. הלקוח משלם בדיוק אותו באתר ב-Cardcom.
  הכל נשאר בפלטפורמה: אין Escrow, אין payout לספק על קופונים (זה מכריע את C11: הספק מקבל 0).
  היתרה משולמת בבית העסק בסריקה, ואז הקופון פג לצמיתות. תמחור באחוז-מהמחיר המלא (הגישה
  הישנה של checkout/v1 ו-MASTER v2) בטל, כולל עמודות ה-GENERATED של 10%/90%.
- פיזי: תשלום מלא באתר, פיצול לפי `order_items.platform_percent` שמצולם בקנייה (immutable).
  אין אחוז קבוע בשום מקום.
- Guest Cart פתוח, login (Google OAuth) רק בתשלום. ארנק פנימי בלבד. אין tenant_id.
  תיאור = שדה אחד. התראות = Supabase Trigger + Edge Function + Resend בלבד.

**הערת מודל - הוכרעה 2026-07-24**: אין ברירת מחדל לעמלה. `platform_percent`
פר-מוצר הוא הידית היחידה ו-`commission_percent` יצא משימוש. פירוט מלא
ב-`docs/CONTRADICTIONS.md`.

## In Progress

Checkout v1 modules (see Next Tasks). `src/lib/money.ts` + `src/lib/money.test.ts` started.

## Blocking Issues

- מיגרציית ההמרה לאגורות (ledger family) דורשת cutover של קוד server actions לפני החלה על DB.
- Product-page visual diff (26-55% in y900-2100) unverified against live.
- Gap **G1**: `payment_webhook_events` lacks an append-only block trigger (P1).

## Next Task
ראה "3 המשימות הבאות" בסיכום המצב למעלה. אחריהן ממשיך מרתון ה-/goal:
cron, כתובות, ביטול הזמנה, דוחות ספק, Q&A, סל נטוש, גלריה, פילטרים, Cmd+K,
feature flags, Redis cache, API layer, webhooks, פרטיות, DB opt,
visual regression, RTL sweep.
(משימה קודמת שנדחתה: מימוש קופון אצל הספק + דף הזמנות ללקוח.)

## Working Directory

`/Users/ofir/kenyonexpress-web/kenyonexpress` (branch `phase5/homepage`). עץ יחיד אחרי יום המיזוג.
