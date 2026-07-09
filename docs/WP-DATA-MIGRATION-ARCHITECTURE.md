# ארכיטקטורת מיגרציית דאטה מוורדפרס (WooCommerce -> Supabase)

מסמך תכנון מלא. מיגרציה נלווית (טיוטה, staging בלבד, לא הוחלה):
`supabase/migrations/032_wp_import_staging.sql`

תאריך: 2026-07-09. ענף: `phase5/homepage`.
מסמכים קשורים: `docs/PRODUCTION-OPS-ARCHITECTURE.md` (cutover, DNS, גיבויים),
`docs/CATALOG-SEARCH-SEO-ARCHITECTURE.md` (030: slugs, seo_redirects),
`docs/COMMERCE-ARCHITECTURE.md` (026), `docs/ACCOUNT-IDENTITY-ARCHITECTURE.md` (029),
`docs/NOTIFICATIONS-MARKETING-ARCHITECTURE.md` (031, חוק הספאם 30א),
`docs/MASTER-ARCHITECTURE.md` (סדר מיגרציות קנוני).

> הקשר: האתר החי `kenyonexpress.co.il` רץ על WordPress + WooCommerce ומוחלף
> במערכת החדשה (Next.js + Supabase) על אותו דומיין, באפס איבוד דאטה.
> PRODUCTION-OPS מכסה את ה-cutover של ה-DNS ואת רציפות ה-SEO;
> מסמך זה מכסה את הדאטה עצמו: מה מחלצים, לאן זה נכנס, איך מאמתים,
> ואיך חוזרים אחורה.

---

## 0. עקרונות מחייבים

1. **אפס איבוד דאטה, לא אפס ייבוא-לפרודקשן.** כל ביט מהאתר הישן נשמר
   לצמיתות בסכימת `wp_import` (ארכיון שאילתות מלא בתוך אותו פרויקט Supabase).
   רק תת-קבוצה מוקרנת לטבלאות ה-public. ארכיון = שימור; הקרנה = שימוש.
2. **ה-DB החדש לא יורש חוב.** אף שורה לא נכנסת ל-public אם היא מפרה
   constraint, סמנטיקת snapshot כספי, או החלטת ארכיטקטורה קיימת
   (suppliers קנונית, ledger כפול, enums של 007).
3. **הכול idempotent ומבוסס מפתח מקור.** כל ישות מיובאת נושאת את מזהה
   וורדפרס שלה ב-`wp_import.id_map`. הרצה חוזרת = upsert, לא כפילות.
4. **הסכימה החיה היא האמת, לא קבצי המיגרציה.** יש drift מתועד (טבלת
   `coupons`, ערכי enum שאולי חסרים). כל בדיקת קדם רצה מול ה-DB החי.
5. **חוק הספאם 30א gוברת על נוחות שיווקית.** אף לקוח מיובא לא נכנס opted-in.
6. **ביקורות לא עוברות.** הוחלט: reviews של WooCommerce נזנחות (אין ביקורות
   במערכת החדשה, עיקרון 0.5 של מסמך הקטלוג). הן כן נשמרות בארכיון הגולמי
   (dump מלא), פשוט לא נטענות ל-staging.

---

## 1. שלב החילוץ (Inventory Extraction)

### 1.0 ממצאי בדיקה חיה (2026-07-09, HTTP מול האתר בפועל)

נאסף מ-sitemap של Yoast ומה-Store API הפתוח של Woo. עובדות, לא הנחות:

- **סטאק**: WordPress 6.8.1, WooCommerce, Elementor 3.30.2,
  Slider Revolution 6.5.8, WP Rocket, Redux, Yoast SEO
  (`sitemap_index.xml`), Facebook for WooCommerce.
- **היקף**: 46 מוצרים ב-`product-sitemap.xml` (‏45 גלויים ב-Store API:
  ‏44 simple, ‏1 variable), 9 קטגוריות מוצר, 26 עמודים, פוסט יחיד.
  סדר הגודל מאשר את D9 (one-shot) ומאפשר spot-check בכיסוי גבוה מאוד.
- **slugs**: עבריים percent-encoded תחת `/product/` ו-`/product-category/`,
  בדיוק כהנחת סעיף 2.3.
- **מחירים**: שקלים שלמים (`currency_minor_unit=0`); ‏25 מתוך 45 מוצרים
  ב-on_sale (מזין את כלל `full_price` בסעיף 2.1).
- **SKU**: רק 4 מתוך 45 מוצרים נושאים SKU, בלי כפילויות. סיכון dup-SKU
  זניח בפועל; הכיסוי הכמעט-אפסי נרשם כ-issue ברמת info, לא חוסם.
- **ביקורות**: סך `review_count` = ‏324. זו הכמות שנזנחת לפי D13
  (נשמרת רק בתוך ה-dump).
- **API**: ‏WC REST v3 מחזיר 401 בלי מפתחות; ה-Store API פתוח לקריאה
  אנונימית. לא משנה את D1 (ה-dump נשאר מקור האמת היחיד), אבל ה-Store API
  משמש אימות צולב זול בפרוטוקול 5.2.
- **Elementor פעיל**: נגזר כלל ניקוי 8 בסעיף 2.5.

### 1.1 החלטת כלי: MySQL dump הוא מקור האמת, לא REST ולא WXR

**הוכרע: `mysqldump` מלא של ה-DB הוורדפרסי + העתק `wp-content/uploads`.**
ה-dump נטען ל-MySQL מקומי (Docker) וסקריפטים שולפים ממנו לטבלאות ה-staging.

| אפשרות | למה לא / כן |
|---|---|
| **MySQL dump (נבחר)** | שלם (כל postmeta, orders, users, טבלאות plugins), snapshot עקבי בנקודת זמן אחת, אפשר להריץ שוב על dump חדש בלי throttling, וה-dump עצמו הוא הגיבוי המשפטי של האתר הישן |
| WP REST API | לא מחזיר הזמנות ולקוחות בלי מפתחות Woo, מסנן meta לא רשום, איטי ושביר לאלפי בקשות, ואין snapshot עקבי (דאטה זז בין עמודים) |
| WXR (export XML) | מיועד לתוכן, לא לחנות: הזמנות/לקוחות/וריאציות יוצאים חלקית או בכלל לא; parsing של serialized PHP בתוך XML הוא הגרוע שבעולמות |
| Screaming Frog / crawl | לא מקור דאטה; משמש רק לבניית מלאי ה-URLs (סעיף 4.3) |

