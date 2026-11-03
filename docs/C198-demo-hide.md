# C198: demo deals hidden from every public surface

Date: 2026-11-04. Branch `closeout/v1-final`, base 40e972425.

## What changed

Rows with `products.is_demo = true` (migration 329, 44 rows seeded by 330)
no longer reach any public listing, search, sitemap, feed or JSON-LD. Admin
pages read through the admin client and are untouched, so admin still lists,
edits and bulk-deletes them.

RLS cannot do this alone: `products_select_anon` is
`status = 'active' and deleted_at is null` and knows nothing about
`is_demo`. The filter is therefore in the application, on every public read:

| Surface | File |
|---|---|
| Home grids | `src/lib/home-data.ts` |
| Category listing, counts, price range, suppliers, tags, computed views | `src/lib/category-page.ts` (6 reads) |
| Sitemap | `src/app/sitemap.ts` |
| Product feed / merchant feed | `src/lib/feeds/catalogue.ts` |
| Related products strip | `src/lib/related-products.ts` (2 reads) |
| City page | `src/lib/city-page.ts` |
| Supplier storefront | `src/lib/supplier-storefront.ts` |
| Search page ILIKE path, faceted search | `src/lib/search-server.ts`, `src/lib/search/faceted-server.ts` |
| Search API ILIKE path | `src/app/api/search/route.ts` |
| `search_products` FTS RPC (both callers) | `withoutDemoRows` in `src/lib/supabase/pending-search.ts`, fails closed |
| Meilisearch reindex + prune, per-row index job | `src/lib/search/meilisearch.ts`, `src/lib/search/indexer.ts` |
| PDP body, PDP prerender list, PDP metadata | `src/lib/product-detail.ts`, `src/lib/product-seo.ts` (demo slug answers 404 + noindex, so no Product JSON-LD) |
| Mobile PDP API, partners API, daily-deals cron | their route files |

`src/types/database.ts` gains `is_demo` on products (the column is live since 329).
No migration, no DB write.

The slug prefix is not the test: production has 30 real (not `is_demo`)
products whose slug also starts with `demo-`. Every filter uses `is_demo`.

Guard: `src/__tests__/demo-deals-hidden.test.ts` fails if any active-products
read in the 13 public readers lacks `.eq('is_demo', false)`. Mutation-checked:
reverting the filters in `category-page.ts` and `sitemap.ts` turns 2 tests red.

## Gates

```
pnpm type-check   -> tsc --noEmit, 0 errors
pnpm lint         -> rc=0 (26 pre-existing warnings), tokens/copy/asset gates clean
pnpm test         -> first run: Tests 5 failed | 9717 passed | 39 skipped (9761)
                     (all 5 in daily-deals route.test.ts: its fake chain had no .eq;
                      fixed by adding 'eq' to the fake)
vitest daily-deals -> Tests 9 passed (9)
vitest demo-deals-hidden + search-server + api/search + lib/search
                  -> Test Files 16 passed (16), Tests 222 passed (222)
pnpm build        -> rc=0
```

## Playwright: local production build (`pnpm start` :3398, production DB)

`node scripts/demo/check-demo-hidden.mjs http://localhost:3398 demo-slugs.json`
(44 slugs from `select slug, name_he from products where is_demo`):

```
PASS  380 home                         status=200 links=17 demo_links=0 demo_jsonld=0
PASS  380 category/hot-deals           status=200 links=1 demo_links=0 demo_jsonld=0
PASS  380 category/under-99            status=200 links=9 demo_links=0 demo_jsonld=0
PASS  380 category/new                 status=200 links=5 demo_links=0 demo_jsonld=0
PASS  380 category/restaurants-cafes   status=200 links=3 demo_links=0 demo_jsonld=0
PASS  380 category/beauty-health       status=200 links=8 demo_links=0 demo_jsonld=0
PASS  380 category/phones-computers    status=200 links=4 demo_links=0 demo_jsonld=0
PASS  380 category/baby-kids           status=200 links=2 demo_links=0 demo_jsonld=0
PASS  380 category/vacation            status=200 links=6 demo_links=0 demo_jsonld=0
PASS  380 category/pets                status=200 links=0 demo_links=0 demo_jsonld=0
PASS  380 category/professionals       status=200 links=1 demo_links=0 demo_jsonld=0
PASS  380 category/electronics         status=200 links=0 demo_links=0 demo_jsonld=0
PASS  380 category/courses             status=200 links=0 demo_links=0 demo_jsonld=0
PASS  380 search?q=iPhone              status=200 links=0 demo_links=0 demo_jsonld=0
PASS  380 search?q=קפה                 status=200 links=3 demo_links=0 demo_jsonld=0
PASS  380 search?q=ספא                 status=200 links=1 demo_links=0 demo_jsonld=0
PASS  380 search?q=צימר                status=200 links=2 demo_links=0 demo_jsonld=0
PASS  380 search?q=מחשב                status=200 links=0 demo_links=0 demo_jsonld=0
PASS 1440 home                         status=200 links=24 demo_links=0 demo_jsonld=0
PASS 1440 category/hot-deals           status=200 links=1 demo_links=0 demo_jsonld=0
PASS 1440 category/under-99            status=200 links=9 demo_links=0 demo_jsonld=0
PASS 1440 category/new                 status=200 links=5 demo_links=0 demo_jsonld=0
PASS 1440 category/restaurants-cafes   status=200 links=3 demo_links=0 demo_jsonld=0
PASS 1440 category/beauty-health       status=200 links=8 demo_links=0 demo_jsonld=0
PASS 1440 category/phones-computers    status=200 links=4 demo_links=0 demo_jsonld=0
PASS 1440 category/baby-kids           status=200 links=2 demo_links=0 demo_jsonld=0
PASS 1440 category/vacation            status=200 links=6 demo_links=0 demo_jsonld=0
PASS 1440 category/pets                status=200 links=0 demo_links=0 demo_jsonld=0
PASS 1440 category/professionals       status=200 links=1 demo_links=0 demo_jsonld=0
PASS 1440 category/electronics         status=200 links=0 demo_links=0 demo_jsonld=0
PASS 1440 category/courses             status=200 links=0 demo_links=0 demo_jsonld=0
PASS 1440 search?q=iPhone              status=200 links=0 demo_links=0 demo_jsonld=0
PASS 1440 search?q=קפה                 status=200 links=3 demo_links=0 demo_jsonld=0
PASS 1440 search?q=ספא                 status=200 links=1 demo_links=0 demo_jsonld=0
PASS 1440 search?q=צימר                status=200 links=2 demo_links=0 demo_jsonld=0
PASS 1440 search?q=מחשב                status=200 links=0 demo_links=0 demo_jsonld=0
sitemap.xml locs=120 demo=0
api/search q=iPhone results=0 demo=0
api/search q=קפה results=2 demo=0
api/search q=ספא results=2 demo=0
api/search q=צימר results=2 demo=0
api/search q=מחשב results=0 demo=0
demo PDP /product/demo-alternative-medicine status=404
TOTAL pages=36 pass=36 demo_links=0 demo_jsonld=0 failures=0
```

