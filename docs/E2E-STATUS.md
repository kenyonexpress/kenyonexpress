# E2E status: the Playwright suite, twice back-to-back

Measured 15.10.2026 (XF04) on the `kenyonexpress-autopilot` worktree,
branch `phase5/homepage-closeout`, against a fresh production build
(`CARDCOM_USE_MOCK=true pnpm build`, port 3454, listener cwd and BUILD_ID
verified before every run), two workers, all three projects (`chromium`,
`mobile-chrome`, `visual`), 1,122 cases in 57 spec files. The recipe is
`logs/xf04/run.sh <n>`; the tables below are `logs/xf04/summarize.mjs` over
the json reporter output of the two runs.

## Results

**Status: NOT GREEN YET, by one flaky case.** The measured pair ran on the
build of 6718a7f5a (BUILD_ID `MuW7j7T4WAlfxQ-nENRZq`, built 07:31 from the clean
committed tree, the tree that carries every fix in this document) inside the
XF05-RETRY item, because WRETRY-XF04 itself ran out of its 3,600-second
budget eight minutes into run 1 (the loop recorded `rc=124` at 07:32; its
fixes are in 6718a7f5a). Run 1: **1,097 passed / 0 failed / 25 skipped of 1,122 in 20:56**. Run 2: **1,097 passed / 1 failed / 24 skipped of 1,122 in 20:57**.
Failed in both runs: **0**. Flaky, passed once and failed once:
**1**, listed under the tables with the error. The tag
`v1.0.0-mvp-ready-pending-cardcom` is therefore NOT written: the condition
is two green runs, and run 2 is not one. The flaky case is fixed in the
commit that carries this paragraph (a test defect, see below), the fix is
queued as `WRETRY-flake` at the head of `~/ke-goals/queue.txt` to run the
pair again, and `XF05-RETRY` follows it with the same tag text. The runs
that led here stay below as the record of how the suite got from 128
failures to one.

### The measured pair (the build of 6718a7f5a, 15.10.2026, runs started 07:33:46 and 07:54:47)

`bash logs/xf04/run.sh 1` then `bash logs/xf04/run.sh 2`, back-to-back on
one server start each, port 3454, listener cwd and BUILD_ID verified before
each run. Tables and lists are `node logs/xf04/summarize.mjs
/tmp/xf04/run1.json /tmp/xf04/run2.json`, verbatim:

| run | passed | failed | skipped | total | wall time | started |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 1097 | 0 | 25 | 1122 | 20:56 | 2026-10-15 00:33:47Z |
| 2 | 1097 | 1 | 24 | 1122 | 20:57 | 2026-10-15 00:54:48Z |

