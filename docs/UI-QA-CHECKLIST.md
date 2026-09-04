# UI-QA-CHECKLIST.md

The manual visual pass over the purchase funnel: homepage, category, product,
cart, checkout, payment, thank-you, account.

This is the pass a person does with their eyes. It is deliberately **not** a
restatement of what the automated gates already cover, and each section says
which gate has the page and what that gate cannot see. Every measured number
quoted here comes from `docs/DESIGN-SYSTEM.md`, which sources it from the live
computed-style capture.

Status: reference. Docs only.

---

## 0. How to run the pass

### 0.1 The build under test must be a production build

```bash
pnpm build
PORT=3311 pnpm start
```

Not `next dev`. The dev overlay renders a `nextjs-portal` route badge that does
not exist in a production build, Turbopack caches compiled CSS by content hash
so a dev server started before a `@theme` colour was added keeps serving CSS
without that colour's utilities, and `pnpm build` is a separate gate from the
test suite: `cacheComponents` rejects uncached page reads that tests,
`type-check` and `lint` all pass.

If brand colours are missing in dev (the yellow newsletter bar renders white,
`bg-brand-secondary` resolves to transparent), **restart the dev server**. Do
not go looking for the bug in a component.

### 0.2 The three widths

Every page is checked at **380, 768 and 1440**, which are
`--breakpoint-mobile` / `-tablet` / `-desktop` and the three widths
`compare.mjs` measures at. The shell is a different height at each and
everything below the header inherits the offset, so a check at one width says
nothing about the other two.

Additional widths worth a look on the pages named:

| Width | Page | Why |
|---|---|---|
| 320 | product | The buy row is 140 + 4 + 192 = 336px of fixed width against a 290px summary column. It was the only public route failing the 320 gate on 2026-08-19. |
| 374 / 375 | home | Below 374 the benefit bar's five items stack. At 375 they sit icon-beside-label. Both shapes must be clean. |
| 560 | checkout | The stepper's labels visually hide below it. |
| 640 | any page with the consent banner | The banner is at its worst desktop shape here: `sm:flex-row` puts text and buttons on one line at 640 and the text still wraps to two. |
| 992 | checkout | The stepper steps out entirely and the sections stack. |
| 1024 | header | Live's header switch is `xl`, so 1024 gets the **handheld** header, not the masthead. |

### 0.3 Two states every page has that are easy to miss

- **Consent not yet answered.** The banner is `fixed bottom-0`, it is tall on a
  phone, and body padding is reserved for it in three tiers (14.5rem below 640,
  8rem from 640, 7rem from 768). Check both `html[data-consent="decided"]` and
  the undecided state: on a Pixel 5 at `/login` the passwordless toggle was
  visible, enabled and unclickable, because `elementFromPoint` at its centre
  returned the banner's paragraph.
- **A toast raised.** A toast has no URL and lives for four seconds, so it is
  invisible to every gate that visits pages. Add to the cart to raise one, and
  check all four kinds if the flow can produce them.

### 0.4 What to record

For each finding: the page, the width, the element, what was expected, what was
seen, and a screenshot. A finding without a width is not actionable, because the
same element is three different boxes.

---

## 1. Global, on every page in the funnel

Check these once per page. They are the ones that recur.

### 1.1 Shell

- [ ] Top bar and header heights match the width. Home at 380 is a **three-row**
      top bar (112 + 1px) because of the greeting; every inner page at 380 is
      **two rows** (75 + 1px). At 768 both are one 38px row; at 1440 the top bar
      is 38 and the masthead is 110.
- [ ] The greeting `ברוך הבא לעולם של קניון Express` appears on `/` and on no
      other page.
- [ ] The masthead is sticky (`top-0 z-40`) and nothing scrolls over it.
- [ ] At 1024 the **handheld** header renders (hamburger, centred logo, cart and
      account icons), not the masthead. The switch is `xl`, not `lg`.
- [ ] Hamburger on the **right** (inline-start), cart and account on the **left**
      (inline-end). This was mirrored on every page once.
- [ ] Logo painted at 100x26 handheld, 79px tall at `xl`. Not one size scaled.
- [ ] Divider hairlines between the four top-bar items appear from `md` only,
      and never before the first item.
