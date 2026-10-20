# E2E Test Status

**Last run:** 2026-10-20 21:49 UTC, run 6, MAINTENANCE_LOOP_4 fourth cycle
**Base commit:** 5ba9efa96 on `autopilot`
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
| 6, 5ba9efa96, 21:49 UTC, `--retries=1`, prefix 10.44.79 | 682 | 616 | 58 | 1 | 7 | 19.8 min |

Run 6 is the first full run on the run 5 spec fixes. Nothing under `src/` changed
between 6d1951209 and 5ba9efa96; the diff is `e2e/` only (helpers, a11y, and the six
add-to-cart call sites), so run 6 measures those fixes and the backend. The server log
holds **7 `supabase.timeout` events** against 83 in run 5 (two on `cart.get` and
`cart.add` at 21:52, five product reads between 21:56 and 22:06), and the run was 1.7
minutes faster. The 58 failures are exactly classes 1 to 12 below, case for case: run 5's
classes 13 and 14 (the budgets fixed in the previous cycle) produced zero reds, and no
case failed that had not failed in run 5. Run 5's three flaky cases all passed on the
first attempt. One new flaky case appeared, in the cart page, with the same shape as
class 13; it is fixed below and verified.

## Flaky (run 6, passed on retry)

| Case | Project | First attempt | Verdict and fix |
| --- | --- | --- | --- |
| cart: add to cart from product page then see it in the cart | chromium | 21:53:18, 25 s: `getByText('! צימר מאסטר')` not found within the 5 s default on `/cart`. The snapshot shows the header badge at "1 פריטים, 0 ₪" and the main column reading "סל הקניות שלך ריק כרגע." under the heading. `cart.get` and `cart.add` had both hit the 10 s Supabase ceiling at 21:52:15, one minute earlier. Retry at 21:53:43 passed in 16 s | **spec budget, class 13 shape.** `/cart` is prerendered and `CartPageView` has no loading branch: it draws the empty state until `CartBootstrap`'s one `/api/cart` fetch lands, and that read carries the server's 10 s ceiling. checkout.spec got the 15 s discovery budget for exactly this in the previous cycle; cart.spec line 46 and five sibling sites were still on 5 s. Fixed in `e2e/helpers.ts`: `openCartWithItems(page)` navigates to `/cart`, waits for the heading, then waits `DISCOVERY_TIMEOUT` for the order summary, which only renders in the non-empty branch, and returns it. Six sites in `cart.spec.ts` and two in `production-smoke.spec.ts` call it; the one site that expects an empty cart does not. Verified: cart.spec and production-smoke.spec, both projects, `--retries=0 --repeat-each=2`, prefix 10.44.80: 46 passed, 0 failed, 0 flaky, 10 skipped (the standing viewport and no-coupon skips, twice), 0 timeouts in the server log during it. |

Run 5's three flaky cases (login keyboard reachability on mobile-chrome, cart scroll-lock
on chromium, purchase-flow on chromium) passed on their first attempt in run 6.

## Failures by class (run 6, 58; classes 1 to 12 unchanged from run 5)

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
| 9 | Money flow | 2 | full-purchase-redeem, both chromium cases. In run 5 they died earlier than in run 4, on the same "נוסף לסל" label as the purchase-flow flake (19:09, inside the timeout burst); with the helper they reach the run 4 point again, `toHaveURL` on `/login?next=%2Fcheckout` for a guest who is handed `/checkout` directly. Run 6 confirms: both cases now fail at that assertion, 21:55:56 | spec vs guest-checkout drift |
| 10 | Login page | 2 | auth "shows magic link form on toggle": the toggle `/קישור מאובטח/` is now a tab named "קישור", 30 s timeout | spec drift (UX23) |
| 11 | Archive page clamp | 2 | `/products?page=9999` renders page 1, not the last page | product |
| 12 | Checkout CLS | 1 | `/checkout` shifted 0.4515 on mobile-chrome against a 0.1 budget (0.4692 in run 4) | product |
| 13 | Spec budgets under the server's Supabase ceiling | 0 in run 6 (1 in run 5) | checkout "the cart CTA hands a guest straight to checkout", chromium, 19:08:45 and 19:09:15: the header badge reads "1 פריטים" while `/cart` renders "סל הקניות שלך ריק כרגע"; `cart.get` timed out at 19:08:56 inside the first attempt. mobile-chrome passed at 19:18. On the first re-run 6 of 8, the two misses next to `cart.add` timeouts at 19:32:53 and 19:35:16: one add still pending at the helper's 15 s mark, one `/cart` CTA not there at 5 s. Fixed: the add waits 25 s (two slow calls plus the rest of the serial chain), the test gets 60 s, the CTA gets the 15 s the summary already had in purchase-flow. Second re-run 8 of 8, then cart.spec 21/21 and checkout.spec 14/14 with 5 timeouts in the log | spec, fixed |
| 14 | Two-second label | 0 in run 6 (1 in run 5) | purchase-flow on mobile-chrome, both attempts at 19:21: buy button still disabled at the 5 s mark, badge at 1, no server error in that minute. Same root as the chromium flake; fixed by the helper | spec, fixed |

