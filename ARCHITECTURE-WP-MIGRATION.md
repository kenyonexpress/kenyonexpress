# ARCHITECTURE-WP-MIGRATION: מיגרציית דאטה מלאה מ-WordPress ל-Supabase

תאריך: 2026-07-20. ענף: `phase5/homepage`. מעמד: design only, אפס יישום.

מעמד מול מסמכים קודמים: המסמך הזה הוא העדכון המחייב של
`docs/ARCHITECTURE-WP-DATA-MIGRATION.md` (2026-07-17, החלטות M1-M17).
הוא מיישר את התכנון לסכימת 042 (כסף באגורות, `commission_ledger`,
`cashback_percent`, אילוצי NOT NULL חדשים) ולדרישות הסקופ המעודכן.
בכל סתירה: המסמך הזה גובר. החלטות M1-M17 שלא נסתרו כאן נשארות בתוקף.

תשתית DB נלווית: `supabase/migrations/032_wp_import_staging.sql`
(טיוטה קיימת, נקראה במלואה; סכימת `wp_import` עם 12 טבלאות, id_map,
issues, media, url_inventory, views; לא חשופה ל-PostgREST; החלה רק
דרך MCP `apply_migration`). המסמך הזה מאשרר את 032 כמות שהיא, עם
תוספת אחת נדרשת (סעיף 3.6).

עקרונות על (ירושה מהמסמך הקודם, בתוקף):

1. אפס איבוד דאטה: הכול נשמר לצמיתות ב-`wp_import`; רק תת-קבוצה
   נקייה מוקרנת ל-public.
2. ה-DB החדש לא יורש חוב: שורה שמפרה constraint או סמנטיקה כספית
   לא נכנסת.
3. הכול idempotent דרך `wp_import.id_map`; הרצה חוזרת = upsert.
4. הסכימה החיה היא האמת (יש drift מול קבצי המיגרציות).
5. חוק הספאם 30א: אף לקוח מיובא לא נכנס opted-in.

---

## 1. מלאי דאטה ושיטת חילוץ

### 1.1 שיטת החילוץ: mysqldump מלא (מאושרר, M1)

**mysqldump מלא + rsync של `wp-content/uploads`. לא REST, לא WP-CLI
כמקור, לא WXR.**

Terminal (על שרת האחסון או דרך SSH):

```bash
mysqldump --single-transaction --quick --default-character-set=utf8mb4 \
  --routines --triggers --hex-blob "$DB_NAME" | gzip > ke-wp-$(date +%Y%m%d).sql.gz
rsync -az user@host:/path/to/wp-content/uploads/ ./wp-uploads/
```

נימוקים (נבדקו חי):

- WC REST v3 מחזיר 401 בלי מפתחות; ה-Store API הפתוח משמש רק לאימות
  צולב בשלב הבדיקות.
- WXR (`wp export`) לא מייצא הזמנות/לקוחות/וריאציות באופן מלא.
- רק dump נותן snapshot עקבי בנקודת זמן אחת, והוא גם הגיבוי המשפטי
  הקבוע (חובת שמירה 7 שנים).
- אם WP-CLI קיים אצל המאחסן, מותר `wp db export` (עטיפה ל-mysqldump);
  מקור האמת הוא קובץ ה-dump.

ה-dump נטען ל-MySQL מקומי (Docker, `mysql:8`, utf8mb4) והסקריפטים
שולפים ממנו אל `wp_import`.

### 1.2 טבלאות WP לחילוץ

| טבלת WP | תוכן | יעד staging |
|---|---|---|
| `wp_posts` | מוצרים, וריאציות, attachments, הזמנות (לא-HPOS), קופונים, עמודים | `wp_import.products` / `orders` / `media` / `coupons` |
| `wp_postmeta` | כל ה-meta של Woo: `_price`, `_regular_price`, `_sale_price`, `_sku`, `_stock`, `_thumbnail_id`, `_product_image_gallery`, Yoast, Elementor | עמודות מפורקות + `raw_meta` jsonb |
| `wp_terms` + `wp_term_taxonomy` + `wp_term_relationships` + `wp_termmeta` | `product_cat`, `product_tag`, מאפיינים גלובליים `pa_*` | `wp_import.categories` + שדות המוצר |
| `wp_users` + `wp_usermeta` | לקוחות: אימייל, שם, טלפון, כתובות billing/shipping | `wp_import.customers` |
| `wp_woocommerce_order_items` + `wp_woocommerce_order_itemmeta` | שורות הזמנה | `wp_import.order_items` |
| `wp_wc_orders` + `wp_wc_orders_meta` + `wp_wc_order_addresses` + `wp_wc_order_operational_data` | הזמנות HPOS (אם פעיל; נבדק ב-preflight) | `wp_import.orders` עם `storage_source='hpos'` |
| `wp_wc_product_meta_lookup` + `wp_wc_customer_lookup` | אימות צולב מחירים/ספירות | בדיקות בלבד, לא נטען |
| `wp_options` | plugins פעילים, permalink structure, מטבע, מדינה | `00-preflight` בלבד |
| טבלאות plugin השוברים | שוברים שנמכרו + סטטוס מימוש | `wp_import.vouchers` (מבנה נסגר אחרי זיהוי ה-plugin) |
| `wp_comments` | 324 ביקורות | לא נטען (M17: נזנחות; נשמרות ב-dump) |

מחוץ ל-DB: `wp-content/uploads` (קבצי מקור של תמונות),
`sitemap_index.xml` של Yoast, ייצוא GSC של 12 חודשים. שלושתם מזינים
את `url_inventory` ואת צנרת המדיה.

