# ארכיטקטורה: WP Migration (מצביע BINDING)

סקירה קצרה לייבוא WordPress. פירוט ב-docs/.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

**מקור קנוני:**

```
docs/ARCHITECTURE-WP-MIGRATION.md
docs/ARCHITECTURE-WP-DATA-MIGRATION.md
docs/ARCHITECTURE-WORDPRESS-IMPORT.md
```

Dump ארוך (998 שורות): git history לפני 2026-08-12.

---

## החלטה

| # | הכרעה |
|---|---|
| WM1 | מקור: WXR dump; ETL 6 שלבים. |
| WM2 | URL חי: `/product/[slug]`, `/category/[slug]`. |
| WM3 | תמונות: R2 presigned PUT. |
| WM4 | 21 שערי שלמות SQL לפני cutover. |
| WM5 | `seo_redirects` + 301 חובה לפני go-live. |
| WM6 | מוצרים חסרי percent: draft; publish ידני admin. |

---

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| root ETL dump | docs/WP-MIGRATION קנוני. |
| REST API בלבד | dump offline יציב. |
| merge categories קיימות | טעינה ראשונה. |
| import ישיר prod | dry-run חובה. |
| Escrow meta מ-WP | No Escrow. |

---

## סכמת DB

```text
id_map, import_batches
products, categories, suppliers
seo_redirects (pending)
```

Runner: `scripts/wp-import/`. אין DDL חדש.

---

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | שלב 4 נכשל | rollback batch. |
| CE2 | 301 חסר | שער SEO fail. |
| CE3 | attachment כפול | dedup R2. |
| CE4 | product בלי category | orphan check. |
| CE5 | redirect absent ב-proxy | block cutover. |

---

## פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | seo_redirects migration | pending. |
| O2 | post-import SQL views | automation. |
| O3 | 61 products בלי category | import מתקן. |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-07-29 | dump root |
| 2026-08-12 | batch-2: BINDING מצביע |
