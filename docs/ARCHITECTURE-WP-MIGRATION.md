# ARCHITECTURE-WP-MIGRATION: הגירת הנתונים מוורדפרס

תאריך: 2026-07-29 | ענף: `arch/mega-docs` | סטטוס: **מסמך מחייב, שכבת מימוש**

כפיפות סמכות. המסמך הזה כפוף ל-`docs/MASTER-ARCHITECTURE.md` ול-
`docs/CONTRADICTIONS.md`, ומרחיב את `docs/ARCHITECTURE-WP-DATA-MIGRATION.md`.
בכל חפיפה בין השניים: המסמך הישן קובע את **החוזה** (מה מותר לייבא, מה
נשאר בארכיון, מה חוסם cutover), והמסמך הזה קובע את **המימוש** ברמת
העמודה, ה-SQL וה-script. איפה שהמסמך הזה סותר את הישן במפורש, יש כאן
פסקה שמסבירה למה, עם ראיה מהקוד החי או מה-DB החי.

מה חדש כאן ולא במסמך הישן:

1. מסלול ה-dump כאזרח מדרגה ראשונה: מיפוי `wp_posts` / `wp_postmeta` /
   `wp_terms` עמודה-לעמודה, לא כהערת שוליים ל-REST.
2. ‏ETL בשישה שלבים עם שערי כניסה ויציאה לכל שלב, ומה קורה כשכל שלב נופל
   באמצע.
3. ‏R2 כיעד התמונות בפועל, על גבי `src/lib/storage/r2.ts` שכבר קיים
   בריפו, ולא כ"חלופה מאושרת".
4. מלאי ה-301 המלא: כל צורת URL שוורדפרס מייצרת, מול הנתיבים שהאפליקציה
   באמת חושפת היום.
5. אימות שלמות: 21 שערים עם ה-SQL שמריץ כל אחד מהם.

---

## 0. מצב הפתיחה, מאומת

נמדד מול הפרויקט `ixvwfbuvfxxsjiywhbbb` וקוד ה-branch ב-2026-07-29.

| עובדה | ערך | מקור |
|---|---|---|
| טבלאות ב-`public` | 33, כולן RLS enabled | ‏`pg_class` |
| `public.products` | 61 שורות | ‏`list_tables` |
| `public.categories` | **0 שורות** | ‏`list_tables` |
| `public.suppliers` | 11 שורות | ‏`list_tables` |
| `public.seo_redirects` | **לא קיימת** | ‏`pg_class` |
| ה-runner | ‏`scripts/wp-import/` (6 שלבים) קיים | דיסק |
| ‏R2 | ‏`src/lib/storage/r2.ts` קיים, presigned PUT | דיסק |
| נתיב מוצר חי | ‏`/product/[slug]` | ‏`src/app/sitemap.ts` |
| נתיב קטגוריה חי | ‏`/category/[slug]` | ‏`src/app/sitemap.ts` |
| ‏redirect lookup ב-proxy | **אין** | ‏`src/proxy.ts` |

שתי מסקנות שנגזרות מזה מיד, ושתיהן משנות תוכניות קודמות:

**‏`categories` ריקה לגמרי.** ‏61 המוצרים החיים יושבים בלי עץ קטגוריות
מאוכלס. כלומר שלב הקטגוריות בייבוא הוא לא "מיזוג עם קיים" אלא **טעינה
ראשונה**, ואין סיכון התנגשות slug מול דאטה קיימת. זה גם אומר שכל
`products.category_id` שקיים היום מצביע ל-NULL או לשורה שנמחקה, ושהייבוא
הוא ההזדמנות היחידה לתקן את זה בלי מיגרציית נתונים נפרדת.

**נתיבי ה-URL במסמך הישן שגויים.** המסמך הישן ממפה ל-`/p/<slug>` ו-
`/c/<slug>`, ומסמך האב ל-`/products/[slug]`. הקוד החי חושף
`/product/<slug>` ו-`/category/<slug>`, וזה מה ש-`sitemap.ts` פולט לגוגל
כרגע. **הקוד גובר.** כל טבלת ה-301 בסעיף 4 בנויה על הנתיבים החיים. שינוי
עתידי של הנתיב הוא 301 נוסף בשרשרת, לא סיבה לכתוב את מפת ההגירה על נתיב
שלא קיים.

---

## 1. מקורות: REST מול dump

### 1.1 מתי כל אחד

| מצב | מסלול | למה |
|---|---|---|
| האתר חי, ה-plugin של WooCommerce REST פעיל | ‏REST | ‏JSON פתור מראש, בלי לפענח `wp_postmeta` |
| האתר הוקפא ל-cutover | ‏dump | אין שרת שעונה |
| ‏REST חוסם, מגביל, או מחזיר שדות חלקיים | ‏dump | ‏REST משמיט meta שלא ברשימת ה-fields |
| אימות סופי לפני flip | **שניהם** | הפרש בין המקורות הוא ממצא, ראה 5.4 |

הכלל: ‏REST הוא המקור התפעולי, ה-dump הוא **מקור האמת המשפטי**. גם
בריצת REST מוצלחת לוקחים dump אחד ומאחסנים אותו, כי הוא הדבר היחיד
שאפשר לחזור אליו אחרי שהאתר הישן ירד.

### 1.2 לקיחת ה-dump

```bash
# Terminal (על שרת הוורדפרס או דרך SSH):
mysqldump --single-transaction --quick --default-character-set=utf8mb4 \
  --routines --triggers --hex-blob --no-tablespaces \
  "$WP_DB_NAME" \
  | gzip > ke-wp-$(date +%Y%m%d-%H%M).sql.gz

# עותק ה-uploads, בנפרד ולפני ההקפאה:
rsync -az --info=progress2 \
  user@host:/var/www/wp-content/uploads/ ./wp-uploads/
```

`--single-transaction` נותן snapshot עקבי על InnoDB בלי לנעול את החנות.
בלעדיו הזמנה שנכנסת באמצע ה-dump מפצלת את עצמה בין טבלאות.

השחזור לוקאלי, לא על שום שרת חי:

```bash
# Terminal:
docker run -d --name ke-wp-src -e MYSQL_ROOT_PASSWORD=local \
  -e MYSQL_DATABASE=wp -p 3399:3306 mysql:8
gunzip -c ke-wp-*.sql.gz | mysql -h127.0.0.1 -P3399 -uroot -plocal wp
```

### 1.3 מה עוד לוקחים, ולא רק את ה-DB

| פריט | למה הוא חוסם |
|---|---|
| ‏`wp-content/uploads/` מלא | בלעדיו אין תמונות, וה-checksum בשער 12 לא ניתן לחישוב |
| ייצוא Search Console (‏Pages, 16 חודשים) | זה **מלאי ה-URL האמיתי**. sitemap של וורדפרס לא מכיל URL שנמחקו והם עדיין מאונדקסים |
| ‏`sitemap_index.xml` וכל ה-sitemaps הבנים | הצלבה מול GSC |
| קובץ `.htaccess` / כללי nginx | יש שם 301 היסטוריים שצריך לשרשר, ראה 4.6 |
| רשימת ה-plugins הפעילים | קובעת אילו מפתחות meta קיימים בכלל (2.3) |

---

## 2. מיפוי: וורדפרס אל הסכימה החיה

### 2.1 מוצרים: `wp_posts` + `wp_postmeta` אל `public.products`

מוצר בוורדפרס הוא שורה ב-`wp_posts` עם `post_type = 'product'`, וכל
המספרים שלו מפוזרים כזוגות מפתח-ערך ב-`wp_postmeta`. השאילתה הבסיסית:

