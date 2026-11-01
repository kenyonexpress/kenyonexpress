# C07 - Supplier admin (product upload, CSV import, platform_percent slider, supplier redemptions)

Re-audit of the four parts built in C06, plus three defects found and fixed.

| Part | Location | State |
|---|---|---|
| Admin product upload form | `src/app/(admin)/admin/products/new`, `[id]/edit`, `src/components/admin/ProductForm.tsx` | Present. Guarded by `requireSection('catalog','write')`. |
| CSV import | `src/app/(admin)/admin/products/import`, `src/app/api/admin/products/import/route.ts`, `src/server/actions/admin/product-import.ts`, `src/lib/admin/product-import/import-rows.ts` | Present. Preview writes nothing, commit creates drafts. |
| `platform_percent` slider | `ProductForm.tsx` (range 0-100, step 0.5, synced with the number input; only the number input is submitted) | Present (C06). |
| Supplier read-only redemptions | `src/app/(supplier)/supplier/redemptions/page.tsx`, `src/server/queries/supplier-redemptions.ts` | Present. Money via `src/lib/money.ts` (agorot). |

`platform_percent` is per product and snapshotted into `order_items` at purchase time (`buildOrderItemSnapshot`; `platform-percent-immutability.test.ts` passes).

## Fixes in this item
1. `src/lib/commerce/product-money.ts`: `ProductMoneyWrite` was not exported but `import-rows.ts` imports it. That was a tsc error in the CSV import path. Now exported.
2. `src/lib/admin/product-import/import-rows.test.ts`: the slug test expected a Hebrew slug to be rejected. The schema deliberately accepts Hebrew slugs (36 of 45 live products have one). Test now rejects `bad slug ₪` and accepts a Hebrew slug.
3. Biome: import order in `product-import.ts`, unused setter in `ProductForm.tsx`.

## Gates
- tsc: no errors in any touched or admin/supplier file. Remaining repo-wide tsc errors are in unrelated files (`r2-service.ts` missing `@aws-sdk/*`, `analytics/cohorts.ts`, `queries/reviews.ts`).
- biome: clean on touched files.
- vitest: `src/lib/admin/product-import` 40/40. In `src/lib/commerce` + `src/lib/admin`, 4 other tests fail identically without these changes (`permissions.test.ts` x2, `operational-flags.test.ts` x2); not touched here.
- compare.mjs gate does not apply (admin and supplier pages are not home/product/c).
- Live dummy-product upload/delete not run: Supabase MCP is unauthenticated in this session and migration 306 is unapplied on prod.

No migrations. No forbidden files touched.
