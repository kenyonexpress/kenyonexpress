# Search pipeline

**This document was written from the code, not from a plan.** Every value below
was read out of `src/lib/search/` on 2026-09-01. Where the implementation
differs from what the briefs have repeatedly asked for, the difference is named
rather than smoothed over.

## Engine, and the fallback that is not optional

`src/lib/search-server.ts` picks the engine at call time:

```ts
function meiliConfigured(): boolean {
  return Boolean(process.env.MEILISEARCH_HOST && process.env.MEILISEARCH_API_KEY)
}
```

With both set, queries go to Meilisearch. With either missing it falls back to a
Postgres `ILIKE` search through the Supabase client. Both paths return the same
`ProductCard` shape and the outcome carries `engine: 'meilisearch' | 'database'`,
so a caller can tell which answered.

**Neither variable is set in production today.** Production is therefore running
the Postgres path. That is a working search, not a broken one, but it has no
typo tolerance, no synonyms and no facets, and nothing in the UI says so.

## Index settings, as implemented

From `src/lib/search/meili-settings.ts`.

**Typo tolerance.** Enabled, and **4/7, not 4/8**:

```ts
minWordSizeForTypos: { oneTypo: 4, twoTypos: 7 }
disableOnAttributes: ['sku', 'slug', 'barcode']
```

Every brief so far has quoted 4/8. The code says 7 and `meili-settings.test.ts`
asserts it. Identifiers are excluded from typo correction on purpose: a one-typo
match on a SKU returns the wrong product with full confidence.

**Searchable attributes**, in priority order:

```
name_he  name_en  brand  category_name_he  city  tags
supplier_name  short_description_he  description_he  sku
```

**Filterable** (these are the facets):

```
type  category_id  category_slug  city  tags  supplier_id
kenyon_price  in_stock  _geo
```

The briefs ask for facets on category, price, supplier, city and discount. Four
of the five are here. **There is no `discount` facet**; discount is derived from
`kenyon_price` against the compare-at price and is not an indexed attribute.

**Sortable:** `kenyon_price`, `created_at`, `_geo`. The `_geo` entry is what
makes distance sorting possible on category and search.

**Ranking rules**, with one non-default insertion:

```
words  typo  in_stock:desc  proximity  attribute  sort  exactness
```

`in_stock:desc` sits third, above proximity. An out-of-stock product cannot
outrank an in-stock one on wording alone, which is the correct commercial
behaviour and is not Meilisearch's default.

**Stop words**, eight Hebrew function words:

```
של  עם  את  או  גם  זה  הוא  היא
```

**Synonyms** are built by `buildSynonyms()` in
`src/lib/search/hebrew-synonyms.ts`, which currently defines 15 groups. They are
generated in code rather than loaded from a `synonyms.he.json` file. The briefs
ask for that filename; it does not exist and the code does not read one.

## Indexing

`src/lib/search/indexer.ts` speaks the Meilisearch REST API directly and returns
`'skipped: meilisearch not configured'` when the environment is absent, so an
unconfigured deployment degrades quietly instead of throwing on every write.

`src/lib/search/qstash.ts` carries the retry contract. Its own comment describes
exponential backoff followed by a POST to `/api/search/index-dlq`, and
`search_index_dlq` exists as a table in production with RLS on and no policy, so
dead letters are server-only.

**The backoff ladder the briefs specify (1m, 5m, 15m, 1h, 240m) is not in this
repo.** What exists is QStash's own exponential backoff plus a dead-letter hop.
The specific ladder, and the debounce / coalesce / bisect behaviour also asked
for, would need to be written. They are not here and this document will not
claim otherwise.

## What is missing against the briefs

| Asked for | State |
| --- | --- |
| typo tolerance 4/8 | implemented as **4/7** |
| `synonyms.he.json` | synonyms are built in code, 15 groups, no such file |
| facet on `discount` | absent; the other four facets exist |
| backoff 1m/5m/15m/1h/240m | absent; QStash exponential backoff + DLQ instead |
| debounce, coalesce, bisect | absent |
| `golden-queries.json`, 50 Hebrew queries | absent |
| `search-eval.mjs` and a pass rate | absent |
| drift checker, DB count vs index count | absent |
| `packages/search` | there is no `packages/` directory; the code is `src/lib/search/` |

## Tests that exist

`meili-settings.test.ts` and `hebrew-synonyms.test.ts` both pass in the suite.
They assert the settings object rather than a live index, so they prove the
configuration is what this document says it is, and prove nothing about a
running Meilisearch instance. There is no such instance to test against.
