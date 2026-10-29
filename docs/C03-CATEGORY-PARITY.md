# C03 ELECTRO-V7-PARITY-CATEGORY

RESULT: BLOCKED category grid empty (migration 306 unapplied, Supabase MCP unauthenticated)

No page code was changed. Measurements from the ledger only.

## Path note
The queue names `apps/web/app/(shop)/category/[slug]/page.tsx`. That path does not exist. The route is
`src/app/(store)/category/[slug]/page.tsx`.

## compare.mjs category (latest measured rows, docs/UI-PARITY-REPORT.md, 2026-10-25)
| width | diff | gate <11% |
|-------|------|-----------|
| 380   | 21.31% | FAIL |
| 768   | 17.25% | FAIL |
| 1440  | 9.58%  | PASS |

The 2026-10-28 rows are UNMEASURED (connection refused). These were not re-run for C03.

## Why no rebuild
- `/category/hot-deals` returns 200 with an empty grid (0 product links): `catalogue.category_products_failed 42703`,
  `suppliers.open_weekends` is missing. `migrations/pending/306_suppliers_open_weekends.sql` is unapplied and the Supabase
  MCP is unauthenticated in this non-interactive session, so it cannot be applied here.
- A grid-and-sidebar rebuild cannot be diffed against Electro v7 with no products rendered, and Lighthouse on an empty
  grid is not representative (same finding as M03-c263/c264/c266/c268).
- Neither gate (compare <11% at 380/768, Lighthouse) can be passed or honestly measured, so DONE is not claimed.