השלמות מעל ה-dump:
- **`wp-content/uploads`**: rsync/SFTP מהאחסון (או הורדת HTTP לפי URL, ראו 2.4).
- **sitemap ישן + ייצוא GSC** (עמודים עם קליקים 12 חודשים): מזינים את
  `wp_import.url_inventory` (סעיף 4.3). זה כבר דרישה פתוחה של מסמך הקטלוג.
- **בדיקת מצב אחסון הזמנות**: Woo מודרני עשוי לרוץ על HPOS
  (טבלאות `wp_wc_orders`) במקום `wp_posts`. הסקריפטים תומכים בשניהם,
  והשדה `storage_source` ב-staging מתעד מאיפה נשלפה כל הזמנה.

### 1.2 מה מחלצים, ישות-ישות

| ישות | מקור בוורדפרס | יעד staging | הקרנה ל-public |
|---|---|---|---|
| מוצרים | `wp_posts` (type=product) + `wp_postmeta` | `wp_import.products` | כן -> `products` |
| וריאציות | `wp_posts` (type=product_variation) + meta | `wp_import.products` (שורה עם `wp_parent_id`) | כן -> `product_variants` |
| קטגוריות | `wp_terms`/`wp_term_taxonomy` (product_cat) | `wp_import.categories` | מיפוי ל-`categories` קיימות, יצירה רק כשאין יעד |
| תמונות | `wp_posts` (type=attachment) + קבצים | `wp_import.media` | כן -> Storage + `product_images`/`products.images` |
| לקוחות | `wp_users` + `wp_usermeta` | `wp_import.customers` | כן -> `auth.users` + `profiles` + `user_addresses` |
| הזמנות | `wp_posts` (shop_order) או HPOS + order_items | `wp_import.orders` + `wp_import.order_items` | **לא** (ארכיון; חריג בסעיף 1.4) |
| קופוני הנחה (קודי סל) | `wp_posts` (shop_coupon) + meta | `wp_import.coupons` | לא אוטומטית (ראו 1.5) |
| שוברים שנמכרו (vouchers) | טבלת ה-plugin (זהות ה-plugin: שאלה פתוחה 7.1) | `wp_import.vouchers` | רק שוברים חיים (סעיף 1.4) |
| ביקורות | `wp_comments` | לא נטען | לא (הוחלט: נזנחות) |
| עמודי תוכן (about, תקנון) | `wp_posts` (type=page) | לא נטען כדאטה | תוכן נכתב מחדש; ה-URL מקבל 301 דרך url_inventory |

### 1.3 לקוחות: מה עובר ומה לא

עובר: אימייל, שם מלא, טלפון, כתובות (billing/shipping), תאריך הרשמה,
סטטיסטיקות קנייה (orders_count, total_spent: נשמרות ב-staging בלבד, ל-CRM).

לא עובר, בכוונה:

1. **סיסמאות.** hash של וורדפרס (phpass) אינו נתמך ב-GoTrue, וגם אם היה,
   מדיניות הזהות של המערכת החדשה היא Google OAuth + OTP (מסמך החשבון).
   ההחלטה: יצירת המשתמשים בלי סיסמה; כניסה ראשונה דרך Google או קישור
   OTP למייל. אין שליחת "אפסו סיסמה" יזומה לכל הרשימה (ראו שאלה 7.4).
2. **הסכמת שיווק.** ברירת המחדל של כל לקוח מיובא:
   `marketing_email/sms/whatsapp = false`. הפרויקט כבר הכריע (031) שאין
   שימוש בחריג "לקוח קיים" של 30א(ג), ואין ייבוא רשימות. אם יימצא בוורדפרס
   תיעוד opt-in אמיתי פר משתמש (checkbox ניוזלטר + timestamp), הראיות
   נשמרות ב-`wp_import.customers.newsletter_optin_raw`, וההחלטה אם לכבד
   אותן היא שאלה פתוחה (7.5). בלי הכרעה יזומה: לא מכבדים.
3. **לקוחות בלי אימייל** (רשומות זבל, אורחים): לא נוצרים ב-auth. נשארים
   בארכיון בלבד, עם שורת issue.

מנגנון היצירה: **Supabase Auth Admin API** (`auth.admin.createUser` עם
`email_confirm: true`), לא INSERT ישיר ל-`auth.users`. כך שרשרת ה-triggers
הקיימת (`handle_new_user` -> profile + ארנק; trigger ההעדפות של 029) רצה
בדיוק כמו למשתמש אמיתי, ואין שורות profile יתומות. דה-דופליקציה לפי אימייל
מנורמל (lower/trim): אם המשתמש כבר קיים (למשל נרשם באתר החדש לפני הייבוא),
רק ממפים אותו ב-id_map ומעשירים שדות ריקים (phone, כתובת), לעולם לא דורסים.

### 1.4 הזמנות היסטוריות: הוכרע ארכיון, לא ייבוא

**ההחלטה: הזמנות WooCommerce נשארות בארכיון `wp_import` לצמיתות ואינן
מוקרנות ל-`public.orders`.** הנימוקים, לפי סדר חומרה:

1. **הסמנטיקה הכספית לא ניתנת לשחזור.** `order_items` החדשה (026) דורשת
   snapshot של פיצול הכסף: `platform_percent`, `platform_fee_ils`,
   `supplier_due_ils`, `charged_on_site_ils`, `balance_due_at_business_ils`,
   עם CHECK של שוויון סכומים. לנתוני Woo אין את הפיצול הזה; כל ערך שנמציא
   הוא שקר כספי שייכנס לדוחות settlement של הספקים.
