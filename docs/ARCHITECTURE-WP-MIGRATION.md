# ARCHITECTURE-WP-MIGRATION.md

מיגרציית נתונים מ-WordPress / WooCommerce אל Supabase (תכנון מחייב, docs בלבד).

Status: BINDING for `arch/wp-migration` (2026-07-31)
Worktree: `/Users/ofir/kenyonexpress-web/ke-arch-wp` only. **Documentation only. No application code in this commit.**
Canonical host cutover: `kenyonexpress.co.il` (אותו דומיין, DNS אחרי אימות).

Companions (hierarchy on conflict):

1. **This document** (arch/wp-migration) for scope, 33-table matrix, run order, rollback.
2. Repo root `ARCHITECTURE-WP-MIGRATION.md` (2026-07-20) for detailed field tables M/W decisions.
3. `docs/ARCHITECTURE-WP-DATA-MIGRATION.md` (catalog/REST track) only where not superseded.
4. Staging schema: `supabase/migrations/032_wp_import_staging.sql`.
5. Money / no Escrow: BUSINESS-MODEL + LEGAL-COMPLIANCE + recent arch money invariants.
6. Backups before cutover: `docs/ARCHITECTURE-BACKUP-DR.md` (Pro + offsite dump).

---

## 0. מה זה "33 טבלאות"

המספר **33** הוא ספירת טבלאות ב-`public` בפרודקשן (נמדד 2026-07-29 ב-
`docs/MIGRATION-BACKLOG.md`
), לא מספר ישויות WordPress.

| מקור | מספר | משמעות |
|---|---|---|
| `MIGRATION-BACKLOG.md` | **33** | `public` tables בפרודקשן החי |
| `docs/DB-SCHEMA.md` (2026-07-23) | 28 | תיעוד introspection ישן יותר |
| `wp_import` staging | 12–14 + views | ארכיון/staging, לא storefront |

הייבוא **לא** ממלא את כל ה-33. רובן נשארות ריקות או נבנות בריצה חיה אחרי הקאטאובר. סעיף 3 ממפה כל טבלה: `PROJECT` / `SEED_ONLY` / `ARCHIVE_ONLY` / `UNTOUCHED` / `CURATION`.

---

## 1. עקרונות על

1. **אפס איבוד ארכיון:** כל מה שנשלף נשמר לצמיתות ב-`wp_import` (או ב-mysqldump משפטי). רק תת-קבוצה נקייה מוקרנת ל-`public`.
2. **ה-DB החדש לא יורש חוב:** שורה שמפרה constraint, כסף, או סמנטיקה של פלטפורמה לא נכנסת ל-`public`.
3. **Idempotent:** כל הקרנה דרך `wp_import.id_map (entity, wp_id) → new_id`. הרצה חוזרת = upsert, לא כפילות.
4. **הסכימה החיה גוברת** על קבצי מיגרציה כשיש drift (לאמת מול פרודקשן לפני הרצה).
5. **חוק הספאם 30א:** אף לקוח מיובא לא נכנס opted-in לדיוור.
6. **כסף:**
   - קופון: תשלום מלא באתר (`coupon_price`); הפלטפורמה שומרת את הסכום; יתרה בבית העסק לספק; **אין Escrow**.
   - `platform_percent` חובה ב-curation (אין DEFAULT שקט); מצולם ל-`order_items` רק בשרשרת שוברים חיים.
   - המרה: `agorot = round(ils * 100)::int` פעם אחת; מקור עם שברי אגורה = error.
7. **SEO load-bearing:** כל URL ישן של מוצר/קטגוריה נשמר או מקבל 301 ב-`seo_redirects` (או מנגנון ה-proxy הקנוני). אסור 404 המוני אחרי קאטאובר.
8. **הזמנות היסטוריות לא מוקרנות ל-ledger חי** (אי אפשר להמציא snapshots של 042 בלי לזהם settlement).

---

## 2. היקף ישויות (מה כן / מה לא)

