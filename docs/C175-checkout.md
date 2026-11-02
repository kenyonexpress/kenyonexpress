# C175: cart + checkout gap (refs/GAP-CART-CHECKOUT.md)

Date: 2026-11-03, branch closeout/v1-final.

## Gap doc is stale (written 2026-08-03)

`refs/GAP-CART-CHECKOUT.md` is three months older than the current cart and
checkout. Rows it lists that the code has since closed:

| gap row | state now | where |
|---|---|---|
| col-price MISSING (380/768) | unit-price row `.cart-line__unit` ("מחיר:") ships, hidden from 768 up | src/components/cart/CartLineItem.tsx |
| checkout-steps present, order-review / payment-box / place-order 0x0 at 380/768 | below 992 the stepper is display:none and every step paints stacked (one long column, Electro's shape) | src/styles/checkout-page.css `@media (max-width: 991px)` |
| checkout-form MISSING | the form exists; the measurer's local selector `.checkout-col-main form` could never match (the form wraps the column) | refs/measure-cart-checkout.mjs |
| direction ltr vs rtl (every row) | intentional, RTL is a locked rule | CLAUDE.md |
| update-btn MISSING | by design: quantity changes apply immediately via server action | LOCAL_SPEC comment |
| field-select MISSING | Electro's select is the WooCommerce country/state picker; Israel-only shipping address, no billing (locked rule) | |
| MY-ACCOUNT rows | out of scope for this item (cart + checkout) | |

## Feature asks: already shipped

- Guest checkout: `ensureCheckoutUser` gives an anonymous session on submit (anon sign-ins enabled, 327 `profiles.email` nullable, C142).
- Google sign-in at the end: `src/app/(store)/checkout/return/SaveWithGoogle.tsx`, shown to a guest only on the paid return page, calls `linkGoogleAfterCheckout` (`linkIdentity` on the anonymous user).
- Tokenize for one-tap repeat: `save_card` defaults on (guest copy mentions saving with Google afterwards), Cardcom `ChargeAndCreateToken`, `finalize.ts` writes/dedupes `payment_tokens`, `checkout/page.tsx` lists unexpired saved cards, `chargeSavedToken` charges server-to-server with no hosted page (profile ownership + expiry checked).

Unit proof (`docs/C175/vitest-features.txt`):

```
 Test Files  18 passed (18)
      Tests  124 passed (124)
```

## Changed

- `refs/measure-cart-checkout.mjs` LOCAL_SPEC: col-price -> `.cart-line__unit`, checkout-form -> `form.checkout-page__grid`, order-review -> `.checkout-review`, review-table -> `.checkout-review__table`, review-total -> `.checkout-review__row--total`, checkout-steps -> `.checkout-steps`. No src/ change, no forbidden file touched.

## Gate: NOT RUN (Supabase production down)

`pnpm build` reads the DB while collecting page data and failed on this
outage in C152/C173/C174, and the cart seed needs a live catalogue. REST
polled every ~35 s from 05:31 to 06:18 +07, 96 polls, 0 x 200
(`docs/C175/db-poll.txt`, tail):

```
06:15:37 000
06:16:13 000
06:16:48 000
06:17:23 000
06:17:58 000
06:18:34 000
```

Management health at the end:

```
[{"name":"db","healthy":false,"status":"UNHEALTHY","error":"Service health check failed"},{"name":"rest","healthy":false,"status":"UNHEALTHY","info":{"db_schema":"public,graphql_public"},"error":"Service health check failed"}]2026-11-03 06:19:16 +0700

```

GitHub answered 200 in the same window, so the fault is Supabase's side.
Last measured cart/checkout gate (2026-09-06, memory, not proof for this item):
cart 10.07/10.57/8.16, checkout 10.59/10.10/10.71 at 380/768/1440, PASS.

## Next run

When REST returns three 200s in a row: `pnpm build`, `PORT=3311 pnpm start`,
`LOCAL_BASE=http://localhost:3311 node scripts/compare.mjs --page=cart --widths=380,768,1440`,
same for `--page=checkout`, then `node refs/measure-cart-checkout.mjs --local=http://localhost:3311`
for a fresh gap table and close what remains.

RESULT: BLOCKED supabase-down, prod db+rest UNHEALTHY 05:31-06:19 +07, no build so no cart/checkout compare