## Control: same script against production today (before deploy)

Proves the checker sees demo deals when they are there:

```
FAIL  380 home                         status=200 links=29 demo_links=28 demo_jsonld=0
FAIL  380 category/hot-deals           status=200 links=10 demo_links=9 demo_jsonld=0
FAIL  380 category/under-99            status=200 links=13 demo_links=4 demo_jsonld=0
FAIL  380 category/new                 status=200 links=24 demo_links=24 demo_jsonld=0
FAIL  380 category/restaurants-cafes   status=200 links=8 demo_links=5 demo_jsonld=0
FAIL  380 category/beauty-health       status=200 links=15 demo_links=7 demo_jsonld=0
FAIL  380 category/phones-computers    status=200 links=9 demo_links=5 demo_jsonld=0
FAIL  380 category/baby-kids           status=200 links=5 demo_links=3 demo_jsonld=0
FAIL  380 category/vacation            status=200 links=11 demo_links=5 demo_jsonld=0
FAIL  380 category/pets                status=200 links=2 demo_links=2 demo_jsonld=0
FAIL  380 category/professionals       status=200 links=2 demo_links=1 demo_jsonld=0
FAIL  380 category/electronics         status=200 links=6 demo_links=6 demo_jsonld=0
FAIL  380 category/courses             status=200 links=1 demo_links=1 demo_jsonld=0
FAIL  380 search?q=iPhone              status=200 links=1 demo_links=1 demo_jsonld=0
FAIL  380 search?q=קפה                 status=200 links=6 demo_links=3 demo_jsonld=0
FAIL  380 search?q=ספא                 status=200 links=5 demo_links=4 demo_jsonld=0
FAIL  380 search?q=צימר                status=200 links=3 demo_links=1 demo_jsonld=0
FAIL  380 search?q=מחשב                status=200 links=2 demo_links=2 demo_jsonld=0
FAIL 1440 home                         status=200 links=29 demo_links=28 demo_jsonld=0
FAIL 1440 category/hot-deals           status=200 links=10 demo_links=9 demo_jsonld=0
FAIL 1440 category/under-99            status=200 links=13 demo_links=4 demo_jsonld=0
FAIL 1440 category/new                 status=200 links=24 demo_links=24 demo_jsonld=0
FAIL 1440 category/restaurants-cafes   status=200 links=8 demo_links=5 demo_jsonld=0
FAIL 1440 category/beauty-health       status=200 links=15 demo_links=7 demo_jsonld=0
FAIL 1440 category/phones-computers    status=200 links=9 demo_links=5 demo_jsonld=0
FAIL 1440 category/baby-kids           status=200 links=5 demo_links=3 demo_jsonld=0
FAIL 1440 category/vacation            status=200 links=11 demo_links=5 demo_jsonld=0
FAIL 1440 category/pets                status=200 links=2 demo_links=2 demo_jsonld=0
FAIL 1440 category/professionals       status=200 links=2 demo_links=1 demo_jsonld=0
FAIL 1440 category/electronics         status=200 links=6 demo_links=6 demo_jsonld=0
FAIL 1440 category/courses             status=200 links=1 demo_links=1 demo_jsonld=0
FAIL 1440 search?q=iPhone              status=200 links=1 demo_links=1 demo_jsonld=0
FAIL 1440 search?q=קפה                 status=200 links=6 demo_links=3 demo_jsonld=0
FAIL 1440 search?q=ספא                 status=200 links=5 demo_links=4 demo_jsonld=0
FAIL 1440 search?q=צימר                status=200 links=3 demo_links=1 demo_jsonld=0
FAIL 1440 search?q=מחשב                status=200 links=2 demo_links=2 demo_jsonld=0
sitemap.xml locs=154 demo=44
api/search q=iPhone results=1 demo=1
api/search q=קפה results=3 demo=1
api/search q=ספא results=5 demo=3
api/search q=צימר results=3 demo=1
api/search q=מחשב results=2 demo=2
demo PDP /product/demo-alternative-medicine status=200
TOTAL pages=36 pass=0 demo_links=222 demo_jsonld=0 failures=39
```

RESULT: DONE
