# C104 — F13 filter chips

Chips on `/c/[slug]` (city pages), URL-driven: `?filters=weekend,free_shipping`.
No location chip exists and none was added.

- **Open on weekend** (`weekend`): product matches when `products.opening_hours`
  has `fri` or `sat` with `open === true` (`src/lib/opening-hours.ts`). Still also
  matches `weekend_only` (284) and `suppliers.open_weekends` (306), so nothing that
  matched before stops matching. Before this item the city grid selected neither
  field, so the chip always emptied the grid; `weekend_only` is selected already.
- **Free shipping** (`free_shipping`): `shipping_price_agorot === 0`, integer agorot.
- Matching: `matchesCategoryFilters` in `src/lib/category-filter-chips.ts`.

## Migration

`migrations/pending/320_products_opening_hours.sql` (+ `preflight_320.sql`) adds
`products.opening_hours jsonb` and a partial expression index. **Not applied**: the
Supabase MCP is unauthorized in this session. Until it is applied, `city-page.ts`
must NOT select `opening_hours` (a missing column is 42703 and empties the page), so
the weekend chip runs on `weekend_only` today. After applying 320, add
`opening_hours` to the select in `src/lib/city-page.ts` and the chip picks it up.