היקף ידוע (בדיקה חיה 2026-07-09): WordPress 6.8.1 + WooCommerce +
Elementor + Slider Revolution + Yoast; 46 מוצרים ב-sitemap (44 simple,
1 variable), 9 קטגוריות מוצר, 26 עמודים; מחירים בשקלים שלמים
(`currency_minor_unit=0`); רק 4 מוצרים עם SKU. סדר גודל שמאשר
one-shot חזרתי עם spot-check בכיסוי גבוה.

---

## 2. מפרט מיפוי שדה-שדה: WP אל הסכימה החיה

כל שדה בלי עמודת יעד נשמר ב-`raw_meta`/`raw`. כל ההקרנות עוברות דרך
`wp_import.id_map (entity, wp_id) -> new_id`.

### 2.1 מוצרים: `wp_posts` + `wp_postmeta` אל `public.products`

| מקור WP | יעד | טרנספורמציה |
|---|---|---|
| `ID` | `id_map(entity='product')` | מפתח idempotency בלבד |
| `post_title` | `name_he` | trim; ריק = issue ברמת error, לא מיובא |
| `post_content` | `description_he` | ניקוי HTML (C4), שכתוב `<img src>` דרך מפת המדיה (2.5) |
| `post_name` (slug עברי percent-encoded) | לא נכנס ל-`slug` | נכנס ל-`url_inventory` בלבד; ראו 2.2 |
| slug חדש (curation) | `slug` | לטיני `^[a-z0-9]+(-[a-z0-9]+)*$`, ייחודי גלובלית |
| `post_status` | `status` | publish -> active; draft/pending/private -> draft (private עם issue); trash -> לא מיובא |
| `post_date_gmt` | `published_at` + `created_at` | ערך היסטורי נכתב במפורש |
| `_sku` | `sku` | trim; ריק -> NULL; כפילות לפי C3 |
| `_price` (אפקטיבי) | `kenyon_price` וגם `price_ils` | numeric(10,2); כתיבה כפולה כי `price_ils` עדיין NOT NULL בסכימה החיה |
| `_regular_price` | `full_price` | רק אם גדול ממש מהאפקטיבי; אחרת NULL (CHECK: `full_price >= kenyon_price`) |
| `_manage_stock` + `_stock` + `_stock_status` | `stock_quantity` | manage=yes -> `_stock`; manage=no+instock -> NULL; manage=no+outofstock -> 0 |
| `product_type` taxonomy | `has_variants` | variable -> true |
| `_product_attributes` (serialized PHP) | `variant_axes` + `attributes` jsonb | unserialize; צירי וריאציה ל-`variant_axes` |
| `product_cat` ראשית | `category_id` | דרך מפת הקטגוריות (2.3) |
| `product_cat` נוספות | `product_categories` | שיוך משני |
| `product_tag` | `search_keywords` | join ברווחים |
| `_thumbnail_id` + `_product_image_gallery` | `images` jsonb + `product_images` | צנרת המדיה (2.5); הראשונה = ראשית |
| `_yoast_wpseo_title` / `_metadesc` | `seo_title` / `seo_description` | רק אם קיימים ולא תבניתיים |
| היוריסטיקת סיווג ("שובר", "קופון", `_virtual`, קטגוריה) | `type` | הצעה בדוח curation; אדמין מאשר; ברירת מחדל `physical`; הערך `service` אסור בייבוא (drift אפשרי ב-enum) |
| curation: שיוך ספק | `supplier_id` | **חובה, שער חוסם** (ראו 2.4) |
| curation: אחוז פלטפורמה | `platform_percent` | **חובה, שער חוסם.** מהסכם הספק, ערך מפורש בקובץ ה-curation. אין ברירת מחדל בסכימה ליפול אליה (050: `NOT NULL` בלי `DEFAULT`; CONTRADICTIONS C1). מוצר בלי אחוז לא מיובא |
| אין מקור | `cashback_percent` | **0 לכל המיובאים** (042: NOT NULL DEFAULT 0). קמפיין cashback הוא החלטת אדמין עתידית, לא ירושה |
| curation / תוקף שובר | `coupon_expiry_days` | **חובה לכל מוצר** (042: NOT NULL בלי default). physical -> 0; coupon -> ערך מפורש בקובץ ה-curation (ברירת הצעה: תוקף השוברים שנמכרו בעבר) |
| `total_sales`, `menu_order`, meta של עיר | staging בלבד | עיר לא מוקרנת לעולם (C1, באג נהריה) |

**W1 (גובר על M6): `supplier_id` הוא שער חוסם, לא שיוך-בהמשך.**
042 קובעת `products.supplier_id NOT NULL` ו-`order_items.supplier_id
NOT NULL`, והסדר הקנוני מחיל את כל שרשרת המיגרציות לפני האכלוס. לכן
מוצר בלי ספק מאושר בקובץ ה-curation לא מוקרן בכלל (issue ברמת error),
במקום `NULL` + שיוך ידני אחרי. זרימת העבודה: `03-curation-export`
מפיק את רשימת המוצרים עם `supplier_hint` (שם עסק מהטקסט), האדמין מקים
ספקים דרך זרימת 027 (או INSERT אדמין), ממפה מוצר -> ספק בקובץ
ה-curation, ורק אז ההקרנה רצה. אין יצירת ספקים אוטומטית מהייבוא
(איכות "שם עסק בטקסט שיווקי" נמוכה מדי).

עמודות בלי מקור: `is_coupon_enabled=false`, `is_featured=false`,
`created_by` = אדמין המריץ, `brand`/`low_stock_threshold` = ברירות
מחדל.

