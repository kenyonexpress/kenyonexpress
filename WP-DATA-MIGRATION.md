# WP-DATA-MIGRATION: תוכנית הפעלה למיגרציית הדאטה מ-WordPress ל-Supabase

תאריך: 2026-07-23. ענף: `phase6/complete-architecture`. מעמד: design only, אפס יישום.

## מעמד מול מסמכים קיימים

זהו מסמך ההפעלה (runbook) התמציתי והמאוחד של מסלול המיגרציה. הוא נשען על
שני מסמכי התכנון הקיימים ולא מחליף אותם:

- `ARCHITECTURE-WP-MIGRATION.md` (2026-07-20) — התכנון המחייב מול סכימת 042
  (כסף באגורות, `commission_ledger`, `cashback_percent`). בכל סתירה על החלטת
  תכנון, המסמך ההוא גובר.
- `docs/ARCHITECTURE-WP-DATA-MIGRATION.md` (2026-07-17) — הכרעות M1-M17.

תשתית DB נלווית: `supabase/migrations/032_wp_import_staging.sql` — סכימת
`wp_import` (12 טבלאות, `id_map`, `import_batches`, `issues`, `media`,
`url_inventory`), לא חשופה ל-PostgREST, מוחלת רק דרך MCP `apply_migration`.
המסמך הזה מאשרר את 032 כמות שהיא.

המסמך הזה מוסיף ערך במקום אחד: הוא ממיר את התכנון ל-runbook הרצה עם checklist
של go/no-go, שאילתות אימות מוחשיות, וטבלת redirect מלאה. הוא לא ממציא החלטות
חדשות; כל החלטה מפנה למקורה.

## עקרונות על (ירושה, בתוקף)

1. **אפס איבוד דאטה.** כל ביט מהאתר הישן נשמר לצמיתות ב-`wp_import` (כולל
   `raw_meta` jsonb לכל ישות). רק תת-קבוצה נקייה מוקרנת ל-`public`.
2. **ה-DB החדש לא יורש חוב.** שורה שמפרה constraint או סמנטיקה כספית לא נכנסת
   ל-`public`; היא נרשמת ב-`wp_import.issues` ונחסמת.
3. **הכול idempotent** דרך `wp_import.id_map (entity, wp_id) -> new_id`.
   הרצה חוזרת = upsert, לא כפילות.
4. **הסכימה החיה היא האמת.** קיים drift מול קבצי המיגרציות (למשל
   `commerce.ts` עדיין מגדיר `price_ils numeric(10,2)` בעוד ההכרעה המחייבת
   היא אגורות `integer`; ראה 1.3). בדיקות קדם רצות מול ה-DB החי.
5. **חוק הספאם 30א.** אף לקוח מיובא לא נכנס `opted_in=true`.

---

## 1. מלאי דאטה — כל ישות למיגרציה

היקף ידוע (בדיקה חיה 2026-07-09): WordPress 6.8.1 + WooCommerce + Elementor +
Yoast; 46 מוצרים (44 simple, 1 variable), 9 קטגוריות מוצר, 26 עמודים; מחירים
בשקלים שלמים (`currency_minor_unit=0`); 4 מוצרים בלבד עם SKU. 324 ביקורות
(נזנחות, M17). סדר הגודל הקטן מאשר one-shot חזרתי עם spot-check בכיסוי גבוה.

### 1.1 טבלת המלאי — מקור WP → יעד → טרנספורם

