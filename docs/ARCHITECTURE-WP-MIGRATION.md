# ARCHITECTURE-WP-MIGRATION.md

מיגרציית נתונים מ-WordPress / WooCommerce אל Supabase דרך **WXR XML** (תכנון מחייב, docs בלבד).

Status: BINDING for `arch/wp-migration` (2026-07-31, morning refresh)
Worktree: `/Users/ofir/kenyonexpress-web/ke-arch-wp` only. **Documentation only.**
Canonical host: `kenyonexpress.co.il`.

Companions: `032_wp_import_staging.sql`, `scripts/wp-import/`, `docs/ARCHITECTURE-WP-DATA-MIGRATION.md`, `docs/MIGRATION-BACKLOG.md` (33 public tables), BACKUP-DR, money invariants (no Escrow).

---

## 0. מקור האמת לקלט

| פריט | ערך |
|---|---|
| פורמט | WordPress eXtended RSS (**WXR** 1.2) |
| נתיב מחייב | `data-import/wp-backup/` |
| קובץ נוכחי | `data-import/wp-backup/kenyonexpress-wxr-2026-07-29.xml` (~5.7MB, נוצר 2026-07-29) |
| עותק ייחוס ישן | `refs/wp-export/wp-export.xml` (אותו תוכן; להעדיף את נתיב `data-import`) |
| Generator | WordPress 6.8.1, `he-IL`, base `https://kenyonexpress.co.il` |

**אין להתחיל parse מנתיב אחר בלי לעדכן מסמך זה.** קבצי XML גדולים לא נכנסים ל-git (להחזיק מקומית / בארכיון מוצפן); המסמך מתעד את הנתיב והגרסה.

### 0.1 מה יש ב-WXR (ספירה מהקובץ החי)

| `wp:post_type` | כמות (בערך) | שימוש בייבוא |
|---|---|---|
| `attachment` | 404 | תמונות / מדיה |
| `product` | 48 | קטלוג (אחרי סינון Dokan/hidden) |
| `shop_order` | 41 | **כותרות בלבד** (אין שורות הזמנה ב-WXR) |
| `page` | 28 | `url_inventory` + 301 |
| `nav_menu_item` | 55 | להתעלם |
| `product_variation` | 2 | וריאציות |
| `shop_order_refund` | 4 | ארכיון בלבד |
| אחר (Elementor, ACF, …) | עשרות | להתעלם / ארכיון |

Taxonomies: `product_cat`, `product_tag`, `product_type`, `product_visibility`, plus **blog** `<wp:category>` (Electro demo) שאין לייבא כקטגוריות מוצר.

Dry-run מאומת (feat/wp-migration): ~45 מוצרים אחרי סינון, ~11 `product_cat` אמיתיים, ~65 תמונות מוצר. פרטים בסעיף 10.

### 0.2 מגבלת WXR (מחייבת)

1. **הזמנות:** `shop_order` ב-WXR מחזיק meta של חיוב/סכומים **בלי** `order_item` lines (Woo שומר אותם בטבלאות נפרדות). אי אפשר לבנות `order_items` מלאים מ-XML בלבד.
2. **לקוחות:** רשימת `<wp:author>` חלקית (עורכים/ספק); לקוחות קנייה מלאים דורשים dump/REST אם נדרש ייבוא גורף.
3. **שוברים מ-plugin:** רק אם יוצאו כ-posts/meta ב-WXR; אחרת מקור משני.
4. השלמה אופציונלית: `mysqldump` / WC REST ל-orders line items ומשתמשים, **אחרי** שהקטלוג מ-XML יציב.

לקטלוג + מדיה + SEO + מחברים: **WXR הוא המקור הראשי.**

---

## 1. עקרונות על