| ישות WP | ל-`wp_import` | ל-`public` |
|---|---|---|
| מוצרים + וריאציות | כן | כן (אחרי curation) |
| קטגוריות מוצר | כן | **מיפוי** לקטגוריות קנוניות (לא ייבוא עיוור) |
| תמונות / uploads | כן | Storage + `products.images` / `product_images` |
| לקוחות | כן | `auth.users` + `profiles` (+ כתובות) |
| שוברים חיים שטרם מומשו | כן | `coupon_codes` / `vouchers` + הזמנת מינימום תומכת |
| קודי הנחה Woo `shop_coupon` | כן | **ארכיון בלבד** |
| הזמנות היסטוריות | כן | **ארכיון בלבד** |
| ביקורות (`wp_comments`) | dump | לא מוקרן (אופציונלי בעתיד) |
| עמודי תוכן / Elementor | url_inventory | 301 / תוכן ידני |
| ספקים | אין ב-WC | **CURATION** ידני ל-`suppliers` |

היקף חי ידוע (מדגם 2026-07): עשרות מוצרים (לא אלפים), קטגוריות ספורות, מחירים בשקלים שלמים. מאשר one-shot עם spot-check גבוה.

---

## 3. מטריצת 33 טבלאות `public` מול הייבוא

רשימה מבוססת על `DB-SCHEMA.md` + תוספות ידועות בפרודקשן (עד 33). אם בפרודקשן נוספה טבלה אחרי המדידה, לעדכן את המטריצה לפני הרצה.

| טבלה | תפקיד בייבוא | הערות |
|---|---|---|
| `products` | **PROJECT** | ליבת הקטלוג; שער `supplier_id` + `platform_percent` |
| `categories` | **CURATION map** | לא יוצרים עיוור מ-WP; ממפים ל-seed |
| `product_variants` | **PROJECT** | מ-`product_variation` |
| `product_images` | **PROJECT** | אם בשימוש לצד jsonb `images` |
| `suppliers` | **CURATION** | יצירה ידנית לפני הקרנת מוצרים |
| `vendors` | **UNTOUCHED** | ישן; לא יעד ייבוא |
| `profiles` | **PROJECT** | אחרי Auth Admin createUser |
| `user_addresses` | **PROJECT** | מ-billing כשיש city |
| `orders` | **PROJECT minimal** | רק מעטפת לשובר חי; היסטוריה = ARCHIVE |
| `order_items` | **PROJECT minimal** | snapshot כספי לשובר חי בלבד |
| `coupon_codes` / vouchers path | **PROJECT** | שוברים חיים בלבד |
| `coupons` | **ARCHIVE_ONLY** | קודי הנחה Woo; לא פעילים אוטומטית |
| `coupon_deals` | **UNTOUCHED / optional** | לא ממלאים מ-WP אלא אם מודל דילים תואם |
| `payments` | **UNTOUCHED** | אין סליקה ישנה להעברה |
| `payment_tokens` | **UNTOUCHED** | |
| `payment_webhook_events` | **UNTOUCHED** | |
| `carts` | **UNTOUCHED** | עגלות אורח חדשות בלבד |
| `wallet_accounts` | **SEED via triggers** | נוצרים עם המשתמש; בלי יתרות WP אלא אם plugin מאומת |
| `wallet_balances` | **UNTOUCHED** (ברירת מחדל) | |
| `wallet_entries` | **UNTOUCHED** | |
| `wallet_transactions` | **UNTOUCHED** | |
| `escrow_holds` | **UNTOUCHED** | מודל בלי Escrow; לא לייבא holds ישנים |
| `split_executions` | **UNTOUCHED** | |
| `referrals` | **UNTOUCHED** | |
| `affiliates` | **UNTOUCHED** | |
| `audit_log` | **UNTOUCHED** | ריצות ייבוא נרשמות ב-`wp_import` / migration_log |
| `rate_limits` | **UNTOUCHED** | |
| `user_rate_limits` | **UNTOUCHED** | |
| `seo_redirects` | **PROJECT** | חובה ל-SEO (אם הטבלה קיימת בפרודקשן; אחרת blocker) |
| `media_assets` | **PROJECT optional** | אם הצנרת רושמת assets מעבר ל-jsonb |
| `payout_statements` (+ lines) | **UNTOUCHED** | |
| `settlement_events` | **UNTOUCHED** | |
| `agent_*` / analytics | **UNTOUCHED** | |

`ARCHIVE_ONLY` = נשמר ב-`wp_import.*` לצמיתות, לא ב-ledger חי.

---

## 4. חילוץ (Extraction)

### 4.1 שיטה מחייבת

**mysqldump מלא + rsync של `wp-content/uploads`.** לא REST כמקור אמת, לא WXR כמקור הזמנות/לקוחות.

