# S06: cart server audit (04.11.2026)

**Scope.** Queue item S06: verify the cart state machine, line items, agorot
totals, coupon vs physical mixing, shipping fee per product, and min order 0.
Fix bugs in non-frozen code only.

`src/server/cart` does not exist. The cart server is
`src/server/actions/cart.ts` (the `'use server'` actions) plus `src/lib/cart/**`
(pricer, types, coupon evaluation, product loader), and checkout's gate is
`src/lib/checkout/validate-cart.ts`. None of these are frozen.

## What was verified

| Rule | Where | Result |
|---|---|---|
| Line state machine | `pricing.ts` `unavailableReason` | Precedence is `delisted > price_error > unpriced > out_of_stock > insufficient_stock > over_limit`. Any non-null reason sets `available: false`, and `validateCartView` refuses the cart (`UNAVAILABLE`). An empty cart is refused (`EMPTY`). |
| Agorot totals | `pricing.ts`, `lib/commerce/money.ts` | The only float to integer step is `ilsToAgorot(price.toFixed(2))`, once per line. `subtotal` is the sum of `customer_pays_now`, `total = subtotal - discount`, and the discount is capped at the subtotal. Every field is a safe integer on a mixed, discounted cart priced at 33.33 / 49.90 / 199.90. |
| Coupon vs physical mixing | `validate-cart.ts`, `checkout.ts:386` | A mixed cart is allowed. An address is required only when there is a physical line (`requiresAddress = hasPhysical`), and a coupon-only cart never asks for one. `is_coupon_enabled` sells a physical row as a coupon. The coupon line keeps 100% of its prepayment as platform fee, and the physical line splits by `platform_percent`. |
| Shipping fee per product | `lib/shipping/zones.ts` | No product carries a shipping fee. There is no shipping column on `products` or `orders`, and `CartView` has no shipping line. `anyZoneCharges()` is false, matching "משלוח מהיר חינם". This is by design (see the header of `zones.ts`), so nothing was changed. |
| Min order 0 | whole cart and checkout path | There is no minimum order constant anywhere. A cart with a total of 1 agora passes `validateCartView`. `products.min_purchase_ils` exists, but it is null or 0 on all 90 active products (measured) and nothing reads it. |

## Bugs found and fixed

### 1. `max_per_order` was never enforced

The admin form writes `products.max_per_order`, but neither the add-to-cart
gate nor the pricer read it. Measured on production:

```
select max_per_order, type, count(*) as n from products
 where status='active' and deleted_at is null group by 1,2;
{"max_per_order":5,"n":22,"type":"physical"},{"max_per_order":10,"n":22,"type":"coupon"},
{"max_per_order":null,"n":1,"type":"coupon"},{"max_per_order":null,"n":45,"type":"physical"}
has_column_privilege('anon','public.products','max_per_order','SELECT') -> true
```

44 active products had a limit, and the cart let shoppers buy up to 99.

Fix:
- `validateProductForCart` now selects `max_per_order` and refuses with
  `MAX_PER_ORDER` / "ניתן להזמין עד N יחידות מהמוצר". It checks the total
  **per product across every line**, so two variants share one limit.
- `buildCartView` adds the `over_limit` reason and caps `max_quantity` at the
  lower of stock and the remaining limit. That stops the stepper at the ceiling
  and makes checkout refuse carts that went over the limit before this fix,
  including carts from a guest-cart merge.
- `load-products.ts` reads the column. It exists on the hosted project and anon
  can read it, so the select cannot fail with 42703.
- `format.ts` adds the shopper message: "ניתן להזמין עד N יחידות — הפחיתו את הכמות כדי להמשיך".
- When stock and the limit are both exceeded, the lower ceiling is the one
  reported, so the message never states the wrong number.

### 2. Guest-cart merge could delete the only copy of the items

`runMergeGuestCart` ran the account write and the guest delete together in a
`Promise.all` and read neither result. If the account update or insert failed
(RLS, timeout), the guest row was still deleted, and the merged items were
lost. Now the account write runs first and its error is checked. On failure,
the function logs `cart.merge_write_failed` and returns `false`, which already
makes the caller keep the guest cookie for a retry. The guest row is deleted
only after the account write succeeds. A failed delete is logged as a warning
and does not fail the login.

## Tests

New: `src/lib/cart/s06-cart-rules.test.ts` (19 tests) and
`src/server/actions/cart-s06.test.ts` (8 tests).

```
$ pnpm vitest run src/lib/cart src/server/actions/cart-s06.test.ts src/server/actions/cart-merge-never-duplicates.test.ts src/lib/checkout
 Test Files  22 passed (22)
      Tests  307 passed (307)
```

Coverage of the cart server (same run plus `--coverage`):

```
File               | % Stmts | % Branch | % Funcs | % Lines
  coupon.ts        |     100 |    95.45 |     100 |     100
  format.ts        |     100 |    94.44 |     100 |     100
  load-products.ts |     100 |    83.33 |     100 |     100
  pricing.ts       |   98.27 |    96.06 |     100 |   98.91
  store.ts         |    87.5 |    90.56 |   96.66 |   86.66
  cart.ts          |   53.68 |    49.18 |   55.55 |   57.87   (server/actions)
```

`cart.ts` is at 58% lines. The uncovered code is mostly the coupon and campaign
apply paths, which need the growth client mocked end to end. Those paths are
already covered at the pure layer (`coupon.test.ts`, `lib/growth`). The two
defects above are in the covered half.

```
$ pnpm type-check
$ tsc --noEmit            -> exit 0
```

Full suite:

```
$ pnpm test
 Test Files  644 passed (644)
      Tests  7730 passed | 12 skipped (7742)
test exit 0
$ pnpm lint:docs
docs-index-gate: OK. 288 documents, all listed; 2 out-of-docs row(s) resolve.
$ pnpm biome check src/lib/cart src/server/actions/cart.ts src/server/actions/cart-s06.test.ts docs/S06-cart.md
Checked 26 files in 36ms. No fixes applied.
```

`pnpm lint` exits 1, and every diagnostic is under the untracked
`.lighthouseci/` and `android/` dirs (0 elsewhere), the same state S04 recorded.
Those dirs are not this item's, and they are not committed.

## Freeze gate

```
$ git diff --stat design-locked-2026-10-19 -- src/components src/app/globals.css src/app/layout.tsx src/app/page.tsx tailwind.config.ts
 .../turnstile/SupplierApplyChallenge.tsx           | 49 +++++++++++++++
 src/components/turnstile/TurnstileRefresh.tsx      | 71 ++++++++++++++++++++++
 2 files changed, 120 insertions(+)
```

Both files come from S05 and did not exist at the tag
(`git ls-tree design-locked-2026-10-19 src/components/turnstile/` is empty).
S06 touched nothing under `src/components` or `src/app`.

## Housekeeping

`ci-docs-inventory.test.ts` was red before this item: the README said 286
documents and the disk had 287 (S05's doc was never counted). With this doc
added, the count is 288, and the README now says 288.
