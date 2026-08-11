# ארכיטקטורה: חיפוש קטלוג (Search)

חיפוש עברית בקטלוג KenyonExpress: Postgres FTS, autocomplete, UI תוצאות, highlighting.

Status: **BINDING** · עודכן: 2026-08-12  
Scope: **docs only** · worktree `ke-arch` · branch `arch/docs-batch-2`  
אין שינוי קוד. אין נגיעה בתיקייה הראשית.

מסמכים קשורים:

```
docs/ARCHITECTURE-CATALOG-SEARCH-SEO.md
docs/ARCHITECTURE-CATEGORY-PAGE.md
docs/ARCHITECTURE-PERFORMANCE.md
docs/ARCHITECTURE-SEO.md
```

Meilisearch ב-`src/lib/search-server.ts` = overlay אופציונלי. **מקור אמת = Postgres.**

---

## 0. החלטה (מחייבת)

| # | הכרעה |
|---|---|
| SR1 | מנוע ראשי: Postgres FTS (`simple` + `unaccent`). |
| SR2 | `search_vector` מתוחזק ב-TRIGGER (כולל `categories.name_he`). |
| SR3 | דירוג: name (**A**) > description/aliases (**B**) > category (**C**). |
| SR4 | GIN על tsvector + GIN trigram על `name_he`. |
| SR5 | typo fallback: `pg_trgm` `word_similarity` כש-FTS < 3 תוצאות. |
| SR6 | Autocomplete: prefix ILIKE; debounce **150ms**; min **2** chars; AbortController. |
| SR7 | `/search` UI 1:1 chrome של category (electro): breadcrumb, sidebar, grid. |
| SR8 | Highlight: `ts_headline`; client מאפשר רק `<mark>`. |
| SR9 | `/search` = `robots: noindex`. |
| SR10 | אין boost ל-`platform_percent` ב-relevance (נפרד מ-pricing). |

### נוסחת score (binding)

```
score =
  0.70 * ts_rank_cd(search_vector, q, 32)
+ 0.15 * fuzzy_similarity
+ 0.10 * freshness (exp(-age_days/30))
+ 0.05 * is_featured
```

---

## 1. חלופות שנדחו

| חלופה | למה נדחתה |
|---|---|
| Meilisearch כמקור אמת | vendor + sync; Postgres מספיק ל-MVP. |
| Hebrew stemmer | לא זמין ב-managed Supabase; synonyms + clitics. |
| GENERATED column ל-search_vector | לא כולל category rename; trigger. |
| Elasticsearch | עלות/ops; FTS Postgres מספיק. |
| index על כל filter combo | ISR/CDN explosion; relevance ב-RPC. |
| client-side only search | לא scalable; server RPC. |
| index search results | thin/duplicate; noindex. |
| boost margin בחיפוש | business rule ≠ relevance; SR10. |

---

## 2. סכמת DB (מיגרציה `085_search_fts_unaccent_trigger.sql`)

| אובייקט | תיאור |
|---|---|
| `products.search_vector` | tsvector; trigger BEFORE INSERT/UPDATE |
| `products.search_keywords` | synonyms admin |
| `products_name_he_trgm_idx` | GIN trigram |
| `search_synonyms` | term + synonyms[]; RLS read public |
| `search_queries` | log: query, results_count, source, session |
| `he_tsquery(text)` | clitics + synonyms + prefix |
| `search_products(...)` | FTS + fuzzy + headline |
| `autocomplete_products(...)` | category + product prefix |
| `log_search_query(...)` | SECURITY DEFINER; anon/authenticated |

Extensions:

```
pg_trgm, unaccent (schema extensions)
```

Trigger על `categories.name_he` UPDATE → rebuild vectors ל-products בקטגוריה.

---

## 3. זרימת קצה לקוח

```
type ≥2 chars → debounce 150ms → GET /api/search/suggest
submit → /search?q= → search_products
       → אם FTS <3 → fuzzy
       → grid + ts_headline → log_search_query
```

פרמטרי URL:

| Param | משמעות |
|---|---|
| `q` | שאילתה (חובה) |
| `page` | 1-based |
| `type` | coupon / physical |
| `min` / `max` | מחיר ILS |
| `category` | narrow |
| `sort` | relevance (default) / price / newest |

Page size: **24**.

---

## 4. RPC והרשאות

```sql
GRANT EXECUTE ON FUNCTION search_products(...) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION autocomplete_products(...) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION log_search_query(...) TO anon, authenticated;
```

WHERE ב-RPC: `status = active`, `deleted_at IS NULL`.

---

## 5. מקרי קצה (טבלת תפעול)

| קוד | מקרה | התנהגות |
|---|---|---|
| S1 | q < 2 chars | suggest ריק; prompt בעמוד |
| S2 | FTS 0, fuzzy >0 | chip "התאמה משוערת" |
| S3 | both 0 | empty state + log zero_fallback |
| S4 | SQL injection ב-q | parameterized RPC |
| S5 | `%` `_` ב-autocomplete | strip לפני ILIKE |
| S6 | category rename | trigger rebuild vectors |
| S7 | הקלדה מהירה | debounce + abort |
| S8 | unpublished/deleted | excluded ב-WHERE |
| S9 | Meili down | irrelevant; Postgres primary |
| S10 | headline XSS | mark-only sanitizer |
| S11 | clitic ו/ה/ב | he_tsquery alternates |
| S12 | count approximate | "N+" עד count RPC |

---

## 6. פתוחות

| # | פתוח | הערה |
|---|---|---|
| O1 | Meili read-through cache או מחיקה | לאחר Postgres stable |
| O2 | `search_products_count` RPC למספר מדויק | UI "N+" זמני |
| O3 | `product_categories` secondary ב-weight C | multi-category |
| O4 | admin UI ל-search_synonyms | backlog |
| O5 | rate limit על /api/search/suggest | abuse prevention |

עודכן: 2026-08-12.

---

## 7. Acceptance

- [ ] unaccent + pg_trgm
- [ ] trigger A>B>C weights
- [ ] he_tsquery clitics + synonyms
- [ ] fuzzy when FTS thin
- [ ] autocomplete 150ms / min 2
- [ ] /search chrome = category
- [ ] headlines `<mark>` + RTL
- [ ] noindex metadata
- [ ] zero results logged
- [ ] חלופות שנדחו + סכמת DB + מקרי קצה + פתוחות

---

## 8. Revision

| תאריך | שינוי |
|---|---|
| 2026-07-30 | Initial binding Postgres FTS (arch/search) |
| 2026-08-12 | batch-2: שכתוב עברית + תבנית חובה |