נימוק: snapshot עקבי בזמן אחד, גיבוי משפטי, כיסוי meta מלא. REST יכול לשמש לאימות צולב בלבד.

```bash
mysqldump --single-transaction --quick --default-character-set=utf8mb4 \
  --routines --triggers --hex-blob "$DB_NAME" \
  | gzip > ke-wp-$(date +%Y%m%d).sql.gz

rsync -az user@host:/path/to/wp-content/uploads/ ./wp-uploads/
```

ה-dump נטען ל-MySQL מקומי (Docker `mysql:8`, utf8mb4). הסקריפטים קוראים ממנו אל `wp_import` (מימוש ב-`scripts/wp-import/`, מחוץ לסקופ docs-only הזה).

### 4.2 טבלאות WP לחילוץ

| טבלת WP | יעד staging |
|---|---|
| `wp_posts` + `wp_postmeta` | products / orders / media / coupons |
| `wp_terms` + taxonomy + relationships | categories (+ attributes) |
| `wp_users` + `wp_usermeta` | customers |
| `wp_woocommerce_order_items` + meta | order_items |
| `wp_wc_orders*` (HPOS אם פעיל) | orders עם `storage_source=hpos` |
| טבלאות plugin שוברים | vouchers |
| `wp_options` | preflight בלבד |
| `wp_comments` | dump בלבד |

נספחים: Yoast sitemap, ייצוא GSC (12 חודשים) → `url_inventory` + עדיפות 301.

---

## 5. מיפוי שדות (מוצרים, קופונים, תמונות, משתמשים)

### 5.1 מוצרים → `public.products`

| מקור WP | יעד | כלל |
|---|---|---|
| `ID` | `id_map(product)` | מפתח idempotency |
| `post_title` | `name_he` | ריק = error, לא מיובא |
| `post_content` | `description_he` | ניקוי HTML; `<img>` דרך מפת מדיה |
| `post_name` עברי | לא ל-`slug` | רק `url_inventory` + 301 |
| slug לטיני חדש (curation) | `slug` | `^[a-z0-9]+(-[a-z0-9]+)*$` |
| `post_status` | `status` | publish→active; draft/pending→draft; trash→דילוג |
| `_sku` | `sku` | כפילות = issue + סיומת |
| `_price` / sale | `price_ils` (+ כתיבה כפולה לעמודות legacy אם עדיין NOT NULL) | ILS; אגורות בנתיב הזמנות בלבד |
| `_regular_price` | compare / full | רק אם גדול מהאפקטיבי |
| stock meta | `stock_quantity` | לפי manage stock |
| `product_cat` | `category_id` | דרך מפת curation |
| gallery + thumbnail | `images` jsonb + `product_images` | אחרי העלאת Storage |
| Yoast title/desc | `seo_*` | אם לא תבניתי |
| היוריסטיקת קופון | `type` / `product_type` | הצעה ב-curation; ברירת מחדל physical; `service` אסור בייבוא |
| **curation** | `supplier_id` | **שער חוסם** |
| **curation** | `platform_percent` | **שער חוסם**, אין DEFAULT |
| קבוע | `cashback_percent` / bp | **0** לכל המיובאים |
| **curation** | `coupon_expiry_days` | physical=0; coupon=ערך מפורש |
| `coupon_price_ils` | curation / meta דיל | חובה לסוג coupon; מוחלט, לא % מפנים |

וריאציות → `product_variants` (parent דרך id_map, attributes, sku, stock).

### 5.2 קטגוריות

לא ייבוא עיוור של עץ WP. קובץ curation: `wp_term_id → manual_target_slug` לקטגוריה קנונית קיימת. `create_new=true` רק באישור, עומק מוגבל. כל URL קטגוריה ישן → 301.

### 5.3 תמונות

1. רישום attachments ב-`wp_import.media` עם `source_url` (בלי סיומות resize).
2. קריאה מ-rsync; fallback HTTP + retry.
3. המרה: WebP עד 1600px q≈80; OG 1200×630 לתמונה ראשית.
4. יעד: bucket `product-images` (או R2 עם אותו מפתח לוגי). Path דטרמיניסטי, למשל `wp/<attachment_id>/<basename>.webp`.
5. דה-דופ לפי `sha256` של המקור.
6. מפת `source_url → new_url` משכתבת תיאורים ובונה `products.images`.
7. שער: אפס `pending`/`failed` על מוצרים `active`.

