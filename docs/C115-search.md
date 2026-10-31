# C115 - Meilisearch disabled

The Meilisearch Cloud project is paused by owner decision and will not be paid for.
Meilisearch is now an optional dependency.

## Behaviour
- `MEILISEARCH_ENABLED=false` (set in Vercel production): `meiliConfigured()` in
  `src/lib/search-server.ts` and `meiliEnv()` in `src/lib/search/meili-request.ts`
  treat Meilisearch as unconfigured. No outbound request is made.
- Search (`/search`, `/api/search`, suggest) uses the Postgres ILIKE path
  (`searchDb`) over `products.name_he`, `description_he` and `city`
  (this schema has no `title` column; `name_he` is the product title).
  If Meilisearch is enabled but unreachable, `meiliSearch` returns null and the
  same fallback runs. No crash.
- `/api/ready`: `meilisearch` is `not_configured` when disabled or env missing
  (ok), `degraded` when configured but unreachable (ok, HTTP 200). It is never
  `down`, so it can never turn the route 503 or page anyone.

## Re-enabling
Remove `MEILISEARCH_ENABLED` (or set `true`), set `MEILISEARCH_HOST` and
`MEILISEARCH_API_KEY`, redeploy, and reindex via the seed-search admin route.