| ישות | מקור WP | staging | יעד public | מיפוי שדות עיקרי | טרנספורמים |
|---|---|---|---|---|---|
| מוצרים | `wp_posts` (post_type=`product`), `wp_postmeta` | `wp_import.products` | `public.products` | `post_title`→`title_he`; `post_name`→`slug`; `post_content`→`description_html`; meta `_price`/`_regular_price`/`_sale_price`→מחיר; `_sku`→`sku`; `_stock`/`_stock_status`→מלאי; `_thumbnail_id`→תמונה ראשית | מחיר לאגורות `integer` (1.3); slug percent-decode ל-UTF-8 עברי; sanitize HTML; ברירת supplier דיפולטי |
| וריאציות | `wp_posts` (post_type=`product_variation`), `wp_postmeta` | `wp_import.products` (`wp_parent_id`) | `public.products` או variant | attribute meta `attribute_pa_*`→וריאציה; מחיר per-variation | קישור ל-parent דרך `id_map(entity='product')`; דיפולט לירושת מחיר parent |
| קטגוריות | `wp_terms` + `wp_term_taxonomy` (`taxonomy='product_cat'`) + `wp_termmeta` | `wp_import.categories` | `public.categories` | `name`→`name_he`; `slug`→`slug`; `parent`→`parent_id`; `description`; `wp_termmeta` thumbnail | percent-decode slug; בניית עץ hierarchy אחרי טעינה שטוחה; קישור parent דרך `id_map` |
| שיוך מוצר-קטגוריה | `wp_term_relationships` | (נגזר) | `public.product_categories` | `object_id`→`product_id`; `term_taxonomy_id`→`category_id` | תרגום שני צדדים דרך `id_map`; `sort_order` מ-`term_order` |
| קופונים / דילים | `wp_posts` (post_type=`shop_coupon`), `wp_postmeta` | `wp_import.coupons` | `public.coupon_deals` / מוצר coupon | `post_title`→קוד; meta `discount_type`/`coupon_amount`/`expiry_date`/`usage_limit`/`product_ids` | סכום לאגורות; תאריך תפוגה ל-`timestamptz`; שיוך מוצרים דרך `id_map` |
| לקוחות | `wp_users` + `wp_usermeta` | `wp_import.customers` | `auth.users` + `public` profile | `user_email`→`email`; `display_name`; meta `billing_phone`/`first_name`/`last_name`/כתובות | ראה סעיף 4 (סיסמאות לא עוברות); טלפון ל-E.164; `opted_in=false` תמיד |
| כתובות | `wp_usermeta` (`billing_*`, `shipping_*`) | `wp_import.addresses` | טבלת addresses | `billing_address_1/2`, `billing_city`, `billing_postcode`, `billing_country` | פירוק לרשומה מובנית; קישור ל-user דרך `id_map(entity='customer')` |
| היסטוריית הזמנות | `wp_wc_orders` (HPOS) או `wp_posts` (`shop_order`) + `wp_wc_order_addresses` + `wp_woocommerce_order_items(meta)` | `wp_import.orders` + `order_items` | ארכיון קריא-בלבד (לא `public.orders` תפעולי) | סטטוס, total, currency, שורות פריט, כתובות | סכומים לאגורות; שמירה כארכיון היסטורי (חובת 7 שנים); לא מייצר commission ledger |
| מדיה | `wp_posts` (`attachment`) + קבצי `wp-content/uploads` | `wp_import.media` | Supabase Storage / R2 + URL על מוצר | `guid`/`_wp_attached_file`→URL מקור; `_wp_attachment_metadata`→ממדים | ראה סעיף 7 (הורדה, dedupe by hash, העלאה, rewrite) |
| עמודים / SEO | `wp_posts` (`page`), Yoast `sitemap_index.xml`, GSC export | `wp_import.url_inventory` | `public.seo_redirects` | permalink ישן → route חדש | ראה סעיף 5 |

### 1.2 מה לא עובר (מאושרר)

- **324 ביקורות** (`wp_comments`) — M17: נזנחות. נשמרות ב-dump, לא נטענות.
- **סיסמאות** — phpass hashes לא ניתנים להעברה ל-Supabase Auth (סעיף 4).
- **הגדרות plugin, widgets, Elementor layouts** — לא רלוונטי; העיצוב נבנה מחדש.
- **קרדיט/wallet קיים** — אם קיים plugin ארנק, יטופל בקוריישן ידני, לא בייבוא אוטומטי.

### 1.3 טרנספורם המחיר — אגורות (החלטה מחייבת)

WooCommerce מאחסן מחירים כמחרוזת עשרונית בשקלים (`_price='149.00'`, ובאתר הזה
`currency_minor_unit=0` כלומר שקלים שלמים). היעד הוא `integer` באגורות.

- המרה: `round(parse_float(_price) * 100)` → `price_agorot integer`.
- כלל: הפרסינג קורה **פעם אחת בזמן הייבוא**, לא ב-runtime. שגיאת פרסינג
  (מחרוזת ריקה, פסיק במקום נקודה, ערך שלילי) → `wp_import.issues`, השורה נחסמת.
