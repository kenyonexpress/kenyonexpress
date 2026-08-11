# ארכיטקטורה: SEO Sitemap

sitemap.xml, robots, canonical, hreflang, redirects post-WP.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד.

מסמכים קשורים:

```
docs/ARCHITECTURE-SEO.md
docs/ARCHITECTURE-SEO-PERFORMANCE.md
docs/ARCHITECTURE-WP-MIGRATION.md
docs/ARCHITECTURE-CATALOG-SEARCH-SEO.md
```

פירוט URL ארוך: git history לפני 2026-08-12.

---

## החלטה

| # | הכרעה |
|---|---|
| SS1 | Routes: `/product/[slug]`, `/category/[slug]`; sitemap from live app. |
| SS2 | `sitemap.ts` dynamic: products published + categories active. |
| SS3 | `/search`, `/cart`, `/checkout`, `/account/**` = noindex. |
| SS4 | canonical per page; no duplicate query params indexed. |
| SS5 | WP cutover: `seo_redirects` 301 all legacy URLs. |
| SS6 | robots.txt: disallow admin, api, draft preview. |
| SS7 | Image sitemap optional v2; alt-text required PDP. |
| SS8 | lastmod from `products.updated_at` / category.updated_at. |

---

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| static sitemap file only | SS2: dynamic catalog. |
| index `/search?q=` | SS3: noindex. |
| keep WP sitemap URL | SS5: new origin. |
| hreflang en v1 | Hebrew primary only launch. |
| soft 302 redirects | SS5: 301 permanent. |

---

## סכמת DB

```text
products (slug, status, updated_at)
categories (slug, status, updated_at)
seo_redirects (from_path, to_path, status_code=301)
```

`seo_redirects` pending migration.

---

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | unpublished product in old Google index | 404 or 301 to category. |
| CE2 | slug change | 301 old→new in seo_redirects. |
| CE3 | duplicate slug import | slug__wp{id}; redirect both? primary canonical. |
| CE4 | sitemap >50K URLs | sitemap index split. |
| CE5 | staging domain crawl | robots disallow all. |
| CE6 | trailing slash mismatch | canonical pick one. |

---

## פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | proxy redirect lookup | WP-MIGRATION WM7. |
| O2 | Google Merchant feed | LAUNCH-MARKETING. |
| O3 | structured data audit CI | SEO-PERFORMANCE. |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-07-29 | sitemap + 301 map (dump) |
| 2026-08-12 | batch-2: BINDING קצר |
