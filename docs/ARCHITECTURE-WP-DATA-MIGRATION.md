# KenyonExpress: מיגרציית דאטה מ-WordPress/WooCommerce ל-Supabase (מסמך מחייב)

תאריך: 2026-07-17. ענף: `phase5/homepage`.

מעמד המסמך: זהו מסמך ההפעלה המחייב והיחיד של מסלול W (ייבוא WP).
הוא בנוי על הסכימה החיה ועל הכרעות `docs/MASTER-ARCHITECTURE.md`,
ומכריע את כל השאלות שהיו פתוחות בתכנון המקורי (סעיף 6.4 כאן).
בכל סתירה: המסמך הזה גובר.

הקשר: האתר החי `kenyonexpress.co.il` רץ על WordPress + WooCommerce
ומוחלף במערכת החדשה (Next.js + Supabase) על אותו דומיין, באפס איבוד
דאטה. מסמכים קשורים: `docs/ARCHITECTURE-PRODUCTION-OPS.md` (cutover,
DNS, גיבויים), `docs/ARCHITECTURE-CATALOG-SEARCH-SEO.md` (030: slugs,
seo_redirects), `docs/ARCHITECTURE-COMMERCE.md` (026),
`docs/ARCHITECTURE-ACCOUNT-IDENTITY.md` (029),
`docs/ARCHITECTURE-NOTIFICATIONS-MARKETING.md` (031, חוק הספאם 30א),
`docs/MASTER-ARCHITECTURE.md` (סדר מיגרציות קנוני).

תשתית DB נלווית: `supabase/migrations/032_wp_import_staging.sql`
(סכימת `wp_import`: ארכיון + staging, לא חשופה ל-PostgREST, החלה דרך
MCP `apply_migration` בלבד).

עקרונות על:

1. אפס איבוד דאטה: כל ביט מהאתר הישן נשמר לצמיתות ב-`wp_import`.
   רק תת-קבוצה נקייה מוקרנת ל-public.
2. ה-DB החדש לא יורש חוב: שורה שמפרה constraint או סמנטיקה כספית לא נכנסת.
3. הכול idempotent דרך `wp_import.id_map`; הרצה חוזרת = upsert.
4. הסכימה החיה היא האמת (יש drift מול קבצי המיגרציות): בדיקות קדם רצות
   מול ה-DB החי, לא מול הקבצים.
5. חוק הספאם 30א: אף לקוח מיובא לא נכנס opted-in.

---

## 1. מלאי מקור ושיטת חילוץ

### 1.1 הכרעה: DB dump מלא, לא WP-CLI ולא REST

**הוכרע: `mysqldump` מלא של בסיס הנתונים + העתק מלא של
`wp-content/uploads`.** פקודת הייחוס (Terminal, על שרת האחסון או דרך SSH):

```bash
mysqldump --single-transaction --quick --default-character-set=utf8mb4 \
  --routines --triggers --hex-blob "$DB_NAME" | gzip > ke-wp-$(date +%Y%m%d).sql.gz
rsync -az user@host:/path/to/wp-content/uploads/ ./wp-uploads/
```

נימוקי הדחייה של החלופות:

- **WP-CLI (`wp export` / שאילתות פר ישות)**: WXR מיועד לתוכן ולא לחנות
  (הזמנות, לקוחות ווריאציות יוצאים חלקית או בכלל לא), ושאילתות פר ישות
  לא נותנות snapshot עקבי בנקודת זמן אחת. אם WP-CLI מותקן אצל המאחסן
  מותר להפיק את ה-dump דרך `wp db export` (זה עטיפה ל-mysqldump), אבל
  מקור האמת הוא קובץ ה-dump, לא הכלי.
- **WC REST API**: מחזיר 401 בלי מפתחות (נבדק חי 2026-07-09), מסנן meta
  לא רשום, ואין snapshot עקבי. ה-Store API הפתוח משמש רק לאימות צולב
  זול בשלב הבדיקות (סעיף 4.4).
- **Crawl (Screaming Frog)**: לא מקור דאטה; משמש אך ורק לבניית
  `wp_import.url_inventory` (סעיף 5.3).

ה-dump נטען ל-MySQL מקומי (Docker, `mysql:8`, `utf8mb4`) וסקריפטים
שולפים ממנו אל טבלאות ה-staging. ה-dump עצמו הוא גם הגיבוי המשפטי
הקבוע של האתר הישן (חובת שמירה 7 שנים).

### 1.2 טבלאות וורדפרס לחילוץ

| טבלה | תוכן | יעד staging |
|---|---|---|
| `wp_posts` | מוצרים, וריאציות, attachments, הזמנות (אם לא HPOS), קופונים, עמודים | `wp_import.products` / `orders` / `media` |
| `wp_postmeta` | כל ה-meta של Woo (`_price`, `_sku`, `_stock`, גלריה, Yoast, Elementor) | עמודות מפורקות + `raw_meta` jsonb |
| `wp_terms` + `wp_term_taxonomy` + `wp_term_relationships` + `wp_termmeta` | קטגוריות מוצר, תגיות, מאפיינים גלובליים (`pa_*`) | `wp_import.categories` + שדות המוצר |
| `wp_users` + `wp_usermeta` | לקוחות: אימייל, שם, טלפון, כתובות billing/shipping | `wp_import.customers` |
| `wp_woocommerce_order_items` + `wp_woocommerce_order_itemmeta` | שורות הזמנה | `wp_import.order_items` |
| `wp_wc_orders` + `wp_wc_orders_meta` + `wp_wc_order_addresses` + `wp_wc_order_operational_data` | הזמנות במצב HPOS (אם פעיל) | `wp_import.orders` עם `storage_source='hpos'` |
| `wp_wc_product_meta_lookup` + `wp_wc_customer_lookup` | אימות צולב של מחירים/ספירות | בדיקות בלבד, לא נטען |
| `wp_comments` | ביקורות (324 באתר) | לא נטען (D13: נזנחות; נשמרות בתוך ה-dump) |
| `wp_options` | plugins פעילים, permalink structure, הגדרות Woo (מטבע, מדינה) | `00-preflight` בלבד |
| טבלאות plugin השוברים | שוברים שנמכרו + סטטוס מימוש | `wp_import.vouchers` (מבנה נסגר אחרי זיהוי ה-plugin ב-preflight) |

