# ארכיטקטורה: ייבוא WordPress (WXR)

ייבוא חד-פעמי מגיבוי WXR של WordPress/WooCommerce לסכמת Supabase: מיפוי, דה-דופ, תמונות ל-R2, dry-run, rollback.

**WordPress הוא מקור מיגרציה בלבד, לא ה-stack הנוכחי.** ה-stack החי הוא Next.js + Supabase. אחרי cutover אין תלות ריצה ב-WP.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2` · batch #50/50  
אין שינוי קוד. אין נגיעה בתיקייה הראשית (קריאת מבנה הגיבוי READ-ONLY בלבד).

מסמכים קשורים:

```
docs/ARCHITECTURE-WP-DATA-MIGRATION.md
docs/ARCHITECTURE-CATALOG-SEARCH-SEO.md
docs/ARCHITECTURE-CATEGORIES-TAXONOMY.md
docs/ARCHITECTURE-PRICING-RULES.md
docs/ARCHITECTURE-PRODUCTION-OPS.md
docs/CONTRADICTIONS.md
docs/RUNBOOK-PRODUCTION.md
```

**יחס ל-`ARCHITECTURE-WP-DATA-MIGRATION.md`:** מסמך זה = חוזה תפעולי מול תיקיית WXR + R2 + dry-run/rollback. WP-DATA-MIGRATION נשאר לפירוט שדות/SEO ארוך. במקרה סתירה על מודל כסף גוברים CONTRADICTIONS (No Escrow, `platform_percent` פר מוצר בלי default).

מקור גיבוי (נתיב בקוד הראשי, לקריאה בלבד):

```text
kenyonexpress/data-import/wp-backup/
  README.md
  kenyonexpress-wxr-2026-07-29.xml
```

---

## 0. הכרעות

| # | הכרעה |
|---|---|
| WI0 | WP = **מקור מיגרציה** (WXR / REST ארכיון). לא runtime, לא CMS חי אחרי cutover. |
| WI1 | ייבוא קטלוג בלבד: מוצרים, קטגוריות, תמונות, ספקים בסיסיים. הזמנות/לקוחות WP = ארכיון, לא import חובה. |
| WI2 | Idempotent: `id_map` יציב (wp_post_id → uuid); re-run = upsert, לא כפילות. |
| WI3 | לפני publish: `platform_percent` חובה; בלי default. מוצרים חסרים % נשארים `draft`. |
| WI4 | מחיר קופון: שדה מוחלט; לא לגזור אחוז ישן כברירת מחדל עסקית. |
| WI5 | תמונות: העלאה ל-R2 (או CDN היעד); URL ב-`products.images` מצביע ליעד החדש. |
| WI6 | Dry-run חובה לפני כתיבה ל-prod; rollback = ביטול באצ' לפי `import_batch_id`. |
| WI7 | מיגרציות סכמה ל-prod רק MCP; סקריפט הייבוא לא מריץ DDL. |
| WI8 | אסור בייבוא: להמציא `platform_percent`, להמציא Escrow/held. |

---

## 1. מיפוי WXR → סכמה

| מקור WP (WXR / meta) | יעד Supabase | הערה |
|---|---|---|
| `item` post type product | `products` | slug מ-`wp:post_name` |
| title | `name_he` | ניקוי HTML |
| content / excerpt | `description_he` / תקציר | strip shortcodes |
| `_regular_price` / sale | מחיר / compare; המרה לאגורות בשכבת כסף | |
| coupon meta / ACF | `coupon_price_ils`, `type=coupon` | חסר → draft |
| categories | `categories` + join | שמירת היררכיה (עומק ≤ 2 ביעד) |
| featured image + gallery | R2 keys → `images` jsonb | §3 |
| vendor / author shop | `suppliers` + `supplier_id` | stub אם חסר |
| old URL | `seo_redirects` 301 | חובה ל-SEO |
| stock | `stock_qty` / quota | לפי type |

---

## 2. Dedup

```text
1. חפש id_map לפי wp_post_id
2. אם אין: התאם slug UNIQUE; התנגשות → slug__wp{id}
3. UPSERT products לפי מדיניות באצ'
4. אל תיצור מוצר שני לאותו wp_post_id
```

| מפתח | שימוש |
|---|---|
| `wp_post_id` | ראשי |
| `slug` | משני + SEO |
| checksum תוכן | דילוג אם זהה (אופציונלי) |

---

## 3. תמונות → R2

```text
extract image URLs from WXR / media items
  → download (rate limited)
  → upload R2: imports/{batch}/{wp_attachment_id}/{file}
  → write products.images = [{ url, alt, width, height, r2_key }]
  → id_map media
```

| כלל | פירוט |
|---|---|
| כשל תמונה בודדת | מוצר נשאר; דגל `images_incomplete`; לא מפיל באצ' שלם |
| שכפול | אותו attachment id → אותה R2 key |
| מחיקת מקור WP | רק אחרי אימות באצ' + תקופת חפיפה; לא חוסם cutover |

---

## 4. Dry-run

```text
IMPORT_MODE=dry_run
  → parse WXR
  → validate mapping + missing platform_percent + missing supplier
  → דוח: N create / N update / N skip / N error
  → אין כתיבה ל-DB/R2 (או staging בלבד)
```

שער ל-prod: 0 שגיאות חוסמות; אזהרות % חסר מתועדות כ-draft.

---

## 5. Rollback

| רמה | פעולה |
|---|---|
| באצ' אחרון | `DELETE/soft-delete WHERE import_batch_id = X` + מחיקת R2 prefix (אחרי אישור) |
| SEO | לא למחוק `seo_redirects` ישנים בלי ביקורת |
| אחרי רכישות על מוצר מיובא | **אין** hard delete; `archived` + הפסקת מכירה |

לפני rollback פרוד: גיבוי לפי runbook גיבויים.

---

## 6. סדר הרצה

```text
1. dry-run על WXR
2. upsert categories
3. upsert suppliers stubs
4. upload images R2
5. upsert products (draft אם חסר %)
6. seo_redirects
7. דוח + אימות ידני מדגם
8. admin ממלא platform_percent → publish
9. cutover דומיין ל-Next; WP כבוי כמקור אמת
```

---

## 7. Acceptance

- [ ] מיפוי WXR→טבלאות מתועד  
- [ ] Dedup לפי wp_post_id  
- [ ] R2 pipeline + כשל חלקי  
- [ ] Dry-run בלי כתיבת prod  
- [ ] Rollback לפי import_batch_id  
- [ ] אין default עמלה / Escrow בייבוא  
- [ ] מתועד: WP = מקור מיגרציה בלבד, לא stack חי  

---

## 8. Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | BINDING מול data-import/wp-backup WXR + R2 + dry-run/rollback |
| 2026-08-12 | batch #50/50: WI0 WP כמקור מיגרציה לא stack; רענון על arch/docs-batch-2 |
| 2026-08-12 | batch-2 #50 pass-2: BINDING על arch/docs-batch-2 (המשך תור) |
