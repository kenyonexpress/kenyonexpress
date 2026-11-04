# V02: checkout visual (04.11.2026)

Queue item V02: /checkout rebuilt to match the Electro v7 checkout. It is one page with an order summary panel, email first, a shipping form only for physical carts, a payment section, a sticky pay bar on mobile, and loading and error states.

## What changed

**One page at every width, with no stepper.** Electro's checkout has no wizard. `refs/electro-checkout-text.json` captured `stepLike: []`, and `refs/GAP-CART-CHECKOUT.md` lists `checkout-steps` as present here and missing there. Ours was already a single page below 992 (D25), but from 992 up it was a four-step wizard. The stepper, the "המשך" / "חזרה" / "המשך לאישור" / "חזרה לעריכת הכתובת" buttons, the `data-inactive` step gate and the confirm-step chip list are all gone. Every section is on screen at once:

- Main column, in Electro's order:
  - **פרטים אישיים**: email first, as in Electro's billing block, then first and last name side by side, then phone.
  - **חשבונית על שם עסק**.
  - **כתובת למשלוח**, only when `validateCartView(cart).requiresAddress`, which means the cart holds something physical. Coupon carts get no shipping fields and are never asked for an address. Billing is never asked for.
  - **מידע נוסף**: order notes, and the gift block for coupon carts.