```sql
-- MySQL (על ה-dump המשוחזר)
SELECT
  p.ID                        AS wp_id,
  p.post_name                 AS wp_slug,
  p.post_title                AS wp_title,
  p.post_content              AS wp_content,
  p.post_excerpt              AS wp_excerpt,
  p.post_status               AS wp_status,
  p.post_date_gmt             AS wp_created,
  p.post_modified_gmt         AS wp_modified,
  MAX(CASE WHEN m.meta_key = '_regular_price'         THEN m.meta_value END) AS regular_price,
  MAX(CASE WHEN m.meta_key = '_sale_price'            THEN m.meta_value END) AS sale_price,
  MAX(CASE WHEN m.meta_key = '_price'                 THEN m.meta_value END) AS active_price,
  MAX(CASE WHEN m.meta_key = '_sku'                   THEN m.meta_value END) AS sku,
  MAX(CASE WHEN m.meta_key = '_stock'                 THEN m.meta_value END) AS stock,
  MAX(CASE WHEN m.meta_key = '_stock_status'          THEN m.meta_value END) AS stock_status,
  MAX(CASE WHEN m.meta_key = '_manage_stock'          THEN m.meta_value END) AS manage_stock,
  MAX(CASE WHEN m.meta_key = '_thumbnail_id'          THEN m.meta_value END) AS thumb_id,
  MAX(CASE WHEN m.meta_key = '_product_image_gallery' THEN m.meta_value END) AS gallery_ids,
  MAX(CASE WHEN m.meta_key = '_virtual'               THEN m.meta_value END) AS is_virtual,
  MAX(CASE WHEN m.meta_key = '_downloadable'          THEN m.meta_value END) AS is_downloadable,
  MAX(CASE WHEN m.meta_key = '_weight'                THEN m.meta_value END) AS weight,
  MAX(CASE WHEN m.meta_key = '_sale_price_dates_from' THEN m.meta_value END) AS sale_from,
  MAX(CASE WHEN m.meta_key = '_sale_price_dates_to'   THEN m.meta_value END) AS sale_to
FROM wp_posts p
LEFT JOIN wp_postmeta m ON m.post_id = p.ID
WHERE p.post_type = 'product'
  AND p.post_status IN ('publish','draft','pending','private')
GROUP BY p.ID;
```

`post_status = 'trash'` **לא** נכלל: מוצר שנמחק לא חוזר לחיים דרך ההגירה.
הוא כן נכנס ל-`url_inventory` עם החלטת `410`, ראה 4.5.

טבלת המיפוי המלאה אל 33 העמודות הרלוונטיות של `public.products`:

| עמודת יעד | מקור ב-dump | מקור ב-REST | טרנספורם |
|---|---|---|---|
| `id` | נטבע | נטבע | ‏uuid מ-`wp_import.id_map`, יציב בין ריצות |
| `slug` | `wp_posts.post_name` | `slug` | ‏percent-decode, ‏NFC normalize, lower, ראה 4.2 |
| `name_he` | `post_title` | `name` | ‏entity decode, trim |
| `name_en` | אין | אין | ‏NULL. העמודה nullable ב-`products` |
| `description_he` | `post_content` | `description` | ניקוי HTML, סעיף 2.4 |
| `price_ils` | `_sale_price` או `_regular_price` | לוגיקת מחיר 2.2 | ‏numeric(2dp) |
| `kenyon_price` | זהה ל-`price_ils` | זהה | **חובה לכתוב את שתיהן**, ראה 2.6 |
| `full_price` | `_regular_price` | `regular_price` | ‏numeric |
| `compare_at_price_ils` | `_regular_price` | `regular_price` | ‏NULL אם אין מבצע |
| `sku` | `_sku` | `sku` | ‏trim; ריק ⇒ NULL (יש UNIQUE על `product_variants.sku` בלבד, לא כאן) |
| `stock_quantity` | `_stock` | `stock_quantity` | ‏integer; NULL כש-`_manage_stock='no'` |
| `type` | נגזר, 2.5 | נגזר | ‏enum `product_type`: coupon/physical/service |
| `commission_type` | נגזר מ-`type` | נגזר | ‏coupon⇒`coupon_absolute`, אחרת `physical_percent`. אילוץ 093 |
| `status` | `post_status` | `status` | מיפוי 2.7 |
| `approval_status` | קבוע | קבוע | ‏`approved` (המוצרים כבר היו חיים) |
| `images` | `_thumbnail_id` + `_product_image_gallery` | `images[]` | ‏jsonb, סעיף 3.5 |
| `category_id` | ‏term העלה, 2.8 | `categories[0]` | דרך `id_map` של הקטגוריות |
| `supplier_id` | ‏vendor map או ברירת מחדל | זהה | ‏NOT NULL בפועל, 2.9 |
| `platform_percent` | **לא קיים ב-WP** | לא קיים | מקונפיג, 2.10 |
| `supplier_split_percent` | לא קיים | לא קיים | ‏`100 - platform_percent`, אילוץ 070 |
| `commission_percent` | לא קיים | לא קיים | שווה ל-`platform_percent`, 2.6 |
| `coupon_price_ils` | ‏meta מותאם, 2.3 | ‏meta_data | סכום מוחלט. NULL למוצר לא-קופון |
| `coupon_expiry_days` | ‏meta מותאם | ‏meta_data | ‏integer; חובה כשה-type הוא coupon |
| `discount_percent` | נגזר | נגזר | תצוגה בלבד, נגזר מ-`coupon_price_ils` |
| `cashback_percent` | לא קיים | לא קיים | ‏0, אלא אם הקונפיג אומר אחרת |
| `is_coupon_enabled` | נגזר | נגזר | `type = 'coupon'` |
| `is_featured` | ‏`_featured` או term `featured` | `featured` | ‏boolean |
| `published_at` | `post_date_gmt` | `date_created_gmt` | ‏timestamptz, רק ל-`active` |
| `created_at` | `post_date_gmt` | `date_created_gmt` | נשמר, לא now() |
| `updated_at` | `post_modified_gmt` | `date_modified_gmt` | נשמר |
| `created_by` | ‏NULL | ‏NULL | ייבוא, לא אדם |
| `attributes` | ‏`wp_term_relationships` על `pa_*` | `attributes[]` | ‏jsonb, 2.11 |
| `deleted_at` | ‏NULL | ‏NULL | ‏trash לא מיובא בכלל |

### 2.2 לוגיקת המחיר, כולל מלכודת חלון המבצע

```text
regular = numeric(_regular_price)
sale    = numeric(_sale_price)
from    = _sale_price_dates_from   -- unix, אופציונלי
to      = _sale_price_dates_to     -- unix, אופציונלי

sale_active = sale is not null
              and sale > 0
              and sale < regular
              and (from is null or from <= now)
              and (to   is null or to   >  now)

if sale_active:
    price_ils            = sale
    compare_at_price_ils = regular
else:
    price_ils            = regular
    compare_at_price_ils = null
```

**המלכודת.** ‏`_price` (המחיר שוורדפרס מציג בפועל) הוא נגזרת שהחנות
מחשבת מחדש בכל cron. אם מייבאים ממנו, מבצע שפג לפני שבוע נכנס לקטלוג
החדש כמחיר קבוע, והמחיר המקורי נעלם. **תמיד גוזרים מ-`_regular_price` /
`_sale_price` ומחלון התאריכים, לעולם לא מ-`_price`.** את `_price` כן
משווים כשער אימות (שער 8): פער בינו לבין החישוב שלנו מדווח, לא מתקן.

