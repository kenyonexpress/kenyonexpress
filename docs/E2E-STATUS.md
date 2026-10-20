# E2E Test Status

**Last run:** 2026-10-20, two full runs (11:51 UTC and 12:17 UTC), MAINTENANCE_LOOP_4
**Base commit:** 596ba7636 on `autopilot`
**Recipe:** `CARDCOM_USE_MOCK=true pnpm build`, then `pnpm start` on port 3417 with
`CARDCOM_USE_MOCK=true CHECKOUT_ENABLED=true NEXT_PUBLIC_APP_URL=http://localhost:3417`,
then `E2E_BASE_URL=http://localhost:3417 pnpm exec playwright test --retries=2 --reporter=list,json`.
Two workers, both projects (chromium and mobile-chrome). A case counts as **flaky** only
when it failed and then passed on a retry; a case that failed on all three attempts is a
**failure**.

## Test summary

| Run | Total | Passed | Failed | Flaky | Skipped | Duration |
| --- | ----: | -----: | -----: | ----: | ------: | -------: |
| 1, base commit | 682 | 582 | 93 | 0 | 7 | 20.5 min |
| 2, after the two fixes below | 682 | 578 | 91 | 6 | 7 | 28.2 min |
| 3, cart-dependent mobile files, fresh forwarded-for address | 21 | 18 | 0 | 0 | 3 | 0.7 min |

Run 2 looks no better than run 1 only because the DB-backed cart write limiter
(120 writes per hour per client IP) ran out midway through it. Every one of its
14 "add-to-cart did not stick: 0 -> 0" failures is in the mobile-chrome project,
which runs second, and run 3 passes all of them against the same server and build
with nothing changed but the `x-forwarded-for` address. Net of that class, run 2 is
**77 failures**, down from 93.

The previous entry in this file (682 tests, "~54+" failures, "~92%") was an
estimate from failure numbering, not a count. The numbers above come from the JSON
reporter.

## What changed in this loop

1. **Category archive was an error page for every visitor.** `getCategorySuppliersFilter`
   in `src/lib/category-page.ts` selected `suppliers(name_he)`; the suppliers table has
   `name`, not `name_he` (every other embed in the repo already says `suppliers(name)`).
   PostgREST answered `column suppliers_1.name_he does not exist`, the streamed grid
   threw inside its Suspense boundary, and the app error boundary rendered
   "משהו השתבש אצלנו" on every `/category/<slug>`. A curl of the page shows a 200 and
   no error text, because the error travels in the RSC stream; only a browser sees it.
   Fixed; 14 category and a11y cases went green (category.spec 10/24 to 21/24).
2. **Login harness locator matched two elements.** `/login` renders `LoginModal` with
   Radix tabs; the "אימייל" tab panel carries `aria-labelledby` of the trigger, so
   `getByLabel('אימייל')` resolved to the panel and the input and failed strict mode.
   Replaced with `getByRole('textbox', { name: 'אימייל', exact: true })` in
   `e2e/auth-session.ts`, `e2e/auth.spec.ts` and `e2e/full-purchase-redeem.spec.ts`.
   Four auth cases went green; the sign-in path now reaches the server (the admin and
   money specs fail one step later, see below).
3. **Cart write limiter.** `playwright.config.ts` now reads `E2E_FORWARDED_FOR` (one
   address) or `E2E_FORWARDED_FOR_PREFIX` (one address per worker) into
   `extraHTTPHeaders['x-forwarded-for']`. Use a new address on every run inside the same
   hour: `E2E_FORWARDED_FOR_PREFIX=10.44.<n>`.

No test was weakened or skipped.

## Flaky (run 2, passed on retry)

| Case | Project | Note |
| --- | --- | --- |
| a11y: coupons has no WCAG violations | chromium, mobile-chrome | empty axe diff on retry |
| a11y: login has no WCAG violations | mobile-chrome | contrast on the active tab trigger |
| a11y: every interactive control on /login is reachable by keyboard | chromium | |
| category: a price filter narrows the archive | chromium | 30 s timeout once |
| keyboard-navigation: button with Enter key is focusable | chromium | |

Run 1 had zero flaky cases on the same machine; run 2 ran 38% longer with a build and
a unit suite competing for the CPU. Treat these six as load-sensitive, not as product
defects, and re-run them serially before acting.

