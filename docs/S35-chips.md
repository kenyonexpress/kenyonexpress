# S35: filter chip data (06.11.2026)

Queue item S35: `products.open_weekend` and `products.free_shipping` as boolean columns, a migration for them, admin fields, the category chips wired to them, and no location chip.

The chips row already existed, on stand-ins. "Open on the weekend" filtered on a marker tag, `open-weekend`, inside `products.tags`. "Free shipping" filtered on `requires_shipping = true AND shipping_price_agorot = 0`, a rule nobody set on purpose. The row also carried a fifth chip, "near me". This item did four things:

- Migration `262_product_chip_flags.sql`: the two columns, a one-time carry-over from the stand-ins, and a CHECK. Applied to production.
- The chips filter on the two columns, one `eq` each. The retry that worked around a missing `shipping_price_agorot` is gone.
- The admin product form has a checkbox for each column, and the server refuses "free shipping" beside a shipping price.
- Both archive pages mount a new four-chip row with no location chip.

Everything below was measured on 06.11.2026 against the production database, and in a browser on `next build` + `next start` (port 3335, headless Chromium). Production itself answers 503 under `MAINTENANCE_MODE` and was not measured.

## What changed

| file | change |
|---|---|
| `migrations/pending/262_product_chip_flags.sql` | New. `open_weekend` and `free_shipping`, `boolean NOT NULL DEFAULT false`. Each is added and backfilled inside one "column does not exist yet" branch, so a second run neither adds nor re-ticks anything. `products_free_shipping_consistent` refuses free shipping on a row with a shipping price or without physical shipping. |
| `migrations/pending/README.md` | The row for 262. |
| `src/__tests__/pending-migrations-inventory.test.ts` | 262 added to the list. |
| `src/types/database.ts` | The two columns on `products` Row, Insert and Update, added by hand. The file was not regenerated. |
| `src/lib/catalogue/filter-chips.ts` | `applyChipFilters` is `eq('open_weekend', true)` and `eq('free_shipping', true)`. `OPEN_WEEKEND_TAG` and `isMissingShippingColumn` removed. New: `freeShippingConflict` and `freeShippingConstraintError`, the CHECK's rule and its refusal as Hebrew sentences. |
| `src/lib/category-page.ts` | `runWithShippingFallback` removed; both archive queries run once. |
| `src/lib/admin/product-form-schema.ts` | `open_weekend` and `free_shipping` on `productExtrasSchema` (not on `productSchema`, which the CSV import spreads into its insert). |
| `src/server/actions/admin/products.ts` | Reads the two checkboxes, runs `freeShippingConflict` before the write, writes both columns directly, and words the CHECK's refusal on update and insert. The tags input no longer adds or strips a marker. |
| `src/components/admin/ProductForm.tsx` | The weekend checkbox reads `product.open_weekend`. New "משלוח חינם" checkbox under it. The tags box no longer hides a marker tag. |
| `src/components/catalogue/CatalogueFilterChips.tsx` | New. The four-chip row: weekend, free shipping, under 99, newest. Server component, links only. |
| `src/components/catalogue/catalogue-filter-chips.test.tsx` | New. Three tests. |
| `src/app/(store)/category/[slug]/page.tsx`, `src/app/(store)/products/page.tsx` | Mount `CatalogueFilterChips` instead of `components/category/FilterChips`. |
| `src/lib/catalogue/filter-chips.test.ts` | Rewritten for the columns and the conflict rule. |
| `e2e/s35-chips.spec.ts` | New. The row and both column chips in a browser, on a category page and on `/products`. |
| `README.md`, `docs/INDEX.md`, `STATE.md` | Document count, index row, state. |

## Measured

### The migration

Before applying, on production (read only):

| what | value |
|---|---|
| `products` rows | 132 |
| rows with the tag `open-weekend` | 0 |
| rows with `requires_shipping AND shipping_price_agorot = 0` | 14 (11 active, 3 draft) |
| rows with a shipping price above 0 | 11 |
| physical rows with a NULL shipping price | 66 |

Rehearsed in `BEGIN ... ROLLBACK`: 14 rows ticked `free_shipping`, 11 of them active, 0 ticked `open_weekend`; afterwards neither column existed. Then applied in one transaction. After:

```
free_shipping  boolean  NOT NULL  DEFAULT false
open_weekend   boolean  NOT NULL  DEFAULT false
products_free_shipping_consistent
  CHECK ((NOT free_shipping) OR (requires_shipping AND (COALESCE(shipping_price_agorot, 0) = 0)))
open_weekend = true: 0    free_shipping = true: 14 (11 active)    total: 132
```

The ids of the active rows the free-shipping chip listed before (old rule) and lists after (`free_shipping`) were dumped and diffed: 11 and 11, identical.

Three more checks, each inside a transaction that was rolled back:

| statement | result |
|---|---|
| tick `open_weekend` on one active product, count active rows where `open_weekend` | 1 |
| tick `free_shipping` on a product with a shipping price above 0 | 23514, `products_free_shipping_consistent` |
| tick `free_shipping` on a product with `requires_shipping = false` | 23514, `products_free_shipping_consistent` |

After the three, production still read 0 and 14.