השלמות מחוץ ל-DB: `wp-content/uploads` (קבצי המקור של התמונות),
`sitemap_index.xml` של Yoast, וייצוא GSC של כל URL עם קליקים ב-12
החודשים האחרונים. שלושתם מזינים את `url_inventory` ואת צנרת המדיה.

היקף ידוע (בדיקה חיה 2026-07-09, HTTP מול האתר בפועל; נאסף מ-sitemap
של Yoast ומה-Store API הפתוח: עובדות, לא הנחות):

- **סטאק**: WordPress 6.8.1, WooCommerce, Elementor 3.30.2,
  Slider Revolution 6.5.8, WP Rocket, Redux, Yoast SEO
  (`sitemap_index.xml`), Facebook for WooCommerce.
- **היקף**: 46 מוצרים ב-`product-sitemap.xml` (‏45 גלויים ב-Store API:
  ‏44 simple, ‏1 variable), 9 קטגוריות מוצר, 26 עמודים, פוסט יחיד.
- **מחירים**: שקלים שלמים (`currency_minor_unit=0`); ‏25 מתוך 45
  מוצרים ב-on_sale (מזין את כלל `full_price` בסעיף 2.1).
- **SKU**: רק 4 מתוך 45 מוצרים נושאים SKU, בלי כפילויות. סיכון
  dup-SKU זניח בפועל; הכיסוי הכמעט-אפסי נרשם כ-issue ברמת info.
- **ביקורות**: סך `review_count` = ‏324 (נזנחות, D13/M17).
- **API**: ‏WC REST v3 מחזיר 401 בלי מפתחות; ה-Store API פתוח לקריאה
  אנונימית (משמש רק לאימות צולב, סעיף 4.4).
- **Elementor פעיל**: נגזר כלל הניקוי C10.

סדר גודל שמאשר ביצוע one-shot עם spot-check בכיסוי גבוה.

---

## 2. מיפוי שדה-שדה: WP אל הסכימה החיה

כל שדה בלי עמודת יעד נשמר ב-`raw_meta`/`raw` (אפס איבוד). כל ההקרנות
עוברות דרך `wp_import.id_map (entity, wp_id) -> new_id`.

### 2.1 מוצרים: `wp_posts` + `wp_postmeta` אל `public.products`

| מקור WP | יעד | טרנספורמציה |
|---|---|---|
| `ID` | `id_map(entity='product')` | מפתח idempotency בלבד |
| `post_title` | `name_he` | trim; ריק = issue ברמת error, לא מיובא |
| `post_content` | `description_he` | ניקוי HTML (כלל C4), שכתוב URLs של תמונות (2.5) |
| `post_excerpt` | נשמר ב-raw בלבד | אין שדה תקציר; מועמד ל-`seo_description` כשהוא קצר ונקי |
| `post_name` (slug עברי) | לא נכנס ל-`slug` | נכנס ל-`url_inventory` בלבד; ראו 2.2 |
| slug חדש (curation) | `slug` | לטיני `^[a-z0-9]+(-[a-z0-9]+)*$`, ייחודי גלובלית |
| `post_status` | `status` | publish -> active; draft/pending/private -> draft (private מקבל issue); trash -> לא מיובא (issue info) |
| `post_date_gmt` | `published_at` + `created_at` | ערך היסטורי נכתב במפורש |
| `post_modified_gmt` | staging בלבד | `updated_at` ב-public מתנהל ע"י trigger |
| `_sku` | `sku` | trim; ריק -> NULL; כפילות לפי כלל C3 |
| `_price` (אפקטיבי) / `_sale_price` בתוקף | `kenyon_price` **וגם** `price_ils` | numeric(10,2). `price_ils` היא NOT NULL בסכימה החיה (005), לכן כתיבה כפולה זהה עד לניקוי העמודה הישנה |
| `_regular_price` | `full_price` | רק אם גדול ממש מהמחיר האפקטיבי; אחרת NULL (CHECK של 030: `full_price >= kenyon_price`) |
| `_manage_stock` + `_stock` + `_stock_status` | `stock_quantity` | manage=yes -> `_stock`; manage=no+instock -> NULL; manage=no+outofstock -> 0 |
| `product_type` taxonomy | `has_variants` (030) | variable -> true |
| `_product_attributes` (serialized PHP) | `variant_axes` (030) + `attributes` | unserialize; צירי וריאציה ל-`variant_axes`, השאר ל-`attributes` jsonb |
| `product_cat` ראשית | `category_id` | דרך מפת הקטגוריות (2.3) |
| `product_cat` נוספות | `product_categories` (030) | שיוך משני |
| `product_tag` | `search_keywords` (030) | join ברווחים |
| `_thumbnail_id` + `_product_image_gallery` | `images` jsonb + `product_images` | צנרת המדיה (2.5); הראשונה = ראשית |
| `_yoast_wpseo_title` / `_yoast_wpseo_metadesc` | `seo_title` / `seo_description` (030) | רק אם קיימים ולא תבניתיים |
| `_virtual`, קטגוריה, מילות מפתח ("שובר", "קופון") | `type` | היוריסטיקה מציעה `coupon` או `physical`; **כל** הסיווגים נכתבים לדוח curation ואדמין מאשר לפני ההקרנה; ברירת מחדל בספק: `physical`. הערך `service` אסור לשימוש בייבוא (drift: עלול לחסור ב-enum החי) |
| `total_sales` | staging בלבד | מזין spot-check והחלטת `sold_count` עתידית |
| `menu_order` | לא עובר | המיון החדש: `is_featured` + `published_at` |
| meta של עיר/מיקום | **לא מוקרן** | כלל C1 (באג נהריה) |