`compare_at_price_ils <= price_ils` הוא **פסילה**, לא אזהרה. מחיר מחוק
שאינו גבוה מהמחיר הוא הצגה כוזבת של הנחה, וזו חשיפה משפטית לפי
`ARCHITECTURE-LEGAL-COMPLIANCE.md`. שורה כזאת יורדת ל-`draft`.

מוצר `variable`: `price_ils` = המינימום מבין הווריאציות,
`compare_at_price_ils = NULL`, והשורה מסומנת `needs_review` בדוח. אין
ייבוא אוטומטי של וריאציות למחזור הראשון, כי `product_variants` ריקה
(0 שורות) ואין UI שמציג אותן.

### 2.3 מפתחות meta מותאמים: אין ניחוש

`coupon_price_ils` ו-`coupon_expiry_days` **אינם קיימים ב-WooCommerce
סטנדרטי.** אם הם קיימים באתר, הם הגיעו מ-plugin או מ-ACF, והמפתח שלהם
לא ידוע מראש. הנוהל, לפני שכותבים שורת מיפוי אחת:

```sql
-- MySQL: כל מפתחות ה-meta שאינם של הליבה, לפי שכיחות
SELECT m.meta_key, COUNT(*) AS rows_with_key
FROM wp_postmeta m
JOIN wp_posts p ON p.ID = m.post_id AND p.post_type = 'product'
WHERE m.meta_key NOT LIKE '\_edit%'
  AND m.meta_key NOT IN (
    '_regular_price','_sale_price','_price','_sku','_stock','_stock_status',
    '_manage_stock','_thumbnail_id','_product_image_gallery','_virtual',
    '_downloadable','_weight','_length','_width','_height','_tax_status',
    '_tax_class','_visibility','_featured','_product_attributes',
    '_sale_price_dates_from','_sale_price_dates_to','_backorders',
    '_sold_individually','_purchase_note','_default_attributes','_wp_old_slug'
  )
GROUP BY m.meta_key
ORDER BY rows_with_key DESC;
```

הפלט נכנס ל-`config.mjs` תחת `metaKeyMap` כמיפוי מפורש. מפתח שלא נכנס
למפה **לא מיובא**, ומדווח כ-`unmapped_meta_key` ברמת `warn`. אין fallback
לניחוש לפי שם דומה: `_coupon_price` ו-`_ke_coupon_price` הם שני שדות
שונים עד שאדם קובע אחרת.

`_wp_old_slug` הוא היוצא מן הכלל היחיד ולכן הוא ברשימת הליבה: וורדפרס
כותב לשם כל slug ישן של הפוסט, וזה **מקור 301 מוכן** (סעיף 4.4).

### 2.4 ניקוי `post_content`

```text
1. הסרת הערות בלוקים:  <!-- wp:... -->  ו-  <!-- /wp:... -->
2. הסרת shortcodes:  [foo attr="x"]...[/foo]  ->  התוכן הפנימי נשמר
3. allow-list תגיות:  p br ul ol li strong em a h2 h3 h4 blockquote
   כל השאר: unwrap (התוכן נשמר, התגית יורדת). לא delete.
4. הסרת מוחלטת:  script style iframe object embed form input on* attrs
5. כתובות תמונה ב-src ששייכות ל-wp-content/uploads -> URL של R2
   (המיפוי מגיע מ-wp_import.media אחרי שלב media)
6. קישורים פנימיים ל-kenyonexpress.co.il -> נתיב יחסי
7. entity decode, איחוד רווחים, trim
```

צעד 4 הוא בקרת אבטחה, לא ניקיון. `description_he` מוצג ב-UI, ותוכן
וורדפרס הוא קלט לא אמין: אתר שנפרץ אי פעם מחזיק `<script>` בתוך
`post_content` של מוצר. הרשימה הלבנה היא ההגנה, לא ה-sanitizer בצד
התצוגה, כי גם הוא יכול להתחלף.

צעד 5 תלוי בשלב media ולכן ניקוי ה-HTML רץ **אחרי** סנכרון התמונות ולא
לפניו. בריצה בלי תמונות, כתובת `wp-content` שנשארה היא ממצא בשער 13.

### 2.5 קביעת `type`

```text
type = 'coupon'   כאשר  slug הקטגוריה ב-config.couponCategorySlugs
                  או    קיים meta שממופה ל-coupon_price_ils
                  או    (_virtual = 'yes' AND _downloadable = 'yes')

type = 'service'  כאשר  slug הקטגוריה ב-config.serviceCategorySlugs
                  או    (_virtual = 'yes' AND _downloadable != 'yes')

type = 'physical' בכל מקרה אחר
```

הסדר מחייב: קופון נבדק ראשון, כי קופון הוא גם virtual. שתי רשימות
ה-slug ב-config נסקרות בעיניים לפני הריצה, ומופיעות בדוח.

`commission_type` (עמודה מ-093, `NOT NULL`, עם האילוץ
`products_commission_type_matches_type`) נגזרת מ-`type` ולא נקבעת
בנפרד: `coupon ⇒ coupon_absolute`, `physical ⇒ physical_percent`,
`service ⇒ physical_percent`. כתיבה של צירוף אחר נדחית ב-DB, וזה בכוונה.

### 2.6 שלושת זוגות העמודות הכפולות: מה כותבים לשתיהן

בסכימה החיה יש שלושה מקרים של שתי עמודות למספר אחד. אלה לא מקרי קצה,
הם ייכשלו את הייבוא אם מתעלמים מהם.

| זוג | מצב חי | מה הייבוא כותב |
|---|---|---|
| `price_ils` / `kenyon_price` | שוות בכל 61 השורות; `price_ils` הוא `NOT NULL` בלי default | **שתיהן, לאותו ערך** |
| `platform_percent` / `commission_percent` | `commission_percent` הוא `NOT NULL DEFAULT 5`; זה השם הישן של אותה ידית | **שתיהן, לאותו ערך** |
| `platform_percent` / `supplier_split_percent` | ‏CHECK של 070 דורש סכום 100 | ‏`supplier_split_percent = 100 - platform_percent` |

הסיבה שלא בוחרים אחת: `insert` של מוצר בלי `price_ils` או בלי
`commission_percent` **נכשל**, כי שתיהן `NOT NULL`. זה בדיוק הבאג שחסם
יצירת מוצר בפאנל האדמין ב-28.07 (ראה STATE.md). איחוד העמודות הוא
מיגרציית נתונים נפרדת, ולא תנאי לייבוא.

### 2.7 מיפוי `post_status` אל `product_status`

| `post_status` | `products.status` | נכנס ל-`url_inventory`? |
|---|---|---|
| `publish` | `active` | כן, עם 301 או slug זהה |
| `draft` | `draft` | לא (מעולם לא היה אינדוקס) |
| `pending` | `draft` | לא |
| `private` | `draft` | לא |
| `trash` | לא מיובא | **כן, עם 410** |
| `auto-draft` | לא מיובא | לא |

מוצר שעובר את המיפוי אבל נופל בשער מחיר או בשער תמונה יורד ל-`draft`
בלי קשר ל-`post_status` שלו. **מוצר לא עולה `active` עם מחיר NULL,
לעולם.**

### 2.8 קטגוריות: `wp_terms` אל `public.categories`

```sql
-- MySQL: עץ הקטגוריות המלא
SELECT
  t.term_id                AS wp_term_id,
  t.name                   AS name,
  t.slug                   AS slug,
  tt.parent                AS wp_parent_id,
  tt.description           AS description,
  tt.count                 AS product_count,
  MAX(CASE WHEN tm.meta_key = 'thumbnail_id' THEN tm.meta_value END) AS thumb_id,
  MAX(CASE WHEN tm.meta_key = 'order'        THEN tm.meta_value END) AS menu_order
FROM wp_terms t
JOIN wp_term_taxonomy tt ON tt.term_id = t.term_id
LEFT JOIN wp_termmeta tm ON tm.term_id = t.term_id
WHERE tt.taxonomy = 'product_cat'
GROUP BY t.term_id;
```