| suite (spec file) | run 1 pass / fail / skip | run 1 time | run 2 pass / fail / skip | run 2 time |
| --- | --- | --- | --- | --- |
| a11y.spec.ts | 116 / 0 / 2 | 2:34 | 116 / 0 / 2 | 3:02 |
| account-orders.spec.ts | 8 / 0 / 0 | 0:20 | 8 / 0 / 0 | 0:25 |
| account-tabs.spec.ts | 8 / 0 / 0 | 0:35 | 8 / 0 / 0 | 0:34 |
| admin-refund.spec.ts | 0 / 0 / 2 | 1:47 | 0 / 0 / 2 | 1:41 |
| auth.spec.ts | 32 / 0 / 0 | 0:05 | 32 / 0 / 0 | 0:06 |
| brands-row.spec.ts | 8 / 0 / 0 | 0:07 | 8 / 0 / 0 | 0:07 |
| cart-page.spec.ts | 8 / 0 / 0 | 1:04 | 8 / 0 / 0 | 0:59 |
| cart.spec.ts | 21 / 0 / 3 | 2:11 | 21 / 0 / 3 | 2:04 |
| catalog-infinite-scroll.spec.ts | 6 / 0 / 0 | 0:10 | 6 / 0 / 0 | 0:09 |
| category-grid.spec.ts | 5 / 0 / 1 | 0:05 | 5 / 0 / 1 | 0:07 |
| category-seo.spec.ts | 10 / 0 / 0 | 1:30 | 10 / 0 / 0 | 1:32 |
| category.spec.ts | 36 / 0 / 0 | 3:55 | 36 / 0 / 0 | 3:54 |
| checkout-steps.spec.ts | 12 / 0 / 0 | 1:29 | 12 / 0 / 0 | 1:24 |
| checkout.spec.ts | 14 / 0 / 0 | 0:32 | 14 / 0 / 0 | 0:30 |
| city-page.spec.ts | 12 / 0 / 0 | 0:05 | 12 / 0 / 0 | 0:04 |
| coupon-offer.spec.ts | 7 / 0 / 1 | 0:13 | 8 / 0 / 0 | 0:14 |
| coupon-scan.spec.ts | 12 / 0 / 0 | 0:05 | 12 / 0 / 0 | 0:05 |
| coupons.spec.ts | 10 / 0 / 0 | 0:05 | 10 / 0 / 0 | 0:06 |
| deal-of-the-day.spec.ts | 6 / 0 / 0 | 0:16 | 6 / 0 / 0 | 0:16 |
| deals-grid.spec.ts | 12 / 0 / 0 | 0:10 | 12 / 0 / 0 | 0:12 |
| error-page.spec.ts | 2 / 0 / 4 | 0:05 | 2 / 0 / 4 | 0:05 |
| footer.spec.ts | 7 / 0 / 1 | 0:05 | 7 / 0 / 1 | 0:06 |
| full-purchase-redeem.spec.ts | 2 / 0 / 0 | 2:20 | 2 / 0 / 0 | 2:19 |
| header.spec.ts | 24 / 0 / 0 | 0:21 | 24 / 0 / 0 | 0:23 |
| hero-carousel.spec.ts | 10 / 0 / 0 | 0:35 | 10 / 0 / 0 | 0:34 |
| hero-grid.spec.ts | 16 / 0 / 0 | 0:12 | 16 / 0 / 0 | 0:13 |
| home-rtl.spec.ts | 6 / 0 / 0 | 0:05 | 6 / 0 / 0 | 0:05 |
| home.spec.ts | 46 / 0 / 0 | 1:39 | 46 / 0 / 0 | 1:36 |
| hot-coupons.spec.ts | 8 / 0 / 2 | 0:06 | 8 / 0 / 2 | 0:06 |
| layout-stability.spec.ts | 38 / 0 / 0 | 2:34 | 38 / 0 / 0 | 2:26 |
| listing-controls.spec.ts | 9 / 0 / 1 | 0:10 | 9 / 0 / 1 | 0:10 |
| loading-skeletons.spec.ts | 8 / 0 / 0 | 0:30 | 7 / 1 / 0 | 0:26 |
| login-dialog.spec.ts | 14 / 0 / 0 | 0:21 | 14 / 0 / 0 | 0:20 |
| menu-drawer.spec.ts | 30 / 0 / 0 | 0:42 | 30 / 0 / 0 | 0:43 |
| newsletter-form.spec.ts | 8 / 0 / 0 | 0:05 | 8 / 0 / 0 | 0:05 |
| not-found.spec.ts | 8 / 0 / 0 | 0:06 | 8 / 0 / 0 | 0:06 |
| physical-purchase.spec.ts | 2 / 0 / 0 | 1:35 | 2 / 0 / 0 | 1:38 |
| price-bidi.spec.ts | 18 / 0 / 0 | 1:03 | 18 / 0 / 0 | 1:03 |
| product-buy-row.spec.ts | 9 / 0 / 1 | 0:19 | 9 / 0 / 1 | 0:19 |
| product.spec.ts | 20 / 0 / 2 | 0:21 | 20 / 0 / 2 | 0:18 |
| production-smoke.spec.ts | 2 / 0 / 2 | 0:12 | 2 / 0 / 2 | 0:12 |
| purchase-flow.spec.ts | 4 / 0 / 0 | 0:25 | 4 / 0 / 0 | 0:24 |
| pwa.spec.ts | 8 / 0 / 0 | 0:03 | 8 / 0 / 0 | 0:03 |
| region-menu.spec.ts | 12 / 0 / 0 | 0:13 | 12 / 0 / 0 | 0:16 |
| register-dialog.spec.ts | 10 / 0 / 0 | 0:14 | 10 / 0 / 0 | 0:13 |
| render-mode.spec.ts | 26 / 0 / 0 | 0:13 | 26 / 0 / 0 | 0:13 |
| responsive.spec.ts | 124 / 0 / 0 | 1:58 | 124 / 0 / 0 | 1:59 |
| rtl-mobile.spec.ts | 82 / 0 / 0 | 1:30 | 82 / 0 / 0 | 1:35 |
| rtl-three-widths.spec.ts | 24 / 0 / 0 | 0:19 | 24 / 0 / 0 | 0:13 |
| search-results.spec.ts | 15 / 0 / 1 | 0:33 | 15 / 0 / 1 | 0:33 |
| search.spec.ts | 12 / 0 / 0 | 0:09 | 12 / 0 / 0 | 0:10 |
| smoke-all-routes.spec.ts | 62 / 0 / 0 | 0:11 | 62 / 0 / 0 | 0:06 |
| toasts.spec.ts | 6 / 0 / 2 | 0:55 | 6 / 0 / 2 | 0:56 |
| topbar.spec.ts | 50 / 0 / 0 | 0:31 | 50 / 0 / 0 | 0:34 |
| touch-targets.spec.ts | 18 / 0 / 0 | 0:32 | 18 / 0 / 0 | 0:35 |
| visual.spec.ts | 6 / 0 / 0 | 0:19 | 6 / 0 / 0 | 0:17 |
| wishlist-page.spec.ts | 8 / 0 / 0 | 1:22 | 8 / 0 / 0 | 1:20 |

flaky (outcome differed between the runs): 1
- loading-skeletons.spec.ts [chromium] account loading skeleton (UX27) › a tab press paints the column skeleton before the new page, and a direct load flushes it first: run 1 expected, run 2 unexpected; Error: expect(received).toContain(expected) // indexOf
failed in both runs: 0

