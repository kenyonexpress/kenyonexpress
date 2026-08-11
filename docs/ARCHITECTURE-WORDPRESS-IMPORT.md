# ארכיטקטורה: ייבוא WordPress (WXR)

ייבוא חד-פעמי מ-WXR ל-Supabase: מיפוי, dedup, R2, dry-run, rollback.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. WP = **מקור מיגרציה בלבד**, לא stack חי.

מסמכים קשורים:

```
docs/ARCHITECTURE-WP-DATA-MIGRATION.md
docs/ARCHITECTURE-WP-MIGRATION.md
docs/ARCHITECTURE-CATALOG-SEARCH-SEO.md
docs/ARCHITECTURE-PRICING-RULES.md
```

מקור: `data-import/wp-backup/kenyonexpress-wxr-2026-07-29.xml`

---

## החלטה

| # | הכרעה |
|---|---|
| WI1 | ייבוא קטלוג: מוצרים, קטגוריות, תמונות, ספקים stubs. הזמנות/לקוחות WP = ארכיון. |
| WI2 | Idempotent: `id_map` (wp_post_id → uuid); re-run = upsert. |
| WI3 | לפני publish: `platform_percent` חובה; בלי default; חסר → `draft`. |
| WI4 | `coupon_price` מוחלט; לא לגזור אחוז ישן. |
| WI5 | תמונות → R2; URL ב-`products.images`. |
| WI6 | Dry-run חובה לפני prod; rollback לפי `import_batch_id`. |
| WI7 | מיגרציות prod רק MCP; סקריפט import לא מריץ DDL. |
| WI8 | SEO: `seo_redirects` 301 מ-URL ישן. |

---

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| WP כ-CMS חי אחרי cutover | WI1: Next.js + Supabase. |
| default 5%/`platform_percent` בייבוא | WI3: admin ממלא ידנית. |
| import הזמנות WP ל-orders | ארכיון; לא מקור אמת כסף. |
| hotlink תמונות WP לנצח | WI5: R2 יעד. |
| REST בלבד בלי WXR dump | WP-MIGRATION: dump עמודה-לעמודה. |

---

## סכמת DB

```text
products (import_batch_id, wp_post_id via id_map)
categories, product_categories
suppliers (stub)
id_map (source_type, source_id, target_uuid, import_batch_id)
seo_redirects (from_path, to_path, status=301)
products.images jsonb (r2_key, url, alt)
```

אין DDL חדש במסמך זה.

---

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | slug collision | `slug__wp{id}`. |
| CE2 | תמונה בודדת נכשלת | `images_incomplete`; לא מפיל באצ'. |
| CE3 | חסר `platform_percent` | draft; לא publish. |
| CE4 | rollback אחרי רכישות | archived; לא hard delete. |
| CE5 | duplicate wp_post_id | upsert; לא שורה שנייה. |
| CE6 | מחיר float ב-WP meta | המרה ל-agorot בשכבת כסף. |

---

## פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | `seo_redirects` table על prod | מיגרציה pending. |
| O2 | checksum skip אם תוכן זהה | אופציונלי. |
| O3 | backfill enrichment AI | AI-AGENTS-RUNTIME. |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-12 | BINDING WXR + R2 + dry-run |
| 2026-08-12 | batch-2: 5 סעיפים מלאים |