שיוך מוצר לקטגוריה:

```sql
SELECT tr.object_id AS wp_product_id, t.term_id, t.slug, tt.parent
FROM wp_term_relationships tr
JOIN wp_term_taxonomy tt ON tt.term_taxonomy_id = tr.term_taxonomy_id
JOIN wp_terms t          ON t.term_id = tt.term_id
WHERE tt.taxonomy = 'product_cat';
```

| עמודת יעד | מקור | הערה |
|---|---|---|
| `slug` | `wp_terms.slug` | ‏percent-decode |
| `name_he` | `wp_terms.name` | |
| `name_en` | **אין ב-WP** | `NOT NULL` בסכימה. נזרע מה-slug בתעתיק, אף פעם לא מחרוזת ריקה |
| `parent_id` | `wp_term_taxonomy.parent` | דרך `id_map`, טעינת הורים-ראשונים |
| `description_he` | `tt.description` | ניקוי HTML כמו 2.4 |
| `icon_url` | ‏term meta `thumbnail_id` | דרך צינור התמונות |
| `image_url` | אותו מקור | ‏R2 |
| `sort_order` | ‏term meta `order` | ‏integer, ברירת מחדל 0 |
| `is_active` | `tt.count > 0` | קטגוריה ריקה נטענת כ-`false`, לא נמחקת: ה-URL שלה עדיין צריך 301 |

`uncategorized` (מזהה 15 בהתקנה סטנדרטית) **לא מיובא**. מוצר שזו
הקטגוריה היחידה שלו מקבל `category_id = NULL` ומדווח.

**עומק העץ.** ‏`public.categories` היא עץ ללא הגבלת עומק בסכימה, אבל
`ARCHITECTURE-CATALOG-SEARCH-SEO` מגביל לעומק 2. term שעמוק יותר משוטח
להורה שלו בעומק 2, וה-URL המקורי שלו מקבל 301 ליעד המשוטח. שרשרת הורים
מעגלית (קורה בבסיסי נתונים ישנים) נחתכת ב-20 רמות והשורה נטענת כשורש.

מוצר משויך ל-term **העלה** (העמוק ביותר) שלו, כי `products.category_id`
הוא הפניה יחידה. כל ה-terms האחרים שלו נשמרים ב-`wp_import` לצורך
`product_categories` עתידית.

### 2.9 `supplier_id`: החובה שאין לה מקור

`products.supplier_id` הוא `NOT NULL` בפועל (יש 11 ספקים חיים, וכל
המוצרים מצביעים אליהם), ול-WooCommerce אין מושג של ספק אלא אם מותקן
plugin ריבוי-מוכרים.

סדר הפתרון:

1. `vendor_map.csv` בפורמט `wp_vendor_id,supplier_id` אם קיים plugin
   ‏(Dokan / WC Vendors / YITH). המזהה נמצא ב-`post_author` או ב-meta.
2. `slug_supplier_map.csv` בפורמט `product_slug,supplier_id` להתאמה ידנית
   של 61 המוצרים החיים, שהיא כמות שאדם יכול לעבור עליה.
3. ברירת מחדל: ספק סינתטי יחיד `Kenyon Express (legacy WP)`, נוצר פעם
   אחת עם `id` יציב ומתועד בקונפיג.

**חשוב.** ספק סינתטי הוא מצב זמני שחוסם כסף: `platform_percent` שלו לא
מוגדר, ואי אפשר לשלם payout לישות שאינה עסק. לכן שער 17 סופר כמה מוצרים
`active` נשארו על הספק הסינתטי, וכל ערך מעל 0 הוא `error` שחוסם cutover
של מוצרי קופון (אבל לא של מוצרים פיזיים שלא מגיעים לפיצול מיידי).

### 2.10 שלושת האחוזים: מגיעים מקונפיג, לא מ-WP

`platform_percent`, `supplier_split_percent` ו-`cashback_percent` הם
כלכלה חדשה. ל-WooCommerce אין להם עמודה, וההכרעה ב-`CONTRADICTIONS.md`
C1 היא ש**אין ברירת מחדל בשום מקום**: `platform_percent` הוא שדה חובה
שהאדמין מזין פר-מוצר.

הייבוא לא יכול להמציא אותם, והוא גם לא רשאי להשאיר אותם NULL על מוצר
`active`. הפתרון:

```js
// config.mjs
economics: {
  // חובה: מפה מפורשת מ-slug של קטגוריה לאחוז הפלטפורמה.
  // אין ערך '*'. קטגוריה שלא ברשימה מייצרת שגיאת קונפיג לפני הריצה,
  // לא ברירת מחדל שקטה.
  platformPercentByCategory: {
    'restaurants': 25,
    'beauty':      30,
    // ...
  },
  cashbackPercentByCategory: {},   // ריק => 0
  defaultCouponExpiryDays: null,   // null => מוצר קופון בלי meta נכשל
}
```

יש כאן דאטה אמיתית לעבוד איתה: `supplier_split_percent` מאוכלס ב-61
השורות החיות (‏70% על 31 מוצרים, ‏75% על 15, ‏85% על 15, לפי
`CONTRADICTIONS.md`), בעוד `platform_percent` ריק בכולן. לכן למוצר
**שכבר קיים** בסכימה, הייבוא **לא דורס** את הפיצול הקיים אלא גוזר
`platform_percent = 100 - supplier_split_percent`. רק מוצר חדש לוקח
מהקונפיג.

מוצר `type='coupon'` בלי `coupon_expiry_days` **לא מיובא כ-active**.
`finalize.ts` מסרב להנפיק שובר בלי תוקף (ההכרעה של 28.07), ומוצר כזה
בקטלוג הוא מכירה שתיכשל בקופה.

### 2.11 מאפיינים (`pa_*`)

מאפייני WooCommerce הם taxonomies בשם `pa_<name>`. הם נכנסים ל-
`products.attributes` כ-jsonb ולא לטבלה נפרדת, כי `attribute_definitions`
ו-`category_attributes` הן חלק מ-030 שטרם הוחלה:

```json
{ "pa_color": ["אדום", "כחול"], "pa_size": ["M"] }
```

כשה-030 תוחל, המרה מ-jsonb לטבלאות היא query, לא ייבוא חוזר.

### 2.12 הזמנות ולקוחות: ארכיון בלבד

לא מיובאים ל-`public.*`. הנימוק שנקבע במסמך הישן נשאר בתוקף במלואו,
ומתחזק משתי עובדות נוספות שנמדדו:

1. הכלכלה החדשה (`platform_percent` פר-מוצר, snapshot ל-`order_items`)
   לא ניתנת לשחזור רטרואקטיבי. הזמנה מיובאת תיכנס לדוחות עם אחוס שלא
   היה קיים בזמן המכירה, וזה בדיוק מה ש-C10 אוסר.
2. `orders.user_id` מפנה ל-`profiles`, ולקוח מיובא הוא לקוח שלא נתן
   הסכמה. שער 20 (`no_imported_marketing_consent`) חוסם כל שורה כזאת.

הם יושבים ב-`wp_import.orders_archive` / `customers_archive`, service_role
בלבד, לצורכי הנהלת חשבונות ותמיכה. **סיסמאות לעולם לא נכנסות**: שער 19
מכשיל את הריצה אם hash של וורדפרס (`$P$`, `$wp$`, `$2y$`) הגיע ל-staging.