### 2.2 slugs עבריים: לטיניים חדשים + 301 (מאושרר, M7/M8)

slugs עבריים percent-encoded לא עוברים. `name_en` אם קיים, אחרת
תעתיק אוטומטי מ-`name_he` כהצעה בדוח ה-curation; אדמין מאשר.
התנגשות: סיומת `-2`. כל URL ישן מקבל שורת `seo_redirects` עם
`source='wordpress_import'` ויעד `/products/<new-slug>` (רבים).
האכיפה: `src/proxy.ts` עם 301 מדויק; אין `redirects()` ב-next.config
(מחזיר 308, לא סופר hits, מפצל מקור אמת).

### 2.3 וריאציות וקטגוריות

וריאציות (`product_variation`) אל `product_variants`:

| מקור | יעד | הערות |
|---|---|---|
| `post_parent` | `product_id` | דרך id_map |
| `attribute_*` meta | `option_values` + `attributes` | ערכים מתורגמים לפי `wp_terms`; UNIQUE חלקי פר מוצר; כפילות = issue |
| שם מורכב ("הורה: M / שחור") | `name_he` | |
| `_price` | `price` | NULL אם שווה למחיר ההורה |
| `_sku` | `sku` | UNIQUE; התנגשות = סיומת + issue |
| `_stock` | `stock_quantity` | |
| `menu_order` | `sort_order` | |

`price_modifier` לא נכתב (DEPRECATED).

קטגוריות: **מיפוי, לא ייבוא.** ב-DB כבר 12 קטגוריות קנוניות (seed
018). 9 קטגוריות ה-WP ממופות אליהן בקובץ curation
(`manual_target_slug` ב-`wp_import.categories`); יצירת תת-קטגוריה
חדשה רק כשאין יעד (`create_new=true`, עומק 2 נאכף). term בלי הכרעה =
blocker. ה-URL הישן של כל קטגוריה מקבל 301 ליעד הממופה.

### 2.4 תמונות: uploads אל Supabase Storage (מאושרר, M9)

1. מלאי: כל attachment שנקשר למוצר (thumbnail, גלריה, `<img>` בתיאור)
   נרשם ב-`wp_import.media` עם `source_url` (סיומות ריסייז
   `-300x300` מוסרות; תמיד קובץ המקור).
2. השגה: מ-rsync של uploads; fallback ל-HTTP מהאתר החי עם retry
   ואימות Content-Type.
3. המרה: WebP רוחב מקסימלי 1600px איכות 80 + נגזרת OG ‏1200x630
   מתחת ל-300KB לתמונה הראשית (דרישת וואטסאפ).
4. יעד: bucket ‏`product-images` (public, קיים), path דטרמיניסטי
   `wp/<wp_attachment_id>/<basename>.webp`; העלאה חוזרת דורסת את
   עצמה. דה-דופ לפי `sha256` של קובץ המקור.
5. `wp_import.media` היא מפת השכתוב `source_url -> new_url`: בונה את
   `products.images` + `product_images`, משכתבת `<img>` בתיאורים,
   ומזינה 301 לקבצי מדיה עם קליקים ב-GSC.
6. סטטוסים: `pending -> downloaded -> uploaded` או `failed`/`skipped`.
   שער: אפס pending/failed על מוצרים active.

### 2.5 המרת מחירים לאגורות (W2, חדש מול המסמך הקודם)

042 הפכה את שכבת הכסף של orders/order_items לאגורות integer. כללי
ההמרה מחייבים לכל הקרנה כספית (שוברים חיים, יתרות ארנק):

1. `agorot = round(ils * 100)::integer`, פעם אחת בנקודת הכניסה.
2. האתר הישן עובד בשקלים שלמים (`currency_minor_unit=0`, נמדד), לכן
   כל ערך מקור חייב לקיים `ils * 100 == round(ils * 100)`. שבר אגורה
   במקור = issue ברמת error (דאטה חשוד, לא מעגלים בשקט).
3. `currency != 'ILS'` בהזמנת מקור = issue ברמת error (לא צפוי; אם
   יימצא, הכרעה ידנית).
4. הכפילות הישנה (`price_ils` numeric לצד אגורות) נשארת בתחום
   products בלבד; שם ממשיכים לכתוב numeric כפול (2.1) עד ניקוי העמודה.

### 2.6 לקוחות: `wp_users` אל Supabase Auth + profiles

| מקור WP | יעד | טרנספורמציה |
|---|---|---|
| `user_email` | `auth.users.email` + `profiles.email` | lower/trim; לא חוקי -> לא נוצר (ארכיון בלבד) |
| `first_name` + `last_name` | `profiles.full_name` | fallback ל-`display_name` |
| `billing_phone` | `profiles.phone` + `user_addresses.phone` | נרמול `05X-XXXXXXX` (C6) |
| `user_registered` | staging בלבד | `auth.users.created_at` נשלט ע"י GoTrue |
| `billing_*` | `user_addresses` | `billing_address_1` שלם ל-`street`; בלי city = לא נוצרת; `is_default=true` |
| `paying_customer`, `orders_count`, `total_spent` | staging בלבד | ל-CRM עתידי |
| ראיות opt-in | `newsletter_optin_raw` | ראיה בלבד; לא מוקרן (M5) |

מנגנון היצירה: **Auth Admin API בלבד** (`auth.admin.createUser` עם
`email_confirm: true`), לעולם לא INSERT ל-`auth.users`, כדי ששרשרת
ה-triggers תרוץ (profile, חשבונות ארנק, העדפות התראה עם כל ערוצי
השיווק false). דה-דופ לפי אימייל מנורמל: משתמש שכבר נרשם באתר החדש
רק ממופה ב-id_map ומועשר בשדות ריקים; לעולם לא דורסים ערך קיים.