skipped (same in both runs unless noted):
- a11y.spec.ts [chromium] the category drawer keeps Tab inside, is inert when closed, and Escape returns to the trigger
- a11y.spec.ts [mobile-chrome] the search combobox says which suggestion is selected
- admin-refund.spec.ts [chromium] admin cancel and refund @money @admin › a paid coupon order is refunded from the admin, and the voucher dies with it
- admin-refund.spec.ts [mobile-chrome] admin cancel and refund @money @admin › a paid coupon order is refunded from the admin, and the voucher dies with it
- cart.spec.ts [mobile-chrome] shopping cart (guest) › adding to the cart opens the drawer, and the header badge reopens it
- cart.spec.ts [chromium] the cart sheet and the keyboard › the phone sheet takes focus, keeps it, and gives it back on Escape
- cart.spec.ts [mobile-chrome] the cart sheet and the keyboard › the desktop dropdown does not steal focus into a sheet nobody can see
- category-grid.spec.ts [mobile-chrome] the category tile grid › hover lifts the card with the token shadow and zooms the photograph 5%
- coupon-offer.spec.ts [chromium] coupon variant › similar coupons link to coupon pages and the product page links back (run 2: expected)
- error-page.spec.ts [chromium] 500 page and /status (UX26) › a render error under the root boundary shows the status check, the status link and the support button
- error-page.spec.ts [chromium] 500 page and /status (UX26) › a render error under the store boundary shows the status check, the status link and the support button
- error-page.spec.ts [mobile-chrome] 500 page and /status (UX26) › a render error under the root boundary shows the status check, the status link and the support button
- error-page.spec.ts [mobile-chrome] 500 page and /status (UX26) › a render error under the store boundary shows the status check, the status link and the support button
- footer.spec.ts [chromium] site footer (UX13) › a row opens on a tap and shows its links
- hot-coupons.spec.ts [chromium] hot coupons (UX10) › the copy button writes the code to the clipboard and confirms in place
- hot-coupons.spec.ts [mobile-chrome] hot coupons (UX10) › the copy button writes the code to the clipboard and confirms in place
- listing-controls.spec.ts [mobile-chrome] listing controls (UX14) › the view switcher lays the grid out as rows and remembers it
- product-buy-row.spec.ts [mobile-chrome] product buy row and gallery (UX15) › a resting mouse magnifies the photo and leaving restores it
- product.spec.ts [chromium] product page › the cashback line, when present, names a rate and a shekel amount
- product.spec.ts [mobile-chrome] product page › the cashback line, when present, names a rate and a shekel amount
- production-smoke.spec.ts [chromium] production smoke: guest cart to checkout › a coupon product shows the on-site portion separately
- production-smoke.spec.ts [mobile-chrome] production smoke: guest cart to checkout › a coupon product shows the on-site portion separately
- search-results.spec.ts [chromium] search results page (UX21) › on a phone the bar carries a filters link that opens the disclosure
- toasts.spec.ts [chromium] toasts › the admin panel paints its toasts
- toasts.spec.ts [mobile-chrome] toasts › the admin panel paints its toasts

The skipped cases are the same set in both runs but one (the coupon-offer
similar-coupons case skipped in run 1 for want of a coupon product and
passed in run 2, when the sampled product had one), and each carries its
reason as an annotation in the report: the admin leg of admin-refund and
the admin toasts (the admin fixture on the hosted database has no TOTP
factor, so `/admin-mfa` offers enrolment, not a challenge, and enrolling one
is a write to a real account), the four error-page cases
(`SENTRY_DEBUG_ROUTES` is off on this server, so the debug throw routes
render not-found), the hot-coupons copy button (no coupon deal carries a
code until pending migration 270), the coupon-offer similar strip and the
smoke test's on-site portion (the live catalogue has no coupon-type
product since 128 retired the demo rows), the cashback line (the sampled
product earns none), and the per-project pairs where a surface exists on
one breakpoint only (the category drawer and masthead search, the cart
sheet and dropdown, hover cases on the phone project, the footer rows, the
view switcher, the filters link).

**The flaky case, measured.** `loading-skeletons.spec.ts`, "a tab press
paints the column skeleton before the new page" on chromium: run 2 read
`["האזור האישי", "ההזמנות שלי"]` and expected "skeleton" between them; run 1
saw it. The test sampled the live tree inside a MutationObserver callback
(`column.querySelector('[data-account-skeleton]')`), and when the orders page
answers inside one observer batch the skeleton's insertion and its removal
arrive in the same callback, so the sample sees only the page. The skeleton
did paint (the direct-load half of the same case, which reads the streamed
HTML, passed in both runs). The spec now reads the skeleton off the records'
`addedNodes` and samples the tree after each batch, so a fast answer and a
slow one record the same sequence. A test defect; nothing in `src/` changed.
Verified after the pair on a fresh server start of the same build: the
whole spec file passed 4 of 4 on chromium (08:17, 15.2s).
Because the spec was patched on disk while run 2 was still on its chromium
half, the mobile-chrome half of run 2 loaded the patched file (the project
starts the file fresh), the same caveat the diagnostic run carried.