---

## 3. צינור התמונות אל R2

### 3.1 למה R2 ולא Supabase Storage

הריפו כבר מכריע בזה בקוד. `src/lib/storage/r2.ts` קיים, חותם presigned
PUT ב-SigV4 דרך Web Crypto בלי AWS SDK, ו-`next.config.ts` כבר מתיר
`*.r2.dev` ו-`*.kenyonexpress.co.il` ב-`images.remotePatterns`. שלוש
סיבות מעבר לזה:

1. אין דמי egress ב-R2. קטלוג עם תמונות הוא ברובו קריאה, וזה הפריט
   שגדל הכי מהר בחשבון.
2. ‏`R2_PUBLIC_BASE_URL` מצביע ל-`cdn.kenyonexpress.co.il`, כלומר
   התמונות יושבות על הדומיין שלנו. קישור תמונה שמצביע ל-
   `<project>.supabase.co` נשבר ביום שמחליפים פרויקט Supabase, וזה בדיוק
   מה שמסמך התפעול מתכנן (פרויקט פרודקשן חדש).
3. הפרדת גורל: נפילה של Supabase לא צריכה להוריד את התמונות.

‏Supabase Storage נשאר כ-fallback ש-`requestUploadUrl` כבר מממש כשאין
env של R2. ההגירה תרוץ עם R2 מוגדר; ריצה בלי הוא מצב פיתוח.

### 3.2 גילוי המקורות

```sql
-- MySQL: כל התמונות של כל המוצרים, בסדר, כולל הגלריה
SELECT p.ID AS wp_product_id, 0 AS position, a.guid AS src,
       am.meta_value AS alt
FROM wp_posts p
JOIN wp_postmeta th ON th.post_id = p.ID AND th.meta_key = '_thumbnail_id'
JOIN wp_posts a     ON a.ID = th.meta_value AND a.post_type = 'attachment'
LEFT JOIN wp_postmeta am ON am.post_id = a.ID
                        AND am.meta_key = '_wp_attachment_image_alt'
WHERE p.post_type = 'product'
UNION ALL
SELECT p.ID, n.n + 1, a.guid, am.meta_value
FROM wp_posts p
JOIN wp_postmeta g ON g.post_id = p.ID AND g.meta_key = '_product_image_gallery'
JOIN (SELECT 0 n UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4
      UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8) n
  ON n.n < (LENGTH(g.meta_value) - LENGTH(REPLACE(g.meta_value, ',', '')) + 1)
JOIN wp_posts a ON a.ID = TRIM(SUBSTRING_INDEX(
      SUBSTRING_INDEX(g.meta_value, ',', n.n + 1), ',', -1))
LEFT JOIN wp_postmeta am ON am.post_id = a.ID
                        AND am.meta_key = '_wp_attachment_image_alt';
```

`a.guid` הוא ה-URL המקורי. **הוא לא אמין כנתיב קובץ**: אם האתר עבר
דומיין, ה-guid מצביע לדומיין הישן. הנתיב האמיתי הוא
`wp-content/uploads/` + `_wp_attached_file` meta:

```sql
SELECT post_id, meta_value AS rel_path
FROM wp_postmeta WHERE meta_key = '_wp_attached_file';
```

בייבוא מ-dump קוראים מהדיסק (`./wp-uploads/<rel_path>`), לא מהרשת. זה
מהיר פי עשרות ולא תלוי בשרת שאולי כבר כבוי.

### 3.3 השלבים

```text
לכל מקור תמונה:
  1. קריאת בייטים. מהדיסק (dump) או HTTP עם throttle (REST).
     אימות content-type ו-magic bytes. קובץ שאינו תמונה = דילוג + ממצא.
  2. sha256(bytes) -> content_hash.
     חיפוש ב-wp_import.media לפי content_hash.
     נמצא -> שימוש חוזר במפתחות הקיימים. אין המרה, אין העלאה.
  3. המרה עם sharp, שלוש רזולוציות + מקור:
       full:  max width 1600, WebP q80
       card:  max width 800,  WebP q80   (גריד המוצרים)
       thumb: max width 320,  WebP q75   (עגלה, חיפוש)
       og:    1200x630 cover, WebP q80   (שיתוף ל-WhatsApp)
     strip EXIF. שמירת width/height המקוריים.
  4. מפתחות, מהאש בלבד, מפוצלים לפי שתי התווים הראשונים:
       wp/<ab>/<hash>.webp
       wp/<ab>/<hash>.card.webp
       wp/<ab>/<hash>.thumb.webp
       wp/<ab>/<hash>.og.webp
  5. HEAD ל-R2. קיים עם אותו גודל -> דילוג על ההעלאה.
     אחרת PUT דרך presigned URL.
  6. רישום ב-wp_import.media:
     (content_hash, wp_attachment_id, keys, width, height, bytes, alt)
```

**למה המפתח הוא ה-hash ולא מזהה המוצר.** אותה תמונה משמשת כמה מוצרים
בקטלוגים אמיתיים. מפתח מבוסס-מוצר שומר את אותם בייטים פעם לכל מוצר,
וה-dedup חוסך רק המרה. המחיר של המפתח מבוסס-ההאש: **אובייקט אחד שייך
לכמה מוצרים, ולכן מחיקת מוצר לעולם לא מוחקת אובייקט.** ניקוי מקום הוא
GC נפרד שסופר הפניות.

### 3.4 עמידות

- מקבילות: 4 המרות במקביל (‏sharp הוא CPU-bound), 6 העלאות במקביל.
- ‏retry: ‏500ms, 1s, 2s, 4s, 8s. חמישה נסיונות. כיבוד `Retry-After`.
- ‏checkpoint אחרי כל 50 תמונות ל-`wp_import.media`. קריסה ממשיכה מהתמונה
  ה-51, לא מאפס.
- תמונה שנכשלה חמש פעמים נרשמת כ-`media_failed` ומוצר שכל תמונותיו נכשלו
  יורד ל-`draft`. מוצר בלי תמונה בקטלוג הוא מוצר שלא נמכר.

### 3.5 מבנה ה-jsonb שנכתב ל-`products.images`

```json
[
  {
    "url":       "https://cdn.kenyonexpress.co.il/wp/9f/9f8a...c1.webp",
    "card_url":  "https://cdn.kenyonexpress.co.il/wp/9f/9f8a...c1.card.webp",
    "thumb_url": "https://cdn.kenyonexpress.co.il/wp/9f/9f8a...c1.thumb.webp",
    "og_url":    "https://cdn.kenyonexpress.co.il/wp/9f/9f8a...c1.og.webp",
    "alt":       "טקסט חלופי בעברית",
    "width":     1600,
    "height":    1200,
    "sha256":    "9f8a...c1",
    "position":  0
  }
]
```

`position: 0` היא התמונה הראשית: היא שנכנסת לגריד, ל-`og:image` ול-
JSON-LD. `alt` ריק הוא ממצא `warn` ופגיעה בנגישות (LEG-03), לא שגיאה.

הכתיבה היא ל-`products.images` (jsonb) **וגם** ל-`product_images` (31
שורות חיות, RLS ציבורי לקריאה). שתי הצורות קיימות בקוד היום. אותו נימוק
של 2.6: איחוד הוא מיגרציית נתונים, לא תנאי לייבוא.

---

## 4. מלאי ה-URL ו-301 לכל slug ישן

### 4.1 העיקרון

‏SEO הוא הנכס היקר ביותר שעובר בהגירה, והוא חי בכתובות. הכלל:

> אף URL שהיה מאונדקס לא מחזיר 404. לעולם.

שלוש תוצאות חוקיות בלבד לכל URL ישן: **200** (אותו slug נשמר), **301**
(עבר, עם יעד רלוונטי), **410** (הוסר בכוונה, gone). ‏404 הוא באג.

`302` אסור לחלוטין בהגירה: הוא אומר לגוגל "זמני", וההעברה של דירוג לא
מתבצעת. `308` אסור כי הוא לא הצורה שמנועי חיפוש מטפלים בה כהעברה
קבועה של דירוג באותה ודאות.

### 4.2 חוקי ה-slug

1. ברירת מחדל: `products.slug = wp.post_name`, זהה בדיוק.
2. **‏slug עברי מקודד.** ‏`post_name` בוורדפרס עברי הוא percent-encoded
   (`%d7%9e%d7%95%d7%a6%d7%a8`). מפענחים ל-UTF-8, מנרמלים NFC, ומאחסנים
   את הצורה המפוענחת. גוגל מאנדקס את שתי הצורות כאותו URL.
3. **מעבר ל-לטינית** (‏R20 במסמך האב): אם `slug_overrides.csv` מספק slug
   לטיני, הוא היעד, וה-slug העברי מקבל 301 אליו. בלי הקובץ ה-slug העברי
   נשמר כמות שהוא. **לא ממציאים תעתיק אוטומטי**: תעתיק שגוי הוא URL
   מכוער לנצח.
4. התנגשות: השני מקבל סיומת דטרמיניסטית (`-2`, `-3`) לפי סדר `wp_id`
   עולה, כדי שריצה חוזרת תיתן את אותה תוצאה.
5. ‏`categories.slug` באותם כללים.

### 4.3 טבלת צורות ה-URL

וורדפרס מייצר יותר צורות ממה שרוב תוכניות ההגירה סופרות. כולן חייבות
שורה:

| צורת URL ישנה | תוצאה | יעד |
|---|---|---|
| `/product/<slug>/` | 301 | `/product/<slug>` (בלי סלאש) |
| `/product/<slug>` | 200 או 301 | לפי 4.2 |
| `/<parent-cat>/<slug>/` (permalink עם קטגוריה) | 301 | `/product/<slug>` |
| `/shop/<slug>/` | 301 | `/product/<slug>` |
| `/?p=<wp_id>` | 301 | `/product/<slug>` |
| `/?product=<slug>` | 301 | `/product/<slug>` |
| `/?post_type=product&p=<id>` | 301 | `/product/<slug>` |
| `/product-category/<slug>/` | 301 | `/category/<slug>` |
| `/product-category/<parent>/<child>/` | 301 | `/category/<child>` |
| `/product-tag/<slug>/` | 301 | `/products?tag=<slug>` או 410 |
| `/shop/` | 301 | `/products` |
| `/cart/` | 301 | `/cart` |
| `/checkout/` | 301 | `/checkout` |
| `/my-account/` | 301 | `/account` |
| `/my-account/orders/` | 301 | `/account/orders` |
| `/wp-json/*` | 410 | (ה-API הישן מת) |
| `/wp-admin/*`, `/wp-login.php` | 410 | |
| `/feed/`, `/*/feed/`, `/comments/feed/` | 410 | |
| `/?s=<query>` | 301 | `/products?q=<query>` |
| `/page/<n>/` | 301 | `/products?page=<n>` |
| `/wp-content/uploads/<path>` | 301 | ה-URL של R2, לפי `wp_import.media` |
| מוצר ב-`trash` | 410 | |
| מוצר שנבחר לא לייבא | 410 | |

`/wp-content/uploads/*` היא השורה שהכי קל לשכוח והכי כואבת: תמונות
מאונדקסות ב-Google Images, וקישורים חיצוניים מצביעים אליהן ישירות.

### 4.4 שלושה מקורות ל-URL, לא אחד

מלאי שנבנה מ-sitemap בלבד מפספס כל URL שנמחק ועדיין מאונדקס:

| מקור | מה הוא נותן | חובה? |
|---|---|---|
| `sitemap_index.xml` + ה-sitemaps הבנים | מה שהאתר מצהיר עליו היום | כן |
| ‏Search Console, דוח Pages, 16 חודשים, CSV | מה שגוגל **באמת** מכיר, כולל מחוקים | **כן. חוסם.** |
| `wp_postmeta._wp_old_slug` | כל slug שהפוסט החזיק בעבר | כן |
| ‏`.htaccess` / nginx | 301 היסטוריים שכבר קיימים | כן, לשרשור (4.6) |
| ‏access log של 30 יום | ‏URL שמקבלים תעבורה מקישורים חיצוניים | מומלץ |

```sql
-- MySQL: כל slug ישן שוורדפרס שמר
SELECT p.ID AS wp_id, p.post_name AS current_slug, m.meta_value AS old_slug
FROM wp_posts p
JOIN wp_postmeta m ON m.post_id = p.ID AND m.meta_key = '_wp_old_slug'
WHERE p.post_type IN ('product','page','post');
```

הכל נכנס ל-`wp_import.url_inventory`, שהוא **מקור האמת של הכיסוי**. שער
14 דורש 100% החלטה: אפס שורות ב-`url_inventory` בלי `decision`.

### 4.5 הטבלה: `seo_redirects`

**היא לא קיימת. זה החוסם הפתוח האחרון בחצי ה-SEO של ה-cutover.**
המספר הפנוי הבא ברצף הוא **095** (‏094 היא `settlement_events`).

```sql
-- supabase/migrations/095_seo_redirects.sql
create table if not exists public.seo_redirects (
  id           uuid primary key default gen_random_uuid(),
  source_path  text     not null,
  target_path  text     not null,
  status_code  smallint not null default 301
                 check (status_code in (301, 410)),
  entity_type  text check (entity_type in ('product','category','page','media','other')),
  wp_id        bigint,
  hits         bigint   not null default 0,
  last_hit_at  timestamptz,
  is_active    boolean  not null default true,
  created_at   timestamptz not null default now(),
  constraint seo_redirects_source_unique unique (source_path),
  constraint seo_redirects_410_has_no_target
    check (status_code <> 410 or target_path = ''),
  constraint seo_redirects_no_self_loop
    check (source_path <> target_path)
);

create index if not exists seo_redirects_active_idx
  on public.seo_redirects (source_path) where is_active;

alter table public.seo_redirects enable row level security;

-- קריאה ציבורית: ה-proxy קורא בלי סשן, וכתובת ישנה אינה סוד.
create policy seo_redirects_public_read on public.seo_redirects
  for select to public
  using (is_active);

-- אין policy כתיבה. הייבוא והאדמין כותבים דרך service_role בלבד.
```

שני האילוצים האחרונים הם הגנה מפני שני הבאגים שמפילים הגירות: יעד
שנכתב בטעות על שורת 410, ולולאת 301 אל עצמה שגורמת ל-
`ERR_TOO_MANY_REDIRECTS` על דף שהיה עובד.

חוזה הנרמול, חייב להיות זהה בכתיבה ובקריאה:

```text
1. הסרת סכימה ו-host
2. lowercase
3. percent-decode ל-UTF-8, ואז NFC normalize
4. הסרת סלאש סוגר (למעט "/")
5. הסרת query string, אלא אם המקור הוא query-only
   (?p=, ?product=, ?s=) שנשמר ומותאם בנפרד
6. הסרת fragment
```

### 4.6 שרשור: 301 ישן שכבר קיים

ב-`.htaccess` של אתר ותיק יש 301 היסטוריים (`/old-name/` אל
`/product/x/`). אם משאירים אותם כשרשרת, המשתמש מקבל שני 301 והדירוג
מדולל.