**אסטרטגיית זהות (W3, מעדן את M4):**

1. סיסמאות לא עוברות (phpass לא נתמך ב-GoTrue, ומדיניות הזהות היא
   Google כשער ראשי).
2. **התאמת Google לפי אימייל**: משתמש מיובא שנכנס עם Google באותו
   אימייל מקושר אוטומטית ע"י Supabase לרשומה הקיימת. אפס פעולה
   נדרשת מאיתנו מעבר ליצירה עם `email_confirm: true`.
3. **משתמשי סיסמה** (מי שאין לו Google): מקבלים מייל מעבר תפעולי
   יחיד אחרי ה-flip, דרך הסאב-דומיין הטרנזקציוני, בלי תוכן שיווקי:
   "האתר התחדש; נכנסים עם Google או עם קישור קסם למייל". הכניסה
   בפועל: magic link שנשלח בעת הניסיון להיכנס (זרימת OTP הקיימת),
   לא קישור חתום בתוך מייל המעבר עצמו (קישור login חי במייל המוני =
   סיכון פישינג ותוקף פג). מי שמתעקש על סיסמה קובע אחת דרך "שכחתי
   סיסמה" אחרי הכניסה הראשונה.
4. אין קמפיין "אפסו סיסמה" המוני.
5. לקוחות בלי אימייל תקין נשארים בארכיון בלבד + issue.

**קישור היסטוריית הזמנות (W4):** ההזמנות ההיסטוריות לא מוקרנות
ל-`public.orders` (ראו 2.7), אבל הקישור נשמר מבני: `id_map
(entity='customer', wp_id=<wp_user_id>) -> auth.users.id` +
`wp_import.orders.customer_wp_id` + `billing_email`. מסך עתידי
"הזמנות מהאתר הקודם" באזור האישי יקרא מהארכיון דרך view ייעודי
ב-wp_import (join דרך id_map, RLS בהתאם). לא בגרסה הראשונה; הארכיון
בנוי לזה מהיום הראשון. הזמנות אורח (בלי `customer_wp_id`) מקושרות
לפי `billing_email` מנורמל בזמן השאילתה, לא בזמן הייבוא.

### 2.7 הזמנות היסטוריות: ארכיון, לא מיגרציה (מאושרר, M3)

הזמנות Woo נטענות במלואן ל-`wp_import.orders` + `order_items`
ונשארות שם לצמיתות (RLS admin-read). לא מוקרנות ל-`public.orders`:

1. הסמנטיקה הכספית של 042 לא ניתנת לשחזור (snapshot פיצול
   פלטפורמה/ספק באגורות + `commission_ledger` accrual פר שורה; כל
   ערך מומצא מזהם דוחות settlement).
2. ה-ledger הכפול נשאר נקי (אין תנועות `fn_wallet_transfer`
   פיקטיביות).
3. אין מיפוי סטטוסים נקי ל-`wc-processing`/`wc-on-hold`/`wc-failed`.
4. `orders.user_id NOT NULL`: הזמנות אורח היו מחייבות משתמשי צללים.
5. ספרי האתר הישן נשארים בספרים הישנים; חובת 7 השנים מתקיימת ב-dump
   ובארכיון.

החריג היחיד: שוברים חיים (סעיף 4).

---

## 3. צנרת ה-staging

### 3.1 ארכיטקטורת הזרימה

```
mysqldump -> MySQL מקומי (Docker)
   -> 01-load-staging      (raw -> wp_import.*, אפס טרנספורמציה הרסנית)
   -> ולידציה + ניקוי      (C1-C10 -> wp_import.issues)
   -> 03/04 curation        (CSV החוצה, אישורי אדמין פנימה)
   -> 05/06/07 projection   (transform + upsert ל-public דרך id_map)
   -> 08-verify             (שערי סעיף 5; exit code לא-אפס על error)
```

סטאק: TypeScript ב-`tsx`; `mysql2` (קריאת ה-dump), `pg` (כתיבה דרך
session pooler עם service role), `@supabase/supabase-js` (Auth Admin +
Storage בלבד), `sharp` (WebP/OG), `zod` (ולידציית שורות). משתני
סביבה: `WP_MYSQL_URL`, `SUPABASE_DB_URL`, `SUPABASE_URL`,
`SUPABASE_SERVICE_ROLE_KEY`. שום סקריפט לא רץ עם מפתח anon.

```
scripts/wp-import/
  00-preflight.ts        קידוד, HPOS?, זיהוי plugin שוברים, ספירות גולמיות, בדיקת enums חיים
  01-load-staging.ts     MySQL מקומי -> wp_import.* (כל הישויות + raw jsonb)
  02-media-sync.ts       הורדה/rsync -> WebP/OG -> Storage -> עדכון wp_import.media
  03-curation-export.ts  CSV: מיפוי קטגוריות, slugs, סיווג type, שיוך ספקים, coupon_expiry_days
  04-curation-import.ts  קליטת הקבצים המאושרים חזרה ל-staging
  05-project-catalog.ts  categories -> products -> variants -> images -> redirects
  06-project-customers.ts Auth Admin API -> העשרת profiles -> user_addresses
  07-project-vouchers.ts שוברים חיים בלבד (סעיף 4)
  08-verify.ts           כל שערי סעיף 5
  09-purge.ts            rollback לפי batch (סעיף 3.5)
```

### 3.2 idempotency

