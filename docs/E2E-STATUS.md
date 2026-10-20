# E2E Test Status

**Last run:** 2026-10-20 16:42 UTC, run 4, MAINTENANCE_LOOP_4 second cycle
**Base commit:** 36a9a8ae2 on `autopilot`
**Recipe:** `CARDCOM_USE_MOCK=true CHECKOUT_ENABLED=true NEXT_PUBLIC_APP_URL=http://localhost:3417 pnpm build`,
then `pnpm start` on port 3417 with the same three variables, then
`E2E_BASE_URL=http://localhost:3417 E2E_FORWARDED_FOR_PREFIX=10.44.77 pnpm exec playwright test --retries=1 --reporter=list,json`.
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

Run 4 is the first full run with a per-worker `x-forwarded-for` address, so the cart
write limiter (class 1 of run 2, 14 cases) never fired: cart.spec 21/21, checkout.spec
14/14, rtl-mobile 82/82, production-smoke and purchase-flow all green on both projects.
The other classes that went green between run 2 and run 4, on the same specs: sideways
scroll at 1440 px on `/`, `/products` and `/cart` (6 cases), touch targets on `/`,
`/products` and `/search` (6), the three mobile 30 s timeouts in product and
purchase-flow, the Pixel 5 deal-thumb width case, and the category price-filter flake.
Nothing in run 4 is new; every failure below is a class already recorded in run 2.

## Flaky (run 4, passed on retry)

| Case | Project | First attempt | Fix in this loop |
| --- | --- | --- | --- |
| a11y: coupons has no WCAG A/AA violations | chromium | `aria-prohibited-attr` on `div[aria-label="טוען קופונים"]`, the `CouponsGridSkeleton` wrapper; axe ran while the Suspense fallback was still on screen, the retry ran after it had been replaced | `role="status"` on the wrapper, which permits `aria-label`; the same case is a deterministic failure on mobile-chrome, so this fix covers one flaky and one failed case |
| keyboard-navigation: button with Enter key is focusable | mobile-chrome | a locator race, not a product defect: the page is still streaming at `domcontentloaded`, so `first()` resolved to the category tab "דילים חמים" for `focus()` and to the header "תפריט" button for the `activeElement` check a few ms later, and the spec compared two different nodes (probe: 1 in 8 page loads) | focus and check run inside one `evaluate` on the same node; the first-visible selector is kept; the assertion is unchanged |

Both cases were also in the flaky table of run 2; no new flaky case appeared. The
other four flaky cases of run 2 (login contrast, login keyboard reachability, category
price filter, coupons on mobile) were either stable passes or stable failures in run 4.

## Failures by class (run 4, 59)

| # | Class | Cases | Evidence | Kind |
| -: | --- | ---: | --- | --- |
| 1 | Fixture users cannot sign in | 12 | admin-product-crud 6, admin-refund 2, admin-refund-to-wallet 2, physical-purchase 2: `waitForURL` 20 s timeout after submit, or the post-login locator never visible. `.env.local` carries `E2E_ADMIN_EMAIL` only; no `E2E_ADMIN_PASSWORD`, `E2E_CUSTOMER_*`, `E2E_SUPPLIER_*` | environment |
| 2 | WCAG A/AA violations | 9 | a11y: `/cart` (2), every checkout step with validation errors (2), `/login` (2), the cart panel after add-to-cart (2), `/coupons` on mobile-chrome (1, the skeleton `aria-label`, fixed below) | product |
| 3 | Consent banner body reservation | 4 | body reserves 203 px for a 214.5 px banner at 320 px and 112 px for a 120 px banner at 640 px, both projects | product |
| 4 | Touch targets under 24 px | 6 | `/contact`, `/login`, `/suppliers` x 2 projects; `/`, `/products`, `/search` pass now | product |
| 5 | Shekel sign left of digits | 6 | `/`, `/products`, `/category/hot-deals` at 1440 px, both projects; the category nav label "עד ₪99" | product copy |
| 6 | Sticky cart bar at desktop | 8 | mobile-shell: class list lacks `md:hidden`, computed display at 768 and 1440 is not `none`, and the button case times out, both projects | spec vs design drift |
| 7 | Keyboard navigation | 4 | home tab order (skip link is not the first Tab stop) and contact form input 8 without a label, both projects | product |
| 8 | Homepage | 3 | three render-blocking stylesheets instead of one (both projects); `404 /category` from `MobileNavBar` "קטגוריות" on mobile-chrome | product |
| 9 | Money flow | 2 | full-purchase-redeem: a guest cart reaches `/checkout` directly; the spec expects `/login?next=%2Fcheckout` | spec vs guest-checkout drift |
| 10 | Login page | 2 | auth "shows magic link form on toggle": the toggle `/קישור מאובטח/` is now a tab named "קישור", 30 s timeout | spec drift (UX23) |
| 11 | Archive page clamp | 2 | `/products?page=9999` renders page 1, not the last page | product |
| 12 | Checkout CLS | 1 | `/checkout` shifted 0.4692 on mobile-chrome against a 0.1 budget (0.4517 in run 2) | product |

## What changed in this loop

1. `src/components/CouponCardSkeleton.tsx`: `CouponsGridSkeleton` wrapper gets
   `role="status"`. A `div` with no role may not carry `aria-label` (axe
   `aria-prohibited-attr`, serious); `status` is a live-region role that names from
   author, and `aria-busy` stays. Removes the flaky chromium case and the failed
   mobile-chrome case of class 2.
2. `e2e/keyboard-navigation.spec.ts`: "button with Enter key is focusable" focuses
   and checks inside one `evaluate`, so both act on the same node. A first attempt
   that only switched to a `:visible` selector still failed 1 in 3 on chromium; the
   atomic version passed 16 of 16 (8 repeats x 2 projects) and the whole file then
   showed only the four class 7 failures already listed above.

No test was weakened or skipped.

## Action items

- Set `E2E_CUSTOMER_*`, `E2E_SUPPLIER_*` and `E2E_ADMIN_PASSWORD` in `.env.local` for
  fixture users that exist in the database the server reads, or run `pnpm seed:test`
  against a disposable project. Class 1 cannot be measured until then.
- Give `MobileNavBar` "קטגוריות" a real target; `/category` has no index route.
- Classes 2 to 5, 7, 8, 11 and 12 are product defects with a deterministic
  reproduction each; queue one goal per class rather than one for the suite.
- Classes 6, 9 and 10 are specs describing an older design; update the spec or the
  design, not both.
- Keep `E2E_FORWARDED_FOR_PREFIX` on a new value for every run inside the same hour;
  without it the second run of the hour reports the limiter as 14 cart failures.

## Gates after the changes

`pnpm typecheck` clean, `pnpm lint` clean (biome 1697 files, tokens, copy and asset
gates clean), `CARDCOM_USE_MOCK=true pnpm build` exit 0 twice (the build that served
run 4, and the rebuild with the skeleton fix). Against the rebuild: coupons a11y case
6 of 6 green (3 repeats x 2 projects), Enter-key case 16 of 16 green.