## What changed in this loop

1. `e2e/helpers.ts`: new `openCartWithItems(page)`. It goes to `/cart`, asserts the
   heading, waits up to `DISCOVERY_TIMEOUT` (15 s) for the order summary
   (`complementary` "סיכום הזמנה"), and returns that locator. The comment on it carries
   the mechanism: a static page, one post-hydration `/api/cart` fetch, no loading branch,
   and a 10 s server ceiling per Supabase call.
2. `e2e/cart.spec.ts`: the six `page.goto('/cart')` sites that follow an add go through
   the helper (the product-name case, the summary case, both quantity cases, the reload
   case and the empty-cart-button case). The one site that asserts an EMPTY cart after
   a removal keeps its bare `goto`, because the helper would wait for a summary that
   never comes.
3. `e2e/production-smoke.spec.ts`: both cart sites go through the helper; the
   product-name assertion now runs after the summary is on screen.

No assertion was weakened and no test was skipped. The previous cycle's changes
(roving-tab exemption, `addOpenProductToCart` at six call sites, `CART_WRITE_TIMEOUT`,
`allowSlowBackend()`, the checkout CTA budget) are listed in the git history of
8fcd470d5 and 4a2caa1bc and held in run 6: zero reds in classes 13 and 14.

## Action items

- Set `E2E_CUSTOMER_*`, `E2E_SUPPLIER_*` and `E2E_ADMIN_PASSWORD` in `.env.local` for
  fixture users that exist in the database the server reads, or run `pnpm seed:test`
  against a disposable project. Class 1 cannot be measured until then.
- The hosted Supabase project answers REST reads in more than 10 s in bursts (83
  timeouts in run 5, 7 in run 6, 0 in the run 6 verification; a bare
  `products` read from this laptop measured 0.31 to 0.96 s in between). It is the same
  latency that failed the MAINTENANCE_LOOP_3 build on its first attempt. The specs now
  budget for it (class 13); the backend itself is unchanged. The `/cart` page showing
  the empty state, CTA and all, until `/api/cart` answers, and staying on it silently
  when that fetch fails, is worth a product look of its own: a shopper on a slow link
  sees "your cart is empty" under a badge that says 1.
  Run 6 reproduced it on `/cart` itself (the flaky row above). The specs now budget
  for it everywhere; a loading branch in `CartPageView` would remove the class.
- Give `MobileNavBar` "קטגוריות" a real target; `/category` has no index route.
- Classes 2 to 5, 7, 8, 11 and 12 are product defects with a deterministic
  reproduction each; queue one goal per class rather than one for the suite.
- Classes 6, 9 and 10 are specs describing an older design; update the spec or the
  design, not both.
- Keep `E2E_FORWARDED_FOR_PREFIX` on a new value for every run inside the same hour;
  without it the second run of the hour reports the limiter as 14 cart failures.

## Gates after the changes

`pnpm type-check` exit 0 and `pnpm lint` exit 0 (biome 1699 files, tokens, copy and
asset gates clean) on the run 6 spec change. `CARDCOM_USE_MOCK=true pnpm build`:
exit 0, BUILD_ID 0aOBa0tEPai4rHxAThLex, with the known partner-API prerender
bail-out lines only. The run itself used the mock build FMTW3mzSSC0NsGnOPr1zV on port
3417, listener verified by PID and working directory before the suite started.
