# ARCHITECTURE-WP-MIGRATION-PLAN.md

תוכנית **מיפוי WordPress → Supabase** מחייבת: שדה מול שדה, סדר ייבוא, rollback.

Status: BINDING · worktree

```
/Users/ofir/kenyonexpress-web/ke-arch
```

branch:

```
arch/docs-queue
```

Date: 2026-07-31 (rev A)  
Scope: docs בלבד. אין סקריפט ואין SQL בקובץ הזה.  
Companions: `ARCHITECTURE-WP-MIGRATION.md` (העקרונות והמודל), `ARCHITECTURE-WP-DATA-MIGRATION-EXECUTION.md` (ה-runbook), `ARCHITECTURE-SEO-PERFORMANCE.md` (redirects), Go-Live.

חלוקה בין שלושת מסמכי ה-WP: MIGRATION = עקרונות ומודל; **PLAN (המסמך הזה) = חוזה המיפוי שדה-מול-שדה וסדר הייבוא**; EXECUTION = מי מריץ מה ומתי. סתירה ביניהם מוכרעת לפי PLAN בענייני מיפוי.

---

## 0. מקורות אמת

### 0.1 מה קיים עכשיו

ה-WXR חי בפרויקט הראשי:

```
refs/wp-export/wp-export.xml
```

תוכן בפועל (נמדד 2026-07-31, ‏625 items):

| post_type | כמות | הערה |
|---|---|---|
| attachment | 404 | מדיה; רובה תמונות מוצר |
| nav_menu_item | 55 | לא מיובא; התפריט נבנה מחדש |
| product | 48 | הליבה |
| shop_order | 41 | ‏20 cancelled, 10 processing, 8 completed, 3 on-hold (+4 refund rows) |
| page | 28 | רובן Elementor; תוכן נבנה מחדש, לא מומר |
| elementor_library / acf / itsec / אחר | 44 | לא מיובא |
| product_variation | 2 | וריאציות בודדות; טיפול ידני |

טקסונומיות: 11 `product_cat`, ‏43 `product_tag`, ומאפיינים `pa_color` (25), `pa_city` (17), `pa_brands` (16), `pa_ספק` (3).

### 0.2 `refs/wp-inventory.json` (כשיהיה)

קובץ מכונה שנגזר מה-WXR ומחליף ספירה ידנית. צורה מחייבת:

```json
{
  "generated_at": "ISO8601",
  "source": "refs/wp-export/wp-export.xml",
  "products": [{ "wp_id": 0, "slug": "", "type": "simple|variable",
                 "price": "", "regular_price": "", "status": "",
                 "categories": [], "tags": [], "attributes": {},
                 "images": [], "supplier_attr": null }],
  "categories": [{ "wp_term_id": 0, "slug": "", "name": "", "parent": 0 }],
  "attachments_by_product": {},
  "orders_summary": { "by_status": {} }
}
```

כל סקריפט ייבוא קורא מה-inventory, לא מה-XML ישירות. עד שהוא קיים, המספרים בסעיף 0.1 הם הבסיס לתכנון.

---

## 1. טבלת שדה-מול-שדה

### 1.1 מוצר (`product` → `public.products`)

| WP (WXR / postmeta) | schema חדש | טרנספורמציה | חובה |
|---|---|---|---|
| `wp:post_id` | `wp_id` (עמודת מקור) | כמות שהיא | כן, לצורך idempotency ו-redirects |
| `title` | `name_he` | trim; ניקוי תגי HTML | כן |
| `wp:post_name` (slug) | `slug` | URL-decode (עברית מקודדת), ייחודיות | כן |
| `content:encoded` | `description_he` | המרת HTML בסיסי; Elementor shortcodes נמחקים | כן, ריק מותר בעברה ל-draft |
| `_price` | `price_agorot` | ‏ILS decimal → integer agorot (‏`Math.round(x*100)` בצד הסקריפט) | כן |
| `_regular_price` | `regular_price_agorot` | כנ"ל; אם שווה ל-price, ‏null | לא |
| `_sale_price` | לא מיובא | מבצעי עבר לא עוברים | |
| `_stock_status` / `_stock` | `stock_quantity` / `in_stock` | ‏instock בלי כמות = null כמות + in_stock=true | כן |
| `_sku` | `sku` | כמות שהוא | לא |
| `product_cat` terms | `category_id` (+ טבלת קטגוריות) | לפי מיפוי סעיף 1.2; מרובות = הראשית לפי הסדר ב-WXR | כן |
| `product_tag` terms | `tags text[]` | שמות בלבד | לא |
| `pa_ספק` / זיהוי ידני | `supplier_id` | **אין ספק אוטומטי**: מיפוי ידני של הבעלים לכל 48 המוצרים | כן לפני publish |
| תמונות (attachment refs) | `image_url` + גלריה | הורדה → R2 → URL חדש | ראשית חובה |
| `wp:status` | `status` | ‏publish → **draft** (סעיף 2, שער publish); כל השאר → draft | כן |

**שדות בלי מקור ב-WP (חובה להשלים ידנית לפני publish):**

| שדה חדש | מי ממלא |
|---|---|
| `type` (coupon / physical) | בעלים, פר מוצר |
| `platform_percent` | בעלים; אין ברירת מחדל, בלי ערך אין publish |
| `coupon_price_ils` (לקופון) | בעלים |
| `coupon_expiry_days` (לקופון) | בעלים |

ב-WooCommerce הישן לא היה מודל קופון-חלקי; כל מוצר מיובא כ-physical draft עד שהבעלים מסמן אחרת.

