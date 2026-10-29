# C13 — Category-page chips (data layer)

Chips: `open-weekend`, `free-shipping`, `under-100`.

## Data layer

| Chip | Source | Notes |
|---|---|---|
| open-weekend | `products.weekend_open boolean NOT NULL DEFAULT false` | new column |
| free-shipping | `products.free_shipping boolean NOT NULL DEFAULT false` | new column; flag only, threshold stays in `store_settings.free_shipping_threshold_agorot` |
| under-100 | `products.kenyon_price <= 100` | no column; same predicate as the price facet. Existing `under-99` collection rule in `src/lib/category-page.ts` is untouched |

Migration: `migrations/pending/166_chips.sql` (adds both columns, comments,
partial indexes on the flagged rows, rollback, verification queries).
Defaults are false, so applying changes nothing on any live page until a
product is flagged.

`applied/` already contains a `166_voucher_transition_guard.sql`; the C13 file
name is kept as specified (165 is cancelled). Apply by file name.

## Scope

Data layer only. No UI, no locked components, no money arithmetic.
Follow-up (not in C13): admin product form toggles, `category-page.ts`
filters (`weekend_open = true`, `free_shipping = true`, `kenyon_price <= 100`),
and the chip row on `/c/<slug>`.

## Status

- Migration file written to `migrations/pending/`.
- **Not applied**: the Supabase MCP is not authorized in this session, and the
  service-role key is known invalid (see STATE C02). Apply with
  `apply_migration` on project `ixvwfbuvfxxsjiywhbbb` once available.
- compare.mjs gate not run: no page or CSS changed.
