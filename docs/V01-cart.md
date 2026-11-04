# V01: cart visual (04.11.2026)

Queue item V01: the cart drawer and /cart rebuilt to match the Electro v7 cart. Desktop gets a table, mobile gets stacked cards. Everything is RTL, with a quantity stepper, remove, totals in whole shekels, and an empty state.

## What changed

**/cart is now Electro's WooCommerce `table.shop_table.cart`.**
- Columns run right to left: remove, thumbnail, product, price, quantity, subtotal. The header cells for remove and thumbnail carry screen-reader names.
- Row geometry comes from Electro's measured values in `refs/GAP-CART-CHECKOUT.md`: 1px `#ddd` row rules, cells padded 34.995px × 8px and centred vertically, and a 92px thumbnail with 4px padding.
- Below 768 the same markup stacks the way WooCommerce does on small screens. thead is hidden, thumbnail is hidden, and each cell becomes a full-width row labelled from `data-title`. At 380, Electro shows remove, name, price, qty and subtotal.
- Electro's actions row now sits under the lines. It holds the coupon pill (field plus a dark `#333e48` button, joined) and the gray `#efecec` pill. Electro's pill says "Update cart". Here quantities save on every press, so the pill is **רוקן עגלה**.
- The totals box is Electro's `.cart_totals`: an h2, a two-column table with a rule under each row, then the proceed button. It is end-aligned (left in RTL) at `max(390px, 48%)` from 768 up, and full width below.
- The quantity stepper is minus, value, plus inside Electro's 14px-radius `#ddd` box, with 44px buttons.

**Whole shekels everywhere in the cart.** /cart, the phone drawer and the desktop mini-cart all moved from `shekels` (`1,249.50 ₪`) to `shekelsRounded` (`1,250 ₪`). The store still holds integer agorot, and the checkout reprices on the server, so nothing that is charged changes.

**Drawer.**
- Each line now has its own remove button. Before, the only way to delete a line was pressing minus down to zero.
- Stepper, close and "continue shopping" buttons are now 44px. They were 24, 36 and 40.

## Fixed on the way (measured, not assumed)

1. **The desktop mini-cart opened off-screen.** `inset-inline-end: 0` was meant to open the panel rightward from the icon. But the UA sheet gives `<dialog>` both insets at 0, and with a fixed width that over-constrains the box. In RTL the browser drops `left`, so the panel still opened leftward past the viewport edge. Measured with it open: **182px of horizontal overflow at 1440 and 302 at 768.** The fix is `inset-inline-start: auto`. Overflow is now 0 at both widths.
2. **/cart, the drawer and the mini-cart said "your cart is empty" while the cart was loading.** /cart is prerendered with an empty store, and `/api/cart` answers 1.2 to 2.5 s later (local build, production DB). For that whole wait a guest with items read "סל הקניות שלך ריק כרגע." under a header badge that already said 1. Now, while the persisted count says there are items (`mirrorCount > 0`) and the server has not answered (`!serverConfirmed`), all three surfaces show **טוען את הסל...** instead.
3. **Touch targets.** After the rebuild the measurement script found every control under 44px and they were fixed:
   - the breadcrumb link (29px)
   - the product-name links (19 to 24px)
   - the stepper buttons (42px, because the border took 2px)
   - "view full cart" (29px)
   - the mini-cart remove buttons (22px)

   **0 remain at every width.**

## Proof

### Freeze gate

The amendment of 04.11.2026 opens "cart drawer + /cart" for visual completion and limits the S28 gate to the FROZEN list. Every file this item edits is under `src/components/cart/`, `src/styles/`, `messages/` or `scripts/`. None of them is on that list:

```
$ git diff --stat design-locked-2026-10-19 -- src/components/home src/components/layout src/components/hero src/components/header src/components/category src/components/storefront src/components/product-card src/components/SiteFooter.tsx src/app/globals.css src/app/layout.tsx src/app/page.tsx tailwind.config.ts
(no output)
```

This item's own diff under the paths the original gate names:

```
$ git diff --stat -- src/components src/app/globals.css src/app/layout.tsx src/app/page.tsx tailwind.config.ts
 src/components/cart/CartCouponForm.tsx    |  74 +++++++-------
 src/components/cart/CartDrawer.tsx        |  42 ++++++--
 src/components/cart/CartLineItem.tsx      | 162 +++++++++++++++---------------
 src/components/cart/CartPageView.tsx      | 102 +++++++++++++------
 src/components/cart/CartTotalsSidebar.tsx | 106 ++++++++++---------
 src/components/cart/MiniCartDropdown.tsx  |  23 +++--
 6 files changed, 296 insertions(+), 213 deletions(-)
```

