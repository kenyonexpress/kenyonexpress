# ארכיטקטורה: Catalog Search SEO

קטלוג, חיפוש, SEO מבנים: PDP, facets, structured data.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד.

מסמכים קשורים:

```
docs/ARCHITECTURE-SEARCH-DISCOVERY.md
docs/ARCHITECTURE-SEARCH-UX.md
docs/ARCHITECTURE-SEO-SITEMAP.md
docs/ARCHITECTURE-CATEGORY-PAGE.md
docs/ARCHITECTURE-GROWTH-SEO.md
```

פירוט ארוך (626 שורות): git history לפני 2026-08-12.

---

## החלטה

| # | הכרעה |
|---|---|
| CS1 | PDP `/product/[slug]`: supplier identity, dual price coupon, JSON-LD Product. |
| CS2 | Category `/category/[slug]`: faceted filters; canonical pagination. |
| CS3 | Search `/search`: noindex; Meilisearch backend. |
| CS4 | מחיר structured data = on-site charge; לא face alone for coupon. |
| CS5 | אין boost ranking by `platform_percent`. |
| CS6 | Import WP: slug stable + 301; enrichment for thin descriptions. |
| CS7 | RTL Hebrew titles; LTR for SKU/codes in schema where needed. |
| CS8 | BreadcrumbList JSON-LD on PDP/category. |

---

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| /products/ plural path | live `/product/`. |
| keyword stuffing in enrichment | AI guardrails + staff approve. |
| index internal search URLs | CS3: noindex. |
| hide supplier on PDP | trust + legal. |
| margin-based default sort | CS5. |

---

## סכמת DB

```text
products (slug, name_he, seo_title, seo_description, product_type, prices agorot)
categories (slug, parent_id)
search_synonyms (admin approved)
seo_redirects
```

אין DDL חדש.

---

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | draft product URL guess | 404. |
| CE2 | coupon missing coupon_price | not published; not in index. |
| CE3 | slug change | 301 + update sitemap. |
| CE4 | duplicate meta description import | enrichment overwrite queue. |
| CE5 | out-of-stock physical | availability schema OutOfStock. |
| CE6 | facet count stale | async index refresh. |

---

## פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | city landing pages SEO | CITY-LANDING-CONTENT. |
| O2 | review schema | v2 trust program. |
| O3 | hreflang | v2. |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-03 | catalog search SEO |
| 2026-08-12 | batch-2: BINDING קצר |