2. **ה-ledger הכפול היה נשבר.** cashback היסטורי (אם היה) היה דורש כתיבת
   תנועות `fn_wallet_transfer` פיקטיביות. ledger שנפתח עם עבר מזויף מאבד
   את הערך הראייתי שלו.
3. **מיפוי סטטוסים חד-כיווני.** `wc-processing`/`wc-on-hold`/`wc-failed`
   אין להם מקבילה נקייה ב-enum של 007, והזמנות "באמצע" ממילא לא ינוהלו
   במערכת החדשה.
4. **הזמנות אורח.** `orders.user_id` הוא NOT NULL + RESTRICT על
   `auth.users`. ייבוא היה מחייב משתמש-צללים לכל אורח, זיהום של auth.
5. **הנהלת חשבונות.** ספרי האתר הישן (חשבוניות, קבלות) נשארים בספרים
   הישנים לפי דיני ניהול פנקסים; המערכת החדשה פותחת סדרת מסמכים חדשה.
   הארכיון ב-`wp_import` מקיים את חובת שמירת 7 השנים בצורה שאילתתית.

מה כן ניתן ללקוח: מסך "הזמנות מהאתר הקודם" עתידי באזור האישי יכול לקרוא
מהארכיון דרך view ייעודי (לפי `wp_import.id_map` על ההתאמה
customer -> auth.users). לא בגרסה הראשונה; הארכיון כבר מוכן לזה.

**החריג היחיד: שוברים חיים (unredeemed vouchers).** שובר שנמכר באתר הישן
וטרם מומש הוא התחייבות צרכנית שחייבת לעבוד גם אחרי ה-cutover. עבור אלה
בלבד מוקרנת שרשרת מינימלית: הזמנה מסומנת-legacy (`orders` בסטטוס
`fulfilled`, notes = מקור וורדפרס) + `order_items` יחיד עם snapshot כספי
אמיתי מחושב מנתוני השובר (מה שולם בפועל באתר הישן = `charged_on_site_ils`)
+ שורת `coupon_codes` בסטטוס `issued` עם `expires_at` המקורי. כך המימוש,
הסריקה והתזכורות של 027/029/031 עובדים על שוברים ישנים בדיוק כמו על חדשים.
אם בפועל אין שוברים פתוחים בזמן ה-cutover (שאלה 7.2), החריג מתבטל מעצמו.

### 1.5 קופונים ודילים

שני עולמות שונים בוורדפרס, שני יעדים שונים:

1. **מוצרי דיל/שובר** (המוצרים שנמכרים): עוברים ל-`products` כמו כל מוצר,
   עם `type` לפי סיווג (ראו 2.2 שורת type). **לא** נוצרות שורות
   `coupon_deals` אוטומטית: הטבלה הזו עדיין כבולה ל-`vendors` הישנה
   (עד מיגרציית האיחוד של MASTER 2.4), התוכן בה admin-curated, וכפילות
   product+coupon_deal לאותו דיל הייתה יוצרת שני URLs לאותה ישות.
2. **קודי הנחה של Woo** (`shop_coupon`: "10% הנחה בקנייה מעל X"): נטענים
   ל-`wp_import.coupons` כארכיון. לא מוקרנים: מנגנון קודי ההנחה של המערכת
   החדשה טרם עוצב (אין טבלת discount codes ב-026), וקודים ישנים שפורסמו
   בעבר ממילא מתים עם האתר הישן. אם יוחלט לכבד קודים פעילים, זו החלטה
   ידנית פר קוד אחרי שיהיה מנגנון.

### 1.6 ספקים

לוורדפרס של חנות יחידה אין ישות ספק. שיוך מוצר-לספק במערכת החדשה
(`products.supplier_id`, nullable) נעשה ידנית באדמין אחרי הייבוא, מול
רשימת ספקים שתוקם דרך זרימת ה-onboarding של 027 (או INSERT אדמין ישיר
ל-`suppliers`). הייבוא משאיר `supplier_id = NULL` ורושם issue ברמת info
לכל מוצר, כרשימת עבודה. שם העסק שמופיע בטקסט הדיל (אם קיים ב-meta) נשמר
ב-staging כרמז לשיוך.

---

## 2. שלב הטרנספורמציה (Transformation)

### 2.1 מיפוי שדות: מוצרים

מקור: `wp_posts` (post_type=product) + `wp_postmeta` + טקסונומיות.
יעד: `public.products` (הסכימה החיה של 005+014+016+025, ובתוספת עמודות 030
אם הוחלה). כל שדה שאין לו יעד נשמר ב-`wp_import.products.raw_meta`.