1. כל הקרנה דרך `id_map (entity, wp_id) -> new_id`: קיים = UPDATE של
   שדות בבעלות ייבוא בלבד; לא קיים = INSERT + רישום.
2. הגנת עריכות אדמין: `id_map.projected` מחזיק snapshot של הערכים
   שהוקרנו לאחרונה; אם public שונה מה-snapshot (אדמין ערך אחרי
   ההקרנה), השדה לא נדרס ונרשם conflict issue.
3. כל ריצה פותחת שורת `import_batches` (kind, sha256 של ה-dump,
   dry_run, stats); כל כתיבה מסומנת ב-batch_id.
4. דטרמיניזם: אותו dump + אותם קבצי curation = אותה תוצאה (uuid
   נקבעים פעם אחת דרך id_map).
5. מדיה: path דטרמיניסטי + דה-דופ sha256; הרצה חוזרת מעלה רק את מה
   שלא בסטטוס uploaded.

### 3.3 resumability

הצנרת ניתנת לחידוש מכל נקודת כשל בלי להתחיל מחדש:

1. כל סקריפט הוא שלב עצמאי שקורא את מצבו מה-DB (staging + id_map +
   media.status), לא מזיכרון תהליך. קריסה באמצע = הרצה חוזרת של אותו
   סקריפט; מה שהושלם מזוהה ומדולג.
2. יחידת העבודה קטנה: מוצר/לקוח/קובץ בודד בטרנזקציה קצרה. אין
   טרנזקציית ענק אחת שכישלון בה מפיל הכול.
3. `06-project-customers` הוא הרגיש ביותר (Auth Admin API הוא רשת):
   לפני יצירה בודקים קיום לפי אימייל; יצירה שהצליחה אבל נפלה לפני
   רישום id_map מתגלה בהרצה הבאה דרך lookup אימייל ולא יוצרת כפול.
4. `import_batches.stats` מתעדכן תוך כדי ריצה (מונים), כך שאפשר לדעת
   איפה ריצה נעצרה.

### 3.4 dry-run

לכל סקריפט הקרנה דגל `--dry-run`: מחשב את כל הטרנספורמציות, כותב
דוח מלא + issues ל-staging (batch מסומן `dry_run=true`), לא נוגע
ב-public, לא יוצר משתמשי auth ולא מעלה קבצים. שער מעבר בין שלבים:
אפס issues ברמת error; רשימת ה-warnings נסקרת ידנית. החזרה הגנרלית
על פרויקט ה-DEV היא dry-run בקנה מידה מלא: אותם סקריפטים, אותו dump.

### 3.5 purge (rollback דאטה)

`09-purge --batch <id>` מוחק בסדר תלות הפוך: redirects ->
coupon_codes -> order_items -> orders (של legacy בלבד) ->
product_images -> variants -> products -> קטגוריות שנוצרו ->
user_addresses -> משתמשי auth דרך Admin API deleteUser (רק למי שאין
פעילות חדשה). ה-staging וה-dump לא נמחקים לעולם. נקודת אל-חזור:
מרגע שיש הזמנות אמיתיות במערכת החדשה, purge גורף אסור; מתקנים
קדימה נקודתית לפי id_map.

### 3.6 עדכון נדרש ב-032 (W5)

032 מאושררת כמות שהיא, עם תוספת אחת: קובץ ה-curation של המוצרים
צריך לשאת גם `approved_supplier_slug` ו-`approved_coupon_expiry_days`
(בגלל אילוצי ה-NOT NULL של 042). ב-`wp_import.products` קיימות כבר
`supplier_hint` ו-`target_type`; נדרשות שתי עמודות curation נוספות:

```sql
ALTER TABLE wp_import.products
  ADD COLUMN IF NOT EXISTS approved_supplier_slug text,
  ADD COLUMN IF NOT EXISTS approved_coupon_expiry_days integer;
```

התוספת נכנסת לגוף 032 עצמה (הטיוטה טרם הוחלה, אין צורך במיגרציה
נפרדת). שאר 032 (12 טבלאות, views, RLS admin-read, service_role
ככותב יחיד, לא חשופה ל-PostgREST) בתוקף.

---

## 4. קופונים פעילים: שוברים חיים אל `coupon_codes`

### 4.1 היקף

רק שוברים שנמכרו באתר הישן, לא מומשו ולא פגו (לפי טבלת ה-plugin,
תנאי: `is_redeemed IS NOT TRUE AND expires_at_wp > now()`). שובר
שפג = ארכיון בלבד. הקפאת מכירת שוברים ב-T-30 (סעיף 6) שואפת לאפס
את הקבוצה; אם בפועל אפס, כל הסעיף מתבטל מעצמו.

### 4.2 השרשרת המינימלית (מיושר ל-042)

לכל שובר חי מוקרנת שרשרת אחת:

1. **`orders`**: שורה בסטטוס `fulfilled`, `user_id` מה-id_map של
   הלקוח (שובר של אורח: הלקוח נוצר ב-auth לפי `billing_email` של
   ההזמנה המקורית; בלי אימייל תקין אין הקרנה, issue ברמת error),
   וכל שדות האגורות לפי מה ששולם בפועל: `subtotal_agorot` =
   `customer_pays_now_agorot` = `round(paid_amount * 100)`,
   `discount_agorot = 0`, `wallet_applied_agorot = 0`.
