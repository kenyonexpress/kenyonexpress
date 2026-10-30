# C03 - Category page, Electro v7 filter chips

RESULT: BLOCKED gate-unmeasurable (no working DB: 244_chips not applied, Supabase key invalid)

Date: 2026-10-30. No code, no locked files, no migrations touched.

## Where the page is
The queue path `apps/web/app/(shop)/category/[slug]/page.tsx` does not exist. The real route is
`src/app/(store)/category/[slug]/page.tsx`, with the sidebar in
`src/components/category/CategoryFilterSidebar.tsx`.

## Why it is blocked
1. **The chips have no data layer live.** `open-weekend` and `free-shipping` need
   `products.weekend_open` / `products.free_shipping` from `migrations/pending/244_chips.sql` (C13). It is
   not applied: Supabase MCP is unauthenticated in this session and `db push` is forbidden. A category query
   filtering on those columns would error on production until the migration lands.
2. **The gates cannot be measured.** The REST endpoint answers 401 with the current `.env.local` keys
   (invalid `SUPABASE_SERVICE_ROLE_KEY`, same cause as C02). The category page renders no real products, so
   `compare.mjs --page=category` (<11% at 380/768/1440) and Lighthouse (>=90) are not meaningful.

## Planned change, ready to do once unblocked
- `CategoryFilterSidebar.tsx`: replace the sidebar contents with two toggle chips (`aria-pressed`),
  `weekend=1` and `shipping=1` query params, resetting `page`.
- Remove `CategoryAutocomplete` from the sidebar (no search field), the city picker (no location), and keep
  reviews out. Update the `layout/no-search-ui.test.ts` exemption to match.
- Parse both params in `page.tsx`, pass them into `getCategoryProductsCached` and its cache key.

## Unblock
Apply `244_chips.sql` by file name via Supabase MCP, and replace the Supabase keys in `.env.local`.
