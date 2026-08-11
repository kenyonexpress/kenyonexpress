# ארכיטקטורה: Search Discovery

Meilisearch indexing, facets, trending, zero-results, Hebrew tokenizer.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד.

מסמכים קשורים:

```
docs/ARCHITECTURE-SEARCH.md
docs/ARCHITECTURE-SEARCH-UX.md
docs/ARCHITECTURE-CATALOG-SEARCH-SEO.md
docs/RUNBOOK-OPERATIONS.md
```

---

## החלטה

| # | הכרעה |
|---|---|
| SD1 | Meilisearch = מנוע; Postgres = מקור אמת קטלוג וכסף. |
| SD2 | אינדוקס async (QStash/queue); publish לא חוסם על Meili. |
| SD3 | documents: `published` + supplier active בלבד. |
| SD4 | anon search-only key; admin key שרת בלבד. |
| SD5 | `/search` = noindex (SEO). |
| SD6 | מחיר ב-index: paid-on-site לקופון + face; לא margin. |
| SD7 | facets: category, city, product_type, price range (agorot). |
| SD8 | DLQ + retry על index failures; alert ops. |

---

## חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| Postgres FTS בלבד v1 | typo + speed Meili. |
| sync index on publish blocking | SD2: async. |
| index draft products | SD3: published only. |
| client-side Meili admin key | SD4: leak risk. |
| rank by platform_percent | SEARCH-UX SX2. |

---

## סכמת DB

```text
products + joins (categories, suppliers, tags)
search_synonyms (admin approved)
index_jobs (product_id, op, status)  -- optional queue table
Meilisearch index: products
```

אין DDL חדש חובה; queue table optional.

---

## מקרי קצה

| # | מקרה | התנהגות |
|---|---|---|
| CE1 | Meili down | fallback Postgres limited search / degraded. |
| CE2 | price change after index | worker upsert; TTL stale short. |
| CE3 | supplier suspended | delete or is_searchable=false. |
| CE4 | bulk WP import | batch index; rate limit. |
| CE5 | duplicate job same product | idempotent upsert. |
| CE6 | Hebrew niqqud in query | normalize before search. |

---

## פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | trending queries table | analytics rollup. |
| O2 | semantic vector search | v2. |
| O3 | multi-index per locale | v2. |

---

## Revision

| תאריך | שינוי |
|---|---|
| 2026-08-03 | Meilisearch discovery spec |
| 2026-08-12 | batch-2: BINDING 5 סעיפים |