עמודות בלי מקור: `supplier_id = NULL` (שיוך ידני, 2.4),
`platform_percent` לא נכתב (נופל לברירת המחדל/‏fallback של הסכימה),
`is_coupon_enabled = false`, `is_featured = false`,
`created_by` = משתמש האדמין המריץ,
`brand`/`low_stock_threshold` = ברירות המחדל של 030.

### 2.2 slugs: לטיניים חדשים, העברי מת עם 301

לפי הכרעת הקטלוג: slugs עבריים percent-encoded לא עוברים. `name_en`
אם קיים, אחרת תעתיק אוטומטי מ-`name_he` כהצעה. קובץ ה-curation מציג
`wp_slug -> proposed_slug` ואדמין מאשר. התנגשות: סיומת `-2`.
כל URL ישן מקבל שורת `seo_redirects` עם `source='wordpress_import'`
ויעד `/products/<new-slug>` (רבים; הכרעה 1.28 של MASTER). הערה
מיישבת: PRODUCTION-OPS כתב `/product/` (יחיד) כיעד; ההכרעה המחייבת
היא של מסמך הקטלוג + MASTER: **`/products/` (רבים)**.

### 2.3 וריאציות וקטגוריות

וריאציות (`product_variation`) אל `product_variants`:
`post_parent` -> ‏`product_id` (דרך id_map), ‏`attribute_*` meta ->
‏`option_values` (030, ‏UNIQUE חלקי פר מוצר) + ‏`attributes` (למשל
`{"size":"M","color":"שחור"}`; ערכים מתורגמים לפי `wp_terms` של
הטקסונומיה), שם מורכב ("הורה: M / שחור") -> ‏`name_he`, ‏`_price` ->
‏`price` (NULL אם שווה למחיר ההורה, ואז נופל ל-`kenyon_price` לפי כלל
הקטלוג), ‏`_sku` -> ‏`sku` (UNIQUE; התנגשות = סיומת + issue),
‏`_stock` -> ‏`stock_quantity`, ‏`menu_order` -> ‏`sort_order`,
‏`is_active = true`. ‏`price_modifier` לא נכתב (DEPRECATED מ-030).
וריאציה כפולה באותם `option_values` נחסמת ע"י ה-UNIQUE החלקי של 030
ונרשמת כ-issue.