(The final stat also includes the mini-cart touch-target change in `src/styles/mini-cart.css`, which is outside these paths.)

**Decision made alone:** `MiniCartDropdown` is rendered through the header's `HeaderCart`, and the header is frozen. It was treated as part of "cart drawer", because it *is* the cart drawer above 767px: one `drawerOpen` flag drives both, and CSS shows whichever fits the width. Only its price formatter, its loading state and its touch-target CSS changed. Its layout and markup are as they were. No file under `src/components/layout` or `header` was touched.

### Screenshots

`docs/V01/`, from a local production build (`pnpm build`, then `pnpm start` on 3311, against the production DB as a guest):

| File | What |
|---|---|
| `cart-380.png`, `cart-768.png`, `cart-1440.png` | /cart with two lines |
| `drawer-380.png` | the phone sheet with two lines |
| `drawer-768.png`, `drawer-1440.png` | the desktop mini-cart, opened from the header |
| `cart-empty-380.png`, `cart-empty-768.png`, `cart-empty-1440.png` | /cart after pressing רוקן עגלה |

Reproduce:

```
PORT=3311 pnpm start &
BASE=http://localhost:3311 node scripts/v01-cart-shots.mjs
```

### Overflow and touch-target measurement

`scripts/v01-cart-shots.mjs` reports, on the same run as the screenshots, horizontal overflow and every visible button, link and input under 44px. `under44` counts those small controls:

```
added 2
cart-380        overflowX=0  under44=[]
cart-768        overflowX=0  under44=[]
cart-1440       overflowX=0  under44=[]
drawer-380      overflowX=0  under44=[]
drawer-768      overflowX=0  under44=[]
drawer-1440     overflowX=0  under44=[]
cart-empty-380  overflowX=0  under44=[]
cart-empty-768  overflowX=0  under44=[]
cart-empty-1440 overflowX=0  under44=[]
```

Before the fixes, the same script read `drawer-768 overflowX=302`, `drawer-1440 overflowX=182`, and 2 to 4 controls under 44 on each cart surface.

### Tests and gates

```
$ npx tsc --noEmit
(exit 0)

$ pnpm lint
tokens gate: clean · copy gate: clean · asset gate: clean · raw-html gate: clean
postgrest-or gate: clean · cache-invalidation gate: clean · rtl-logical gate: clean
i18n gate: clean (601 Hebrew literals in scope, ceiling 601)
locale-format gate: clean · input-dir gate: clean
docs-index-gate: OK · docs-path-audit: OK
(exit 0)

$ npx vitest run
 Test Files  684 passed | 1 skipped (685)
      Tests  8133 passed | 13 skipped (8146)

$ npx vitest run src/components/cart     (after the last change)
      Tests  19 passed (19)

$ pnpm build
(exit 0)
$ curl -s -o /dev/null -w "%{http_code}" http://localhost:3311/cart
200
```

The new `src/components/cart/cart-page-view.test.tsx` pins four things:
- the six Electro columns
- whole shekels: `1,249.50` renders `1,250`, and no `d.dd` appears anywhere on the page
- the `סיכום הזמנה` complementary region and `לתשלום באתר`, which `e2e/cart.spec.ts`, `purchase-flow.spec.ts` and `production-smoke.spec.ts` find by name
- "loading, not empty" while a remembered cart is on its way, and "empty" once the server answers with nothing

The i18n ceiling went from 603 to 601: the new strings were born in `messages/*.json` under `cartPage.*`, and two old totals strings moved there with them.

## Findings not fixed here

- **A guest's first add can fail with 23505 on `carts_one_per_guest_session_uniq`.** Reproduced only when a client navigates away while the add's server action is still running, and then adds again. The header badge moves optimistically, the navigation cancels the first request on the client, and the server still runs it. So two inserts for the same session race, and the loser throws. A shopper who clicks buy and then immediately opens another product can hit it. The server log recorded 4 of these across 6 shot-script runs that polled the badge. After the script switched to waiting for the action's POST response: 0 in 3 runs. The fix belongs in `saveCartItems` (`src/server/actions/cart.ts`): on 23505, re-read the row and update it. That is a cart-write change and out of a visual item's scope.
- **Catalogue content:** the first purchasable product is still `! צימר מאסטר` at ₪699. That is item 1 on the CLAUDE.md list (template rows in the live catalogue) and an operator decision.