- drift מוכר: `src/db/schema/commerce.ts` עדיין מגדיר `price_ils numeric(10,2)`.
  ה-preflight (סעיף 3.2) מריץ `\d public.products` מול ה-DB החי ומכריע לפי
  הטיפוס החי. אם החי הוא `numeric`, ההקרנה מזינה `numeric` וה-drift נרשם
  כ-issue אבל לא חוסם. אם החי הוא `integer` אגורות, מזינים אגורות.

---

## 2. אסטרטגיית חילוץ — mysqldump מלא (החלטה M1, מאושררת)

**הוכרע: `mysqldump` מלא + `rsync` של `wp-content/uploads`. לא REST, לא WXR.**

```bash
mysqldump --single-transaction --quick --default-character-set=utf8mb4 \
  --routines --triggers --hex-blob "$DB_NAME" | gzip > ke-wp-$(date +%Y%m%d).sql.gz
rsync -az user@host:/path/to/wp-content/uploads/ ./wp-uploads/
sha256sum ke-wp-*.sql.gz > ke-wp.sha256   # נכנס ל-import_batches.source_sha256
```

ה-dump נטען ל-MySQL מקומי (Docker `mysql:8`, utf8mb4) והסקריפטים שולפים ממנו
אל `wp_import`.

נימוקי הדחייה של החלופות:

- **WC REST v3** — מחזיר 401 בלי מפתחות (נבדק חי); מסנן meta לא רשום; אין
  snapshot עקבי. ה-Store API הפתוח משמש רק לאימות צולב זול בשלב הבדיקות.
- **WXR (`wp export`)** — לא מייצא הזמנות/לקוחות/וריאציות באופן מלא.
- **יתרון ה-dump** — snapshot עקבי בנקודת זמן אחת, והוא גם הגיבוי המשפטי הקבוע
  (חובת שמירה 7 שנים). אם WP-CLI קיים אצל המאחסן, `wp db export` מותר (עטיפה
  ל-mysqldump); מקור האמת הוא קובץ ה-dump.

---

## 3. צנרת ייבוא idempotent

### 3.1 ארכיטקטורה דו-שלבית

```
dump.sql.gz → [load] → wp_import.* (ארכיון מלא) → [project] → public.* (נקי)
                          |                              |
                     raw_meta jsonb                  id_map (idempotency)
```

השלב הראשון (`staging_load`) נאמן למקור — מעתיק הכול, כולל `raw_meta`. השלב
השני (`project_*`) בורר, ממיר, מאמת, ומקרין ל-`public`. הפרדה זו מאפשרת להריץ
מחדש הקרנה בלי לחזור לחלץ מ-WP.

### 3.2 preflight (`00-preflight`)

לפני כל טעינה:

1. `\d+` על כל טבלת יעד ב-`public` (products, categories, coupon_deals,
   seo_redirects) — לזהות drift טיפוסים (במיוחד מחיר, 1.3).
2. וידוא HPOS: האם `wp_wc_orders` קיים ומאוכלס, או שההזמנות ב-`wp_posts`.
3. וידוא `currency_minor_unit` מ-`wp_options`.
4. ספירות מקור: כמה `product`, `product_cat`, `shop_coupon`, `wp_users`.
   נשמרות ב-`import_batches.stats` כ-baseline לאימות (3.6).

### 3.3 טעינה (`staging_load`)

- כתיבה עם `service_role` בלבד (עוקף RLS).
- PK טבעי: `wp_post_id`/`wp_user_id` הם המפתחות — עוגני ה-idempotency.
- `INSERT ... ON CONFLICT (wp_post_id) DO UPDATE` — הרצה חוזרת מרעננת.
- כל שורה שומרת `raw_meta` jsonb מלא (אפס איבוד).

### 3.4 מעבר אימות (validation pass)

לכל ישות ב-staging, לפני הקרנה, בדיקות שכל כשל שלהן → `wp_import.issues`
(עם `severity` ו-`wp_id`), לא חריגה:

- מחיר: פרסינג תקין, > 0, לא NULL.
- slug: לא ריק אחרי decode; ייחודי (dedupe 3.5).
- קטגוריה: `parent_id` מצביע לקטגוריה קיימת (או NULL לשורש).
- לקוח: `email` תקין ולא ריק (dedupe 3.5).
- FK: כל שיוך מוצר-קטגוריה מצביע לשני צדדים שקיימים ב-`id_map`.

הקרנה חוסמת שורה שיש לה issue ב-`severity='block'`. issue `warn` עובר עם דגל.

### 3.5 כללי dedupe