### Pre-fix baseline (the build of a1d7af001, before the fixes below)

| run | passed | failed | skipped | total | wall time | started |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | 972 | 128 | 22 | 1122 | 24:44 | 2026-10-15 04:44 |
| 2 | 975 | 119 | 28 | 1122 | 25:11 | 2026-10-15 05:09 |

Failed in both runs: 115 cases (the twelve causes in the tables below).
Flaky, passed once and failed once: 12 cases, all of them inside the same
twelve causes (a Tab walk on /login, the account tab heading, the cart
summary, a category price filter, the city 404, two coupon-offer cases, the
home RTL allow-list, two home image and search cases, the related strip's
strict-mode locator, a wishlist move-to-cart). No case was flaky outside a
known cause, so no `WRETRY-flake` entry was queued for the baseline; the
post-fix pair decides which of those twelve survive.

The per-spec table of the baseline is `/tmp/xf04/baseline-summary.txt`
(not committed: the json reporter output it reads is 1.8 MB per run).

### Post-fix run 1 (the build of 81527ead1, 15.10.2026, started 05:49:08)

Run by hand inside the XF05 item with `logs/xf04/run.sh 1`: the whole suite,
1122 cases, **1065 passed, 36 failed, 21 skipped** in
1328s (ended 06:11:16); the baseline was 128 failed. It is
evidence for what the XF04 fixes left open, not a green run, and it was one
run, not two: `WRETRY-XF04` runs the full pair on the build that carries the
fixes below.

| spec | failed in run 1 |
| --- | --- |
| a11y.spec.ts | 6 |
| admin-refund.spec.ts | 2 |
| category-seo.spec.ts | 1 |
| category.spec.ts | 2 |
| coupon-offer.spec.ts | 1 |
| error-page.spec.ts | 2 |
| full-purchase-redeem.spec.ts | 1 |
| home.spec.ts | 2 |
| physical-purchase.spec.ts | 2 |
| responsive.spec.ts | 2 |
| rtl-mobile.spec.ts | 1 |
| touch-targets.spec.ts | 12 |
| wishlist-page.spec.ts | 2 |

- [chromium] › e2e/a11y.spec.ts:303:7 › product pages have no WCAG A/AA violations › the first product in the catalogue
- [chromium] › e2e/a11y.spec.ts:315:7 › product pages have no WCAG A/AA violations › a coupon product, which renders the struck regular price
- [chromium] › e2e/a11y.spec.ts:492:5 › the cart panel that opens on add-to-cart has no WCAG A/AA violations
- [chromium] › e2e/admin-refund.spec.ts:31:7 › admin cancel and refund @money @admin › a paid coupon order is refunded from the admin, and the voucher dies with it
- [chromium] › e2e/error-page.spec.ts:54:9 › 500 page and /status (UX26) › a render error under the root boundary shows the status check, the status link and the support button
- [chromium] › e2e/coupon-offer.spec.ts:80:7 › coupon variant › a physical product has no coupon variant and lands on its product page
- [chromium] › e2e/error-page.spec.ts:54:9 › 500 page and /status (UX26) › a render error under the store boundary shows the status check, the status link and the support button
- [chromium] › e2e/full-purchase-redeem.spec.ts:51:7 › full purchase to redeem @checkout @redeem @money › guest coupon cart → guest checkout → email sign-in at pay → mock pay → voucher → supplier redeem
- [chromium] › e2e/home.spec.ts:475:7 › homepage › the homepage costs one render-blocking stylesheet
- [chromium] › e2e/physical-purchase.spec.ts:25:7 › logged-in physical purchase @checkout @money › signed-in customer → physical product → mock pay → order, no voucher
- [chromium] › e2e/responsive.spec.ts:98:7 › safe area › the bottom-anchored fixed elements resolve their inset in the computed style
- [chromium] › e2e/touch-targets.spec.ts:160:7 › every control on / is thumb-sized
- [chromium] › e2e/touch-targets.spec.ts:160:7 › every control on /products is thumb-sized
- [chromium] › e2e/touch-targets.spec.ts:160:7 › every control on /cart is thumb-sized
- [chromium] › e2e/touch-targets.spec.ts:160:7 › every control on /category/hot-deals is thumb-sized
- [chromium] › e2e/touch-targets.spec.ts:160:7 › every control on /legal/terms is thumb-sized
- [chromium] › e2e/touch-targets.spec.ts:168:5 › every control on a product page is thumb-sized, buy row included
- [chromium] › e2e/wishlist-page.spec.ts:192:7 › wishlist page (UX20) › the share button either copies a link or says the feature is not open
- [mobile-chrome] › e2e/a11y.spec.ts:303:7 › product pages have no WCAG A/AA violations › the first product in the catalogue
- [mobile-chrome] › e2e/a11y.spec.ts:315:7 › product pages have no WCAG A/AA violations › a coupon product, which renders the struck regular price
- [mobile-chrome] › e2e/a11y.spec.ts:492:5 › the cart panel that opens on add-to-cart has no WCAG A/AA violations
- [mobile-chrome] › e2e/admin-refund.spec.ts:31:7 › admin cancel and refund @money @admin › a paid coupon order is refunded from the admin, and the voucher dies with it
- [mobile-chrome] › e2e/category-seo.spec.ts:158:7 › category page SEO › a facet nobody matches shows the empty state with a way out
- [mobile-chrome] › e2e/category.spec.ts:221:7 › category archive › an unknown brand narrows to the empty state, not a blank page
- [mobile-chrome] › e2e/category.spec.ts:274:7 › category archive › catalog thumbnails go through the image optimizer and decode
- [mobile-chrome] › e2e/home.spec.ts:475:7 › homepage › the homepage costs one render-blocking stylesheet
- [mobile-chrome] › e2e/physical-purchase.spec.ts:25:7 › logged-in physical purchase @checkout @money › signed-in customer → physical product → mock pay → order, no voucher
- [mobile-chrome] › e2e/responsive.spec.ts:98:7 › safe area › the bottom-anchored fixed elements resolve their inset in the computed style
- [mobile-chrome] › e2e/rtl-mobile.spec.ts:125:7 › no sideways scroll at 320px › the seeded single-page checkout fits 320px, every section at once
- [mobile-chrome] › e2e/touch-targets.spec.ts:160:7 › every control on / is thumb-sized
- [mobile-chrome] › e2e/touch-targets.spec.ts:160:7 › every control on /products is thumb-sized
- [mobile-chrome] › e2e/touch-targets.spec.ts:160:7 › every control on /cart is thumb-sized
- [mobile-chrome] › e2e/touch-targets.spec.ts:160:7 › every control on /category/hot-deals is thumb-sized
- [mobile-chrome] › e2e/touch-targets.spec.ts:168:5 › every control on a product page is thumb-sized, buy row included
- [mobile-chrome] › e2e/touch-targets.spec.ts:160:7 › every control on /legal/terms is thumb-sized
- [mobile-chrome] › e2e/wishlist-page.spec.ts:192:7 › wishlist page (UX20) › the share button either copies a link or says the feature is not open