1. Parse → normalize → stage (`wp_import`) → curation → project → validate. Dry-run ברירת מחדל.
2. Idempotent דרך `wp_import.id_map (entity, wp_id) → new_id`.
3. אפס שורות שמפרות constraint / כסף / RLS semantics ל-`public`.
4. **33** = טבלאות `public` בפרודקשן, לא מספר ישויות XML. רובן `UNTOUCHED`.
5. כסף: קופון = תשלום מלא באתר; אין Escrow; `platform_percent` חובה ב-curation; `agorot = round(ils*100)`.
6. 30א: אין opt-in שיווקי מיובא.
7. SEO: כל URL מוצר/קטגוריה/עמוד ציבורי ישן → slug נשמר או 301.
8. קטגוריות: רק `product_cat` מ-`<wp:term>`, **לא** `<wp:category>` של הבלוג.

---

## 2. Pipeline: parse XML

```
data-import/wp-backup/*.xml
        │
        ▼
   [1] parse WXR (stream / DOM)
        │  authors, terms, items[], postmeta, category links
        ▼
   [2] classify items by wp:post_type
        │
        ▼
   [3] normalize → JSON artifacts (wp_import/normalized/)
        │  products.json, categories.json, media.json,
        │  pages.json, orders_headers.json, authors.json
        ▼
   [4] load → wp_import.* staging (Postgres)
        │
        ▼
   [5] media fetch/convert/upload (Storage/R2)
        │
        ▼
   [6] curation gates (supplier_id, platform_percent, slugs)
        │
        ▼
   [7] project → public.* (subset)
        │
        ▼
   [8] integrity checks + report
```

### 2.1 חוקי parse

| כלל | פירוט |
|---|---|
| Encoding | UTF-8; CDATA כטקסט גולמי |
| Item identity | `wp:post_id` (לא GUID בלבד) |
| Status | `publish` מועמד ל-active; `private`/`trash`/`draft` לפי מדיניות (private לא active) |
| Meta | כל `wp:postmeta` → map / `raw_meta` jsonb |
| Terms on item | `category domain="product_cat"` וכו׳; לא לערבב blog categories |
| Attachments | `wp:post_type=attachment` + `wp:attachment_url`; קישור למוצר דרך `_thumbnail_id` / gallery meta / parent |
| Filter Dokan | לדלג על מוצר `reverse-withdrawal-payment` (bookkeeping) |
| Category filter | `readTaxonomy`: **רק** `<wp:term>` עם `product_cat`. אסור לקרוא `<wp:category>` כעץ מוצר (באג ידוע: 17 Electro demo terms) |

### 2.2 שלבי מימוש (מחוץ למסמך, לציון בלבד)

קיים / מתוכנן תחת `scripts/wp-import/`: extract (wxr), transform, load, media, project, validate. שני מנעולים לכתיבה: dry-run כברירת מחדל + `WP_IMPORT_ALLOW_WRITES=1` ו-`--apply`.

---

## 3. מה זה "33 טבלאות" + מטריצת ייבוא

מקור המספר: `docs/MIGRATION-BACKLOG.md` (2026-07-29) = **33 טבלאות ב-`public` בפרודקשן**.

| סטטוס ייבוא | משמעות |
|---|---|
| **PROJECT** | נכתב ל-`public` אחרי curation + שערי integrity |
| **CURATION** | נוצר ידנית / ממופה, לא אוטומט מ-XML |
| **ARCHIVE** | נשמר ב-`wp_import` בלבד |
| **UNTOUCHED** | לא נוגעים בייבוא |

### 3.1 מטריצה (ליבה + עד 33)