### 1.2 קטגוריות (`product_cat` → `public.categories`)

| WP | חדש | הערה |
|---|---|---|
| `term_id` | `wp_term_id` | מקור |
| name | `name_he` | |
| slug | `slug` | URL-decode עברית |
| parent | `parent_id` | סדר ייבוא: הורים קודם |

‏11 קטגוריות בלבד: אימות ידני מלא אחרי הייבוא (שמות, היררכיה, ריק).

### 1.3 מדיה (attachments → R2)

| WP | חדש |
|---|---|
| `attachment` URL (‏`wp-content/uploads/...`) | ‏R2 object key: ‏`products/{product_slug}/{filename}` |
| `_thumbnail_id` | התמונה הראשית של המוצר |
| גודל מקורי | מקור יחיד; ‏Next/image עושה derivatives |

‏404 קבצים: הורדה מרוכזת מהאתר החי לפני כיבויו, לא מה-XML (ה-XML מכיל URL, לא בייטים). קובץ שנכשל = שורת דוח, לא עצירת הכל.

### 1.4 הזמנות ולקוחות (החלטה)

| ישות | החלטה |
|---|---|
| `shop_order` (41) | **לא מיובא** לטבלת orders החיה. ההיסטוריה נשמרת כארכיון קריאה (dump/CSV אצל הבעלים). מודל הכסף החדש (אגורות, snapshots, ledger) לא תואם לאחור, וייבוא היה מזייף דוחות |
| לקוחות WP | לא מיובאים. Auth הוא Google OAuth; לקוח חוזר נוצר מחדש בהתחברות ראשונה |
| קופונים/שוברים ישנים | אם קיימים שוברים פתוחים מהאתר הישן: רשימה ידנית של הבעלים וכיבוד ידני, לא דרך `vouchers` |

### 1.5 עמודים (28)

לא מומרים. תוכן משפטי נכתב מחדש (`ARCHITECTURE-LEGAL-PAGES.md`); עמודי שיווק נבנים ב-Next. מה שכן נגזר מהם: **רשימת ה-URLs לטבלת ה-301** (‏`ARCHITECTURE-SEO-PERFORMANCE.md` + ‏`ARCHITECTURE-LAUNCH-MARKETING.md`).

---

## 2. סדר ייבוא (קשיח)

```
1. categories (הורים → ילדים)          ← תלות: כלום
2. suppliers (ידני, מה-onboarding)      ← תלות: כלום
3. media → R2                            ← תלות: כלום (במקביל ל-1-2 מותר)
4. products כ-draft                      ← תלות: 1, 2, 3
5. השלמה ידנית: type, percent, coupon_price, supplier_id
6. שער publish פר מוצר (אדמין)          ← תלות: 5
7. טבלת redirects 301                    ← תלות: 4 (slugs סופיים)
```

| כלל | אכיפה |
|---|---|
| Idempotency | ‏upsert לפי `wp_id`; ריצה חוזרת לא מכפילה |
| דוח פער | כל שורה שדולגה: סיבה + wp_id בקובץ דוח |
| אין publish אוטומטי | ייבוא מייצר drafts בלבד; publish רק דרך שערי האדמין |
| כסף | אין המרת מחיר בלי בדיקת `NaN`; מחיר לא תקין = draft עם שגיאת ולידציה |

---

## 3. Rollback

| שלב שנכשל | פעולה |
|---|---|
| ייבוא קטגוריות/מוצרים (drafts) | ‏delete לפי `wp_id is not null` בסביבת staging; בייצור: המוצרים drafts, לא נראים, מותר לתקן במקום |
| מדיה ל-R2 | מחיקת ה-prefix שהועלה; אין תלות חיה עד ש-products מפרסמים |
| אחרי publish חלקי | unpublish של המוצרים הפגומים בלבד; לא מוחקים שורות שכבר צברו הזמנות |
| cutover DNS | חזרה ל-WP לפי `ARCHITECTURE-WP-MIGRATION.md` סעיף 7 (ה-WP נשאר חי וקפוא עד אישור סופי) |

עוגן: לפני כל ריצת ייבוא לסביבה עם נתונים = snapshot (שער BAK4 ב-Go-Live).

**קו אדום ל-rollback:** אחרי שההזמנה האמיתית הראשונה נקלטה במערכת החדשה, אין down-migration ואין מחיקת טבלאות. תקלות מטופלות קדימה בלבד.

---

## 4. שערי קבלה למיפוי

| # | בדיקה | חוסם |
|---|---|---|
| MAP1 | ‏count(products where wp_id not null) == מספר המוצרים בדוח הייבוא + דוח דילוגים | כן |
| MAP2 | אף מוצר מיובא לא published בלי platform_percent / coupon fields | כן |
| MAP3 | דגימת 10 מוצרים: מחיר באגורות == מחיר WP * 100 בדיוק | כן |
| MAP4 | כל slug עברי נפתח ב-URL החדש ומופיע בטבלת ה-301 מה-URL הישן | כן |
| MAP5 | תמונה ראשית נטענת מ-R2 לכל מוצר מיובא | כן |
| MAP6 | ‏0 שורות בטבלת orders שמקורן WP | כן |

---

## 5. Out of scope

- המרת עיצוב Elementor
- ייבוא ביקורות מוצר (אין ב-WXR הזה)
- סנכרון דו-כיווני עם WP אחרי cutover

---

## 6. Revision

| Date | Change |
|---|---|
| 2026-07-31 | rev A: חוזה מיפוי שדה-מול-שדה מעוגן ב-WXR האמיתי (625 items), סדר ייבוא, rollback, שערי קבלה |