What run 1 proved, and what was fixed on top of it in the same commit:

- **Product and cart-panel a11y (target-size x8):** the related card's
  category link kept `-my-1`, and a `-mb-1` beats the parent's `space-y-2`,
  so the title below overlapped the link's bottom 4px (axe: 204x20, needs
  24). Now `-mt-1` only (`ProductCard.tsx`, pinned in `responsive.test.ts`).
- **The three money specs:** the checkout page read the gate through
  `readPaymentProviderGate()` (which honours `E2E_MOCK_CHECKOUT=local-build`)
  while `beginCheckout`, the pay step and `reorder` called
  `assessPaymentProviderGate(env)` with no allowance, so the button was
  enabled and the action answered the closed message; the server's
  environment was verified to carry the variable. All three now use the
  page's reader; `provider-gate.test.ts` refuses a server action that imports
  the bare assess. With the gate open the action reached the database and
  answered `Could not find the 'token_id' column of 'payments' in the schema
  cache`: the hosted database is the pre-059 lineage and has no such column,
  so `paymentsHasTokenColumn()` (payment-money-columns.ts) probes it once per
  process and the insert skips the FK when it is absent (pinned by two unit
  cases). With that gone the pay step answered "אין מספיק במלאי לאחד
  הפריטים": the E2E customer's cart carried 27 lines from earlier runs, so
  `emptyCart()` in `e2e/helpers.ts` now empties it after sign-in in
  physical-purchase and admin-refund (full-purchase-redeem is a guest cart
  merged at pay and still inherits whatever the account holds). The last
  attempt then saw no "נוסף לסל" confirmation after the buy press, the
  signature of the 120-an-hour cart-write limiter after a day of runs; the
  money path is therefore NOT yet proven green end to end on this build.
- **error-page (4 cases):** `goto` resolved before the streamed not-found
  heading painted, so an unawaited `isVisible()` was always false and the
  crash heading timed out. The spec waits for either heading now; verified
  against the running server (1 passed, 2 skipped).
- **home.spec, one render-blocking stylesheet:** four sheets were still
  imported beside `globals.css` in the root layout (cart-page, home-handheld,
  newsletter, product-card-deals), which is its own chunk under Turbopack;
  they are `@import`ed by `globals.css` now, as XF04 did for the cart and
  login sheets.
- **category and category-seo empty state (mobile-chrome, 2 cases):** the
  empty state streams through a Suspense boundary, so the HTML carries it
  twice until React commits and the strict locator saw both; the two
  assertions are scoped to `#main-content` now (2 passed on the running
  server under mobile-chrome).
- **responsive.spec safe area (both projects):** the float's inset is 20px +
  the consent reserve on a first visit (308px measured), by design since
  XF04 lifted it above the banner; the test now visits with consent decided,
  which is what it was measuring (4 passed on the running server).