| טבלה | סטטוס | מקור WXR |
|---|---|---|
| `products` | PROJECT | `product` (+ curation) |
| `product_variants` | PROJECT | `product_variation` |
| `product_images` | PROJECT | `attachment` מקושר |
| `categories` | CURATION map | `product_cat` terms → seed |
| `suppliers` | CURATION | אין ב-WXR |
| `profiles` | PROJECT partial | `<wp:author>` + השלמה מאוחרת |
| `user_addresses` | PROJECT partial | meta לקוח אם יתווסף מקור |
| `orders` | ARCHIVE headers / PROJECT minimal לרק שובר חי | `shop_order` (בלי lines) |
| `order_items` | לא מ-WXR | דורש dump/REST |
| `coupon_codes` / vouchers | PROJECT אם ב-XML או מקור משני | plugin-dependent |
| `coupons` | ARCHIVE | `shop_coupon` אם קיים ב-export |
| `seo_redirects` | PROJECT | slugs ישנים + pages |
| `media_assets` | PROJECT optional | attachments |
| `vendors` | UNTOUCHED | |
| `carts` | UNTOUCHED | |
| `payments` / tokens / webhooks | UNTOUCHED | |
| `wallet_*` | SEED via Auth triggers | לא יתרות WP |
| `escrow_holds` / `split_executions` | UNTOUCHED | אין Escrow במודל |
| `referrals` / `affiliates` | UNTOUCHED | |
| `audit_log` / rate_limits | UNTOUCHED | |
| `payout_*` / `settlement_*` | UNTOUCHED | |
| `agent_*` / analytics | UNTOUCHED | |

רשימת 33 המלאה בפרודקשן עשויה לכלול טבלאות נוספות שנמדדו אחרי `DB-SCHEMA` (28). כל טבלה חדשה = `UNTOUCHED` עד להחלטה מפורשת.

---

## 4. מיפוי שדות מ-XML

### 4.1 מוצר (`wp:post_type=product`)

| WXR | יעד | כלל |
|---|---|---|
| `wp:post_id` | `id_map(product)` | |
| `title` | `name_he` | trim; ריק = error |
| `content:encoded` | `description_he` | ניקוי HTML; img דרך media map |
| `wp:post_name` | url_inventory + 301 | slug עברי לא ל-`products.slug` |
| curation slug | `products.slug` | לטיני ייחודי |
| `wp:status` | `status` | publish→מועמד active |
| `_sku` | `sku` | |
| `_price` / `_sale_price` / `_regular_price` | מחירים ILS | אגורות רק בנתיב הזמנות |
| `_stock*` | `stock_quantity` | |
| `_thumbnail_id` + `_product_image_gallery` | images | אחרי upload |
| `_yoast_wpseo_*` | seo_* | אם לא תבניתי |
| domain product_cat | category map | |
| curation | `supplier_id`, `platform_percent`, `type`, `coupon_price_ils`, `coupon_expiry_days` | שערי חובה |

סינון: לא לייבא `reverse-withdrawal-payment`.

Slug ממוחזר מול כותרת (נמצאו ~18/45): **שומרים URL ישן ל-SEO** + 301 אם מחליפים slug לטיני חדש.

### 4.2 תמונות (`attachment`)

| WXR | יעד |
|---|---|
| `wp:post_id` | id_map(media) |
| `wp:attachment_url` | download source |
| parent / featured | קישור למוצר |
| לאחר המרה WebP | Storage path `wp/<attachment_id>/…` + `products.images` |

לא להעלות attachment של מוצר `private` שנפסל מהקטלוג (באג ידוע ב-dry run).

### 4.3 קטגוריות

רק `<wp:term><wp:term_taxonomy>product_cat`. מיפוי ל-slug קנוני ב-curation. 301 מ-URL WP.

### 4.4 משתמשים / מחברים

`<wp:author>` → מועמדים ל-Auth רק אם אימייל לקוח אמיתי; סיסמאות לא מועברות; יצירה ב-Auth Admin API; opted-out.

ייבוא לקוחות מלא (כל רוכש) = שלב משני (dump/REST), לא חובה לקטלוג.

### 4.5 הזמנות

| מ-WXR | אפשר |
|---|---|
| order id, status, totals meta, billing email | כן → staging `orders` headers |
| line items / SKUs / כמות | **לא** |

בלי line items: אין PROJECT ל-ledger. שוברים חיים דורשים מקור שיש בו קוד+מוצר+סטטוס מימוש.

### 4.6 קופונים / שוברים

| סוג | מ-WXR? | ל-public |
|---|---|---|
| `shop_coupon` | אם קיים ב-export | ARCHIVE |
| שובר נמכר חי | תלוי plugin ב-XML | PROJECT אחרי curation כסף |
| מומש/פג | staging | לא פעיל |

---

## 5. סדר הרצה