**כל שרשרת מקופלת לקפיצה אחת.** ‏`/old-name/` נכתב ישירות אל היעד
הסופי החדש. שער 16 מאמת: אפס שורות שבהן `target_path` של שורה אחת הוא
`source_path` של שורה אחרת פעילה.

### 4.7 האכיפה ב-`src/proxy.ts`

**היום `src/proxy.ts` לא מבצע חיפוש redirect בכלל.** הוא מרענן סשן,
מגן על נתיבים, ומייצר `ke_session_id`. הוספת ה-lookup היא משימת קוד
חוסמת ל-cutover.

הכרעה 1.45 של מסמך האב מחייבת: **אין `redirects()` ב-`next.config.ts`.**
הוא מחזיר 308, ומפצל את מקור האמת לשני מקומות. הכל ב-`seo_redirects`,
נאכף ב-proxy.

```ts
// src/proxy.ts, בראש ה-handler, לפני עבודת הסשן
const redirect = await lookupRedirect(normalizePath(request.nextUrl.pathname))
if (redirect) {
  if (redirect.status_code === 410) {
    return new NextResponse(null, { status: 410 })
  }
  const url = request.nextUrl.clone()
  url.pathname = redirect.target_path
  url.search = ''
  return NextResponse.redirect(url, 301)
}
```

**למה לפני הסשן.** ‏`supabase.auth.getUser()` הוא round-trip רשת בכל
בקשה. כתובת ישנה לא צריכה סשן, וגוגל שסורק 4,000 URL ישנים לא צריך
4,000 רענוני טוקן.

המפה נטענת ל-in-memory Map ב-cold start ומתרעננת כל 5 דקות. גודל ריאלי:
כמה אלפי שורות של שני שדות, כלומר מאות קילובייטים. אין קריאת Postgres
בנתיב החם.

`hits` ו-`last_hit_at` מתעדכנים ב-batch אסינכרוני כל דקה, לא בבקשה
עצמה. הם מה שמאפשר לענות על "האם 301 שכתבנו לפני חודשיים עדיין מקבל
תעבורה", וזה הקלט להחלטה מתי אפשר לכבות שורה.

---

## 5. ה-ETL: שישה שלבים

### 5.1 הצינור

```
extract -> transform -> load-staging -> media -> project -> validate
```

מימוש קיים ב-`scripts/wp-import/`. הטבלה למטה היא החוזה של כל שלב: מה
הוא קורא, מה הוא כותב, ומה שער הכניסה שלו.

| # | שלב | קובץ | קורא | כותב | נוגע ב-`public.*` | שער כניסה |
|---|---|---|---|---|---|---|
| 1 | extract | `01-extract.mjs` | ‏WC REST או dump משוחזר | `wp_import/raw/` | לא | יש credentials או dump |
| 2 | transform | `02-transform.mjs` | `raw/` | `normalized/` | לא | ‏raw שלם, `X-WP-TotalPages` הושלם |
| 3 | load-staging | `03-load-staging.mjs` | `normalized/` | `wp_import.*` | לא | ‏032 + 057 מוחלות |
| 4 | media | `06-media-sync.mjs` | ‏staging + uploads | ‏R2 + `wp_import.media` | לא | ‏env של R2 מוגדר |
| 5 | project | `04-project-public.mjs` | `wp_import.*` | `categories`, `products`, `seo_redirects` | **כן** | ‏4 עבר, שערי 1-10 ירוקים |
| 6 | validate | `05-validate.mjs` | הכל | `wp_import/reports/` | לא | תמיד רץ |

**‏transform הוא פונקציה טהורה.** אין רשת, אין DB. זה מה שהופך את כל
התוכנית לניתנת לסקירה לפני שנכתב משהו, וזאת הסיבה שה-dry run שווה
קריאה.

### 5.2 שני מנעולי הכתיבה

```bash
# Terminal:
WP_IMPORT_ALLOW_WRITES=1 node scripts/wp-import/run.mjs --apply
```

‏dry run הוא ברירת המחדל. כתיבה דורשת **שניהם**. מנעול אחד הוא מרחק
של טעות הקלדה מייבוא חי; שניים לא נדרכים יחד בטעות.

ריצה יבשה מבצעת כל קריאה, כל טרנספורם, כל הורדת תמונה, כל המרה וכל
שער, ופולטת את התוכנית המדויקת שהייתה מוחלת. אותו code path בשני
המצבים, כלומר התצוגה המקדימה מילולית ולא משוערת.

### 5.3 אידמפוטנטיות

מפתח אחד, בכל מקום:

```
external_id = wp:<entity>:<wp_id>
```

טבלאות staging עושות upsert על המפתח הטבעי של וורדפרס (`wp_post_id`,
`wp_term_id`). טבלאות `public` עושות upsert על ה-uuid שיושב ב-
`wp_import.id_map`, שנטבע פעם אחת במפגש הראשון ונשמר:

```sql
create table if not exists wp_import.id_map (
  entity       text   not null check (entity in
                 ('product','category','image','supplier','redirect')),
  wp_id        bigint not null,
  target_id    uuid   not null,
  content_hash text,
  first_seen   timestamptz not null default now(),
  primary key (entity, wp_id)
);
```

ריצה חוזרת מעדכנת את השורה שהיא יצרה בפעם הקודמת, לא מטביעה שנייה.
המפתח נרשם על כל שורת `migration_log`, כך שאפשר **להוכיח** שריצה חוזרת
פגעה באותן שורות.

### 5.4 אצווה, טרנזקציה, ותאימות בין המקורות

- קטגוריות: אצווה אחת, טרנזקציה אחת. העץ חייב להיות שלם או לא להיות.
- מוצרים: אצוות של 200. כל אצווה היא טרנזקציה.
- ‏redirects: אצווה אחת אחרי המוצרים.

השוואת REST מול dump (כשיש שניהם) היא **שער, לא הערה**. פער בשדה כספי
או ב-slug בין המקורות מעיד שאחד מהם עבר מניפולציה של plugin בזמן
ההגשה. שער 21.

### 5.5 `migration_log`

`wp_import.migration_log` הוא append-only: שורה אחת לכל
(batch, stage, entity, wp_id), עם הפעולה
(`insert`/`update`/`noop`/`skip`/`fail`/`delete`), דגל `dry_run`, תמונת
לפני ואחרי, וקוד השגיאה. תיקון שורה היה הורס את שרשרת הראיות; תיקונים
הם שורות חדשות.

```sql
-- Supabase > SQL Editor:
SELECT * FROM wp_import.v_migration_log_summary WHERE batch_id = '<uuid>';
SELECT * FROM wp_import.v_migration_failures    WHERE batch_id = '<uuid>';
```

כל פעולה משוכפלת גם ל-`wp_import/logs/<batch>.jsonl` ללא תנאי, כולל
ריצות יבשות. זה הקובץ שקוראים כשה-DB בכוונה לא נגע.

### 5.6 גלגול לאחור

```sql
-- Supabase > SQL Editor:
SELECT * FROM wp_import.fn_rollback_batch('<batch-uuid>');                      -- תוכנית
SELECT * FROM wp_import.fn_rollback_batch('<batch-uuid>', p_dry_run => false);  -- ביצוע
```

יבש כברירת מחדל. מוחק רק שורות שהאצווה **הכניסה**, בסדר ילד-לפני-הורה,
מתוך רשימת טבלאות מקובעת, מנקה את `id_map` כדי שריצה חוזרת תטביע נקי,
ורושם את הביטול עם `stage = 'rollback'`.