קטגוריות: **מיפוי, לא ייבוא.** ב-DB החדש כבר יש 12 קטגוריות קנוניות
(seed ‏018: ‏hot-deals, ‏restaurants-cafes, ‏beauty-health וכו'), ו-9
קטגוריות המוצר של WP ממופות אליהן בקובץ curation עם
`manual_target_slug`; המיפוי חי ב-id_map (`entity='category'`). יצירת
תת-קטגוריה חדשה רק כשאין יעד (עומק 2 נאכף ע"י trigger של 030).
‏term בלי יעד: המוצרים נופלים לקטגוריית ההורה וה-URL מקבל 301.

### 2.4 ספקים

לוורדפרס של חנות יחידה אין ישות ספק. הייבוא משאיר
`products.supplier_id = NULL` ורושם issue ברמת info פר מוצר (רשימת
עבודה לאדמין). שם העסק אם מופיע בטקסט/מטא נשמר ב-`supplier_hint`
ב-staging. הקמת ספקים אמיתיים: זרימת ה-onboarding של 027 (או INSERT
אדמין ל-`suppliers`), כולל `city` אמיתית פר עסק, ואז שיוך ידני באדמין.
אין יצירת ספקים אוטומטית מהייבוא: איכות הדאטה של "שם עסק בתוך טקסט
שיווקי" נמוכה מדי, והיקף של עשרות מוצרים לא מצדיק אוטומציה.

### 2.5 תמונות: uploads אל Supabase Storage

1. מלאי: כל attachment שנקשר למוצר (thumbnail, גלריה, `<img>` בתוך
   התיאור) נרשם ב-`wp_import.media` עם `source_url` מקורי.
2. תמיד קובץ המקור (regex מסיר סיומות ריסייז `-300x300`); הבאה מ-rsync
   של uploads, ‏fallback ל-HTTP מהאתר החי עם retry ואימות Content-Type.
3. המרה בהעלאה (כלל "מעלים מוכן" של PRODUCTION-OPS): WebP ברוחב
   מקסימלי 1600px איכות 80 (מעל זה אין טעם: הרינדור עובר דרך Vercel
   Image Optimization); נגזרת OG ‏1200x630 מתחת ל-300KB לתמונה
   הראשית (דרישת וואטסאפ).
4. יעד: bucket ‏`product-images` (public, קיים מ-004), path דטרמיניסטי
   `wp/<wp_attachment_id>/<basename>.webp` (העלאה חוזרת דורסת את עצמה).
   דה-דופ לפי `sha256` של קובץ המקור: קובץ זהה מועלה פעם אחת.
5. `wp_import.media` היא מפת השכתוב הרשמית `source_url -> new_url`:
   בונה את `products.images` + `product_images`, משכתבת `<img src>`
   בתוך `description_he`, ומזינה 301 לקבצים עם קליקים ב-GSC.
6. סטטוסים פר קובץ: `pending -> downloaded -> uploaded` או
   `failed`/`skipped`. שער אימות: אפס pending/failed על מוצרים active.

### 2.6 לקוחות: `wp_users` אל Supabase Auth + profiles

| מקור WP | יעד | טרנספורמציה |
|---|---|---|
| `user_email` | `auth.users.email` + `profiles.email` | lower/trim; לא חוקי -> לא נוצר (ארכיון בלבד) |
| `first_name` + `last_name` (usermeta) | `profiles.full_name` | fallback ל-`display_name` |
| `billing_phone` | `profiles.phone` + `user_addresses.phone` | נרמול `05X-XXXXXXX` (כלל C6) |
| `user_registered` | staging בלבד | `auth.users.created_at` נשלט ע"י GoTrue; הערך ההיסטורי נשמר בארכיון |
| `billing_*` (usermeta) | `user_addresses` | `billing_address_1` שלם ל-`street` (בלי פירוק מספר בית), `billing_city -> city`, `billing_postcode -> zip` (רק 5-7 ספרות), `is_default = true`; כתובת בלי city לא נוצרת |
| `paying_customer`, `orders_count`, `total_spent` | staging בלבד | ל-CRM עתידי, לא ל-public |
| ראיות opt-in לניוזלטר | `wp_import.customers.newsletter_optin_raw` | ראיה בלבד; לא מוקרן (הכרעה 6.4.3) |

מנגנון היצירה: **Auth Admin API בלבד** (`auth.admin.createUser` עם
`email_confirm: true`), לעולם לא INSERT ל-`auth.users`. כך שרשרת
ה-triggers הקיימת רצה כמו למשתמש אמיתי: `handle_new_user` יוצר
profile + חשבונות ארנק, וה-trigger של 029 יוצר שורת העדפות התראה
(ברירות מחדל: כל ערוצי השיווק false). דה-דופליקציה לפי אימייל מנורמל:
משתמש שכבר קיים (נרשם באתר החדש לפני הייבוא) רק ממופה ב-id_map
ומועשר בשדות ריקים (phone, כתובת); לעולם לא דורסים ערך קיים.

**אסטרטגיית סיסמאות (הוכרע):** סיסמאות לא עוברות. ה-hash של וורדפרס
(phpass/bcrypt-wrapped) אינו נתמך ב-GoTrue, ומדיניות הזהות של המערכת
החדשה היא ממילא Google OAuth כשער ראשי + magic link למייל כגיבוי.
לכן:

1. המשתמש נוצר **בלי סיסמה**. כניסה ראשונה: Google (אם זה אותו אימייל,
   Supabase מקשר אוטומטית) או magic link למייל.
2. **אין** קמפיין "אפסו סיסמה" המוני. שליחת אלפי מיילי reset היא ספאם
   תפעולי, מזמינה פישינג ומייצרת עומס תמיכה.
3. מייל מעבר תפעולי יחיד (הכרעה 6.4.2) מסביר: "נכנסים עם Google או עם
   קוד למייל". מי שמתעקש על סיסמה קובע אחת דרך "שכחתי סיסמה" אחרי
   הכניסה הראשונה.
4. לקוחות בלי אימייל תקין נשארים בארכיון בלבד, עם issue.

### 2.7 קופונים ודילים

1. מוצרי דיל/שובר של האתר הישן הם מוצרים לכל דבר: עוברים ל-`products`
   עם `type='coupon'` לפי ה-curation. **לא** נוצרות שורות `coupon_deals`
   (הטבלה כבולה ל-`vendors` הישנה עד איחוד ה-vendors המתוכנן כ-036, והתוכן בה admin-curated).
2. קודי הנחה של Woo (`shop_coupon`): נטענים ל-`wp_import.coupons`
   כארכיון בלבד. אין להם מנגנון יעד ב-public (אין טבלת discount codes),
   וקודים שפורסמו בעבר מתים עם האתר הישן.
3. שוברים שנמכרו (vouchers של ה-plugin): ארכיון ב-`wp_import.vouchers`;
   שוברים חיים בלבד מקבלים הקרנה מינימלית (סעיף 6.2).

---

## 3. כללי ניקוי דאטה

כל הפרה נרשמת ב-`wp_import.issues` עם severity: ‏error חוסם הקרנה,
‏warn נסקר ידנית, ‏info הוא רשימת עבודה.

**C1: באג "עיר: נהריה" (חובה).** באתר החי כל דיל מציג "נהריה" כעיר
העסק, בלי קשר למיקום האמיתי: ערך ברירת מחדל של התבנית/מטא שהוזן פעם
אחת ושוכפל. לכן שדה עיר שמקורו ב-meta של מוצר בוורדפרס הוא **דאטה לא
אמין ולא מוקרן לעולם**: לא ל-`products.attributes`, לא ל-`suppliers.city`.
הערך הגולמי נשמר ב-`raw_meta`, וכל מוצר שנשא ערך עיר מקבל issue
‏`city_default_bug` ברמת warn. עיר אמיתית נכנסת למערכת רק דרך רשומת
הספק המאומתת (027, סעיף 2.4). הבאג לא נוגע ל-`billing_city` של לקוחות
(קלט אמיתי של המשתמש), שעובר את כלל C8 הרגיל.

**C2: meta יתום.** שורות `wp_postmeta`/`usermeta` בלי רשומת אב, ו-meta
של פוסטים ב-trash: לא נטענות (JOIN פנימי), נספרות בדוח ה-preflight
כ-info. אין ניסיון "להציל" meta יתום: אם אין לו אב, אין לו משמעות.

**C3: SKU כפול.** בין מוצרים: ה-SKU נשאר על המוצר עם `total_sales`
הגבוה ביותר (שובר שוויון: `wp_post_id` הנמוך), האחרים מקבלים
`sku = NULL` + issue ‏`duplicate_sku` ברמת warn. בווריאציות (UNIQUE
בסכימה): סיומת `-2` + issue. בפועל נמדדו רק 4 SKU בכל האתר, בלי
כפילויות; הכלל קיים כדי שההרצה תהיה דטרמיניסטית גם על dump עתידי.

**C4: HTML של תיאורים.** הסרת shortcodes ‏(`[...]`), הסרת inline styles
ו-classes של page builders, המרת `<h1>` פנימי ל-`<h2>`, שכתוב קישורים
פנימיים `kenyonexpress.co.il/...` ל-path יחסי חדש דרך `url_inventory`,
שכתוב `<img>` דרך מפת המדיה. נשמר גם נקי וגם גולמי.

**C5: מחירים.** ‏numeric(10,2); פסיקים וסימני ₪ מוסרים; מחיר 0 או NULL
במוצר publish = issue ברמת error (לא מיובא כ-active).

**C6: טלפונים.** נרמול ל-`05X-XXXXXXX`; ‏`+972`, רווחים ומקפים מטופלים;
לא ניתן לנרמול: נשמר raw + issue ברמת warn, השדה ביעד נשאר ריק.

**C7: אימיילים.** ‏lower/trim + ולידציית תבנית; לא חוקי: הלקוח לא נוצר
ב-auth (ארכיון בלבד, issue).

**C8: כתובות.** ‏`billing_address_1` שלם לתוך `street` (פירוק מספר בית
אוטומטי בעברית = שיעור שגיאה גבוה, לא מנסים); כתובת בלי city לא נוצרת.

**C9: תאריכים וקידוד.** הכול UTC ‏(עמודות `*_gmt`); תצוגת
Asia/Jerusalem היא עניין ה-UI. ה-dump נטען utf8mb4 ועובר בדיקת
mojibake (שאילתת דגימה לעברית שבורה) לפני כל טעינה.

**C10: Elementor.** אם `post_content` ריק/דל ו-`_elementor_data` קיים
על מוצר: חילוץ טקסט מעץ האלמנטים + issue ברמת warn לבדיקת עין.
עמודי תוכן לא עוברים חילוץ (נכתבים מחדש ממילא).

---

## 4. עיצוב הסקריפטים

### 4.1 מבנה, סטאק והרצה

מודל הביצוע (M12): **one-shot חזרתי (rehearsed one-shot), לא סנכרון
מתמשך.** נימוקים: סדר הגודל קטן (עשרות מוצרים, אלפי לקוחות לכל
היותר), כך שטעינה מלאה נמדדת בדקות ותשתית CDC/sync הייתה הנדסת יתר
מסוכנת; ה-idempotency דרך `id_map` נותנת את אותה תוצאה (dump חדש ->
הרצה חוזרת -> רק דלתות משתנות); וסנכרון דו-כיווני היה מחייב פתרון
התנגשויות עריכה בין שתי מערכות חיות, במקום זה יש חלון הקפאת תוכן
(סעיף 5.1).

TypeScript מורץ ב-`tsx`, תלויות: `mysql2` (קריאת ה-dump הטעון),
`pg` (כתיבה ל-Supabase דרך session pooler עם service role),
`@supabase/supabase-js` (Auth Admin + Storage בלבד), `sharp` (WebP/OG),
`zod` (ולידציית שורות). משתני סביבה: `WP_MYSQL_URL`,
`SUPABASE_DB_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
שום סקריפט לא רץ עם מפתח anon.

```
scripts/wp-import/
  00-preflight.ts        בדיקות קדם: קידוד, HPOS?, זיהוי plugin שוברים, ספירות גולמיות,
                         בדיקת enums חיים (product_type בלי service? product_status בלי sold_out?)
  01-load-staging.ts     MySQL מקומי -> wp_import.* (כל הישויות + raw jsonb)
  02-media-sync.ts       הורדה/rsync -> WebP/OG -> Storage -> עדכון wp_import.media
  03-curation-export.ts  דוחות CSV: מיפוי קטגוריות, slugs מוצעים, סיווג type, רמזי ספק
  04-curation-import.ts  קליטת הקבצים המאושרים חזרה ל-staging
  05-project-catalog.ts  הקרנה: categories -> products -> variants -> images -> redirects
  06-project-customers.ts Auth Admin API -> העשרת profiles -> user_addresses
  07-project-vouchers.ts שוברים חיים בלבד (מותנה בממצאי preflight)
  08-verify.ts           כל שערי סעיף 4.4; exit code לא-אפס על כל error
  09-purge.ts            rollback לפי batch (סעיף 4.5)
```

### 4.2 idempotency

1. כל הקרנה עוברת דרך `wp_import.id_map (entity, wp_id) -> new_id`:
   קיים = UPDATE של שדות בבעלות ייבוא בלבד; לא קיים = INSERT + רישום.
2. הגנת עריכות אדמין: `id_map.projected` מחזיק snapshot של הערכים
   שהוקרנו לאחרונה. אם הערך ב-public שונה מה-snapshot (אדמין ערך אחרי
   ההקרנה), השדה לא נדרס ונרשם conflict issue.
3. כל ריצה פותחת שורת `wp_import.import_batches` (kind, dump sha256,
   dry_run, stats) וכל כתיבה מסומנת ב-batch_id.
4. דטרמיניזם: אותו dump + אותם קבצי curation = אותה תוצאה (uuid נקבעים
   פעם אחת דרך id_map).
5. טריגרים: audit נשארים דלוקים בכוונה (הייבוא הוא בדיוק מה ש-audit
   צריך לתעד); `published_at`/`created_at` היסטוריים נכתבים במפורש;
   לקוחות נוצרים דרך Admin API כדי ששרשרת ה-triggers תרוץ. טריגר
   ההתראות של 031 על orders לא נורה כי לא כותבים paid-transition
   (השוברים החיים נכנסים ישירות בסטטוס הסופי).

### 4.3 dry-run

לכל סקריפט הקרנה דגל `--dry-run`: מחשב את כל הטרנספורמציות, כותב דוח
מלא + issues ל-staging (batch מסומן `dry_run=true`), לא נוגע ב-public,
לא יוצר משתמשי auth ולא מעלה קבצים. שער מעבר בין שלבים: אפס issues
ברמת error; רשימת ה-warnings נסקרת ומאושרת ידנית. החזרה הגנרלית על
פרויקט ה-DEV היא ה-dry-run בקנה מידה מלא: אותם סקריפטים, אותו dump.

### 4.4 דוח אימות (source vs target)

`08-verify.ts` מדפיס ושומר ב-`import_batches.stats`:

| בדיקה | תנאי עצירה |
|---|---|
| `wp_import.v_reconciliation` | ‏staged = mapped = נספר ב-public, פר ישות: מוצרים publish (פער = חסימה), וריאציות (סכום פר מוצר-הורה זהה), קטגוריות (לכל term עם מוצרים יש יעד ממופה), לקוחות עם אימייל תקין, redirects |
| תמונות של מוצרים active | ‏100% בסטטוס uploaded; אפס failed/pending |
| checksums | ‏Σ`kenyon_price` ו-Σ`stock_quantity` פר קטגוריה שווים בין staging ליעד |
| שוברים חיים (אם יש) | ספירת staging פתוחים = ‏`coupon_codes` בסטטוס issued שנוצרו |
| ‏301 | ‏100% כיסוי `url_inventory` (סעיף 5.3) |
| ‏spot-check | ‏20 מוצרים אקראיים (seed קבוע) + ‏10 הנמכרים ביותר מול האתר החי + ‏Store API; ‏5 לקוחות; ‏10 URLs ישנים |

### 4.5 rollback

שתי שכבות בלתי תלויות:

1. **rollback של האתר**: החזרת DNS לוורדפרס (TTL 300, דקות). וורדפרס
   נשאר חי וללא שינוי לפחות שבועיים אחרי ה-flip.
2. **rollback של הדאטה**: `09-purge --batch <id>` מוחק בסדר תלות הפוך
   (redirects -> product_images -> variants -> products -> categories
   שנוצרו -> user_addresses -> משתמשי auth דרך Admin API deleteUser,
   רק למי שאין פעילות חדשה). ה-staging וה-dump לא נמחקים לעולם.
3. נקודת אל-חזור: מרגע שיש הזמנות אמיתיות במערכת החדשה, purge גורף
   אסור; מתקנים קדימה נקודתית לפי id_map.

### 4.6 תכולת 032 (סכימת wp_import)

`supabase/migrations/032_wp_import_staging.sql`, ‏idempotent,
staging בלבד, מוחלת דרך MCP `apply_migration` בלבד:

1. `CREATE SCHEMA wp_import` (לא חשופה ל-PostgREST: לא ברשימת
   הסכימות של ה-API; גישה רק דרך service role / MCP).
2. טבלאות: `import_batches`, `products`, `categories`, `customers`,
   `orders`, `order_items`, `coupons`, `vouchers`, `media`,
   `url_inventory`, `id_map`, `issues`. כולן עם עמודת raw jsonb
   (נאמנות מלאה למקור), מפתח וורדפרסי טבעי, ו-timestamps.
3. views: ‏`v_reconciliation` (ספירות מקור/ממופה פר ישות),
   ‏`v_open_issues`.
4. ‏RLS מופעל על הכול; policies קריאה לאדמין בלבד; אפס policies
   כתיבה (הכותב היחיד הוא service role, שעוקף RLS).
5. ‏GRANTs מפורשים ל-service_role בלבד; אין GRANT ל-anon/authenticated
   ברמת הסכימה.

לא כלול ב-032 בכוונה: שינוי כלשהו ב-public, טעינת דאטה, פונקציות
הקרנה (הן קוד סקריפטים, לא DB). המיגרציה בטוחה להחלה בכל נקודה
בשרשרת (אין תלות ב-026-031).

---

## 5. תוכנית cutover

### 5.1 ציר זמן

| זמן | פעולה |
|---|---|
| T-30 ימים | הקפאת מכירת שוברים חדשים באתר הישן + עידוד מימוש (שאיפה: אפס שוברים פתוחים ב-flip) |
| T-7 ימים | dump חזרה גנרלית אחרון; אימות מלא ירוק על DEV |
| T-48h | הקפאת קטלוג באתר הישן (אין עריכת מוצרים/מחירים/קטגוריות); TTL של ה-DNS יורד ל-300 |
| T-24h | dump סופי -> טעינת staging -> הקרנה לפרודקשן -> ‏`08-verify` ירוק מלא |
| T-0 | ‏flip: ‏apex ‏A ל-`76.76.21.21` (Vercel), ‏www ‏CNAME ל-`cname.vercel-dns.com`. הדומיינים נוספו ל-Vercel ואומתו (TXT + תעודות Let's Encrypt) לפני ה-flip |
| T+2h | הזמנה שנכנסה לוורדפרס בחלון ה-DNS: מועתקת ידנית לארכיון; שובר שנקנה בחלון מוקרן ידנית |
| T+24h | ניטור רציף: ‏`/api/health`, ‏Sentry, דוח 404, ‏Coverage ב-GSC |
| T+7 ימים | dump משלים של הזמנות בלבד -> רענון ארכיון (סטטוסים שהתעדכנו בזנב) |
| T+14 ימים | אם יציב: וורדפרס יורד לקריאה בלבד; ה-dump האחרון = הגיבוי הקבוע; ‏TTL חוזר לרגיל |

חלון השבתה ללקוחות: אפס. ההקפאה היא על עריכת תוכן; checkout ישן נסגר
רק ברגע ה-flip.

### 5.2 מפת 301: מנגנון אחד, מקור אמת אחד

**הוכרע: כל ה-redirects, כולל הדפוסים הקבועים, חיים ב-`public.seo_redirects`
ונאכפים ב-`src/proxy.ts` (על 404) עם `NextResponse.redirect(url, 301)`.**
לא משתמשים ב-`redirects()` של `next.config.ts`: הוא מחזיר 308 על
`permanent: true` (לא 301 מדויק), לא סופר hits, ומפצל את מקור האמת
לשניים. ה-path הישן נשמר percent-encoded ומנורמל (בלי trailing slash),
בדיוק כמו שה-lookup מצפה. שרשראות אסורות: מקסימום קפיצה אחת.

| דפוס ישן | יעד | הערות |
|---|---|---|
| `/product/<wp-slug>/` | `/products/<new-slug>` | פר מוצר, מ-id_map |
| `/product-category/<wp-slug>/` | `/category/<target-slug>` | לפי מיפוי הקטגוריות |
| `/shop/` | `/products` | |
| `/cart/`, `/checkout/` | `/checkout` | |
| `/my-account/*` | `/account` | |
| `/?p=N`, `/?page_id=N` | היעד הממופה של אותו פוסט | דרך url_inventory |
| עמודי תוכן (about, תקנון...) | העמוד החדש אם נכתב; אחרת `/` | מינימום מחויב לפני flip: תקנון, פרטיות, משלוחים והחזרות, צור קשר |
| קבצי מדיה עם קליקים ב-GSC | ‏URL החדש ב-Storage | ממפת המדיה |
| ‏tags, ‏author, ‏feed | הקטגוריה הקרובה או `/` | ‏301, לא 410 |

### 5.3 שער שלמות ה-301

`wp_import.url_inventory` מאוחדת משלושה מקורות: sitemap ישן, ייצוא GSC
(כל URL עם קליק ב-12 חודשים), crawl מלא. שער: לכל שורה בדיוק אחת
משלוש הכרעות: (א) שורת `seo_redirects`; (ב) התאמה ישירה ל-path חי
חדש; (ג) סימון מודע 410. אפס שורות בלי הכרעה. סקריפט מריץ HTTP על כל
ה-inventory מול הפרודקשן החדש לפני ה-flip (דרך דומיין ה-staging עם
Host override): מצופה 301 -> 200, בלי שרשראות ובלי לולאות.

### 5.4 sitemap ורציפות SEO

1. `app/sitemap.ts` (מפוצל לפי סוג: קטגוריות, מוצרים active, דילים,
   `lastModified` מ-`updated_at`) ו-`app/robots.ts` (Disallow:
   ‏`/admin`, ‏`/account`, ‏`/supplier`, ‏`/api`, ‏`/search`, ‏`/auth`)
   נבנים ועולים **לפני** ה-flip (תלות בשלב C4 של המסלול הקטלוגי).
2. אותו דומיין, אותו property ב-GSC (הבעלות מאומתת בעוד וורדפרס חי,
   זו משימת שלב 0). מיד אחרי ה-flip: הגשת ה-sitemap החדש והסרת הפניית
   ה-sitemap הישן של Yoast.
3. ניטור חודש ימים: ‏GSC Coverage שבועי, ‏`seo_redirects.hits`, דוח 404
   שבועי. ‏redirect בלי תנועה אחרי שנה מועמד לארכוב.

---

## 6. הזמנות היסטוריות: הכרעה

### 6.1 ההחלטה: ארכיון קריא, לא מיגרציה

**הזמנות WooCommerce לא מוקרנות ל-`public.orders`. הן נטענות במלואן
ל-`wp_import.orders` + `wp_import.order_items` ונשארות שם לצמיתות
כארכיון שאילתות מלא, קריא לאדמין (RLS admin-read).** הנימוקים:

1. **הסמנטיקה הכספית לא ניתנת לשחזור.** `order_items` החדשה דורשת
   snapshot של פיצול הכסף בזמן קנייה (`platform_percent`,
   `platform_fee_ils`, `supplier_due_ils`, `charged_on_site_ils`,
   `balance_due_at_business_ils`, עם CHECK שוויון סכומים). לנתוני Woo
   אין את הפיצול הזה; כל ערך מומצא הוא שקר כספי שיזהם דוחות settlement.
2. **ה-ledger הכפול נשאר נקי.** ייבוא cashback היסטורי היה דורש תנועות
   `fn_wallet_transfer` פיקטיביות; ledger שנפתח עם עבר מזויף מאבד את
   ערכו הראייתי, ו-`v_wallet_ledger_drift` (033) היה צועק מהיום הראשון.
3. **מיפוי סטטוסים חד-כיווני.** ל-`wc-processing`/`wc-on-hold`/`wc-failed`
   אין מקבילה נקייה ב-enum של 007, והזמנות "באמצע" לא ינוהלו במערכת החדשה.
4. **הזמנות אורח.** `orders.user_id` הוא NOT NULL + RESTRICT על
   `auth.users`; ייבוא היה מחייב משתמשי צללים וזיהום של auth.
5. **הנהלת חשבונות.** ספרי האתר הישן נשארים בספרים הישנים; המערכת
   החדשה פותחת סדרת מסמכים חדשה. חובת שמירת 7 השנים מתקיימת ב-dump
   ובארכיון wp_import.

ללקוח: מסך עתידי "הזמנות מהאתר הקודם" באזור האישי יכול לקרוא מהארכיון
דרך view ייעודי (התאמה דרך `id_map` על customer -> auth.users).
לא בגרסה הראשונה; הארכיון כבר בנוי לזה. חשבוניות ישנות לא מונגשות
באתר (בקשה נקודתית נענית ידנית במייל).

### 6.2 החריג היחיד: שוברים חיים

שובר שנמכר באתר הישן וטרם מומש הוא התחייבות צרכנית שחייבת לעבוד אחרי
ה-flip. עבור אלה בלבד מוקרנת שרשרת מינימלית: שורת `orders` בסטטוס
`fulfilled` מסומנת-legacy + ‏`order_items` יחיד עם snapshot כספי אמיתי
(מה ששולם בפועל = `charged_on_site_ils`) + שורת `coupon_codes` בסטטוס
`issued` עם `expires_at` המקורי, כך שהסריקה, המימוש והתזכורות של
027/029/031 עובדים על שובר ישן כמו על חדש. הקפאת המכירה ב-T-30
(סעיף 5.1) שואפת לאפס את הקבוצה הזו; אם בפועל אפס, החריג מתבטל מעצמו.

### 6.3 מה עוד לא עובר, סופית

- ביקורות (324): נזנחות; נשמרות רק בתוך ה-dump (D13).
- קודי הנחה של Woo: ארכיון בלבד (2.7).
- רשימות תפוצה: אסור בייבוא; `marketing_* = false` לכל המיובאים (30א).
- עמודי תוכן: נכתבים מחדש; ה-URL הישן מקבל 301.

### 6.4 הכרעת השאלות שהיו פתוחות

1. **plugin השוברים**: מזוהה מה-dump ב-`00-preflight` (סריקת טבלאות
   ו-options); מבנה הטעינה של `vouchers` נסגר רק אחרי הממצא.
2. **מייל מעבר**: כן. מייל תפעולי יחיד אחרי ה-flip, דרך הסאב-דומיין
   הטרנזקציוני (`txn.`), בלי שום תוכן שיווקי: "האתר התחדש; נכנסים עם
   Google או קוד למייל". זה עדכון שירות מותר, לא פרסומת.
3. **ראיות opt-in היסטוריות**: לא מכובדות. ‏re-opt-in נאסף באתר החדש
   בפעולה אקטיבית; הראיות נשמרות ב-`newsletter_optin_raw` בלבד.
4. **יתרות זכות (store credit)**: אם ה-preflight ימצא יתרות אמיתיות,
   הן מיובאות כתנועות פתיחה בארנק: `fn_wallet_transfer` מ-`platform:adjustments`
   לחשבון המשתמש, reason ‏`manual_adjust`, ‏idempotency_key
   ‏`legacy_opening:<wp_user_id>`, אחרי אימות סכום כולל מול ה-dump.
   התחייבות צרכנית קיימת לא מתאדה בגלל החלפת פלטפורמה. אם אין plugin
   כזה ב-dump, הסעיף מתבטל.
5. **גישה לאחסון/DB + GSC**: משימת הפתיחה של המסלול; חוסמת את שלב 0.

---

## 7. סדר ביצוע ותלויות

```
שלב 0: השגת גישה (SSH/DB + GSC) -> dump ראשון + uploads + sitemap + ייצוא GSC
שלב 1: החלת 032 (wp_import) דרך MCP apply_migration (עצמאית, בטוחה בכל נקודה)
שלב 2: 00 -> 01 -> 02 -> 03 -> אישורי curation -> 04
שלב 3: הקרנה מלאה על פרויקט ה-DEV (05 -> 06 -> 07) + 08-verify
שלב 4: תיקון כללים וחזרה על 2-3 עד אפס errors
שלב 5: פרודקשן: החלת 001->035 מסודר (לפי MASTER) -> הקרנה -> verify -> cutover (סעיף 5)
```

תלויות סכימה: הקרנת קטלוג ולקוחות רצה על הסכימה החיה (016+025
מספיקות); redirects דורשים 030; שרשרת השוברים החיים דורשת 026+027;
יתרות ארנק דורשות 026. בפרודקשן ממילא מחילים את כל השרשרת לפני האכלוס.

## 8. טבלת החלטות

| # | החלטה |
|---|---|
| M1 | חילוץ: mysqldump מלא + rsync של uploads; ‏WP-CLI/REST/WXR נדחו כמקור |
| M2 | ‏`wp_import` = ארכיון קבוע + staging; לא חשוף ל-API; כותב יחיד: service role |
| M3 | הזמנות היסטוריות: ארכיון קריא בלבד; חריג יחיד: שוברים חיים בשרשרת מינימלית |
| M4 | לקוחות דרך Auth Admin API, בלי סיסמאות; כניסה ראשונה Google/magic link; אין קמפיין reset המוני; מייל מעבר תפעולי יחיד |
| M5 | כל המיובאים opted-out משיווק; ראיות opt-in ישנות לא מכובדות |
| M6 | מוצרי Woo אל `products` בלבד; `coupon_deals` לא מאוכלסת; `supplier_id=NULL` + שיוך ידני |
| M7 | ‏slugs לטיניים חדשים; כל URL ישן מקבל 301; יעד מוצר `/products/` (רבים) |
| M8 | כל ה-301 ב-`seo_redirects` ונאכפים ב-`proxy.ts` עם 301 מדויק; אין `redirects()` ב-next.config |
| M9 | תמונות: מקור -> WebP ‏1600px + נגזרת OG -> ‏`product-images` תחת `wp/<id>/`; דה-דופ sha256 |
| M10 | עיר מ-meta של WP לעולם לא מוקרנת (באג נהריה); עיר אמיתית רק מרשומת ספק מאומתת |
| M11 | ‏SKU כפול: נשאר אצל בעל `total_sales` הגבוה, השאר NULL + issue; ‏meta יתום לא נטען |
| M12 | ביצוע one-shot חזרתי idempotent (id_map + batches + projected snapshot); לא סנכרון מתמשך |
| M13 | ‏dry-run לכל סקריפט הקרנה; שער אפס errors לפני כל הקרנה; חזרה גנרלית מלאה על DEV |
| M14 | ‏rollback: ‏DNS חזרה (וורדפרס חי שבועיים) + ‏purge לפי batch; אל-חזור מרגע שיש הזמנות חדשות |
| M15 | הקפאות: מכירת שוברים T-30, קטלוג T-48h; ‏dump סופי T-24h; ‏dump הזמנות משלים T+7 |
| M16 | יתרות store credit (אם יימצאו): תנועות פתיחה דרך `fn_wallet_transfer` עם idempotency key |
| M17 | ביקורות נזנחות; קודי הנחה של Woo ארכיון בלבד; עמודי תוכן נכתבים מחדש (מינימום משפטי לפני flip) |