- **מוצרים**: `wp_post_id` הוא המפתח היחיד; אין dedupe נוסף. slug כפול אחרי
  decode → suffix `-2` דטרמיניסטי לפי `wp_post_id` עולה, ונרשם issue.
- **קטגוריות**: dedupe לפי `slug` decoded; הראשונה (wp_id נמוך) מנצחת.
- **לקוחות**: dedupe לפי `lower(email)`. שני `wp_users` עם אותו אימייל →
  מיזוג לרשומת auth אחת, שני ה-wp_ids ממופים לאותו `new_id` ב-`id_map`.
- **מדיה**: dedupe לפי SHA-256 של תוכן הקובץ (סעיף 7).

### 3.6 dry-run ו-rollback

- **dry-run**: `import_batches.dry_run=true`. מריץ טעינה, validation, ומדפיס
  את ה-diff המתוכנן (כמה INSERT/UPDATE ל-`public`, כמה issues, כמה נחסמים)
  בלי לכתוב ל-`public`. חובה להריץ ולעבור לפני כל הקרנה אמיתית.
- **rollback ברמת batch**: כל שורה מוקרנת נושאת `batch_id`. ביטול הקרנה =
  `DELETE FROM public.<t> WHERE id IN (SELECT new_id FROM wp_import.id_map
  WHERE batch_id = $1)`, ואז מחיקת רשומות ה-`id_map` של אותו batch.
- **rollback מלא**: `wp_import` נשאר; אפשר לנקות `public` ולהקרין מחדש מ-staging
  בלי לגעת ב-WP. השלב היקר (חילוץ + טעינה) לא חוזר.

---

## 4. מיגרציית משתמשים — forced reset

phpass hashes של WordPress לא ניתנים לייבוא ל-Supabase Auth (bcrypt/scrypt).
לכן: **כל משתמש מיובא נכנס בלי סיסמה, ומופעל reset בכניסה הראשונה.**

### 4.1 יצירת המשתמשים

1. לכל `wp_import.customers` נקי (email תקין), יצירת `auth.users` דרך Supabase
   Admin API `createUser({ email, email_confirm: true, password: <random-32> })`.
   הסיסמה האקראית לעולם לא נמסרת — היא placeholder שלא ניתן לנחש.
2. רישום `id_map(entity='customer', wp_id, new_id)` — קישור wp_id ל-uuid החדש.
3. הקרנת פרופיל (שם, טלפון) ל-`public`, כולל `opted_in=false` (חוק 30א).
4. app_metadata: `{ source: 'wp_import', wp_user_id, must_reset: true }`.

### 4.2 forced-reset flow

- בהתחברות הראשונה המשתמש לא יודע סיסמה, אז המסלול היחיד הוא "שכחתי סיסמה".
- אימייל חד-פעמי בזמן ה-cutover: "העברנו את האתר, אנא אפסו סיסמה" עם קישור
  `resetPasswordForEmail`. הקישור מפנה ל-`/auth/reset`.
- לאחר איפוס מוצלח, `must_reset` מוסר מ-app_metadata.
- הזמנות היסטוריות של המשתמש (ארכיון 1.1) מקושרות אליו דרך `id_map`, כך שאחרי
  איפוס הוא רואה את ההיסטוריה שלו.

### 4.3 מיפוי מזהים

`id_map(entity='customer')` הוא הגשר. כל הפניה להיסטוריה (הזמנות, כתובות)
עוברת דרכו. משתמש שאין לו אימייל תקין לא נוצר ב-auth; ההזמנות שלו נשארות
בארכיון בלי owner (נגישות לאדמין בלבד).

---

## 5. מפת redirect — כל URL ישן → route חדש

### 5.1 מקורות ה-inventory

`wp_import.url_inventory` מאוכלס משלושה מקורות ומאוחד:

1. Yoast `sitemap_index.xml` — כל ה-URLs האינדקסיים (מקור אמת עיקרי).
2. GSC export של 12 חודשים — URLs שקיבלו traffic/impressions אמיתי (עדיפות).
3. permalinks מ-`wp_import.products`/`categories`/עמודים.

### 5.2 טבלת 301 (מיפוי דפוסים)