- [ ] There is **no search UI** anywhere. This is deliberate and against live.
- [ ] Footer container edges: `SiteFooter` sits in 1200, the home `Footer.tsx`
      in 1430. They are different components and are allowed to differ.

### 1.2 Colour and contrast

- [ ] **Nothing white on brand yellow.** 1.41:1. Ink on `#fed700` is `#333e48`
      (7.76:1) or `#1a1a1a` (12.38:1).
- [ ] **Brand yellow is never text.** Links are `--color-link` `#0062bd`.
- [ ] Muted text on the `#f5f5f5` panels is `#6f6f6f`, not `#767676`.
- [ ] The sale badge is `#328614`, not live's `#44b81b`.
- [ ] No colour on screen that is not in `src/styles/tokens.css`. A raw hex in a
      `.tsx` fails `tokens.test.ts`, but a hex inlined in a `.css` page file that
      does not read `var()` will not, so spot-check page stylesheets by eye.

### 1.3 RTL

- [ ] Nothing reads left-to-right that should not. Full detail in
      `docs/RTL-PITFALLS.md`.
- [ ] Every arrow, chevron and back/forward glyph points the RTL way.
- [ ] Prices, phone numbers, order ids and coupon codes are isolated LTR runs
      and their punctuation has not migrated to the wrong end.
- [ ] Nothing is on the wrong side while all its classes are already logical.
      That is a DOM-order problem, not a CSS one, on both the header and the
      cart line.

### 1.4 Motion, focus and targets

- [ ] Every interactive control has a visible focus ring, and it is not clipped
      by an `overflow: hidden` ancestor.
- [ ] Tab order follows visual order at each of the three widths. It can differ
      per width when a `flex` `order` is used.
- [ ] Every tappable target is at least 44x44 (`--spacing-touch-min`), including
      the hamburger, whose **painted** size is live's smaller 34x36 with the hit
      area padded out.
- [ ] Nothing that is visually hidden has been hidden with `display: none` when
      it carries the accessible name of the control beside it.

---

## 2. Homepage `/`

Gate: `compare.mjs --page=home` at 380, 768 and 1440. Threshold 11%.
The gate refuses to score a moving hero, so a passing number means the slider
was frozen on slide 1 on both sides.

### 2.1 Shell and hero

- [ ] Hero row height: **213** at 380, **495** at 768, **613** at 1440.
- [ ] Slider height inside it: **213** / **304** / **370**.
- [ ] The category strip is **absent at 380**, present at 768 and 1440 at 170px
      tall with an `#e7e7e7` border.
- [ ] The side-banner column is absent below `lg` and present at 1440. It holds
      three lazy images; when it is `display:none` they correctly never load,
      and that is not a bug.
- [ ] The category strip is **right-offset** inside the container
      (`offsetInlineEnd: 517`, max-width 728), not page-centred. In RTL the first
      item renders at the inline-start, which is the visual right.
- [ ] Slider dots: active 30x8, inactive 8x8, radius 3, 6px from the bottom.
      Active `#fed700`; idle is `rgba(125,125,125,0.5)`.
- [ ] Hero type ramp at 1440: line 1 at 51px/300, line 2 at 45px/300 with
      `-0.01em`, tagline 19px/700, "from" label 13px, price 45px/700. At 380:
      43 / 38 / 11 / 12 / 35.
- [ ] Hero slide background `#eef7f9`.

### 2.2 Benefit bar and feature bar

- [ ] Feature bar: an **empty 31px strip at 380** (live renders none of the five
      `.feature` blocks below `md`), and a flat **134px at both 768 and 1440**.
      Ours was once 223 at 768 and 76 at 1440 because it was sized by content.
- [ ] Benefit bar items sit icon-beside-label at 375 and up, and **stack** below
      374. Check 320, 340, 360, 375. No horizontal scrollbar at any of them.
- [ ] USP bar: max-width 1170, `#ddd` border, radius 8, 36px `#fed700` icons at
      stroke-width 1.5. Title 15/700 `#333e48`, subtitle 13/400 with 2px above.

### 2.3 Deals grid

- [ ] The gap between the feature bar and the first card row is **3px at 1440**
      and 2px at 380. Not 30.
