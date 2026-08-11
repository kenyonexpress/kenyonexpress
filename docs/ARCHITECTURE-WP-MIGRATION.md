# ארכיטקטורה: WP Migration (מימוש)

ETL מ-WordPress: dump, שלבים, R2, 301, שערי שלמות. חוזה כסף ב-WP-DATA-MIGRATION.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד.

מסמכים קשורים:

```
docs/ARCHITECTURE-WP-DATA-MIGRATION.md
docs/ARCHITECTURE-WP-MIGRATION-PLAN.md
docs/ARCHITECTURE-WORDPRESS-IMPORT.md
docs/MASTER-ARCHITECTURE.md
docs/CONTRADICTIONS.md
```

Dump SQL/ETL מפורט: git history לפני 2026-08-12 (998 שורות).

---

## החלטה

| # | הכרעה |
|---|---|
| WM1 | מקור: WXR dump (`wp_posts`, `wp_postmeta`, `wp_terms`) עמודה-לעמודה. |
| WM2 | ETL 6 שלבים: categories → suppliers → images R2 → products → redirects → verify. |
| WM3 | URL חי: `/product/[slug]`, `/category/[slug]` (לא `/p/` או `/products/`). |
| WM4 | R2 דרך `src/lib/storage/r2.ts`; presigned PUT. |
| WM5 | `categories` ריקה לפני import: טעינה ראשונה, לא merge. |
| WM6 | 21 שערי שלמות עם SQL לכל שער (count, orphan, slug dup). |
| WM7 | `seo_redirects` + proxy lookup (מתוכנן); cutover חוסם בלי 301. |
| WM8 | מוצרים חסרי % נשארים draft; admin publish ידני. |

---

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| REST API בלבד | dump יציב + offline; rate limits. |
| `/p/<slug>` paths | WM3: קוד חי `/product/`. |
| merge categories קיימות | WM5: 0 שורות; טעינה ראשונה. |
| import ישיר ל-prod בלי dry-run | WORDPRESS-IMPORT WI6. |
| Escrow meta מ-WP | CONTRADICTIONS: No Escrow. |

---

## סכמת DB

```text
id_map, import_batches
products, categories, suppliers
seo_redirects (pending migration)
products.images → R2 keys
```

Runner: `scripts/wp-import/` (6 steps). אין DDL חדש כאן.

---

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | שלב 4 נכשל באמצע | rollback batch; לא cutover. |
| CE2 | 301 חסר ל-URL ישן | שער SEO נכשל; לא go-live. |
| CE3 | attachment כפול | dedup R2 key. |
| CE4 | product בלי category | orphan check; draft או default. |
| CE5 | meta `_regular_price` ריק | draft + flag. |
| CE6 | redirect lookup absent ב-proxy | WM7: block cutover עד יישום. |

---

## פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | `seo_redirects` + proxy | migration pending. |
| O2 | SQL views post-import verify | automation. |
| O3 | 61 products live בלי category | import מתקן. |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-07-29 | ETL + 21 gates (dump) |
| 2026-08-12 | batch-2: BINDING קצר; dump → git history |