- **touch-targets.spec on every route (12 cases):** two causes. The sign-in
  link's `.tap-area--down` box grows into the sticky header, which is `z-40`
  and painted over it (elementFromPoint: the header's row; 72x38 measured),
  so the top bar is `relative z-50` now, verified by injecting the style on
  the running build (link hit at +1, +3 and +6px). The product page's other
  eight entries are the related-card category links at 97x20, the same
  overlap the axe finding above describes, fixed by the `-mt-1` change.
- **Not fixed here, for the retry:** `category.spec.ts` catalogue thumbnails
  on mobile-chrome (element detached mid-scroll),
  `coupon-offer.spec.ts` (the `/coupon/<physical slug>` probe landed on the
  not-found page in the browser while curl got the 307), the
  `wishlist-page.spec.ts` share button, full-purchase-redeem's inherited cart,
  and the cart-write limiter state on this machine.


### Diagnostic run (WRETRY-XF04, the build of 86077efdb, started 06:32:49)

The retry's first run, on the build the previous item left behind (BUILD_ID
`fdf4T7DEiGFTe08hNsYjI`, built 06:30 from the committed tree, nothing under
`src/` or `e2e/` newer than it): **1,084 passed, 14 failed, 24 skipped** of
1,122 in 21.0 min (ended 06:53:57). Not a measured pair: it is the run that
found the eleven causes below, and the test-side fixes written while it ran
were already on disk when the mobile-chrome worker started, so its second
half ran newer spec code than its first. The pair that counts is the next
section, on the rebuilt tree.

| spec | failed | project |
| --- | --- | --- |
| admin-refund.spec.ts | 2 | chromium, mobile-chrome |
| physical-purchase.spec.ts | 2 | chromium, mobile-chrome |
| full-purchase-redeem.spec.ts | 1 | chromium |
| home.spec.ts (one stylesheet) | 2 | chromium, mobile-chrome |
| menu-drawer.spec.ts (close button hover, 380 and 768) | 2 | chromium |
| wishlist-page.spec.ts (share button) | 2 | chromium, mobile-chrome |
| a11y.spec.ts (cart panel) | 1 | mobile-chrome |
| a11y.spec.ts (Tab walk on /login) | 1 | mobile-chrome |
| coupon-offer.spec.ts (physical slug) | 1 | mobile-chrome |

What each one was, measured on the running server and its own error context:

- **The money specs, three causes stacked.** (1) `emptyCart()` read the cart
  page the instant it loaded, before `GET /api/cart` had answered: a fresh
  context's mirror is empty, so the page settles on the empty state first,
  the clear button was not on it, and the press was skipped; the checkout
  then carried 38, 39, 40, 42 and 43 lines across the five cases (the header
  badge in every snapshot) and the pay step answered "אין מספיק במלאי לאחד
  הפריטים". The helper now waits for the network to go idle on `/cart`,
  presses the button when it is there, and proves the badge reads 0. A
  waiter armed on the response alone resolved on the account page's own
  fetch after sign-in (second attempt, mobile-chrome). (2) `run.sh` passed
  no `VOUCHER_QR_SECRET`, so a coupon order could not sign its voucher: the
  full-purchase snapshot carries the alert "VOUCHER_QR_SECRET is not set;
  refusing to sign or verify voucher QR payloads". The script passes one.
  (3) With the cart emptied by hand after the run, the physical add answered
  nothing: badge "1 פריטים, 0 ₪", buy button disabled, no "נוסף לסל", clean
  server log. The `cart_write` policy (120 an hour) is keyed on the user
  alone for a signed-in shopper, the counters live in Postgres (no Upstash
  locally) and outlive every server restart, and a day of runs had spent the
  one seeded customer's hour. `cartWriteIdentifier()` (lib/cart) charges a
  signed-in shopper per address as well, but only under the
  `E2E_MOCK_CHECKOUT=local-build` allowance the payment gate already reads
  (inert on Vercel); each run hands its workers a fresh /24 keyed on the
  hour (`run.sh`), so a run starts with a shopper's budget. The three specs
  also take a cross-worker lock (`e2e/money-lock.ts`): they share one account
  and one cart row, and the chromium tail runs beside the mobile-chrome head.
  full-purchase-redeem empties the account cart in a context of its own
  before its guest leg, since the guest cart is merged into the account at
  pay.
- **home.spec, one stylesheet (both projects).** The font chunk is not only
  `@font-face`: next/font adds its two class rules (`.heebo_<hash>-module__…`,
  173 bytes measured), the filter counted the chunk as the app's and read 2.
  The filter strips those rules too.