- [ ] Deal card order in the DOM and on screen: category tag, title, image with
      the discount badge overlaid, price block, add-to-cart icon.
- [ ] Card images are sharp, not upscaled, at dpr 1 and dpr 2. The `sizes` string
      is measured; a soft image at 900px wide dpr 2 is the failure mode that does
      not error.
- [ ] Discount badge `#ee0000` with white 12/700 on it.
- [ ] Deal price ink `#2d2d2d`, sale price `#c93636` (**not** `#dc3545`, which is
      the site-wide price red), strike `#6f6f6f`.

### 2.4 Footer

- [ ] Newsletter bar 80px tall, `#fed700`, with the 470x41 pill in it.
- [ ] Newsletter heading at 20.006/48.5946 weight 500, the marketing line beside
      it at 14.994/25.6997. Rounding these to 20/15 moves the baseline visibly.
- [ ] Widget titles 16/700 `#333e48`, links 14/400 with 24 line-height.
- [ ] Copyright bar 45px tall on `#eaeaea` with `#333e48` ink (9.08:1).
- [ ] The copyright year is the current year.

---

## 3. Category `/category/[slug]`

Gate: `compare.mjs --page=category`. The gate **refuses** unless both grids hold
the same number of cards **and** at least 80% of slots hold the same product, so
a passing number here means the two catalogues were seeded to match. If it
refuses, that is a seeding task, not a design finding.

- [ ] Container 1170 inside `max-w-page`. The breadcrumb sits flush at the top of
      the content area at every width.
- [ ] Card column 234px, so the 1170 grid is five across at 1440. A row is 371px.
- [ ] Thumbnail max 186.03px, square.
- [ ] Card title 14/700 `#0062bd` with 18 line-height and 8px below.
- [ ] Category tag above it: 12/400 `#657888`, 12px below.
- [ ] Price 20.006 `#333e48`; sale price 20 `#dc3545`; strike 12 `#657888`.
- [ ] Sale badge `#328614` with white 12/700, radius 4, padding 2/10.
- [ ] Page title 25.004px.
- [ ] Sorting and view-switcher controls (`#495057`) are reachable by keyboard
      and their focus ring is visible.
- [ ] The empty category state renders a message, not a bare grid.
- [ ] Pagination, if the category paginates, reads RTL: "next" moves leftward.
- [ ] Add-to-cart from a card raises a toast, and the toast's colours are the
      darkened set (success 4.71:1), not sonner's stock light pairs.
- [ ] The header cart badge increments and the badge is `#fed700` with `#333e48`
      12px ink.

---

## 4. Product `/product/[slug]`

Gate: `compare.mjs --page=product`, which **refuses** when one side paints a main
product image and the other does not. Live's gallery carries an inline
`opacity: 0` that nothing clears, so the honest reading is that this page's live
reference is partly blank and about 3.6 points of its historical score were that
rectangle. The related-products row is a known content difference (live renders
one card, ours four) and is worth about 3 points on its own. **Treat this page's
number as advisory and do the visual pass carefully.**

### 4.1 Layout

- [ ] Container 1170, gallery 470, summary 700, 15px between them at 1440.
- [ ] Breadcrumb 84px tall at desktop, 55px at 380.
- [ ] Gallery main image 470x477 at desktop, full-width 345 on a phone.
- [ ] The whole page is inside 320px at 320px. No horizontal scroll.

### 4.2 Type and price block

- [ ] Title 25.004/32.0051 at weight 500 in `#333e48`, 12px below it.
- [ ] Summary body 14/23.996.
- [ ] Eyebrow 11.998/17.2771, meta 13.006/18.0133.
- [ ] Current price **35px / 45.01px** in `#dc3545`.
- [ ] Strike price **21px / 31.5px** in `#6f6f6f` with a real `line-through`.
- [ ] The price row is baseline-aligned with a 12px gap and wraps rather than
      overflowing.
- [ ] The discount badge in the price row is white on `#dc3545`, 14/23.996 at
      weight 700, `padding-inline: 8px`, radius 4.

### 4.3 Buy controls

- [ ] Quantity field 140x41 on the **inline-start** of the row, which in RTL is
      the **right**. Live has it at x665 against the button's x469 at 1440.