| # | שלב | קלט | פלט | כותב public? |
|---|---|---|---|---|
| 0 | Preflight | XML path, sha256, wxr_version | דוח | לא |
| 1 | Parse + classify | `data-import/wp-backup/*.xml` | raw items | לא |
| 2 | Transform | raw | normalized JSON | לא |
| 3 | Load staging | normalized | `wp_import.*` | לא |
| 4 | Media | media list + uploads/HTTP | Storage + media map | לא (bucket כן) |
| 5 | Curation import | CSV/גיליון | staging flags | לא |
| 6 | Project catalog | staging + curation | products, variants, images, category links, seo_redirects | **כן** |
| 7 | Project users (אופציונלי) | authors / customers | auth+profiles | **כן** |
| 8 | Project live vouchers (אופציונלי) | מקור מלא | coupon_codes + min order | **כן** |
| 9 | Integrity suite | הכל | דוח pass/fail | לא |
| 10 | Cutover | DNS / smoke | ייצור | : |

סדר תלויות בתוך project catalog: `suppliers` (ידני) → category map → `products` → variants → images → `seo_redirects` (מוצרים, קטגוריות, **עמודים**).

---

## 6. Rollback

| מצב | פעולה |
|---|---|
| Dry-run | אין מה לגלגל |
| אחרי load staging בלבד | `TRUNCATE`/`DELETE` ל-batch ב-`wp_import` לפי `import_batches` |
| אחרי project, לפני הזמנה חיה | מחיקת שורות לפי `id_map` בסדר הפוך: redirects → images → variants → products; משתמשים רק אם נוצרו ב-batch |
| תעבורה | DNS חזרה ל-WP (TTL נמוך מראש) |
| קוד | Vercel rollback (לא DB) |
| Storage | לא מוחקים blobs משותפים; מנתקים הפניות |
| אחרי הזמנה אמיתית בחדש | אין purge; תיקון קדימה |

נקודת אל-חזור = הזמנה משולמת ראשונה בסטאק החדש.

---

## 7. Integrity checks (חובה לפני PROJECT ל-prod)

### 7.1 Pre-parse / parse

| בדיקה | Pass |
|---|---|
| קובץ קיים תחת `data-import/wp-backup/` | כן |
| `wp:wxr_version` נקרא | 1.2 (או מתועד) |
| sha256 מתועד בדוח הריצה | כן |
| מספר `item` > 0 | כן |
| אין כפילות `wp:post_id` | 0 כפילויות |

### 7.2 Catalog

| בדיקה | Pass |
|---|---|
| אפס blog `<wp:category>` בטבלת קטגוריות מוצר | 0 |
| אין slug `uncategorized-2` שנוצר מקוליזיה מלאכותית | 0 |
| מוצר Dokan bookkeeping לא ב-normalized products | 0 |
| כל product מועמד: `name_he` לא ריק | 100% |
| כל product מועמד ל-active: `supplier_id` + `platform_percent` ב-curation | 100% |
| coupon: `coupon_price_ils` + `coupon_expiry_days` | 100% |
| מחיר מקור: אין שברי אגורה לא צפויים | 0 errors |
| כל thumbnail_id מצביע ל-attachment קיים או issue | 0 orphans ל-active |
| attachment של private-excluded לא ב-upload set | 0 |
| ספירת products normalized ≈ 45±ε אחרי פילטרים | תואם dry-run |

### 7.3 SEO / URLs

| בדיקה | Pass |
|---|---|
| כל product/category publish ב-`url_inventory` | 100% |
| כל עמוד ציבורי רלוונטי (`privacy`, `terms`, `shop`, `about`, …) ב-inventory או ברשימת דילוג מאושרת | 100% |
| `redirect_coverage` לא מדווח 100% על inventory חסר עמודים | ה-gate בודק pages גם כן |
| אין התנגשות slug לטיני ב-`products` | 0 |

### 7.4 Media

| בדיקה | Pass |
|---|---|
| download/upload status ל-active products | אפס pending/failed |
| כל `products.images[0]` URL מחזיר 200 | מדגם 100% + סריקה מלאה |
| dedupe sha256 עקבי | אין כפילות מיותרות בדוח |