| דפוס URL ישן (WP) | route חדש (Next.js) | status | הערה |
|---|---|---|---|
| `/product/<slug>/` | `/p/<slug>` | 301 | slug decoded; אם slug השתנה, מיפוי דרך `id_map` |
| `/product-category/<slug>/` | `/c/<slug>` | 301 | קטגוריה |
| `/shop/` | `/` או `/catalog` | 301 | דף חנות ראשי |
| `/cart/`, `/checkout/` | `/cart`, `/checkout` | 301 | מסלולים חדשים |
| `/my-account/` (+תת) | `/account` | 301 | אזור אישי |
| `/<page-slug>/` (עמודי תוכן) | route תואם או `/` | 301 | מיפוי ידני פר עמוד (26 עמודים) |
| מוצר/עמוד שנמחק ואין לו יעד | `/` | 410 | Gone; `new_path='/'` בקונבנציית הטבלה |

### 5.3 היעד: `public.seo_redirects` + קובץ ל-Vercel

הטבלה `seo_redirects` כבר קיימת (030): `old_path` (ייחודי, מתחיל ב-`/`),
`new_path`, `status_code IN (301,302,307,308,410)`, `source='wordpress_import'`,
`hits`, `last_hit_at`.

- ההקרנה (`project_redirects`) כותבת שורה לכל URL ב-inventory, עם dedupe לפי
  `old_path` ואכיפת `old_path <> new_path` (constraint קיים `seo_redirects_no_self`).
- **קובץ נוצר ל-Vercel**: `scripts/wp-import/gen-redirects.ts` שולף מ-`seo_redirects`
  ומייצר בלוק `redirects()` ב-`next.config.ts` (או `vercel.json`) עבור ה-URLs
  בעלי ה-traffic הגבוה (top-N מ-GSC), כדי לחסוך round-trip ל-DB. השאר נפתרים
  דינמית ב-middleware מול הטבלה, עם ספירת `hits`/`last_hit_at` לניטור.
- אימות: כל URL ב-`url_inventory` חייב או להתמפות ל-301 עם יעד 200, או להיות
  410 מפורש. URL בלי החלטה = issue חוסם cutover (6.4).

---

## 6. runbook cutover

### 6.1 הכנות (T-7 ימים)

- הרצת dry-run מלא על dump טרי; אפס issues חוסמים.
- אימות מפת redirect מול crawl של האתר החי (0 קישורים שבורים).
- אימות מדיה: כל תמונת מוצר קיימת ב-Storage (סעיף 7).
- הכנת אימייל forced-reset (4.2), מאושר תוכן.
- הורדת TTL של רשומת ה-DNS ל-300s (כדי שה-switch יהיה מהיר).

### 6.2 חלון ההקפאה (freeze window)

- הודעה ללקוחות: תחזוקה מתוכננת (חלון של שעה-שעתיים, בלילה, traffic נמוך).
- **הקפאת כתיבה ב-WP**: העברת WooCommerce ל-maintenance mode (אין הזמנות
  חדשות). זה מבטיח שה-dump הסופי הוא ה-snapshot הסופי.
- לקיחת **dump סופי** (2) אחרי ההקפאה — זה המקור הקנוני ל-cutover.

### 6.3 רצף ה-cutover

1. טעינת ה-dump הסופי ל-`wp_import` (`staging_load`).
2. `project_catalog` → מוצרים, קטגוריות, שיוכים, קופונים.
3. `project_media` → אימות שכל המדיה כבר הועלתה (7); rewrite URLs.
4. `project_customers` → יצירת `auth.users` + `id_map`.
5. `project_redirects` → מילוי `seo_redirects` + generate קובץ Vercel.
6. deploy של Next.js עם ה-redirects.
7. **שאילתות אימות** (6.4).
8. אם go: החלפת רשומת ה-DNS (A/CNAME) לדומיין החדש.
9. שליחת אימיילי forced-reset.

### 6.4 שאילתות אימות (verification)

```sql
-- ספירות: staging מול baseline preflight (3.2)
SELECT count(*) FROM wp_import.products WHERE post_type='product';   -- =46
SELECT count(*) FROM public.products;                                 -- =46 (פחות blocked)
SELECT count(*) FROM public.categories;                               -- =9
-- כל issue חוסם טופל
SELECT severity, count(*) FROM wp_import.issues GROUP BY 1;           -- 0 'block' פתוחים
-- שלמות מחיר: אין מחיר 0 או NULL בהקרנה
SELECT count(*) FROM public.products WHERE price_agorot IS NULL OR price_agorot<=0;  -- =0
-- redirect: כל URL ב-inventory ממופה
SELECT count(*) FROM wp_import.url_inventory u
  LEFT JOIN public.seo_redirects r ON r.old_path=u.path
  WHERE r.id IS NULL;                                                  -- =0
-- מדיה: כל מוצר עם תמונה מצביע ל-URL תקין ב-Storage
SELECT count(*) FROM public.products WHERE image_url IS NULL;         -- מול baseline WP
```