Rollback לא מוחק אובייקטים shared ב-Storage (GC מאוחר).

### 5.4 משתמשים → Auth + `profiles`

| מקור | יעד | כלל |
|---|---|---|
| `user_email` | Auth email + profile | lower/trim; לא חוקי = ארכיון בלבד |
| שם | `profiles.full_name` | |
| טלפון billing | `profiles.phone` | נרמול ישראלי |
| כתובת | `user_addresses` | בלי city = לא נוצרת |
| סיסמה phpass | **לא מועברת** | Google לפי אימייל / magic link תפעולי |
| opt-in דיוור | staging בלבד | כולם מתחילים opted-out |

יצירה רק דרך **Auth Admin API** (`createUser`, `email_confirm: true`), לעולם לא `INSERT` ישיר ל-`auth.users`. דה-דופ לפי אימייל: משתמש שכבר קיים באתר החדש רק ממופה ב-id_map; לא דורסים שדות מלאים.

### 5.5 קופונים / שוברים

| סוג | Staging | Public |
|---|---|---|
| קוד הנחה Woo (`shop_coupon`) | `wp_import.coupons` | לא מופעל אוטומטית |
| שובר שנמכר וטרם מומש | `wp_import.vouchers` | `coupon_codes` / `vouchers` + הזמנת מינימום |
| שובר שמומש / פג | staging | לא מוקרן כפעיל |

כללי כסף לשובר חי שמוקרן:

- `paid_on_site` מאגורות התשלום ההיסטורי (או מחיר הדיל); אין להמציא.
- `platform_percent` מה-curation של מוצר האב; עמלה/ledger רק דרך המנגנון החי (triggers), לא ידנית בסקריפט.
- אחרי מימוש באתר הישן: נשאר ארכיון; האתר החדש לא מאפשר סריקה כפולה (קוד לא פעיל / לא מיובא).

זיהוי טבלאות ה-plugin: שלב preflight חובה (שם ה-plugin משתנה בין התקנות).

---

## 6. Staging: `wp_import`

טבלאות ליבה (032):

- `products`, `categories`, `customers`, `orders`, `order_items`
- `coupons`, `vouchers`, `media`, `url_inventory`
- `id_map`, `issues`, `import_batches` (או שקול ב-057)

עקרונות:

- לא חשוף ל-PostgREST ציבורי.
- כל שגיאת הקרנה → `issues` עם חומרה `error`/`warn`.
- שער הקרנה ל-`public`: אפס `error` פתוחים על ישויות המיועדות ל-PROJECT.

---

## 7. Curation (שער אנושי לפני PROJECT)

קובץ / גיליון curation חייב לכלול לפחות:

| שדה | חובה ל |
|---|---|
| `wp_product_id` | הכל |
| `supplier_id` (UUID חי) | כל מוצר שמוקרן |
| `platform_percent` | כל מוצר שמוקרן |
| `type` = coupon \| physical | הכל |
| `coupon_price_ils` | coupon |
| `coupon_expiry_days` | coupon (physical=0) |
| `slug` לטיני מאושר | הכל |
| `category_target_slug` | הכל |

בלי שורה מלאה: המוצר נשאר ב-staging.

ספקים: האדמין יוצר ב-`suppliers` (שם, טלפון, כתובת, לוגו ל-PDP) לפני ההקרנה. אין יצירת ספק אוטומטית מטקסט שיווקי.

---

## 8. סדר הרצה (Runbook)

### שלב 0: גישה וגיבוי

1. SSH / גישת DB ל-WP; הרשאות GSC לקריאת לחיצות.
2. mysqldump + rsync uploads + שמירת sitemap.
3. וידוא Supabase **Pro** + `pg_dump` חיצוני עדכני (BACKUP-DR).
4. Preflight: HPOS כן/לא, plugin שוברים, מטבע ILS, מספר מוצרים.

### שלב 1: Staging

1. החלת `032` (ועזרי log אם 057) על סביבת DEV קודם.
2. טעינת dump → חילוץ → `wp_import` (idempotent).
3. בניית `url_inventory` + התחלת הורדת מדיה.

### שלב 2: Curation

1. ייצוא דוח מוצרים חסרים.
2. יצירת ספקים + מילוי אחוזים + slugs + מיפוי קטגוריות.
3. ייבוא קובץ curation ל-staging.

### שלב 3: מדיה