2. **`order_items`**: שורה אחת, `product_type='coupon'`,
   `quantity=1`, `item_status='issued'`,
   `unit_price_agorot = customer_pays_now_agorot` = מה ששולם,
   `face_value_agorot = round(face_value * 100)` (ערך הנקוב מה-plugin;
   אם חסר, שווה ל-paid), `platform_percent` מהסכם הספק שנקבע
   ב-curation, `platform_fee_agorot` + `supplier_due_agorot` נגזרים
   ממנו בעיגול round-half-up פעם אחת, **`cashback_percent = 0` ו-
   `cashback_amount_agorot = 0`** (אין cashback רטרואקטיבי על קניות
   מהאתר הישן; W6).
3. **`coupon_codes`**: סטטוס `issued`, `expires_at` = התוקף המקורי
   מה-plugin (נשמר כמות שהוא, לא מחושב מחדש מ-`coupon_expiry_days`),
   `user_id` + `supplier_id` + `order_item_id` מהשרשרת.

תופעת לוואי מכוונת של 042: ה-trigger ‏`snapshot_commission_ledger`
יורה על ה-INSERT ל-`order_items` ויוצר accrual ב-`commission_ledger`
בסטטוס `pending` עם idempotency key ‏`commission:accrual:<item_id>`.
זה בדיוק הרצוי: כשהשובר הישן ימומש, `fn_credit_order_item_cashback`
יסמן `earned` (ועם `cashback_amount_agorot=0` לא תיווצר תנועת ארנק).
העמלה על מימוש שובר legacy נכנסת לדוח ה-settlement הרגיל של הספק.
אם ההסכם העסקי הוא שאין עמלה על שוברי legacy, קובעים
`platform_percent=0` בקובץ ה-curation פר ספק (הכרעה עסקית, שאלה
פתוחה Q4).

### 4.3 פורמט הקוד (W7)

`coupon_codes.code` כפוף ל-CHECK ‏`^[0-9]{8}$`. קודי ה-plugin הישן
כנראה לא בפורמט הזה. ההכרעה:

1. קוד ישן שהוא בדיוק 8 ספרות ולא מתנגש: נשמר כמות שהוא.
2. כל קוד אחר: מונפק קוד 8 ספרות חדש. המיפוי `old_code -> new_id`
   חי ב-`id_map (entity='coupon_code', wp_id=<old_code>)`, והקוד
   הישן נשמר גם ב-metadata של השובר לצורכי תמיכה.
3. הלקוח מקבל את הקוד החדש במסך "הקופונים שלי" (השובר מופיע שם
   רגיל לגמרי אחרי הכניסה הראשונה) ובמייל המעבר התפעולי (סעיף
   2.6.3) מוזכר ששוברים ישנים זמינים באזור האישי.
4. מימוש מול קוד ישן מודפס: המוכר סורק דרך הסורק החדש; אם הלקוח
   מציג קוד ישן, ה-lookup בתמיכה עובר דרך id_map. אין תמיכת סריקה
   כפולת-פורמט ב-`redeem_coupon` (מסבך את נתיב הכסף בשביל זנב קטן
   ששאיפת ה-T-30 מאפסת ממילא).

### 4.4 מיפוי ספק לשובר

`supplier_id` של השובר נגזר מהמוצר שממנו נמכר (`product_wp_id` ->
id_map -> `products.supplier_id`). שובר שהמוצר שלו לא מיובא (הוחרג
או נמחק) מקבל שיוך מוצר + ספק ידני בקובץ ה-curation; בלי הכרעה =
blocker (error).

### 4.5 קודי הנחה של Woo (`shop_coupon`)

ארכיון בלבד ב-`wp_import.coupons` (מאושרר, M17). אין להם ישות יעד
ב-public (אין טבלת discount codes במערכת החדשה), וקודים שפורסמו
בעבר מתים עם האתר הישן. אם יתגלה ב-preflight קוד הנחה פעיל עם שימוש
משמעותי, ההכרעה אם לכבד אותו ידנית היא עסקית (שאלה פתוחה Q5).

### 4.6 יתרות ארנק (store credit)

אם ה-preflight ימצא יתרות store credit אמיתיות (plugin), הן מיובאות
כתנועות פתיחה: `fn_wallet_transfer` מ-`platform:adjustments` לחשבון
המשתמש, reason ‏`manual_adjust`, idempotency_key
‏`legacy_opening:<wp_user_id>`, אחרי אימות הסכום הכולל מול ה-dump
והמרת אגורות לפי W2 (מאושרר, M16). כך `v_wallet_ledger_drift` נשאר
נקי. אם אין plugin כזה, הסעיף מתבטל.

---

## 5. שערי שלמות (integrity gates)

`08-verify.ts` מדפיס ושומר ב-`import_batches.stats`. כל שורה = תנאי
עצירה; error חוסם cutover.

### 5.1 ספירות פר ישות (reconciliation)

`wp_import.v_reconciliation` + ספירה ב-public:

| ישות | תנאי |
|---|---|
| מוצרים | staged (publish, לא מוחרג) = mapped = count ב-`products` שמקורם בייבוא |
| וריאציות | סכום פר מוצר-הורה זהה בין staging ל-`product_variants` |
| קטגוריות | לכל term עם מוצרים יש יעד ממופה ב-id_map |
| לקוחות | staged (אימייל תקין) = mapped = משתמשי auth שנוצרו |
| מדיה | 100% uploaded על מוצרים active; אפס failed/pending |
| שוברים חיים | ספירת staging פתוחים = `coupon_codes` בסטטוס issued שנוצרו = שורות orders legacy = שורות order_items legacy |
| commission_ledger | שורת accrual אחת בדיוק פר order_item שהוקרן |
| redirects | 100% כיסוי url_inventory (5.5) |

### 5.2 גילוי יתומים