- **Order summary panel** (Electro's `#order_review`):
  - "ההזמנה שלך", the lines, the totals, the payment box (card method, saved cards, wallet), the privacy note, the terms tickbox, save-card, Turnstile, and the 64px yellow place-order button.
  - From 992 up it sits beside the form at Bootstrap's 7/5 (`minmax(0,7fr) minmax(0,5fr)`), `position: sticky`. The old fixed 665/466 pair was the same ratio measured on a 1165px container, and it left 125px of the 1320 container unused.
  - Below 992 it stacks under the form.
- **Whole shekels.** Every price on the page went from `shekels` to `shekelsRounded`, the same move V01 made on the cart. The server reprices in integer agorot, so nothing that is charged changes.
- **Electro's field labels**: bold, 18px line (`GAP-CART-CHECKOUT.md`: field-label `font-weight 700`, `line-height 18.004px`). Below 576 every field row is one column, as in Electro, instead of two 145px inputs.

**Sticky pay bar under 992.** On a phone the real button is about two screens down, so `.checkout-sticky-pay` is fixed at the bottom. It shows "סה"כ לתשלום" with the total and a yellow "לתשלום" button.
- It sits **above** the store's tab bar (`bottom: var(--reserve-tabbar)`, z-35, between the tab bar's z-30 and WhatsApp's z-40).
- It lifts the WhatsApp float above itself, through `body:has(...)`, without touching that component.
- It is hidden while the real pay button is on screen, using an IntersectionObserver.
- It is a second submit of the **same** form, so it runs the same validation.
- Its name is different from "שליחת הזמנה", so a by-name query still finds exactly one button.

**Error state.** Pressing pay runs every section's rules at once (`checkAll`). Before, it walked step by step.
- A refused press paints WooCommerce's error bar above the form: "לא ניתן לשלוח את ההזמנה. יש לתקן את השדות המסומנים באדום.", `role="alert"`, re-announced on every attempt.
- Each field gets its own `role="alert"` message and `aria-invalid`.
- **Focus moves to the first wrong field in reading order**, which scrolls a phone user from the sticky bar up to it.
- Server failures still show in the panel, with "נסו שוב" when the code is retryable.

**Loading state.**
- While the action runs, both pay controls show a spinner and their busy label ("מעביר לדף תשלום מאובטח..." / "מעביר לתשלום..."), and they are `aria-busy`.
- The busy panel button keeps full colour and a progress cursor, so it does not read as greyed out and get pressed again. A spinner with `prefers-reduced-motion` stops spinning, and the label alone carries the state.
- The Suspense shell (`CheckoutShell`) used to draw the stepper row. It now draws the single-page shape: the guest strip, email / name pair / phone skeleton rows at the real 18px label + 45px input heights, and the panel box beside them.

**Touch targets.** The first measured run found these under 44px:
- the breadcrumb link (24)
- the guest sign-in link (24)
- the tickbox rows (24)
- the card-method radio (13, with a sibling label)
- the inline consent links (21 tall, and "לתקנון" 38 wide)

Fixes:
- The radio now sits inside its label.
- Rows get `min-height: var(--cart-touch)`.
- Inline links grow their hit area with padding and give it back with an equal negative margin, so the text layout does not move.

**0 remain at every width** (below).

## Proof

### Freeze gate

The 04.11 amendment opens `/checkout` for visual completion and limits the S28 gate to the FROZEN list. This item edits only `src/app/(store)/checkout/`, `src/styles/checkout-page.css`, `messages/`, tests, `e2e/` and `scripts/`:

```
$ git diff --stat design-locked-2026-10-19 -- src/components/home src/components/layout src/components/hero src/components/header src/components/category src/components/storefront src/components/product-card src/components/SiteFooter.tsx src/app/globals.css src/app/layout.tsx src/app/page.tsx tailwind.config.ts
(no output)

$ git diff --stat -- src/components src/app/globals.css src/app/layout.tsx src/app/page.tsx tailwind.config.ts
(no output)
```

No file under `src/components/` was touched. The WhatsApp lift and the tab-bar clearance are both done from `checkout-page.css`.

### Screenshots

`docs/V02/`, from a local production build (`pnpm build`, then `pnpm start` on 3311, against the production DB as a guest with one product in the cart):

| File | What |
|---|---|
| `checkout-380.png`, `checkout-768.png`, `checkout-1440.png` | the whole page as it opens (full-page captures draw the fixed sticky bar where the viewport was) |
| `checkout-fold-380.png`, `-768`, `-1440` | the first screen: sticky bar above the tab bar at 380, at the bottom at 768, none at 1440 with the sticky panel beside the form |
| `errors-380.png`, `-768`, `-1440` | after pressing pay on the empty form: summary bar, per-field errors, focus on the email |
| `loading-380.png`, `-768`, `-1440` | after pressing pay on a filled form: spinner and busy label |
| `skeleton-380.png`, `-768`, `-1440` | the Suspense shell (scripts off, so the streamed body never swaps in) |

**No order was created.** The script holds every POST to `/checkout` in the browser for 4 s and then aborts it, so the server action never reaches the server.

Reproduce:

```
PORT=3311 pnpm start &
BASE=http://localhost:3311 node scripts/v02-checkout-shots.mjs
```

### Overflow, touch targets, focus (same run as the screenshots)

`under44` lists every visible button, link, input and textarea in the page and the sticky bar under 44px. A tickbox is measured by its label.

```
added 1
checkout-380     overflowX=0 stickyBar=true  under44=[]
checkout-768     overflowX=0 stickyBar=true  under44=[]
checkout-1440    overflowX=0 stickyBar=false under44=[]
errors-380-focused co-email
errors-380       overflowX=0 stickyBar=true  under44=[]
errors-768-focused co-email
errors-768       overflowX=0 stickyBar=true  under44=[]
errors-1440-focused co-email
errors-1440      overflowX=0 stickyBar=false under44=[]
loading-380 מעביר לדף תשלום מאובטח...
loading-768 מעביר לדף תשלום מאובטח...
loading-1440 מעביר לדף תשלום מאובטח...
```

The first run, before the touch-target fixes, listed these at each width:
- breadcrumb 60×24
- guest link 158×24
- tickbox rows ×24
- radio 13×13
- five consent links ×21

```
$ curl -s -o /dev/null -w "%{http_code} %{redirect_url}" http://localhost:3311/checkout   (no cart)
307 http://localhost:3311/cart
```

### Tests and gates

```
$ npx tsc --noEmit
(exit 0)

$ pnpm lint
Checked 2203 files in 653ms. No fixes applied.
tokens gate: clean · copy gate: clean · asset gate: clean · raw-html gate: clean
postgrest-or gate: clean · cache-invalidation gate: clean · rtl-logical gate: clean
i18n gate: clean (600 Hebrew literals in scope, ceiling 600)
locale-format gate: clean · input-dir gate: clean
docs-index-gate: OK · docs-path-audit: OK
(exit 0)

$ npx vitest run 'src/app/(store)/checkout' src/styles/checkout-tokens.test.ts src/lib/checkout
 Test Files  18 passed (18)
      Tests  174 passed (174)

$ npx vitest run
 Test Files  1 failed | 683 passed | 1 skipped (685)
      Tests  1 failed | 8139 passed | 13 skipped (8153)
```

The one red is `ci-docs-inventory.test.ts`, `expected 308 to be 309`: the README's document count, which V01 left at 308 when it added `V01-cart.md`. With this doc the count is 310, and README is updated to 310 in this commit. That test was re-run after the update (below).

```
$ npx vitest run src/__tests__/ci-docs-inventory.test.ts   (README at 310)
      Tests  6 passed (6)
$ node scripts/docs-index-gate.mjs
docs-index-gate: OK. 310 documents, all listed; 2 out-of-docs row(s) resolve.

$ pnpm build
(exit 0)   ├ ◐ /checkout
```

What the tests now pin:
- **`checkout-form-contract.test.tsx`**, new `the single-page checkout (V02)` block:
  - no stepper and no "המשך"
  - email, first, last, phone in that order
  - payment box, terms and pay button visible with nothing pressed
  - no `d.dd` in the panel
  - the sticky bar is a submit of the same form and carries the total
  - a refused press paints the summary and the email and terms errors, and focuses the email
  - exactly one "שליחת הזמנה" button
- **`saved-address-step-gate`, `coupon-needs-no-address`, `guest-checkout-form`**: the same three rules as before, now driven through the pay button instead of "המשך":
  - a saved address is not asked for fields it does not render
  - a coupon cart is never asked for an address
  - a physical cart always is
- **`checkout-tokens.test.ts`**:
  - no `.checkout-steps` / `.checkout-nav__` rules left
  - the sticky bar is `display:none` by default and sits on `--reserve-tabbar` under 992
  - its button is brand yellow on the 44px token
- **`e2e/a11y.spec.ts`**: the four-step wizard walk became one scan each of the empty, refused and filled-with-terms page. `e2e/helpers.ts` `walkCheckoutToPayment` already stopped when there was no "המשך"; only its comment changed.

**The i18n ceiling went from 601 to 600.** The stepper's literals left. The error summary and sticky-bar strings were born in `messages/*.json` under `checkout.single.*`. `checkout.steps.extras` lost its only reader and was removed.

## Decisions made alone

- **The wizard was removed, not hidden.** Hiding it with CSS from 992 up as well would have left four controls in the DOM that do nothing, and a step state that no longer means anything. The step **rules** in `src/lib/checkout/steps.ts` stay, because the pay button runs them all. `CHECKOUT_STEPS` / `STEP_TITLES` are still used: the first by `checkAll`, the second by the shell heading.
- **A side effect fixed a bug.** Saved cards and the wallet field were rendered only on `step !== 'confirm'` **inside** a block hidden unless `step === 'confirm'`. So from 992 up, a returning customer could never pick a saved card or spend wallet balance. On a single page both are simply shown.
- **The live content stays.** Section names, the "מחיר" / "סה"כ" rows and the button label are the live site's. Electro gives the shape only (`docs/SOURCING-RULES.md`).

## Findings not fixed here

- **Turnstile shows "סיסמת אתר לא תקינה" on the local build** (`loading-*.png`). The local site key is not valid for localhost. That is environment configuration, not this page.
- **Catalogue content.** The product in the shots is `! צימר מאסטר` at ₪699, a template row. That is item 1 on the CLAUDE.md list and an operator decision.