### 6.5 go / no-go checklist

- [ ] ספירות staging = baseline preflight.
- [ ] 0 issues `severity='block'` פתוחים.
- [ ] 0 מוצרים עם מחיר NULL/≤0 ב-`public`.
- [ ] 0 URLs ב-inventory בלי redirect.
- [ ] 100% תמונות מוצר ב-Storage, 0 broken.
- [ ] deploy עבר, smoke test ידני על 5 מוצרים + checkout.
- [ ] אימייל forced-reset מוכן לשליחה.

כל תיבה לא מסומנת = no-go. ממשיכים רק כשכולן ירוקות.

### 6.6 rollback ברמת cutover

- ה-DNS עדיין עם TTL 300s → החזרה לרשומה הישנה מחזירה את WP תוך דקות.
- WP לא נגע לרעה: ההקפאה הוסרה, האתר הישן חי כפי שהיה.
- `public` מנוקה דרך rollback ברמת batch (3.6); `wp_import` נשאר.
- תנאי rollback: כשל באחת משאילתות 6.4 שלא ניתן לתקן בחלון, או תקלת deploy.

---

## 7. מיגרציית מדיה

### 7.1 batch download

- מקור: `wp-content/uploads` (כבר rsync-ד מקומית, 2) + `wp_import.media`
  (`_wp_attached_file`, `guid`).
- הורדה/קריאה של כל attachment שמשויך למוצר או קטגוריה (`_thumbnail_id`,
  `_product_image_gallery`, `wp_termmeta` thumbnail). מדיה יתומה (לא משויכת
  לישות מוקרנת) לא מועלית, רק נרשמת.

### 7.2 dedupe by hash

- לכל קובץ: SHA-256 של התוכן → `wp_import.media.content_sha256`.
- WordPress יוצר גדלים מרובים (`-150x150`, `-300x300`) של אותה תמונה. שומרים
  רק את המקור (full size); הגרסאות הנגזרות נזרקות (Next/Image מייצר מחדש).
- שני attachments עם אותו hash → קובץ יחיד ב-Storage; שניהם ממופים אליו.

### 7.3 upload ל-Storage

- יעד: Supabase Storage bucket `product-images` (מוגדר ב-020) או R2.
- מפתח דטרמיניסטי: `products/<content_sha256>.<ext>` — idempotent, הרצה חוזרת
  לא מעלה שוב (בדיקת קיום לפי key).
- העלאה עם `service_role`; המרה ל-WebP אופציונלית בזמן העלאה.

### 7.4 URL rewrite

- אחרי ההעלאה, `id_map(entity='media', wp_id=attachment_id, new_id)` +
  שמירת ה-public URL ב-`wp_import.media.storage_url`.
- ההקרנה של מוצר (`project_catalog`) קוראת את `storage_url` דרך ה-`id_map`
  וכותבת אותו ל-`public.products.image_url` / gallery.
- אזכורי `<img src>` בתוך `description_html`: regex rewrite מ-URL WP ישן
  ל-`storage_url` המתאים (lookup לפי filename ב-`media`). URL שלא נמצא → נשאר
  כפי שהוא ונרשם issue `warn` (התמונה עדיין נגישה מ-WP עד ה-DNS switch).

### 7.5 אימות מדיה

- כל מוצר עם תמונה ב-WP חייב `image_url` לא-NULL ב-`public` (6.4).
- fetch לדגימת 10 URLs → 200 OK.
- `wp_import.media` עם `storage_url` NULL אחרי הרצה = issue חוסם.

---

## נספח: מיפוי entity ב-id_map (מ-032)

`id_map.entity` מוגבל ל: `product`, `variant`, `category`, `customer`,
`address`, `order`, `order_item`, `coupon_code`, `redirect`, `media`. כל
טרנספורם במסמך הזה מתרגם מזהים דרך העמודות האלה בלבד. הוספת entity חדש דורשת
ALTER ל-CHECK ב-032.