### 7.5 Users / money (אם רצים)

| בדיקה | Pass |
|---|---|
| אין INSERT ישיר ל-`auth.users` | רק Admin API |
| כל profile חדש: marketing channels false | 100% |
| אין PROJECT של order_items מ-WXR בלבד | gate נכשל אם מנסים |
| שובר חי: קוד ייחודי, סטטוס issued, קישור מוצר | 100% |

### 7.6 Post-project SQL smoke

```sql
-- illustrative checks on target DB
SELECT count(*) FROM products WHERE status = 'active';
SELECT count(*) FROM products WHERE supplier_id IS NULL OR platform_percent IS NULL;
SELECT count(*) FROM products p
  LEFT JOIN suppliers s ON s.id = p.supplier_id
  WHERE p.status = 'active' AND s.id IS NULL;
SELECT slug, count(*) FROM products GROUP BY 1 HAVING count(*) > 1;
```

Pass: ספירת NULL/orphan/duplicate = 0 למועמדי production.

### 7.7 דוח חובה

כל ריצה כותבת:

- `wp_import/reports/<batch>/summary.json` (ספירות, sha256 של XML, שערי pass/fail)
- רשימת `issues` (error/warn)
- בלי `error` פתוחים על ישויות PROJECT → מותר `--apply` ל-prod

---

## 8. Curation (שער אנושי)

חובה לפני project:

- `wp_post_id`
- `supplier_id`
- `platform_percent`
- `type` (`coupon`|`physical`)
- `slug` לטיני
- `category_target_slug`
- ל-coupon: `coupon_price_ils`, `coupon_expiry_days`

---

## 9. כסף (תזכורת לייבוא)

| כלל | השלכה |
|---|---|
| קופון שולם במלואו באתר | לא לחשב מחיר כ-% מפנים |
| אין Escrow | לא ליצור `escrow_holds` מייבוא |
| `platform_percent` | curation בלבד; snapshot רק בהזמנה חיה / שובר חי מאושר |
| הזמנות היסטוריות | ARCHIVE; לא מזהמים settlement |

---

## 10. ממצאי dry-run שחייבים להישאר בבלוקרים

| # | ממצא | פעולת חובה במסמך/קוד |
|---|---|---|
| B1 | ערבוב `<wp:category>` → 17 קטגוריות מדומות | parse רק `product_cat` מ-`<wp:term>` |
| B2 | מוצר Dokan נסתר נספר | filter לפי slug/SKU ידוע |
| B3 | תמונת private עולה | media set = רק מוצרים שעוברים catalog filter |
| B4 | inventory בלי pages → coverage מזויף | לכלול pages ב-url_inventory/gate |
| B5 | orders בלי lines | אסור project order_items מ-WXR |
| B6 | slugs ממוחזרים מול כותרת | החלטת SEO: שמירה + 301 אם מחליפים |

---

## 11. Definition of Done (לפני DNS)

- [ ] XML תחת `data-import/wp-backup/` עם sha256 בדוח
- [ ] B1-B6 סגורים או מוחרגים בכתב
- [ ] Integrity suite ירוק על DEV
- [ ] מדגם ידני: 10 PDP, 5 301, login לאימייל מיובא (אם יובא)
- [ ] `pg_dump` אחרי project נשמר offsite
- [ ] WP נשאר זמין ≥ 14 יום

---

## 12. Out of scope במסמך זה

- מימוש parsers בקוד (קיים ב-`scripts/wp-import`)
- יישום UI ל-curation
- ייבוא ביקורות / Elementor כעמודים חיים

---

## 13. Revision

| Date | Change |
|---|---|
| 2026-07-31 | מסמך ראשון (dump-oriented) על `arch/wp-migration` |
| 2026-07-31 | רענון בוקר: מקור מחייב WXR ב-`data-import/wp-backup/`, parse, מטריצת 33, סדר הרצה, rollback, integrity checks, בלוקרי dry-run |
