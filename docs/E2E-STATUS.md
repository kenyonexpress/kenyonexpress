# E2E Test Status

**Last run:** 2026-10-20 19:01 UTC, run 5, MAINTENANCE_LOOP_4 third cycle
**Base commit:** 6d1951209 on `autopilot`
**Recipe:** `CARDCOM_USE_MOCK=true CHECKOUT_ENABLED=true NEXT_PUBLIC_APP_URL=http://localhost:3417 pnpm build`,
then `pnpm start` on port 3417 with the same three variables, then
`E2E_BASE_URL=http://localhost:3417 E2E_FORWARDED_FOR_PREFIX=10.44.78 pnpm exec playwright test --retries=1 --reporter=list,json`.
Two workers, both projects (chromium and mobile-chrome). A case counts as **flaky** only
when it failed and then passed on a retry; a case that failed on every attempt is a
**failure**. Counts come from the JSON reporter, never from the list output.

## Test summary

| Run | Total | Passed | Failed | Flaky | Skipped | Duration |
| --- | ----: | -----: | -----: | ----: | ------: | -------: |
| 1, 596ba7636, 11:51 UTC | 682 | 582 | 93 | 0 | 7 | 20.5 min |
| 2, after the category and login fixes, 12:17 UTC | 682 | 578 | 91 | 6 | 7 | 28.2 min |
| 3, cart-dependent mobile files, fresh forwarded-for address | 21 | 18 | 0 | 0 | 3 | 0.7 min |
| 4, 36a9a8ae2, 16:42 UTC, `--retries=1`, fresh forwarded-for prefix | 682 | 614 | 59 | 2 | 7 | 16.4 min |
| 5, 6d1951209, 19:01 UTC, `--retries=1`, fresh forwarded-for prefix | 682 | 612 | 60 | 3 | 7 | 21.5 min |

Run 5 ran on the same spec and source files as run 4 (no `src/` or `e2e/` change
between the two commits), so the diff of the two failure sets is a measurement of the
backend and the specs, not of the product. Only one case moved out (coupons a11y on
mobile-chrome, the run 4 fix) and two moved in: checkout "the cart CTA hands a guest
straight to checkout" on chromium and purchase-flow "a shopper can find a product" on
mobile-chrome. The server log of the run holds **83 `supabase.timeout` events** (10 s
REST timeouts on `products`, `product_variants`, `reviews`, `available_stock` and five
on `cart.get`), 60 of them between 19:02 and 19:09 UTC; run 4 had a quiet backend and
ran 5 minutes faster. The three flaky cases and both incoming failures all sit inside
or next to that window, and the breakdown below says which of them the specs could
have absorbed and which they could not.

## Flaky (run 5, passed on retry)

| Case | Project | First attempt | Verdict and fix |
| --- | --- | --- | --- |
| a11y: every interactive control on /login is reachable by keyboard | mobile-chrome | three `button.inline-flex ... px-3` reported unreachable: the Radix tab triggers of the login methods, every one at `tabindex="-1"` | **spec heuristic.** Radix Tabs follows the WAI-ARIA roving pattern: the `tablist` is the single Tab stop (`tabindex` goes -1 to 0 in a layout effect after hydration) and the tabs stay at -1 for the life of the page. Probed on the build: Tab press 5 lands on the active tab "אימייל" through the list. The case only ever PASSED when `domcontentloaded` beat the Suspense reveal of the login form, so the fast runs evaluated an empty page. Fixed in `e2e/a11y.spec.ts`: a `role="tab"` inside a focusable `tablist` is reachable, and the assertion is `expect.poll` so it reads the hydrated DOM. 8 of 8 after the fix (4 repeats x 2 projects). |
| cart: the page scrolls behind the desktop dropdown and not behind the phone sheet | chromium | `page.goto` of the product page waited more than 30 s for `load`, at 19:06:34 | **environment.** 12 Supabase timeouts in that minute and a `cart.get` timeout at 19:07:00; the retry at 19:07:11 passed in 12 s. Nothing to fix in the spec. 8 of 8 on the re-run. |
| purchase-flow: a shopper can find a product, add it, and reach checkout | chromium | `button "נוסף לסל"` not visible within 5 s after the buy click, at 19:13:11 | **spec.** The snapshot at the 5 s mark shows the buy button still disabled and the header badge already at the optimistic 1, so the add had not been answered yet. The "נוסף לסל" label is a 2-second `setTimeout` in `ProductInfo.tsx`, which the shared `addOpenProductToCart` helper retired in favour of the settled badge. A quiet add measures 3.1 s on this laptop. Fixed: the spec calls the helper. The identical case on mobile-chrome failed on both attempts at 19:21 and is the second incoming failure below. 8 of 8 after the fix. |

## Failures by class (run 5, 60)