### The pages, in a browser

`e2e/s35-chips.spec.ts`, on `/category/electronics` and on `/products`, projects `chromium` and `mobile-chrome`: 16 of 16, five runs in a row. With `e2e/category.spec.ts` in the same run: 40 of 40.

What the spec asserts on each of the two pages:

- The row holds exactly four links, in the order weekend, free shipping, under 99, newest. No `<button>`, no `filter-chip-near`.
- Clicking "משלוח חינם" puts `shipping=free` in the URL and `aria-current="true"` on the chip; the grid is a subset of the unfiltered one; a second click turns it off.
- `?open=weekend` answers 200 with a grid or the empty sentence, and both chips together are one page that renders.
- No horizontal overflow at 380, 768 and 1440 with a chip on.

Counts read from the rendered pages, against the database:

| URL | cards | database |
|---|---|---|
| `/category/electronics` | 6 | 6 active |
| `/category/electronics?shipping=free` | 5 | 5 active with `free_shipping` |
| `/category/electronics?open=weekend` | 0, the empty sentence | 0 |
| `/products?shipping=free` | 11 | 11 |
| `/products?open=weekend` | 0, the empty sentence | 0 |

All seven URLs fetched with curl (the two pages bare, each with each chip, and the category with both) answered 200, with four chip test ids and zero occurrences of `filter-chip-near`.

### Regression

| check | result |
|---|---|
| `vitest run` | 8285 passed, 13 skipped, 0 failed (703 files) |
| `tsc --noEmit` | 0 |
| `pnpm lint` | 0 (docs-index-gate: 355 documents, all listed) |
| `pnpm build` | 0 |
| freeze gate, `git diff design-locked-2026-10-19 -- <frozen paths>` | empty |

## Decisions made alone

- **A new component, not an edit.** The existing row, `src/components/category/FilterChips.tsx`, is under the design freeze and has the location chip inside it. Removing the chip there would have been a freeze violation. The pages are not frozen, so they mount a new row from `src/components/catalogue/`. The frozen file, its test and `components/geo/NearMeChip.tsx` are untouched and no longer mounted by any page.
- **`?near=` still works.** The nearest-first sort and its parser stay; a URL that already carries `near=` keeps its order, and the chips keep the parameter. Nothing in the row writes it any more.
- **The file is `262_...`, not `<timestamp>_...`.** Every file in `migrations/pending/` is numbered and `pending-migrations-inventory.test.ts` reads the three-digit prefix.
- **The 14 rows were ticked.** They are exactly the rows the chip listed before, so the chip shows the same products on both sides of the change. The alternative, starting from an empty chip, would have removed 11 products from a filter with no operator decision behind it either way. A NULL shipping price was not carried over; it was never in the chip.
- **The CHECK.** The item asked for a boolean. "Free shipping" is a statement to a customer, so the table refuses it beside a shipping price or on a product that does not ship. The admin action checks the same rule first.
- **Both staff roles can tick the boxes.** They are written with the content fields, like `city`. The content uploader's form has no shipping price box, so for that role the pre-check cannot see the stored price and the CHECK is what refuses; the action words that refusal.
- **The 42703 retry was removed.** It existed because the free-shipping stand-in named a column from a pending migration. The chip columns are live, so a missing column is now a real failure and is reported as one.
- **No index.** 132 rows.
- **Applied wrapped in `BEGIN; ... COMMIT;`.** `~/ke-goals/db.sh -f` passes the file's text as an argument, and a file that begins with a `--` comment is read as a flag (the first attempt failed that way and changed nothing).

## Not measured

- **Saving the admin form in a browser.** No product was saved through `/admin` in this item; that would have written to production. The rule is covered by unit tests (`freeShippingConflict`, `freeShippingConstraintError`) and the CHECK by the rolled-back statements above. The path form -> action -> column was not exercised end to end.
- **A product ticked "open on the weekend" on a rendered page.** No row has the flag, so the weekend chip was measured returning the empty state, and the filter itself only in SQL.
- **Production.** 503 under `MAINTENANCE_MODE`.
- **`compare.mjs`.** Not run: `/category/*` and `/products` are not on the open list.

## Found and not handled

- The backfill fired the table's triggers on 14 rows: `updated_at` moved to 06.11, `audit_products` wrote 14 rows, and the search index queue got 14 entries.
- `README.md` stated 353 documents with 354 on disk before this item. It now states the on-disk count.
- 66 physical products have a NULL `shipping_price_agorot`. They read as 0 in the admin form and were never in the free-shipping chip.
- The hint under the shipping price box still reads "0 = משלוח חינם". The price is still what would be charged; the chip now needs the checkbox as well.
- `~/ke-goals/db.sh -f` fails on any SQL file whose first line is a comment.
- `components/category/FilterChips.tsx`, its test, `NearMeChip.tsx` and `use-near-me.ts` are now unreferenced by any page. The first two are frozen.
- On roughly one load in six the category page holds a second copy of the row for a moment after the load event, inside React's hidden `div#S:2` before the segment is revealed. One row in `<main>` at every load, one row in total within 3 seconds. It predates this item (the Suspense structure was not changed); the spec reads inside `<main>` because of it.

RESULT: DONE