- [ ] Add-to-cart 192x53 on `#fed700`.
- [ ] Buy-now full width, 46px, on `#c94b28`; hover `#b8401f`.
- [ ] The buy row **wraps** at 320 rather than pushing the document sideways.
- [ ] The quantity stepper stops at the stock ceiling and says so, rather than
      running to 99 and failing server-side.
- [ ] Out of stock: the add-to-cart is disabled and reads as disabled without
      relying on colour alone.

### 4.4 Below the fold

- [ ] Related heading 25.004/40.0064, 34px below it, 54px row gap.
- [ ] The related row streams in. Confirm it has actually arrived before judging
      it; the gate once counted zero cards in a page whose screenshot held four.
- [ ] Tabs or accordions (description, details) are keyboard-reachable and their
      panels are labelled.

---

## 5. Cart `/cart`

Gate: `compare.mjs --page=cart`, which **refuses** when the two carts are in
different states. Neither cart redirects when empty, which is exactly what made
this the trap it was: a filled live cart against an empty local one produces a
number and the number is meaningless. Run the empty-state comparison
deliberately with `COMPARE_CART_EMPTY=1`.

### 5.1 Both states

- [ ] Empty cart renders the empty panel with a route back to the shop, not a
      blank page. Ours says `העגלה שלך ריקה`.
- [ ] Filled cart: container `--container-page`, padding `0 15px 80px` below
      1024 and `padding-bottom: 138px` from 1024 up. The 138 is live's desktop
      clearance and must not be applied at 380, where live's gap is 80.
- [ ] Page title 40px / weight 500.

### 5.2 The line, at 1440

- [ ] **Order right to left: remove, then line total, then quantity, with the
      subtotal leftmost.** Live's row runs remove x1236, price x497, quantity
      x267 inside a 135..1305 row. Ours was the exact mirror once. If this is
      wrong, reorder the JSX; the classes are already logical.
- [ ] Thumbnail square, `object-contain`, and a product with no image shows
      `אין תמונה` rather than a broken glyph.
- [ ] Remove button carries `aria-label` naming the product, not just "remove".
- [ ] Line total uses `shekels()` and renders `₪1,234.50` with two agorot
      digits, grouped thousands, and no directional marks around the glyph.

### 5.3 The line, below 768

- [ ] The line renders as live's stacked rows: remove / name / unit price /
      quantity / line total. Live measures 57+83+54+75+54 at 380.
- [ ] The unit-price row (`מחיר:`) appears **only** below 768.
- [ ] The mobile labels beside the controls are `aria-hidden`, and the controls
      themselves are still named.

### 5.4 Behaviour

- [ ] `+` stops at the stock ceiling and does not spend a round trip at the top.
- [ ] `-` stops at 1.
- [ ] A line that becomes unavailable raises the `output.cart-line__warning`, and
      a screen reader **announces** it (it is an `<output>`, not a `<p>`, for
      exactly this reason).
- [ ] A coupon line with a business balance shows both halves:
      `תשלום באתר: … · יתרה בחנות: …`, and the two add up to the line total.
- [ ] Totals recompute after every quantity change, with no flash of a stale
      number.
- [ ] The header cart badge and the mini cart agree with the page. All three read
      `--cart-touch` and `--cart-price-red` from `mini-cart.css`; if any of the
      three disagrees, one of them redeclared a token.
- [ ] The checkout button is `#fed700` with `#333e48` 14/700 ink at radius 22.
- [ ] An unavailable line **blocks** checkout, and says why.

---

## 6. Checkout `/checkout`

Gate: `compare.mjs --page=checkout`, which seeds both carts and **refuses** if
the page redirected away (an empty cart goes to `/cart` on both sides, and two
cart screenshots score as an excellent checkout).

### 6.1 Layout

- [ ] An empty cart redirects to `/cart`. It does not render an empty checkout.
- [ ] Container `--container-page`, `padding: 0 15px 3rem`, body 14/23.996.
- [ ] Live's 1440 RTL column layout: billing on the **right** (645..1310), order
      panel on the **left** (145..611, 466 wide), container 145..1310.
- [ ] Breadcrumb: below 768 a compact full-bleed grey band, 42px tall, 9px
      padding, `#f7f6f6`, bled to the container edge with `margin-inline: -15px`.
      From 768 up the transparent 71px treatment.