| בדיקה | חומרה |
|---|---|
| `order_items` ב-staging בלי הזמנת אב | error |
| וריאציה בלי מוצר הורה מיובא | error |
| שובר חי בלי מוצר/ספק ממופה | error (4.4) |
| `coupon_codes` שנוצר בלי `order_item_id` תקף | error |
| postmeta/usermeta בלי רשומת אב | info (לא נטען, C2) |
| מוצר active בלי אף תמונה | warn |
| כתובת לקוח בלי city | info (לא נוצרת, C8) |

### 5.3 ולידציית מחירים ומטבע

1. checksums: ‏Σ`kenyon_price` ו-Σ`stock_quantity` פר קטגוריה שווים
   בין staging ליעד.
2. אגורות (W2): לכל שורת orders/order_items שהוקרנה,
   `agorot % 100 == 0` (המקור בשקלים שלמים); חריגה = error.
3. אינברינט 042 פר order_item legacy:
   `platform_fee_agorot + supplier_due_agorot == customer_pays_now_agorot`
   ו-`cashback_amount_agorot == 0`.
4. מחיר 0 או NULL על מוצר publish = error (לא מיובא active, C5).
5. `full_price > kenyon_price` בכל שורה שבה full_price לא NULL.
6. סכום יתרות ארנק שנפתחו (אם יש) = הסכום הכולל ב-dump, באגורות.

### 5.4 גילוי כפילויות

| בדיקה | טיפול |
|---|---|
| אימייל מנורמל כפול ב-`wp_users` | הרשומה עם הפעילות המאוחרת מקבלת את החשבון; השאר ארכיון + warn |
| SKU כפול בין מוצרים | נשאר אצל בעל `total_sales` הגבוה; השאר NULL + warn (C3) |
| slug מוצע כפול | סיומת `-2` בזמן curation; אפס התנגשויות בהקרנה |
| קוד שובר כפול ב-plugin | error (דאטה חשוד במקור) |
| `sha256` כפול במדיה | דה-דופ מכוון, לא שגיאה |
| משתמש auth קיים באותו אימייל | מיפוי + העשרה בלבד, בלי יצירה (2.6) |

### 5.5 שער שלמות 301

`url_inventory` מאוחדת מ-sitemap ישן + ייצוא GSC (כל URL עם קליק
ב-12 חודשים) + crawl מלא. לכל שורה בדיוק אחת משלוש הכרעות: שורת
`seo_redirects`; התאמה ישירה ל-path חי חדש; סימון מודע 410. אפס
שורות בלי הכרעה. לפני ה-flip רץ HTTP על כל ה-inventory מול הפרודקשן
החדש (דומיין staging עם Host override): מצופה 301 -> 200, בלי
שרשראות ובלי לולאות.

### 5.6 spot-check

20 מוצרים אקראיים (seed קבוע) + 10 הנמכרים ביותר מול האתר החי
וה-Store API; 5 לקוחות; 10 URLs ישנים; כל השוברים החיים אחד-אחד
(הקבוצה קטנה ורגישה כספית).

---

## 6. תוכנית cutover

### 6.1 ציר זמן

| זמן | פעולה |
|---|---|
| T-30 ימים | הקפאת מכירת שוברים חדשים באתר הישן + עידוד מימוש (שאיפה: אפס שוברים פתוחים ב-flip) |
| T-7 ימים | dump חזרה גנרלית אחרון; ‏verify מלא ירוק על DEV |
| T-48h | הקפאת קטלוג באתר הישן (אין עריכת מוצרים/מחירים/קטגוריות); TTL של ה-DNS יורד ל-300 |
| T-24h | **דלתא סופית**: dump סופי -> טעינת staging (id_map מזהה רק שינויים) -> הקרנה -> ‏`08-verify` ירוק מלא |
| T-0 | flip: ‏apex A ל-`76.76.21.21` (Vercel), ‏www CNAME ל-`cname.vercel-dns.com`; הדומיינים נוספו ל-Vercel ואומתו (TXT + תעודות) מראש |
| T+2h | הזמנה שנכנסה לוורדפרס בחלון ה-DNS: מועתקת ידנית לארכיון; שובר שנקנה בחלון מוקרן ידנית דרך 07 |
| T+24h | ניטור רציף: ‏`/api/health`, ‏Sentry, דוח 404, ‏GSC Coverage |
| T+7 ימים | dump משלים של הזמנות בלבד -> רענון ארכיון (סטטוסים שהתעדכנו בזנב) |
| T+14 ימים | אם יציב: וורדפרס יורד לקריאה בלבד; ה-dump האחרון = הגיבוי הקבוע; TTL חוזר לרגיל |

חלון השבתה ללקוחות: אפס. ההקפאה היא על עריכת תוכן; checkout ישן
נסגר רק ברגע ה-flip.

### 6.2 הדלתא הסופית (T-24h)

לא סנכרון מתמשך אלא הרצה חוזרת של אותה צנרת על dump טרי: id_map
מזהה מה קיים, `projected` snapshot מגן על עריכות אדמין שנעשו במערכת
החדשה, ורק דלתות אמיתיות נכתבות (מוצר שהתעדכן בחלון, לקוח חדש,
שובר שנמכר לפני ההקפאה). הקפאת הקטלוג ב-T-48h מבטיחה שהדלתא קטנה
וניתנת לסקירה ידנית בדוח ה-verify.

### 6.3 rollback

שתי שכבות בלתי תלויות:

1. **rollback של האתר**: החזרת DNS לוורדפרס (TTL 300, דקות).
   וורדפרס נשאר חי וללא שינוי לפחות שבועיים אחרי ה-flip.