- **menu-drawer, the close button at 380 and 768.** The top bar's `relative
  z-50` (the touch-target fix of 4d61c6fb1) is in the root stacking context;
  the drawer is `fixed z-50` INSIDE the sticky header, which is `z-40`, so
  the bar painted over the open drawer and `hover()` retried 52 times on
  "subtree intercepts pointer events" from the bar. The drawer marks `<html
  data-drawer-open>` while open and the bar steps to `z-index: auto` under
  it (globals.css); pinned in MobileDrawer.test.
- **wishlist share (both projects).** The button carried
  `aria-disabled="true"` while 248 is unapplied; Playwright treats that as
  disabled and the click waited out the test. The attribute is gone (the
  press still answers with the toast, which is what the test checks); the
  title and `data-share` carry the state.
- **a11y, the cart panel on mobile-chrome.** A toast was on screen during
  the scan and its close button is sonner's 20x20 box: axe `target-size`
  measures the element, not the 44px pseudo-element hit box UX28 added.
  The button is 24x24 now.
- **a11y, the Tab walk on /login (mobile-chrome).** The walk hit-tested the
  stop in the same frame the browser scrolled it into view, and read the
  email field under the consent banner once and above it the next time. The
  walk waits two frames after each Tab.
- **coupon-offer, a physical slug (mobile-chrome).** `redirect()` thrown
  from CouponOfferPage, in the static half of the render, wrote the Location
  header TWICE (`curl -sI` shows both); curl followed the first, the browser
  joined them with a comma and landed on `/product/x, /product/x`, a 404.
  The route redirects from behind a boundary after `connection()` now, the
  way the voucher half's sign-in redirect already does, and that one was
  measured single.
  Measured on the rebuilt server: the URL answers 200 with the framework's
  client redirect (`NEXT_REDIRECT` in the payload, a `<meta http-equiv=
  "refresh">` fallback), and the browser lands on the product page; the
  server-side 307 is gone with the duplicate.

Two more were under those, found by a targeted run of the money specs on the
rebuilt tree before the pair (the customer legs of both coupon specs passed
there: vouchers were issued and listed under "הקופונים שלי"):

- **full-purchase-redeem, the supplier leg.** `next.config.ts` carried
  `/scan -> /supplier/scan` (permanent) while the app's page at
  `/supplier/scan` redirects to `/scan`, where the screen lives: a signed-in
  supplier bounced between the two forever (blank page, "navigated to
  /supplier/scan" seven times in the call log). Signed out, the proxy's
  login redirect answered first, which is why coupon-scan.spec never saw
  it. The config alias is removed; the page's redirect is the alias.
- **admin-refund, the admin leg.** The admin fixture on the hosted database
  has no TOTP factor: `/admin-mfa` offers enrolment ("התחלת הגדרה" and a QR),
  not the code challenge `completeAdminMfaIfAsked` answers, and enrolling a
  factor from a test is a write to a real account's auth factors. The helper
  skips the case with that reason on such a database; the admin leg stays
  unproven here, and is recorded as such.

Three more came out of the targeted reruns that followed, each on the
rebuilt tree (three rebuilds in all for this item, each for a change in
`src/` or `next.config.ts` that the measured pair had to carry):

- **full-purchase-redeem, the scan page's button.** The spec pressed "המשך";
  the page's button is "בדוק שובר" (ScanClient.tsx), so the press waited
  out the test with the voucher code typed in the field. The spec names the
  real button, and the journey's budget is 240s (three sign-ins, a checkout,
  a voucher and a redeem on a database whose every query is 300-500ms: the
  customer leg alone took 1.3 min).
- **The add-to-cart confirmation at 5s.** `cart.add` on the hosted database
  is a limiter RPC and five reads at 300-500ms each (2.5s measured end to
  end in the server log), and the "נוסף לסל" state arrived after the
  default expectation had expired. The two signed-in money specs wait 20s
  for it.
- **Order velocity, the third budget.** With the cart budget solved the pay
  step answered "יותר מדי הזמנות בזמן קצר, נסו שוב מאוחר יותר": the fraud
  velocity buckets (`src/lib/fraud/velocity.ts`) allow 15 new orders per
  email and per phone a day, and the seeded customer had placed them across
  the day's runs, each refusal also queueing a fraud review row for the
  fixture. Under the same local-build allowance the email and phone buckets
  carry the address too (`localE2eScope`, lib/rate-limit), the cart
  identifier reads the same helper, and both stay the identity alone on
  Vercel. Pinned in velocity.test, local-e2e-scope.test and
  write-limit-identifier.test.

## How the suite got there

The first measurement of the day, on the build as it stood, was **972 passed,
128 failed, 22 skipped in 24.7 minutes**, and a second run on the same build
(kept as a flake baseline) reproduced it: every failure but one was stable.
The 128 were twelve causes, nine of them defects in the product and three in
the tests. All are fixed in the same commit as this document.

### Product defects

| Cases | Where | What was wrong | Fix |
| --- | --- | --- | --- |
| 52 | `rtl-mobile.spec.ts`, every route at 320px | The handheld header row (hamburger 44 + logo 100 + three 44px icon cells + two 16px gaps + the 30px gutter pair = 338px) does not fit 320; UX03's 11px pull left 3px of sideways scroll on every page. | `gap-2` below a new `--breakpoint-narrow: 360px` token (`Header.tsx`); from 360 the row is live's 16px gap. |
| 8 | `a11y.spec.ts`, first Tab is the skip link | `ConsentBanner` is first in the root layout for LCP, so its two buttons were the first two Tab stops on every page for a first-time visitor. | One `SkipLink` in the root layout ahead of the banner; the six per-layout copies are gone; the auth layout's `<main>` carries `id="main-content"`. |
| 9 | `a11y.spec.ts`, Tab walk | The WhatsApp float sat under the consent banner (`focus hidden under details.mt-2`). | `.whatsapp-float` is lifted by `--reserve-consent` and `--reserve-pwa` (responsive.css, mini-cart.css). |
| 12 | `a11y.spec.ts`, six legal pages | `dt` at `text-heading/70` over `bg-heading/5` is 4.3:1 at 14px. | `text-heading/80` (5.6:1). |
| 2 | `a11y.spec.ts`, /contact | White on `#25d366` (the WhatsApp support button) is 1.9:1. | `bg-whatsapp-ink` (`#075e54`, 7.67:1, the pairing tokens.css documents). |
| 6 | `a11y.spec.ts`, product page and cart panel | Related-card category links were 20px tall (`target-size`). | `min-h-6` on the line-clamped link. |
| 14 | `touch-targets.spec.ts` | The top-bar sign-in link at y=0 lost 3px of its 44px hit box above the viewport (72x41); the category-card compare overlay's hit box overlapped the heart's by 4px (44x40); "בית" in the breadcrumb was 22x24; "שכחתם סיסמה?" 82x18. | `.tap-area--down` (grows downward only) on the top-bar link; compare overlay at `bottom-13`; `tap-area` on the breadcrumb and forgot-password links. The product page's inline wishlist and compare buttons keep their 36px share-row pitch and are held to the 24px floor, not 44. |
| 5 | the three money specs | `next start` is NODE_ENV=production, and `provider-gate.ts` closes the checkout on a mock provider there, so the pay button read "התשלום ייפתח בקרוב"; two of the specs also assumed a signed-in customer lands on the payment step, where the terms checkbox lives, and timed out on it hidden under the details step. | `E2E_MOCK_CHECKOUT=local-build` opens the gate for the mock only and never where `VERCEL` is set (`mockAllowedInProductionBuild`, pinned by `provider-gate.test.ts`); `walkCheckoutToPayment()` in `e2e/helpers.ts` is shared by all three; the specs skip with a reason when the gate is closed. |
| 4 | `home.spec.ts`, footer prefetch | `/wishlist` answered 410 from the stale 09.09 `seo_redirects` row (pending migration 271 retires it). | `LIVE_ROUTES` in `src/lib/seo/redirects.ts`: a path this app serves is never answered from the table, mirroring the legacy map's `source_is_live` exclusions (pinned). |