### 6.2 The stepper

- [ ] Four steps in order: `פרטים אישיים`, `כתובת למשלוח`, `ביקורת הזמנה`,
      `אישור ותשלום`.
- [ ] Current step: white fill, `#333e48` ink, `#fed700` bottom border, and a
      `#fed700` numeral badge with `#333e48` on it.
- [ ] Done step: white fill, `#333e48` ink, `#e4e4e4` bottom border, and a
      `#333e48` numeral badge with white on it.
- [ ] Upcoming step: `#f7f7f7` fill, `#616161` ink, transparent bottom border,
      `#e4e4e4` numeral badge with `#616161` on it.
- [ ] **State is legible in greyscale.** Take a greyscale screenshot: the border
      and the badge must still separate the three states, because colour alone
      would not survive a print or a shopper who cannot separate yellow from
      grey.
- [ ] Step buttons are at least 44px tall (`--cart-touch`).
- [ ] Disabled steps read as disabled (`cursor: not-allowed`, `opacity: 0.6`) and
      are not focusable traps.
- [ ] **Below 560:** the label is visually hidden but **still in the accessibility
      tree**. Run a screen reader or axe here. When this was `display: none` all
      four buttons had no accessible name at all and axe reported `button-name`,
      critical, four nodes, on the phone and nowhere else.
- [ ] **From 992 up:** the stepper is gone and every section paints stacked in
      wizard DOM order, which is Electro's own single-column checkout. The single
      visible submit still validates every step.

### 6.3 The form

- [ ] Every field label is a real `<label>` tied to its input, in Hebrew.
- [ ] Inputs are `text-start`, never `text-left`.
- [ ] The phone field accepts `05XXXXXXXX`, `+972…` and spaced or hyphenated
      forms, and rejects a landline with
      `מספר נייד ישראלי הוא 10 ספרות ומתחיל ב-05`. That is not pedantry: this
      number is what the courier and the coupon SMS use.
- [ ] A blank required field says `שדה חובה` and the message is tied to the input
      with `aria-describedby`, not merely painted below it.
- [ ] Postal code is optional and only validated when filled.
- [ ] Moving forward from a step with an error keeps the shopper on that step and
      moves focus to the first broken field.
- [ ] Jumping back from the stepper is always allowed; jumping forward only as
      far as the filled fields justify.
- [ ] **Fill step 1, walk to step 3, come back: step 1 still holds the values.**
      The whole form stays mounted; only visibility changes. If a value is gone,
      a step is unmounting and the order will submit incomplete.
- [ ] Editing step 1 into an invalid state and walking forward lands the shopper
      back on the step that broke, not on the card.
- [ ] The order panel's totals match the cart exactly, line for line, including
      any coupon split.
- [ ] Terms and privacy links open and are reachable by keyboard.

---

## 7. Payment

The payment surface is Cardcom's, not ours, so most of this is a transition
check: what the shopper sees on the way out and on the way back. There is no
`compare.mjs` page for it.

- [ ] The submit is disabled and shows a pending state for the whole round trip.
      A second click must not create a second order.
- [ ] The handoff happens once. Back-button from the payment surface returns to a
      checkout that is still filled, not to a blank form.
- [ ] Nothing in the URL or on screen carries a card number, a CVV or a token.
- [ ] The return lands on `/checkout/return`; `/checkout/confirmation` is an alias
      that redirects there and must preserve `order_id`.
- [ ] **Pending state:** `מאמתים את התשלום...` with its subtitle, rendered both as
      the Suspense shell and as the settled pending result. Neither is a blank
      page and neither spins forever without saying what it is waiting for.
- [ ] The auto-refresh on the pending page eventually gives up and says so,
      rather than polling silently.
- [ ] **Failure** redirects to `/checkout/failed?order_id=…` with a Hebrew reason
      and a way back to the cart. The order id shown is the same one.
- [ ] An unknown order id renders the not-found page, not an empty success.
- [ ] The cart is **not** cleared until the payment has actually settled.
- [ ] At 380 the pending, failed and success pages each fit without horizontal
      scroll, including any order id, which is an LTR run.

---

## 8. Thank-you `/checkout/return`