| # | Class | Cases | Evidence | Kind |
| -: | --- | ---: | --- | --- |
| 1 | Fixture users cannot sign in | 12 | admin-product-crud 6, admin-refund 2, admin-refund-to-wallet 2, physical-purchase 2: `waitForURL` 20 s timeout after submit, or the post-login locator never visible. `.env.local` carries `E2E_ADMIN_EMAIL` only; no `E2E_ADMIN_PASSWORD`, `E2E_CUSTOMER_*`, `E2E_SUPPLIER_*` | environment |
| 2 | WCAG A/AA violations | 8 | a11y: `/cart` (2), every checkout step with validation errors (2), `/login` (2), the cart panel after add-to-cart (2). The coupons skeleton case of run 4 is gone on both projects | product |
| 3 | Consent banner body reservation | 4 | body reserves 203 px for a 214.5 px banner at 320 px and 112 px for a 120 px banner at 640 px, both projects | product |
| 4 | Touch targets under 24 px | 6 | `/contact`, `/login`, `/suppliers` x 2 projects | product |
| 5 | Shekel sign left of digits | 6 | `/`, `/products`, `/category/hot-deals` at 1440 px, both projects; the category nav label "עד ₪99" | product copy |
| 6 | Sticky cart bar at desktop | 8 | mobile-shell: class list lacks `md:hidden`, computed display at 768 and 1440 is not `none`, and the button case times out, both projects | spec vs design drift |
| 7 | Keyboard navigation | 4 | home tab order (skip link is not the first Tab stop) and contact form input 8 without a label, both projects | product |
| 8 | Homepage | 3 | three render-blocking stylesheets instead of one (both projects); `404 /category` from `MobileNavBar` "קטגוריות" on mobile-chrome | product |
| 9 | Money flow | 2 | full-purchase-redeem, both chromium cases. In run 5 they died earlier than in run 4, on the same "נוסף לסל" label as the purchase-flow flake (19:09, inside the timeout burst); with the helper they reach the run 4 point again, `toHaveURL` on `/login?next=%2Fcheckout` for a guest who is handed `/checkout` directly | spec vs guest-checkout drift |
| 10 | Login page | 2 | auth "shows magic link form on toggle": the toggle `/קישור מאובטח/` is now a tab named "קישור", 30 s timeout | spec drift (UX23) |
| 11 | Archive page clamp | 2 | `/products?page=9999` renders page 1, not the last page | product |
| 12 | Checkout CLS | 1 | `/checkout` shifted 0.4515 on mobile-chrome against a 0.1 budget (0.4692 in run 4) | product |
| 13 | Supabase REST timeouts | 1 | checkout "the cart CTA hands a guest straight to checkout", chromium, 19:08:45 and 19:09:15: the header badge reads "1 פריטים" while `/cart` renders "סל הקניות שלך ריק כרגע"; `cart.get` timed out at 19:08:56 inside the first attempt. mobile-chrome passed at 19:18. On the re-run 6 of 8, the two misses again next to `cart.add` timeouts at 19:32:53 and 19:35:16 | environment |
| 14 | Two-second label | 1 | purchase-flow on mobile-chrome, both attempts at 19:21: buy button still disabled at the 5 s mark, badge at 1, no server error in that minute. Same root as the chromium flake; fixed by the helper | spec, fixed |

## What changed in this loop

1. `e2e/a11y.spec.ts`: `unreachableControls` no longer reports a `role="tab"` whose
   `tablist` is itself focusable (or holds a tab at `tabindex >= 0`), which is the
   roving pattern Radix renders on `/login`. The three callers go through a new
   `expectEveryControlReachable`, an `expect.poll` on the same function, so the read
   happens on the hydrated DOM instead of at `domcontentloaded`. A control that stays
   unreachable after hydration still fails.
2. `e2e/purchase-flow.spec.ts`, `e2e/full-purchase-redeem.spec.ts` (2 places),
   `e2e/physical-purchase.spec.ts`, `e2e/admin-refund.spec.ts`,
   `e2e/admin-refund-to-wallet.spec.ts`: the inline `buy.click()` plus a 5 s wait on
   the "נוסף לסל" label is replaced by `addOpenProductToCart(page)`, which waits up
   to 15 s for the header badge to rise AND the button to leave its pending state,
   the moment `settle()` has the server's answer. The skip checks on `buy` stay.
   This is the same retirement `helpers.ts` documents for the seven cart specs; these
   six call sites had been left on the old assertion.

No test was weakened or skipped. Verification on the live build, `--retries=0
--repeat-each=4`, both projects, fresh forwarded-for prefix: a11y login keyboard
8/8, cart scroll-lock 8/8, purchase-flow 8/8, checkout CTA 6/8 (class 13),
full-purchase-redeem 0/8 at the class 9 assertion instead of the label.

## Action items

- Set `E2E_CUSTOMER_*`, `E2E_SUPPLIER_*` and `E2E_ADMIN_PASSWORD` in `.env.local` for
  fixture users that exist in the database the server reads, or run `pnpm seed:test`
  against a disposable project. Class 1 cannot be measured until then.
- Class 13 is the hosted Supabase project answering REST reads in more than 10 s in
  bursts (83 timeouts in run 5, 29 in the 4-minute re-run; a bare `products` read from
  this laptop measured 0.31 to 0.96 s in between). It is the same latency that failed
  the MAINTENANCE_LOOP_3 build on its first attempt. The `/cart` page degrading to
  "empty" on a `cart.get` timeout, under a badge that says 1, is worth a product look
  of its own: a shopper on a slow link sees the same contradiction.
- Give `MobileNavBar` "קטגוריות" a real target; `/category` has no index route.
- Classes 2 to 5, 7, 8, 11 and 12 are product defects with a deterministic
  reproduction each; queue one goal per class rather than one for the suite.
- Classes 6, 9 and 10 are specs describing an older design; update the spec or the
  design, not both.
- Keep `E2E_FORWARDED_FOR_PREFIX` on a new value for every run inside the same hour;
  without it the second run of the hour reports the limiter as 14 cart failures.

## Gates after the changes

`pnpm typecheck` clean, `pnpm lint` clean (biome 1698 files, tokens, copy and asset
gates clean), `CARDCOM_USE_MOCK=true pnpm build`: exit 0 on the edited tree (the same build served the re-run before the edits; e2e files are not part of the bundle). The build log carries the known prerender warnings only.