1. המרה + העלאה ל-Storage/R2.
2. שער: אין failed על מועמד ל-active.

### שלב 4: Project ל-DEV

סדר תלויות מחייב:

1. `suppliers` (curation)
2. מיפוי `categories` (רק id_map / קישור)
3. `products` + `product_variants`
4. תמונות / jsonb
5. `seo_redirects`
6. לקוחות: Auth → profiles → addresses
7. שוברים חיים: הזמנת מינימום → order_items → coupon_codes/vouchers

אחרי כל שלב: validate (ספירות, FK, מדגם ידני 10 מוצרים + 5 משתמשים + 5 שוברים).

### שלב 5: תיקון עד אפס error

חזרה על 2–4 עד שער ירוק.

### שלב 6: Prod

1. תחזוקת חלון קצר (אופציונלי) / קפיאת הזמנות חדשות ב-WP אם אפשר.
2. Dump סופי + diff מול DEV.
3. אותה שרשרת על prod (אחרי שרשרת מיגרציות כסף/סכימה מעודכנת).
4. Smoke: בית, PDP, login Google למשתמש מיובא, הצגת שובר, 301 מ-URL ישן.
5. DNS / Vercel כבר על הדומיין: וידוא proxy ל-301.
6. WP נשאר חי לקריאה ≥ שבועיים (rollback תעבורה).

### שלב 7: נקודת אל-חזור

ההזמנה האמיתית הראשונה בסטאק החדש = אין purge המוני. תיקונים קדימה דרך id_map וסקריפטי תיקון נקודתיים.

---

## 9. Rollback

| מצב | פעולה |
|---|---|
| לפני נקודת אל-חזור, batch ידוע | מחיקת שורות **שהוכנסו ב-batch** בסדר תלויות הפוך (vouchers → order_items → orders → products…), לפי `id_map` / `fn_rollback_batch` אם קיים |
| תעבורה רעה אחרי DNS | החזרת DNS ל-WP (TTL נמוך מראש, למשל 300) |
| קוד אפליקציה רע | Vercel rollback (לא מחזיר DB) |
| מדיה | לא מוחקים blobs משותפים; ניתוק הפניות בלבד |
| אחרי הזמנה חיה | אין rollback מלא; תיקון קדימה + תמיכה ידנית |

תרגיל: להריץ project+rollback פעם אחת על DEV לפני prod (כמו DR drill).

---

## 10. שערי איכות (Definition of Done)

- [ ] אפס `issues` ברמת error לישויות PROJECT
- [ ] כל מוצר active עם `supplier_id`, `platform_percent`, תמונה ראשית, slug לטיני
- [ ] מדגם 301: לפחות כל מוצר שהיה ב-sitemap
- [ ] משתמש מיובא מתחבר ב-Google באותו אימייל
- [ ] שובר חי מוצג בחשבון; קוד שמומש ב-WP לא ניתן למימוש מחדש
- [ ] אין opt-in שיווקי מיובא
- [ ] `pg_dump` אחרי הייבוא נשמר offsite
- [ ] WP dump + uploads נשמרים 7 שנים (ארכיון משפטי)

---

## 11. סיכונים ופתיחות

| סיכון | הפחתה |
|---|---|
| Plugin שוברים לא מזוהה | Preflight חוסם הקרנת vouchers |
| Drift סכימה (agorot / שמות עמודות) | אימות חי לפני שלב 4 |
| `seo_redirects` חסר בפרודקשן | Blocker; להחיל מיגרציית SEO לפני קאטאובר |
| כפילות אימייל / משתמש חדש | id_map + never overwrite |
| מחיר קופון חסר ב-meta | curation ידני; אחרת לא מייבאים כ-coupon |
| צוות ממלא platform_percent לא נכון | ביקורת אדמין + דוח חריגות אחרי ייבוא |

---

## 12. מה במפורש מחוץ למסמך זה

- מימוש סקריפטי `scripts/wp-import/*.mjs` (קיימים בנפרד)
- עיצובי UI של מסכי curation
- מיגרציית ביקורות / בלוג
- תרגום EN

---

## 13. Revision

| Date | Change |
|---|---|
| 2026-07-31 | מסמך מחייב ב-`arch/wp-migration`: מטריצת 33 טבלאות, מיפוי מוצרים/קופונים/תמונות/משתמשים, סדר הרצה, rollback; docs בלבד |
