<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# `npm install` cannot work in this repo. Use `pnpm`.

Any `npm install`/`npm i <pkg>` run from the project root dies with:

```
npm error Cannot read properties of null (reading 'matches')
```

This is **not** a corrupt npm cache, and `npm cache clean --force` does not
change it. The package manager here is pnpm (`packageManager: pnpm@11.1.2`,
`pnpm-lock.yaml`, no `package-lock.json`). pnpm's virtual store,
`node_modules/.pnpm/**`, is a forest of symlinks. npm's arborist loads that
tree, builds `Link` nodes whose `target` resolves to `null`, and then
`Link.matches` dereferences it:

```
at Link.matches      (@npmcli/arborist/lib/node.js:1183:41)
at Link.canDedupe    (@npmcli/arborist/lib/node.js:1127:15)
at PlaceDep.pruneDedupable
```

Measured, not assumed: the identical `npm i -D playwright`, same npm 11.12.1
and same cache, succeeds in an empty directory and fails here. It also fails
**before any escape hatch npm offers** — a `preinstall` script and
`engine-strict` + a bogus `engines.npm` were both tried and neither fired,
because the crash is inside `buildIdealTree`, ahead of every lifecycle hook.
There is therefore no way to replace that message with a helpful one from
inside the repo. This section is the replacement.

Install with `pnpm add -D <pkg>`.

**`scripts/compare.mjs` never needed it.** It imports `@playwright/test`
(already a devDependency, 1.60.0), not `playwright`, and the browsers are in
`~/Library/Caches/ms-playwright/`. Run it against a built server:

```
PORT=3311 pnpm start &
LOCAL_BASE=http://localhost:3311 node scripts/compare.mjs --page=home
```

## NON NEGOTIABLE: Dynamic Percentages

There is NO fixed commission or split percentage in this project.
Every percentage is per product, set by the admin on the product page.
Never hardcode 0.05, 5, or any other value in code, env, config, or seed.
Never create a global default or a fallback. Empty field = validation error.

Per product fields, under the names the live database actually uses:

| The rule's name | The live column | Notes |
| --- | --- | --- |
| `supplier_split_percent` | `supplier_split_percent` | same |
| `platform_commission_percent` | **`platform_percent`** | read in 49 places, snapshotted to `order_items` |
| `discount_percent` | `discount_percent` | same |
| `voucher_prepaid_amount` | **`coupon_price_ils`** | the absolute amount paid on site for a coupon |
| `supplier_id` | `supplier_id` | same |
| `product_type` | **`products.type`** | enum `product_type` = (coupon, physical, service) |

The two bolded rows were decided on 2026-08-11: the facts already existed under
those names, and adding a second spelling would give one fact two columns on the
money path. That is the exact defect `PENDING-money-integer-fix.sql` exists to
untangle for `compare_at_price` / `compare_at_price_ils`. Do not add
`platform_commission_percent` or `voucher_prepaid_amount` as columns.

DB CHECK: `supplier_split_percent + platform_percent = 100`
Percentages are snapshotted into order_items at order creation and are immutable.

**Statutory rates are not commissions and are exempt from this rule.** They are
set by law, not by an admin, and hardcoding them is correct:

- `CANCELLATION_FEE_RATE` (`src/server/domain/orders/refund.ts`), the Israeli
  distance-selling cancellation fee: the lower of 5% or ₪100.
- `DEFAULT_VAT_PERCENT` (`src/lib/invoices/document.ts`), VAT at 18%.

The CI gate `scripts/check-hardcoded-percentages.mjs` enforces the rule and
allowlists exactly those two.