שורות שהאצווה רק **עדכנה** מדווחות לסקירה ידנית ולעולם לא מוחזרות
אוטומטית: ביטול עדכון הוא שחזור `migration_log.before_data`, וזו החלטה
של אדם.

**אובייקטים ב-R2 לעולם לא נמחקים בגלגול לאחור.** הם content-addressed,
משותפים בין מוצרים, ולא עולים כלום להשאיר. ‏GC נפרד סופר הפניות.

---

## 6. אימות שלמות: 21 שערים

`05-validate.mjs` מריץ את כולם וכותב
`wp_import/reports/validation-<batch>.{json,md}` ושורה ב-
`wp_import.validation_reports`.

חוק ברזל: שער שאי אפשר להעריך (אין DB, אין דאטה) מדווח `unknown`
ו**אינו עובר**. שתיקה היא לא הצלחה.

| # | שער | חומרה | איך נמדד |
|---|---|---|---|
| 1 | ‏parity מוצרים | error | ספירת `products` = ספירת WP פחות trash/auto-draft |
| 2 | ‏parity קטגוריות | error | ספירת `categories` = ספירת `product_cat` פחות uncategorized |
| 3 | ‏FK קטגוריה | error | אפס `category_id` שמצביע לשורה חסרה |
| 4 | ‏FK ספק | error | אפס `supplier_id` NULL או מצביע לחסר |
| 5 | ‏slug ייחודי | error | `count(*) = count(distinct slug)` בשתי הטבלאות |
| 6 | ‏slug לא ריק | error | אפס slug ריק או NULL |
| 7 | מחיר על active | error | אפס `active` עם `price_ils` NULL או <= 0 |
| 8 | הנחה כוזבת | error | אפס `compare_at_price_ils <= price_ils` |
| 9 | זוגות עמודות | error | `price_ils = kenyon_price`, `platform_percent = commission_percent`, `platform + supplier_split = 100` |
| 10 | ‏commission_type | error | תואם ל-`type` לפי אילוץ 093 |
| 11 | תוקף קופון | error | אפס `type='coupon'` ו-`status='active'` בלי `coupon_expiry_days` |
| 12 | ‏checksum תמונות | error | לכל `images[].sha256` יש שורה ב-`wp_import.media`, ו-HEAD ל-R2 מחזיר 200 עם אותו גודל |
| 13 | אין `wp-content` שנשאר | error | אפס `description_he` שמכיל `wp-content/uploads` |
| 14 | כיסוי redirects | error | אפס שורות ב-`url_inventory` בלי `decision` |
| 15 | ‏301 מגיע ל-200 | error | דגימה של 200 שורות: כל יעד מחזיר 200 באמת |
| 16 | אין שרשרת 301 | error | אפס `target_path` שהוא גם `source_path` פעיל |
| 17 | ספק סינתטי | error | אפס מוצרי קופון `active` על הספק הסינתטי |
| 18 | תמונה ראשית | warn | כל `active` עם לפחות תמונה אחת |
| 19 | אין חומר סיסמאות | **error** | אפס hash של WP ב-staging. אירוע אבטחה, לא באג |
| 20 | אין הסכמה שיווקית | **error** | כל מיובא עם `marketing_* = false` |
| 21 | ‏REST מול dump | warn | פער בשדה כספי או slug בין המקורות |

בנוסף, שלוש בדיקות עיניים שאף שער לא מחליף:

1. 25 המוצרים המובילים בתעבורה לפי GSC, diff שדה-שדה מול המקור.
2. 25 מוצרים אקראיים, נפתחים בדפדפן: תמונה, מחיר, RTL, כפתור קנייה.
3. 20 כתובות ישנות אקראיות מ-GSC, נלחצות ידנית ומגיעות ליעד.

תוצאות השערים נכתבות לדוח ריצה. שער `error` שנכשל **חוסם cutover**.

---

## 7. סדר הביצוע מהיום ועד ה-flip

| # | צעד | תלוי ב | חוסם |
|---|---|---|---|
| W0 | קבלת גישות: SSH/DB לוורדפרס, ‏GSC, ‏R2 | אין | הכל |
| W1 | ‏dump מלא + uploads, שחזור לוקאלי | W0 | W2 |
| W2 | סקר `meta_key` (2.3) ומילוי `metaKeyMap` | W1 | W6 |
| W3 | ייצוא GSC 16 חודשים + sitemap + `.htaccess` | W0 | W8 |
| W4 | החלת 032 + 057 על dev | אין | W6 |
| W5 | **כתיבת והחלת `095_seo_redirects.sql`** | אין | W8 |
| W6 | ריצה יבשה מלאה, קריאת התוכנית | W2, W4 | W7 |
| W7 | סנכרון media ל-R2 | W6 | W9 |
| W8 | בניית `url_inventory` משלושת המקורות + החלטות | W3, W5 | W9 |
| W9 | הקרנה ל-dev (`--apply`) | W7, W8 | W10 |
| W10 | 21 השערים + שלוש בדיקות העיניים | W9 | W11 |
| W11 | **חיווט lookup ב-`src/proxy.ts`** | W5 | W12 |
| W12 | ‏baseline GSC ‏T-7 (‏G1 של מסמך הצמיחה) | W3 | W14 |
| W13 | הקפאת קטלוג בוורדפרס ‏T-48h | W10 | W14 |
| W14 | ‏cutover DNS (‏TTL 300) | W11, W12, W13 | - |
| W15 | ניטור 30 יום: 404, hits, כיסוי ב-GSC | W14 | - |

**‏W5 ו-W11 הם החוסמים האמיתיים.** בלי הטבלה ובלי ה-lookup, כל 301
שהצינור מחשב הוא שורה בקובץ JSON שאף אחד לא מגיש. אפשר לייבא קטלוג בלי
הם; אי אפשר לעשות cutover.

וורדפרס נשאר חי שבועיים אחרי ה-flip, כמו שמסמך התפעול מחייב. הגלגול
לאחור הוא DNS, לא DB.

---

## 8. פערים פתוחים

| # | פער | חומרה | הבעלים |
|---|---|---|---|
| WP-1 | ‏`seo_redirects` לא קיימת (‏095 טרם נכתבה) | **חוסם cutover** | ‏DB |
| WP-2 | ‏`src/proxy.ts` לא מבצע lookup | **חוסם cutover** | קוד |
| WP-3 | ‏`categories` ריקה: אין עץ בפרודקשן | גבוה | ייבוא |
| WP-4 | ‏61 מוצרים בלי `platform_percent` | גבוה | אדמין |
| WP-5 | מפתחות meta של קופון לא ידועים (‏2.3) | גבוה | ‏W2 |
| WP-6 | אין `vendor_map`: כל המוצרים לספק סינתטי | בינוני | עסקי |
| WP-7 | שני זוגות עמודות כפולות (‏2.6) | בינוני | מיגרציית נתונים |
| WP-8 | וריאציות לא מיובאות | בינוני | מחזור שני |
| WP-9 | ‏R2 מעולם לא נבדק מול bucket אמיתי | בינוני | ‏W7 |
| WP-10 | אף שלב לא רץ מול החנות החיה | גבוה | ‏W6 |

---

מסמכים קשורים:
`docs/ARCHITECTURE-WP-DATA-MIGRATION.md` (החוזה),
`docs/ARCHITECTURE-SEO-SITEMAP.md` (מה קורה ל-URL אחרי שהוא חדש),
`docs/ARCHITECTURE-OPS.md` (‏DNS, גיבויים, cutover),
`docs/ARCHITECTURE-ROADMAP.md` (איפה מסלול W נפגש עם השאר).
