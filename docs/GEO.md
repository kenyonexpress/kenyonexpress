# Geo

Verified 2026-09-02 rather than rebuilt: G5 asked for city tags, a cities
schema, distance sorting and city facets, and most of it predates G5.

| Piece | State | Where |
| --- | --- | --- |
| City list | Static, in code | `src/lib/geo/cities.ts` (+tests). No `cities` table exists in production, and a static list of Israeli cities is honest for a catalogue of 45 products. |
| City tags UI | Wired | `src/components/geo/CityTags.tsx`, rendered on the category page |
| City filter | Wired | `src/lib/category-page.ts` via `filterByCity` |
| Distance math | Exists | `src/lib/geo/distance.ts` (+tests), coordinates validated |
| Supplier coordinates | **Staged, unapplied** | `migrations/pending/136_supplier_coordinates.sql` |
| Distance SORT | **Blocked on 136** | sorting suppliers/products by distance needs their coordinates; the column ships in 136 |
| Search facets | Not applicable | search is Postgres ILIKE; there is no Meilisearch in the query path to facet |

The G5 brief's "migration 135 for a cities table" collides with reality twice:
135a/b are taken (recurring products), and the code's city model is a static
list, not a table. Nothing here invents the table; if a cities table is ever
wanted, it replaces `cities.ts` in one move.