- [ ] `התשלום הצליח!` at the success title size, with its subtitle below.
- [ ] The order id is rendered as an isolated LTR run and its punctuation stays
      at the correct end. Same for any voucher or coupon code.
- [ ] Every money figure on the page uses `shekels()`: `₪` glyph, grouped
      thousands, two agorot digits, no directional marks.
- [ ] Cashback, when present: `נוסף לארנק שלך: ₪X.XX קאשבק`, and the figure
      matches the wallet page.
- [ ] For a coupon order, the split is shown again (paid online, balance at the
      business) and matches what the cart and the checkout panel said.
- [ ] Redemption QR or code, when present: high enough contrast to scan, large
      enough at 380, and the code beneath it is LTR-isolated and monospaced.
- [ ] The inline styles on this page (`marginTop: 12/20/28`, `fontSize: 13`)
      still render sane at all three widths. They are literal numbers, not
      tokens, so nothing else moves them.
- [ ] A route onward exists (orders, wallet, or back to the shop). The page is
      not a dead end.
- [ ] Reloading the page does not re-trigger anything and does not show an error.
- [ ] The confirmation email, if it fires, quotes the same figures. `formatAgorot`
      builds those; nothing in the email path divides by 100.

---

## 9. Account `/account`

No `compare.mjs` page unless `COMPARE_STORAGE_STATE` supplies an authed session.
This is a fully manual pass.

- [ ] Logged out, `/account` sends the shopper to login and returns them here
      afterwards.
- [ ] The account navigation is a real list of links, RTL, and the current page
      is marked by something other than colour alone.
- [ ] `/account/orders`: newest first, each row shows date, total and status. The
      date is `he-IL` formatted and the total is `shekels()`.
- [ ] `/account/orders/[id]`: line items match what was bought, the order id is an
      LTR-isolated run, and the totals reconcile.
- [ ] `/account/wallet`: the balance matches the cashback credited on the
      thank-you page. Money is `shekels()` throughout.
- [ ] `/account/coupons`, `/account/vouchers`, `/account/my-vouchers`: every code
      is `dir="ltr"` and monospaced, and a code with digits and Latin letters
      reads in the right order.
- [ ] `/account/addresses`: adding, editing and deleting all work, and the delete
      asks before it deletes.
- [ ] `/account/details`, `/account/security`: forms are labelled, errors are
      Hebrew and tied to their fields, and any secret (a TOTP key, a token) is
      `dir="ltr"`.
- [ ] `/account/subscriptions`: a cancelled subscription says what happens next,
      with an absolute Hebrew date and no refund promise it cannot keep.
- [ ] `/account/referrals`, `/account/tokens`, `/account/wishlist`: each renders
      an empty state rather than a blank panel.
- [ ] At 380 every account table either fits or scrolls **inside its own
      container**, never by moving the document.
- [ ] Nothing on any account page paints yellow text or white-on-yellow.

---

## 10. The pass is not the gate

`compare.mjs` scores pixels against a reference that is itself imperfect. It
cannot see:

- **Anything without a URL.** Toasts, focus rings, hover and active states,
  disabled styling, the drawer while open, a modal, a validation message that
  appears on blur.
- **Anything about meaning.** A step whose state is legible only by colour
  passes the pixel diff and fails a greyscale print.
- **Anything the reference gets wrong.** Live fails AA in seven places this
  project deliberately corrects, and live's own product gallery is invisible.
  A lower percentage is not automatically a better page.
- **Anything below 2600px.** The diff crops there at every width, and at 380 the
  home page is over 17000px tall, so most of the page is never scored at all.
- **Order.** A row whose classes are all logical and whose DOM order is mirrored
  scores badly and gives no clue why.

That is what this checklist is for. Run it before calling a UI step done, and
record findings with the width attached.

---

## Related documents

```
docs/DESIGN-SYSTEM.md      the token layer, component anatomy and the gate definition
docs/RTL-PITFALLS.md       Hebrew typography, bidi, number and icon direction
DESIGN-MEASURED.md         the measured palette, type and layout, with sources
docs/A11Y-SWEEP-REPORT.md  the axe pass
scripts/compare.mjs        the gate
scripts/diff-bands.mjs     the band report
```