| מקור WP/Woo | יעד | טרנספורמציה |
|---|---|---|
| `ID` | `wp_import.id_map (entity='product', wp_id)` | מפתח idempotency, לא נכנס ל-public |
| `post_title` | `name_he` | trim; ריק = issue error, לא מיובא |
| `post_content` | `description_he` | ניקוי HTML (כלל 2.5), שכתוב URLs של תמונות (2.4) |
| `post_excerpt` | נשמר ב-raw בלבד | אין שדה תקציר; מועמד ל-`seo_description` כשהוא קצר ונקי |
| `post_name` (slug) | **לא** נכנס ל-slug | slug ישן נכנס ל-`url_inventory` בלבד; ראו 2.3 |
| slug חדש | `slug` | נגזר לטינית לפי כללי 2.3 |
| `post_status` | `status` | publish -> active; draft/pending/private -> draft (+issue ל-private); trash -> לא מיובא (issue info) |
| `post_date_gmt` | `published_at` | וגם `created_at` (השורה נכתבת עם הערך ההיסטורי) |
| `post_modified_gmt` | staging בלבד | `updated_at` ב-public מתנהל ע"י trigger |
| `_sku` | `sku` | trim; ריק -> NULL |
| `_regular_price` | `full_price` | רק אם גדול ממש מהמחיר האפקטיבי; אחרת NULL (כלל התצוגה של הקטלוג + CHECK של 030) |
| `_price` (אפקטיבי) / `_sale_price` בתוקף | `kenyon_price` | numeric(10,2); חסר/0 במוצר publish = issue error |
| `_manage_stock` + `_stock` | `stock_quantity` | manage=yes -> `_stock`; manage=no + instock -> NULL (untracked); manage=no + outofstock -> 0 |
| `_stock_status` | (נגזר) | אין עמודה; מכוסה בכלל שמעל |
| `product_type` (taxonomy: simple/variable) | `has_variants` (030) | variable -> true |
| `_product_attributes` (serialized) | `variant_axes` (030) + `attributes` | unserialize; צירי וריאציה ל-variant_axes, מאפיינים גלובליים ל-attributes jsonb |
| `product_cat` (ראשית) | `category_id` | דרך מפת הקטגוריות (2.2) |
| `product_cat` (נוספות) | `product_categories` (030) | שיוך משני |
| `product_tag` | `search_keywords` (030) | join ברווחים; בלי 030: raw בלבד |
| `_thumbnail_id` + `_product_image_gallery` | `images` jsonb + `product_images` | לפי צנרת התמונות (2.4); ראשי ראשון |
| `total_sales` | staging בלבד | מזין את רשימת ה-spot-check (5.2) והחלטת sold_count עתידית |
| `_virtual` | רמז ל-type | virtual=yes מרים סבירות ל-coupon/service |
| `menu_order` | לא עובר | המיון החדש: is_featured + published_at |
| SEO plugin (Yoast/RankMath: `_yoast_wpseo_title`, `_yoast_wpseo_metadesc`) | `seo_title`, `seo_description` (030) | רק אם קיימים ולא תבניתיים; אחרת ריק |
| `type` (עמודת 005) | `type` | סיווג: היוריסטיקה (virtual/קטגוריה/מילות מפתח "שובר", "קופון") מציעה `coupon` או `physical`; **כל** הסיווגים נכתבים לדוח curation ואדמין מאשר לפני ההקרנה. ברירת מחדל בספק: `physical`. הערך `service` לא בשימוש (drift: אולי חסר ב-enum החי) |

עמודות public בלי מקור וורדפרס: `supplier_id` (NULL, סעיף 1.6),
`platform_percent` (NULL: נופל ל-fallback של 027), `is_coupon_enabled`
(false; אדמין), `is_featured` (false), `created_by` (משתמש האדמין המריץ),
`brand`/`low_stock_threshold` (ברירות מחדל של 030).

### 2.2 מיפוי שדות: וריאציות, קטגוריות

**וריאציות** (`wp_posts` type=product_variation, הורה = המוצר):

| מקור | יעד `product_variants` | טרנספורמציה |
|---|---|---|
| `ID` | `id_map (entity='variant')` | |
| `post_parent` | `product_id` | דרך id_map של ההורה |
| `attribute_pa_*` / `attribute_*` meta | `option_values` (030) + `attributes` | `{"size":"M","color":"שחור"}`; ערכים מתורגמים לפי `wp_terms` של הטקסונומיה |
| שם מורכב | `name_he` | ההורה + ערכי הצירים ("חולצה: M / שחור") |
| `_price` | `price` | NULL אם שווה למחיר ההורה (ואז נופל ל-kenyon_price לפי כלל הקטלוג 1.2) |
| `_sku` | `sku` | UNIQUE בסכימה; התנגשות = issue + סיומת |
| `_stock`/`_manage_stock` | `stock_quantity` | כמו במוצר |
| `menu_order` | `sort_order` | |

`price_modifier` לא נכתב (DEPRECATED מ-030). וריאציה כפולה באותם
option_values נחסמת ע"י ה-unique החלקי של 030 ונרשמת כ-issue.

**קטגוריות**: היעד הוא **מיפוי**, לא ייבוא. ב-DB החדש כבר יש 12 קטגוריות
קנוניות (018). לכל term של product_cat נקבע יעד באחת משלוש דרכים,
בקובץ curation שאדמין מאשר:

1. התאמה לקטגוריה קיימת (לפי שם/סמנטיקה): רוב המקרים.
2. יצירת תת-קטגוריה חדשה (עומק 2 נאכף ע"י ה-trigger של 030).
3. ללא יעד (term ריק/כפול): המוצרים שלו נופלים לקטגוריית ההורה הממופה,
   וה-URL הישן של ה-term מקבל 301 לקטגוריה הקרובה.

`wp_import.categories.manual_target_slug` מחזיק את ההכרעה; המיפוי חי
ב-id_map (`entity='category'`).

### 2.3 slugs ורציפות SEO

לפי הכרעת מסמך הקטלוג (3.1): **slugs לטיניים** במערכת החדשה. slugs
וורדפרסיים עבריים (percent-encoded) לעולם לא הופכים ל-slug חדש.

1. **גזירת slug חדש**: `name_en` אם קיים; אחרת תעתיק אוטומטי מ-`name_he`
   (הצעה בלבד); מנורמל ל-`^[a-z0-9]+(-[a-z0-9]+)*$`. קובץ ה-curation מציג
   `wp_slug -> proposed_slug` ואדמין מאשר/עורך לפני ההקרנה. התנגשות:
   סיומת `-2`.
2. **שימור ה-URL הישן**: לכל מוצר/קטגוריה/עמוד נכתבת שורת
   `seo_redirects` עם `source='wordpress_import'`:
   `/product/<wp-slug>/ -> /products/<new-slug>` (301),
   `/product-category/<wp-slug>/ -> /category/<target-slug>` (301),
   בתוספת כללי המערכת של PRODUCTION-OPS (`/shop/`, `/my-account/`,
   `/cart/`, `?p=N` וכו'). ה-path הישן נשמר percent-encoded ומנורמל
   (בלי trailing slash), בדיוק כפי ש-lookup ה-404 של הקטלוג (3.3) מצפה.
   הערה מיישבת: PRODUCTION-OPS כתב `/product/` (יחיד) כיעד; ההכרעה
   המחייבת היא של מסמך הקטלוג + STATE: **`/products/` (רבים)**.
3. **תלות**: טבלת `seo_redirects` נוצרת ב-030. ייבוא ה-redirects רץ אחרי
   החלת 030 (סעיף 3.4, שלב ההקרנה).

### 2.4 תמונות: wp-content -> Supabase Storage + מפת שכתוב

1. **מלאי**: כל attachment שנקשר למוצר (thumbnail, gallery, תמונות בתוך
   post_content) נרשם ב-`wp_import.media` עם `source_url` המקורי.
2. **קובץ המקור**: תמיד הקובץ המקורי (בלי סיומות ריסייז `-300x300`);
   ה-regex מסיר סיומת מידות ומאמת קיום. הבאה מ-rsync של uploads אם יש
   גישת קבצים, אחרת HTTP מהאתר החי (עם retry + אימות Content-Type).
3. **אופטימיזציה בעת ההעלאה** (כלל PRODUCTION-OPS 3.2: מעלים מוכן):
   המרה ל-WebP ברוחב מקסימלי 1600px, איכות 80. מעל זה אין טעם: הרינדור
   עובר דרך Vercel Image Optimization. נגזרת OG ‏1200x630 מתחת ל-300KB
   נוצרת לתמונה הראשית (דרישת וואטסאפ, קטלוג 3.7).
4. **יעד**: bucket ‏`product-images` (public, קיים מ-004), path
   `wp/<wp_attachment_id>/<basename>.webp`. ה-path דטרמיניסטי = העלאה
   חוזרת דורסת את עצמה (idempotent). דה-דופ לפי `sha256` של קובץ המקור:
   קובץ זהה שמופיע בכמה מוצרים מועלה פעם אחת וממופה מכולם.
5. **מפת שכתוב**: `wp_import.media` היא ה-map הרשמי
   `source_url -> new_url`. היא משמשת: (א) בניית `products.images` jsonb
   ו-`product_images`; (ב) שכתוב `<img src>` בתוך `description_he`;
   (ג) שורות 301 ל-URLs של קבצים שצברו קליקים ב-GSC (נדיר אך קיים,
   Google Images).
6. **סטטוס פר קובץ**: `pending -> downloaded -> uploaded` או
   `failed`/`skipped` + error. שער האימות (5.1) דורש אפס pending/failed
   על תמונות של מוצרים active.

### 2.5 כללי ניקוי דאטה

1. **HTML של תיאורים**: הסרת shortcodes (`[...]`), הסרת inline styles
   ו-classes של page builders, המרת `<h1>` פנימי ל-`<h2>`, שכתוב קישורים
   פנימיים `kenyonexpress.co.il/... -> path` יחסי חדש דרך url_inventory,
   שכתוב תמונות דרך media map. התוצר נשמר גם נקי (ליעד) וגם גולמי (raw).
2. **מחירים**: numeric(10,2); פסיקים/סימני ₪ מוסרים; מחיר 0 או NULL
   במוצר publish = error (לא מיובא כ-active).
3. **טלפונים**: נרמול לפורמט `05X-XXXXXXX` (תבנית האפליקציה);
   `+972`/רווחים/מקפים מטופלים; לא ניתן לנרמול -> נשמר raw + issue warn.
4. **אימיילים**: lower/trim; ולידציית תבנית; לא חוקי -> הלקוח לא נוצר
   ב-auth (ארכיון בלבד).
5. **כתובות**: `billing_address_1` נכנס שלם ל-`street` (בלי ניסיון לפרק
   מספר בית אוטומטית: שיעור שגיאה גבוה בעברית); `billing_city -> city`,
   `billing_postcode -> zip` (רק 5-7 ספרות), טלפון מנורמל. כתובת חלקית
   (בלי city) לא נוצרת.
6. **תאריכים**: כל התאריכים נשמרים UTC (`*_gmt`); תצוגה Asia/Jerusalem
   היא עניין של ה-UI.
7. **קידוד**: ה-dump נטען utf8mb4; בדיקת mojibake אוטומטית (שאילתת
   דגימה לתווים עבריים שבורים) לפני כל טעינה.
8. **Elementor** (מותקן באתר, ממצא 1.0): תיאורי מוצר של Woo יושבים בדרך
   כלל ב-post_content רגיל, אבל תוכן שנבנה ב-builder חי ב-meta
   ‏`_elementor_data` (JSON). כלל: אם post_content ריק/דל ו-`_elementor_data`
   קיים על המוצר, מחלצים את הטקסט מעץ האלמנטים + issue ברמת warn לבדיקת
   עין. עמודי תוכן (שנכתבים מחדש ממילא) לא עוברים חילוץ כזה.

---

## 3. שלב הביצוע (Execution)

### 3.1 הוכרע: one-shot חזרתי (rehearsed one-shot), לא סנכרון מתמשך

**ההחלטה: ייבוא חד-כיווני שניתן להריץ שוב ושוב על dump טרי, בלי סנכרון
דו-כיווני ובלי delta מתמשך.** נימוקים:

- סדר הגודל קטן (עשרות עד מאות מוצרים, אלפי לקוחות לכל היותר): טעינה
  מלאה נמדדת בדקות. תשתית CDC/sync הייתה הנדסת יתר מסוכנת.
- ה-idempotency דרך `id_map` נותנת את אותה תוצאה: dump חדש -> הרצה
  חוזרת -> רק דלתות משתנות.
- סנכרון דו-כיווני היה מחייב לפתור התנגשויות עריכה בין שתי מערכות חיות.
  במקום זה: חלון הקפאת תוכן (3.3).

### 3.2 סדר וריצות

```
שלב 0 (עכשיו, חוסם הכול): השגת גישה לאחסון/DB הישן; זיהוי plugin השוברים;
        ‏dump ראשון + uploads + sitemap + ייצוא GSC
שלב 1: החלת 032 (סכימת wp_import) על פרויקט היעד דרך MCP apply_migration
שלב 2: טעינת staging (סקריפטים, סעיף 6) -> דוחות curation
        (קטגוריות, slugs, סיווג type, ספקים) -> אישורי אדמין
שלב 3: הקרנה ל-public על פרויקט ה-DEV תחילה (חזרה גנרלית מלאה):
        categories -> products -> variants -> images -> customers
        -> (שוברים חיים, אם יש) -> redirects
שלב 4: אימות (סעיף 5) על DEV; תיקון כללים; חזרה על 2-3 עד אפס errors
שלב 5: cutover על פרודקשן (3.3)
```

תלויות בשרשרת המיגרציות: ‏032 (staging) עצמאית לחלוטין ואפשר להחיל אותה
מיד. ההקרנה של קטלוג ולקוחות רצה על הסכימה החיה (016+025 מספיקות);
ההקרנה של redirects דורשת 030; הקרנת שוברים חיים דורשת 026+027 (עמודות
snapshot + QR על coupon_codes). לפי MASTER, בפרודקשן ממילא מחילים
001->031 מסודר לפני האכלוס.

### 3.3 חלון הקפאת תוכן ו-cutover

משתלב ברצף ה-DNS של PRODUCTION-OPS (TTL 300, ‏flip, ‏ניטור):

| זמן | פעולה |
|---|---|
| T-7 ימים | dump חזרה גנרלית אחרון; אימות מלא ירוק על DEV |
| T-48h | **הקפאת קטלוג** באתר הישן: אין עריכת מוצרים/מחירים/קטגוריות (הודעה מנהלתית; אפשר גם נעילת עריכה ב-WP). מכירת שוברים חדשים נעצרת |
| T-24h | dump סופי -> טעינת staging -> הקרנה לפרודקשן -> אימות מלא (שערי 5) |
| T-0 | מעבר DNS לפי PRODUCTION-OPS. וורדפרס נשאר חי וללא שינוי |
| T+2h | הזמנה שנכנסה לוורדפרס בחלון ה-DNS (עד דקות ספורות): נבדקת ידנית ומועתקת לארכיון; שובר שנקנה בחלון מוקרן ידנית לפי כלל 1.4 |
| T+7 ימים | dump משלים של הזמנות בלבד -> רענון ארכיון (סטטוסים שהתעדכנו בזנב) |
| T+14 ימים | אם יציב: וורדפרס יורד לקריאה בלבד; ה-dump האחרון נשמר בגיבוי הקבוע |

חלון ההשבתה ללקוחות: אפס בפועל. ההקפאה היא על עריכת תוכן, לא על גלישה;
checkout ישן נסגר רק ברגע ה-flip.

### 3.4 dry-run ואימות מקדים

- לכל סקריפט הקרנה יש מצב `--dry-run`: מחשב את כל הטרנספורמציות, כותב
  דוח מלא + issues, לא נוגע ב-public.
- שערי מעבר בין שלבים: אפס שורות issue ברמת error; רשימת ה-warnings
  נסקרת ידנית ומאושרת.
- החזרה הגנרלית על DEV היא dry-run-בקנה-מידה-מלא של פרודקשן: אותם
  סקריפטים, אותו dump, סכימה זהה.

### 3.5 תוכנית rollback

שתי שכבות, בלתי תלויות:

1. **rollback של האתר** (PRODUCTION-OPS): החזרת DNS לוורדפרס (TTL 300
   -> תעבורה חוזרת תוך דקות). וורדפרס לא נגוע: הוא המשיך לחיות כל הזמן.
2. **rollback של הדאטה בפרודקשן החדש**: כל שורה מוקרנת רשומה ב-id_map
   עם ‏batch_id. סקריפט `purge --batch <id>` מוחק בסדר תלות הפוך
   (redirects -> product_images -> variants -> products -> ...;
   ‏auth.users דרך Admin API ‏deleteUser רק למשתמשים שאין להם פעילות
   חדשה). staging וה-dump לא נמחקים לעולם: הם הארכיון.
3. נקודת אל-חזור: מרגע שיש הזמנות אמיתיות במערכת החדשה, purge גורף אסור;
   מתקנים קדימה (תיקון שורות נקודתי לפי id_map).

---

## 4. (משולב מעלה) מיפוי, ניקוי ו-URL: ראו 2.1-2.5

הסעיף נשמר לניווט; אין תוכן נוסף.

---

## 5. שלב האימות (Verification)

### 5.1 שערים כמותיים (reconciliation)

`wp_import.v_reconciliation` משווה שלושה מספרים פר ישות: מקור (staging),
ממופה (id_map), יעד (ספירה ב-public):

| בדיקה | תנאי עצירה |
|---|---|
| מוצרים publish | staging = mapped = ‏products active שנוצרו מהייבוא; פער = חסימה |
| וריאציות | סכום פר מוצר-הורה זהה |
| קטגוריות | לכל term עם מוצרים יש יעד ממופה |
| לקוחות עם אימייל תקין | staging = auth.users שנוצרו/מופו |
| תמונות של מוצרים active | ‏100% בסטטוס uploaded; אפס failed/pending |
| שוברים חיים (אם יש) | ספירת staging פתוחים = coupon_codes issued שנוצרו |
| checksums | ‏Σ‏kenyon_price ו-Σ‏stock_quantity פר קטגוריה שווים בין staging ליעד (תופס עיוותי המרה שספירה לא תופסת) |

### 5.2 פרוטוקול spot-check

מדגם קבוע ומתועד (הרשימה נשמרת ב-repo, התוצאות ב-checklist):

1. **20 מוצרים אקראיים** (seed קבוע לשחזוריות) + **10 הנמכרים ביותר**
   (לפי `total_sales` מה-staging): השוואת שדה-שדה מול האתר הישן החי:
   שם, מחיר + מחיר מלא, תיאור מרונדר, תמונות (כמות + ראשית), קטגוריה,
   וריאציות + מחיריהן, מלאי.
2. **5 לקוחות** (בתיאום/עצמיים): כניסת Google/OTP עובדת, טלפון וכתובת
   נכונים, אין דגלי שיווק דלוקים.
3. **דפדוף אמיתי**: 10 URLs ישנים מובילים 301 ליעד נכון שנטען 200.

### 5.3 שלמות 301 מול האתר הישן

1. `wp_import.url_inventory` מאוחדת משלושה מקורות: sitemap ישן, ייצוא
   GSC (כל URL עם קליק ב-12 חודשים), crawl מלא (Screaming Frog).
2. **שער**: לכל שורת inventory יש בדיוק אחד מהשלושה: (א) שורת
   `seo_redirects`; (ב) התאמה ישירה ל-path חי חדש; (ג) סימון מודע
   `410`/ירידה יזומה. אפס שורות ללא הכרעה.
3. סקריפט אימות מריץ HTTP על כל ה-inventory מול הפרודקשן החדש (לפני
   ה-flip, דרך ה-staging domain עם Host override): מצופה ‏301 -> ‏200,
   בלי שרשראות (מקסימום קפיצה אחת) ובלי לולאות.
4. אחרי ההשקה: ניטור GSC ‏Coverage + ‏`seo_redirects.hits` + דוח 404
   שבועי, חודש ימים (כבר מוגדר במסמך הקטלוג 3.8).

---

## 6. תכנון הכלים (Tooling)

### 6.1 מבנה הסקריפטים

```
scripts/wp-import/
  00-preflight.ts       בדיקות קדם: גרסאות, קידוד, HPOS?, plugin שוברים, ספירות גולמיות
  01-load-staging.ts    ‏MySQL מקומי (Docker) -> wp_import.* ‏(products, categories,
                        customers, orders, order_items, coupons, vouchers, media)
  02-media-sync.ts      הורדה/rsync -> אופטימיזציה (WebP/OG) -> Storage -> עדכון media
  03-curation-export.ts דוחות CSV: מיפוי קטגוריות, slugs מוצעים, סיווג type, רמזי ספק
  04-curation-import.ts קליטת הקבצים המאושרים חזרה ל-staging
  05-project-catalog.ts הקרנה: categories -> products -> variants -> images -> redirects
  06-project-customers.ts ‏Auth Admin API -> העשרת profiles -> user_addresses
  07-project-vouchers.ts שוברים חיים בלבד (מותנה בשאלה 7.2)
  08-verify.ts          כל שערי סעיף 5; ‏exit code לא-אפס על כל error
  09-purge.ts           ‏rollback לפי batch (סעיף 3.5)
```

### 6.2 עקרונות idempotency של הסקריפטים

1. **מפתח מקור בכל שורה**: כל הקרנה עוברת דרך
   `wp_import.id_map (entity, wp_id) -> new_id`. קיים -> ‏UPDATE של שדות
   בבעלות-ייבוא בלבד; לא קיים -> ‏INSERT + רישום map. שדה שאדמין ערך
   במערכת החדשה אחרי הקרנה (מזוהה לפי השוואת snapshot ההקרנה הקודם
   השמור ב-staging) לא נדרס, ונרשם conflict issue.
2. **חיבור ל-DB**: ‏service role דרך connection string ישיר (pooler),
   בטרנזקציות פר-ישות; ‏Auth דרך Admin API בלבד. שום סקריפט לא רץ עם
   מפתח anon.
3. **batch**: כל ריצה פותחת שורת `import_batches` וכל כתיבה מסומנת בה.
4. **דטרמיניזם**: אותו dump + אותם קבצי curation = אותה תוצאה ביט-ביט
   (למעט uuid חדשים, שנקבעים פעם אחת דרך id_map).
5. **בלי טריגרים מיותרים בזמן טעינה**: ההקרנה כותבת `published_at`/
   `created_at` היסטוריים במפורש; ‏audit triggers נשארים דלוקים בכוונה
   (הייבוא הוא בדיוק הדבר ש-audit צריך לתעד). טריגר ההתראות של 031 על
   orders לא נורה כי לא כותבים paid-transition (השוברים החיים נכנסים
   ישירות בסטטוס הסופי).

### 6.3 מה כוללת 032 (טיוטה, לא להריץ)

`supabase/migrations/032_wp_import_staging.sql`, ‏idempotent, staging בלבד:

1. `CREATE SCHEMA wp_import` (לא חשופה ל-PostgREST: לא ברשימת הסכימות
   של ה-API, גישה רק דרך service role / MCP).
2. טבלאות: `import_batches`, `products`, `categories`, `customers`,
   `orders`, `order_items`, `coupons`, `vouchers`, `media`,
   `url_inventory`, `id_map`, `issues`. כולן עם עמודת raw jsonb (נאמנות
   מלאה למקור), מפתח וורדפרסי טבעי, ו-timestamps.
3. views: ‏`v_reconciliation` (ספירות מקור/ממופה פר ישות),
   ‏`v_open_issues`.
4. ‏RLS מופעל על הכול; policies קריאה לאדמין בלבד; אפס policies כתיבה
   (הכותב היחיד הוא service role, שעוקף RLS).
5. ‏GRANTs מפורשים ל-service_role בלבד; אין GRANT ל-anon/authenticated
   ברמת הסכימה.

לא כלול ב-032 בכוונה: שינוי כלשהו ב-public, טעינת דאטה, פונקציות הקרנה
(הן קוד אפליקציה/סקריפטים, לא DB), והיא בטוחה להחלה בכל נקודה בשרשרת
(אין תלות ב-026-031).

---

## 7. שאלות פתוחות

עדכון 2026-07-09: שאלות בלי tradeoff עסקי הוכרעו אוטומטית וסומנו
"DECIDED (auto)". שאלות עם השלכה עסקית/משפטית/כספית מסומנות
"מחייב אישור אופיר" ולא הוכרעו.

1. **plugin השוברים באתר הישן**: איזה plugin מנפיק את השוברים/QR היום,
   ובאיזו טבלה הם יושבים? קובע את מבנה הטעינה של `wp_import.vouchers`.
   **DECIDED (auto) 2026-07-09**: לא מנחשים מראש. הזיהוי נעשה מה-dump
   בשלב 0 (בדיקת `00-preflight`: סריקת טבלאות/אופציות של plugins בסכימה),
   ומבנה הטעינה של `wp_import.vouchers` נסגר רק אחרי הממצא. השאלה
   העובדתית נשארת פתוחה עד שיש dump; ההכרעה היא על שיטת הבירור.
2. **כמה שוברים פתוחים יהיו ב-cutover?** אם אפס (או שמחליטים לממש/להקפיא
   הכול לפני), החריג של 1.4 מתבטל וההזמנות כולן ארכיון טהור.
   **מחייב אישור אופיר** (המלצה: הקפאת מכירת שוברים באתר הישן 30 יום
   לפני ה-flip ועידוד מימוש, כדי לשאוף לאפס פתוחים ולבטל את החריג).
3. **גישה בפועל**: פרטי אחסון/SSH/phpMyAdmin של האתר הישן + הרשאת GSC.
   בלי זה שלב 0 לא נפתח (זו גם שאלה פתוחה 6.2 של מסמך הקטלוג).
   **DECIDED (auto) 2026-07-09**: זו משימת הפעולה המיידית של המסלול,
   לפני כל עבודה אחרת בו: השגת פרטי גישה מהמאחסן + הוספת בעלות ב-GSC.
   אין כאן הכרעה עסקית, רק פעולה אנושית שחוסמת את שלב 0.
4. **הודעת מעבר ללקוחות**: האם שולחים מייל תפעולי חד-פעמי ("האתר התחדש,
   נכנסים עם Google/קוד למייל")? מותר כתפעולי, אבל צריך ניסוח והחלטה.
   **מחייב אישור אופיר** (המלצה: כן, מייל תפעולי טהור בלי שום תוכן
   שיווקי, דרך הסאב-דומיין הטרנזקציוני; הנוסח יובא לאישור בנפרד).
5. **ראיות opt-in היסטוריות**: אם יימצא תיעוד הרשמה לניוזלטר עם
   timestamp, האם מכבדים אותו (ייבוא כ-consent_events עם source='admin'
   ‏+ wording מתועד) או דורשים re-opt-in מכולם? ברירת המחדל: לא מכבדים.
   **מחייב אישור אופיר** (המלצה: להשאיר את ברירת המחדל, לא מכבדים;
   re-opt-in נאסף באתר החדש. עד להכרעה ברירת המחדל ממילא בתוקף).
6. **יתרות זכות/נקודות באתר הישן**: אם קיים store credit ב-Woo, ייבואו
   דורש תנועות `fn_wallet_transfer` מ-`platform:adjustments` פר לקוח.
   צריך לוודא אם יש בכלל.
   **מחייב אישור אופיר** (הבירור העובדתי נעשה מה-dump בשלב 0; אם יש
   יתרות, ההחלטה אם לייבא כרשומות פתיחה או לזכות ידנית היא כספית
   ומחכה לאישור).
7. **עמודי תוכן**: אילו עמודים סטטיים (תקנון, אודות, משלוחים) נכתבים
   מחדש לפני ה-cutover? ה-301 שלהם ממתין לרשימת יעדים.
   **DECIDED (auto) 2026-07-09**: לפני ה-flip נכתב רק המינימום המחויב
   לאתר שמוכר: תקנון, מדיניות פרטיות, משלוחים והחזרות, צור קשר.
   כל השאר (אודות וכו') אחרי ההשקה; עד אז ה-URL הישן שלהם מקבל 301
   לדף הבית דרך url_inventory.
8. **חשבוניות ישנות כ-PDF**: האם צריך להנגיש ללקוח חשבוניות מהאתר הישן,
   או שמספיק שהן שמורות בספרי האתר הישן + בארכיון?
   **DECIDED (auto) 2026-07-09**: לא מנגישים באתר החדש. חובת השמירה
   מתקיימת ב-dump ובספרי האתר הישן; בקשת לקוח נקודתית נענית ידנית
   במייל. אין בניית UI לחשבוניות ישנות.

---

## 8. סיכום החלטות

| # | החלטה |
|---|---|
| D1 | מקור החילוץ: mysqldump מלא + העתק uploads; ‏REST/WXR נדחו |
| D2 | סכימת `wp_import` בפרויקט היעד = ארכיון קבוע + שכבת staging; לא חשופה ל-API |
| D3 | הזמנות היסטוריות: **ארכיון, לא ייבוא**; חריג יחיד: שרשרת מינימלית לשוברים חיים |
| D4 | לקוחות: יצירה דרך Auth Admin API (הטריגרים רצים), בלי סיסמאות, dedupe לפי אימייל |
| D5 | שיווק: כל המיובאים opted-out; אין ייבוא consent בלי ראיות + הכרעה יזומה (7.5) |
| D6 | מוצרי Woo -> ‏`products` בלבד; ‏`coupon_deals` לא מאוכלסת אוטומטית |
| D7 | slugs חדשים לטיניים; כל URL ישן מקבל 301 ב-`seo_redirects` (source='wordpress_import'); יעד מוצר: ‏`/products/` (רבים) |
| D8 | תמונות: מקוריות -> ‏WebP ‏1600px + נגזרת OG -> ‏bucket ‏product-images תחת ‏`wp/<id>/`; דה-דופ sha256; מפת שכתוב ב-`wp_import.media` |
| D9 | ביצוע: one-shot חזרתי idempotent (id_map + batches), לא סנכרון מתמשך |
| D10 | הקפאה: קטלוג ומכירת שוברים 48h לפני; checkout ישן נסגר רק ב-flip; ‏dump משלים ‏T+7 |
| D11 | ‏rollback: ‏DNS חזרה (וורדפרס חי שבועיים) + ‏purge לפי batch; אל-חזור מרגע שיש הזמנות חדשות |
| D12 | אימות: שערי ספירה + checksums, ‏spot-check ‏20+10+5, ‏100% כיסוי url_inventory, אפס errors לפני כל הקרנה |
| D13 | ביקורות Woo נזנחות (נשמרות רק בתוך ה-dump); עמודי תוכן נכתבים מחדש |
