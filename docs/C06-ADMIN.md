# C06 - Supplier admin UI

Audit of the four parts, plus the one gap closed.

| Part | Location | State |
|---|---|---|
| Admin product upload form | `src/app/(admin)/admin/products/new`, `[id]/edit`, `src/components/admin/ProductForm.tsx` | Existed. Guarded by `requireSection('catalog','write')`; pricing hidden for roles without money access. |
| CSV import | `src/app/(admin)/admin/products/import`, `src/app/api/admin/products/import/route.ts`, `src/server/actions/admin/product-import.ts` | Existed. Two steps: preview (writes nothing), then commit as drafts. Rate limited, audit logged. |
| `platform_percent` per-product slider | `ProductForm.tsx` | Added in C06: range slider (0-100, step 0.5) bound to the same state as the number input. The supplier split stays at 100 minus the platform percent. Only the number input is submitted. |
| Supplier read-only redemptions | `src/app/(supplier)/supplier/redemptions/page.tsx` | Existed. Read-only list and today / 30-day totals. Money goes through `src/lib/money.ts` (agorot). |

`platform_percent` is per product and snapshotted into `order_items` at purchase time. Vendor-level commission is rejected in `vendors.ts`.

No migrations. No forbidden files touched.