### Test defects

| Cases | Where | What was wrong | Fix |
| --- | --- | --- | --- |
| 4 | `home.spec.ts` | next/image returns an AVIF source unchanged at every width by design; the test read that as a sharp failure. The consent banner's per-category checkboxes (STEP 31) are typed inputs. The font chunk next/font emits is a `.css` link like the app's. | AVIF sources assert pass-through; banner inputs are the banner's; a sheet that is only `@font-face` is not an app import. The cart and login-dialog sheets are now `@import`ed by globals.css so the app ships one chunk. |
| 2 | `home-rtl.spec.ts` | `#masthead-search` is `dir="auto"` and an empty auto box resolves to ltr. | Allow-listed with the reason. |
| 2 | `product.spec.ts` | Two strips carry `.pdp-related__grid` (related and recommendations); strict mode. | Scoped to `section[data-strip="related"]`. |
| 4 | `coupon-offer.spec.ts` | `page.url()` carries a Hebrew slug percent-encoded; the catalogue's first coupon has a single terms section, so "last" is the open first. | Decoded comparison; a one-section accordion closes and reopens. |
| 4 | `error-page.spec.ts` | `notFound()` behind a Suspense boundary streams a 200, so the 404 skip never fired. | Skip when the not-found heading rendered. |
| 7 | `wishlist-page.spec.ts` | The heart reads "הוסף" until the store's first read answers; on the hosted database the 600ms settle was not enough, and the press REMOVED a saved product (one card instead of two). | Wait for the page to go quiet and let the press's outcome decide; a second press restores a product that was saved after all. |
| 1 | `account-tabs.spec.ts` | The orders page read sat past the 5s default once in two runs (`db.query_slow` in the server log, no error). | 15s on that heading. |

### Rate limiters, the thing that would have made the second run red anyway

Sign-in is 10 an hour per IP and 20 an hour per account; cart writes 120 an
hour per IP; all DB-backed. The suite signed the customer in sixteen times
per run and its adds alone cross 120, so a second back-to-back run on one
address fails from the first cart spec. `e2e/auth-session.ts` now signs in
once per role per run and replays the cookies (`test-results/.auth`, wiped by
Playwright each run; a spec that merges a guest cart passes
`mergeGuestCart: true`), and `E2E_FORWARDED_FOR_PREFIX=10.44.<run>` hands
every worker its own address (Playwright re-evaluates the config inside each
worker after setting `TEST_PARALLEL_INDEX`). `docs/TESTING.md` carries the
recipe.

## What stays out of scope here

- The `visual` project ran without a Percy agent, so its snapshots are
  navigations only (`percySnapshot` logs once and returns).
- The money specs write real rows to the production database (mock-paid
  orders on the E2E customer, a refund). There is no staging; this is the
  documented state of the suite.
- Pending migration 271 is still the right fix for the `/wishlist` row;
  `LIVE_ROUTES` is the guard that holds until it is applied.
