# ARCHITECTURE-SEARCH.md

ארכיטקטורת **חיפוש** (Meilisearch + עברית).

Status: BINDING · `ke-arch` · Date: 2026-07-31 · docs only.

## Stack
Meilisearch index of sellable products. Next server route `/search`. Typo tolerance tuned for Hebrew.

## Index fields (min)
`id, name_he, slug, category_slugs, type, price_for_sort, coupon_price_ils, is_published, image_url, supplier_name`

## Rules
1. Only published + available products.  
2. Sort defaults: relevance; optional price.  
3. Zero-result logging for KPI.  
4. Reindex on product publish/update (queue/cron).  
5. No service key in browser; search via server or search-only key with tight rules.

## Synonyms / stopwords
Maintain Hebrew synonym list (קטגוריות נפוצות). Avoid indexing HTML junk from WP import without strip.

## SEO
`/search?q=` noindex by default (thin/faceted). Category pages remain the indexable browse path.

## Revision
| Date | Change |
|---|---|
| 2026-07-31 | Search binding in `ke-arch` (`arch/docs-queue`) |