2. **rollback של הדאטה**: `09-purge --batch <id>` (סעיף 3.5).
3. נקודת אל-חזור: הזמנה אמיתית ראשונה במערכת החדשה. מרגע זה purge
   גורף אסור; מתקנים קדימה נקודתית.

### 6.4 תקופת ריצה מקבילה (parallel-run verification)

T-0 עד T+14, וורדפרס חי (בלי checkout) כרפרנס:

1. יומי: השוואת ספירות מוצרים active + מחירים מול ה-Store API הישן
   (עוד נגיש ישירות ב-IP/דומיין staging של המאחסן).
2. יומי: דוח 404 של הפרודקשן החדש מוצלב מול `url_inventory`; ‏URL
   ישן שמופיע ב-404 ולא ב-inventory = פער crawl, מקבל 301 מיידי.
3. שבועי: ‏GSC Coverage + ‏`seo_redirects.hits`.
4. מימושי שוברי legacy נבדקים אחד-אחד מול הארכיון בשבועיים
   הראשונים.
5. הזמנות שנכנסו לוורדפרס בזנב (אם checkout נסגר באיחור) מזוהות
   ב-dump של T+7 ומטופלות ידנית.

### 6.5 סדר ביצוע כולל

```
שלב 0: השגת גישה (SSH/DB + GSC) -> dump ראשון + uploads + sitemap + ייצוא GSC
שלב 1: החלת 032 המעודכנת (wp_import) דרך MCP apply_migration
שלב 2: 00 -> 01 -> 02 -> 03 -> אישורי curation (כולל ספקים + expiry) -> 04
שלב 3: הקרנה מלאה על פרויקט ה-DEV (05 -> 06 -> 07) + 08-verify
שלב 4: תיקון כללים וחזרה על 2-3 עד אפס errors
שלב 5: פרודקשן: החלת שרשרת המיגרציות המלאה לפי MASTER (כולל 042) ->
        הקרנה -> verify -> cutover (סעיפים 6.1-6.4)
```

תלות קשיחה: ההקרנה לפרודקשן רצה רק אחרי שכל שרשרת המיגרציות
(כולל 042) מוחלת, כי המיפוי בסעיף 2 כותב לעמודות של 030/042.

---

## 7. טבלת החלטות חדשות (משלימות את M1-M17)

| # | החלטה |
|---|---|
| W1 | שיוך ספק הוא שער curation חוסם: מוצר בלי ספק מאושר לא מוקרן (042: NOT NULL). גובר על M6 |
| W2 | המרת אגורות: `round(ils*100)` פעם אחת; שבר אגורה או מטבע לא-ILS במקור = error |
| W3 | זהות: Google מקושר אוטומטית לפי אימייל; משתמשי סיסמה מקבלים מייל מעבר יחיד שמפנה ל-magic link בזרימת הכניסה; אין קמפיין reset |
| W4 | קישור היסטוריית הזמנות דרך id_map + ארכיון; view עתידי באזור האישי; אורחים לפי billing_email בזמן שאילתה |
| W5 | ‏032 מקבלת שתי עמודות curation נוספות (`approved_supplier_slug`, `approved_coupon_expiry_days`) בגוף הטיוטה |
| W6 | שוברי legacy: ‏`cashback_percent=0`; ה-accrual ב-commission_ledger נוצר מה-trigger של 042 ונשאר pending עד מימוש |
| W7 | קוד שובר: נשמר אם הוא 8 ספרות; אחרת מונפק חדש עם מיפוי old->new ב-id_map; אין סריקה כפולת-פורמט ב-redeem_coupon |
| W8 | ‏coupon_expiry_days: ‏physical=0, ‏coupon=ערך מפורש ב-curation (הצעה אוטומטית מתוקף השוברים ההיסטוריים); בלי הכרעה אין הקרנה |

---

## 8. שאלות פתוחות

1. **זהות plugin השוברים** באתר הישן ומבנה הטבלה שלו. נסגר עובדתית
   מה-dump ב-`00-preflight`; מבנה הטעינה של `vouchers` וסעיף 4 כולו
   תלויים בו. חוסם את סגירת 07.
2. **גישה בפועל** ל-SSH/phpMyAdmin של המאחסן + הרשאת GSC. משימת
   הפתיחה של המסלול; חוסמת את שלב 0.
3. **כמות שוברים פתוחים בפועל ב-cutover.** קובעת אם סעיף 4 בכלל
   מופעל. הקפאת T-30 שואפת לאפס.
4. **עמלה על שוברי legacy**: האם `platform_percent` של השרשרת
   הממופה הוא לפי הסכם הספק הרגיל או 0 (הכסף כבר נגבה במלואו באתר
   הישן; ההכרעה משנה את דוח ה-settlement הראשון של כל ספק).
5. **קודי הנחה פעילים של Woo**: אם ה-preflight ימצא קוד פרסומי חי
   עם שימוש משמעותי, האם מכבדים אותו ידנית במערכת החדשה (אין ישות
   יעד; יחייב הכרעה עסקית נפרדת) או מת עם האתר הישן.
6. **מסך "הזמנות מהאתר הקודם"** באזור האישי (W4): באיזו גרסה נבנה,
   ומה חשיפת ה-RLS של ה-view על wp_import (כרגע admin-read בלבד).
7. **נוסח מייל המעבר** התפעולי (W3): טקסט סופי + כתובת השליחה
   בסאב-דומיין הטרנזקציוני; תלוי בתשתית המיילים של דומיין 031.
8. **תאריך T-30**: הקפאת מכירת השוברים דורשת קביעת תאריך flip יעד;
   ההחלטה עסקית ותלויה במוכנות מסלולי checkout/ספקים.