## Failures by class (run 2, 91)

| # | Class | Cases | Evidence | Kind |
| -: | --- | ---: | --- | --- |
| 1 | Cart write limiter exhausted | 14 | cart 9, checkout 2, rtl-mobile 2, production-smoke 1, all mobile-chrome, all "badge went 0 -> 0"; pass in run 3 | harness, fixed |
| 2 | Fixture users cannot sign in | 12 | admin-product-crud 6, admin-refund 2, admin-refund-to-wallet 2, physical-purchase 2: `waitForURL` timeout after submit. `.env.local` carries `E2E_ADMIN_EMAIL` only; no `E2E_ADMIN_PASSWORD`, `E2E_CUSTOMER_*`, `E2E_SUPPLIER_*` | environment |
| 3 | WCAG A/AA violations | 10 | a11y: `aria-allowed-attr` on `/products?weekend=1` and `?free_shipping=1` links; contrast on the pagination button "עמודים", the login tab trigger, `.text-6xl` on the category archive; cart panel `aria-prohibited-attr` on `.h-6` and `label-content-name-mismatch` on the mini-cart trigger; checkout steps | product |
| 4 | Consent banner body reservation | 4 | body reserves 203 px for a 214.5 px banner at 320 px and 112 px for a 120 px banner at 640 px | product |
| 5 | Touch targets under 24 px | 12 | 6 routes x 2 projects: carousel dots 21x24, product-name links 18 px tall on `/`, `/contact`, `/login`, `/products`, `/search`, `/suppliers` | product |
| 6 | Sideways scroll at 1440 px | 6 | `/`, `/products`, `/cart` are 1490 px wide in a 1440 px viewport, both projects | product |
| 7 | Shekel sign left of digits | 6 | the category nav label "עד ₪99" on `/`, `/products`, `/category/hot-deals`; the price cells themselves pass | product copy |
| 8 | Sticky cart bar at desktop | 8 | `ProductStickyCartBar` class is `fixed bottom-0 ... md:bottom-auto md:top-0`, no `md:hidden`; computed display `flex` at 768 and 1440; its button test times out | spec vs design drift |
| 9 | Keyboard navigation | 5 | skip link is not the first Tab stop (consent banner is); contact form input 8 has no label; Enter-key focus on mobile | product |
| 10 | Homepage | 4 | three render-blocking stylesheets instead of one (both projects); deal thumbs 149 px instead of the 245 px pin at Pixel 5; `404 /category` from `MobileNavBar` "קטגוריות", no such route exists | product |
| 11 | Money flow | 2 | full-purchase-redeem: a guest cart reaches `/checkout` directly; the spec expects `/login?next=%2Fcheckout` | spec vs guest-checkout drift |
| 12 | Login page | 2 | auth "shows magic link form on toggle": the toggle `/קישור מאובטח/` is now a tab named "קישור" | spec drift (UX23) |
| 13 | Archive page clamp | 2 | `/products?page=9999` renders page 1, not the last page; `/category/<slug>?page=9999` clamps correctly | product |
| 14 | Checkout CLS | 1 | `/checkout` shifted 0.4517 on mobile against a 0.1 budget | product |
| 15 | Mobile timeouts | 3 | product breadcrumb, purchase-flow x2, all mobile-chrome, 30 s | unclassified |

Class 15 is checked in the follow-up re-run noted at the end of this file.

## Action items

- Set `E2E_CUSTOMER_*`, `E2E_SUPPLIER_*` and `E2E_ADMIN_PASSWORD` in `.env.local` for
  fixture users that exist in the database the server reads, or run `pnpm seed:test`
  against a disposable project. Class 2 cannot be measured until then.
- Give `MobileNavBar` "קטגוריות" a real target; `/category` has no index route.
- Classes 3 to 7, 9, 10, 13 and 14 are product defects with a deterministic
  reproduction each; queue one goal per class rather than one for the suite.
- Classes 8, 11 and 12 are specs describing an older design; update the spec or the
  design, not both.

## Gates after the changes

`pnpm typecheck` clean, `pnpm lint` clean, `CARDCOM_USE_MOCK=true pnpm build` exit 0
(the build that served run 2). `pnpm test`: see the follow-up line below.
