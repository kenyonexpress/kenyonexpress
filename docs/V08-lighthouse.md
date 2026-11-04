# V08: Lighthouse mobile on the open funnel routes

Queue item V08, 05.11.2026. Target: mobile performance 90+ and accessibility
95+ on `/cart`, `/checkout`, `/login`, `/account`.

**Result: all four routes meet both targets.** Performance medians are 97 / 97 / 99 / 97.
Accessibility is 100 on every route.

## How it was measured

`scripts/v08-lighthouse.mjs` (new). It measures each route the way a customer reaches it:

- `/cart` and `/checkout` signed in as the E2E fixture customer, with lines in the cart.
- `/account` signed in.
- `/login` signed out, because a signed-in visit redirects away from it.

The script mints the fixture customer's SSR cookie the same way
`scripts/v07-mobile-shell.mjs` does. Playwright attaches over CDP to the
installed Chrome that Lighthouse then drives, so the cookies sit in the profile
being measured. Storage reset is off. Lighthouse 13.5.0 uses its default mobile
config: simulated throttling, Moto G Power, 4x CPU.

Each route gets one warm-up load, then 5 simulated runs (the median is the
score) and 1 run with `--throttling-method=devtools`. Lighthouse hangs on
Playwright's Chrome for Testing build, so the installed Chrome is the one
measured.

The build was `CARDCOM_USE_MOCK=true NEXT_PUBLIC_APP_URL=http://localhost:3481 pnpm build`,
started with `pnpm start` on 3481 using the same URL. Nothing was submitted.
After the run, the fixture customer's cart was emptied with the "רוקן עגלה" button (`empty: true`).

## Scores

Before, at HEAD `92f6da69a`, 3 simulated runs per route (`docs/V08/before.json`):

| route | simulated perf | **perf** | **a11y** | BP | SEO | FCP ms | LCP ms | TBT ms | CLS | SI ms | devtools perf | devtools LCP | devtools CLS |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| /cart | 87 / 86 / 89 | **87** | **100** | 96 | 69 | 770 | 1206 | 190 | 0.188 | 3526 | 89 | 807 | 0.188 |
| /checkout | 95 / 82 / 84 | **84** | **97** | 96 | 69 | 770 | 3749 | 0 | 0.003 | 6220 | 75 | 7591 | 0.003 |
| /login | 100 / 100 / 100 | **100** | **100** | 96 | 69 | 618 | 1053 | 0 | 0.01 | 723 | 100 | 209 | 0.025 |
| /account | 68 / 73 / 45 | **68** | **100** | 96 | 92 | 769 | 2861 | 29 | 0.432 | 8169 | 54 | 7968 | 0.449 |

After, on this commit's tree, 5 simulated runs per route (`docs/V08/report.json`, 2026-11-04T18:16:56Z):

| route | simulated perf | **perf** | **a11y** | BP | SEO | FCP ms | LCP ms | TBT ms | CLS | SI ms | devtools perf | devtools LCP | devtools CLS |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| /cart | 95 / 96 / 97 / 98 / 98 | **97** | **100** | 96 | 61 | 769 | 1205 | 0 | 0 | 4578 | 98 | 1088 | 0 |
| /checkout | 99 / 97 / 96 / 97 / 93 | **97** | **100** | 96 | 61 | 770 | 2249 | 0 | 0.003 | 4033 | 90 | 3591 | 0.003 |
| /login | 96 / 100 / 100 / 98 / 99 | **99** | **100** | 96 | 69 | 618 | 1053 | 145 | 0.002 | 890 | 100 | 538 | 0.002 |
| /account | 88 / 99 / 97 / 98 / 86 | **97** | **100** | 96 | 92 | 771 | 2035 | 52 | 0.02 | 3912 | 97 | 2550 | 0.02 |

```
$ RUNS=5 OUT=docs/V08 node scripts/v08-lighthouse.mjs
cart      perf 95/96/97/98/98 (devtools 98)  a11y 100  bp 96  seo 61  -> http://localhost:3481/cart
          perf fails: speed-index
checkout  perf 99/97/96/97/93 (devtools 90)  a11y 100  bp 96  seo 61  -> http://localhost:3481/checkout
          perf fails: largest-contentful-paint, speed-index
login     perf 96/100/100/98/99 (devtools 100)  a11y 100  bp 96  seo 69  -> http://localhost:3481/login
          perf fails: total-blocking-time
account   perf 88/99/97/98/86 (devtools 97)  a11y 100  bp 96  seo 92  -> http://localhost:3481/account
          perf fails: largest-contentful-paint, speed-index
wrote docs/V08/report.json
```

### Things worth knowing about these numbers

- **The noise is real, which is why the final run uses 5 runs.** An earlier
  3-run pass on the same code read 88 / 87 / 98 / 84. During that pass macOS's
  `duetexpertd` was at 91% CPU, and simulated TBT went from about 10 ms to
  150-270 ms. The 5-run pass was taken once the machine was idle.
- **Database latency from this machine is the floor.** Ping to the Supabase
  host (eu-north-1) is 335 ms, and `/auth/v1/health` takes 1.1-1.9 s. Before the fix, single
  queries in the server log took 1.7-6 s. On Vercel the functions run next to
  the database, so the streamed parts of `/checkout` and `/account` will paint
  sooner there than here. These local numbers are the pessimistic case.
- **Best Practices 96 everywhere is one environment error.**
  `/_vercel/insights/script.js` returns 404 off Vercel (`errors-in-console`).
- **SEO 61-69 is by design.** These routes are `noindex` (`is-crawlable`), and
  each route's own page comment explains why.

## What was fixed

Each fix comes from a failing audit in the before run.

1. **`/account` CLS 0.43 → 0.02.** The page's Suspense fallback was `null`, so
   the footer was drawn under an empty column and then pushed off the screen
   when the page streamed in. The footer was the shifted node, scoring 0.41.
   The fallback is now `.account-content__pending`: the nav's pending height
   beside the nav, and a full screen when the nav stacks (≤900px).
   Files: `src/app/(account)/layout.tsx`, `src/styles/account.css`.
2. **`/cart` CLS 0.188 → 0.** The 240px "loading the cart" block left the
   footer in view, and the arrival of the table pushed it down. Below 1024px the cart
   always stacks taller than the screen, so the block now holds `100svh` there.
   File: `src/styles/cart-page.css`.
3. **`/login` devtools CLS 0.41 → 0.002, devtools perf 81 → 100.** Same shape
   as /account. The page's Suspense fallback was `null`, and on a slow link the
   shell (header and footer) painted before the form's flush landed. The
   fallback is now an empty box a screen tall, never a form, so the
   "remount loses typing" reason for the null fallback still holds.
   `/register` and `/signup` had the same pattern and got the same fix.
   The Turnstile slot also holds its 65px from first paint, because the
   lazy-loaded iframe was pushing the submit row down.
   Files: `src/app/(auth)/{login,register,signup}/page.tsx`, `src/styles/auth-page.css`.
4. **`/checkout` a11y 97 → 100.** `target-size` (WCAG 2.5.8) failed on the
   terms checkbox. The browser's default 13px box sat 8px from the first legal link in
   the same sentence. It is now 24px square.
   File: `src/styles/checkout-page.css`.
5. **`/checkout` two serial round trips removed.** `auth.getUser()` and
   `getCart()` now run together. `getCart` reads its own session and never needed this one first.
   The saved invoice settings joined the wallet, address and card batch instead of
   running after it. File: `src/app/(store)/checkout/page.tsx`.
6. **`/account` 11 auth calls per render → 1.** Every account query called
   `auth.getUser()` itself. The side nav makes five reads and the overview page
   six, so one render asked the auth server the same question eleven times in
   parallel. The new `src/lib/supabase/request-user.ts` wraps that read in
   React `cache`. It is still the auth server's check of this request's cookies,
   asked once per request. Outside a server-component render `cache` does not
   memoise, so server actions and tests behave as before. Used by
   `src/server/queries/{account,club,orders,vouchers}.ts`.

## Gates

```
$ pnpm test
 Test Files  686 passed | 1 skipped (687)
      Tests  8162 passed | 13 skipped (8175)

$ pnpm type-check
(exit 0)

$ pnpm lint
(exit 0)

$ CARDCOM_USE_MOCK=true NEXT_PUBLIC_APP_URL=http://localhost:3481 pnpm build
build=0
```

### Freeze gate

```
$ git diff --stat design-locked-2026-10-19 -- src/components/home src/components/layout src/components/hero src/components/header src/components/category src/components/storefront src/components/product-card src/components/SiteFooter.tsx src/app/globals.css src/app/layout.tsx src/app/page.tsx tailwind.config.ts
(no output, exit 0)

$ git diff --stat
 docs/INDEX.md                     |  1 +
 src/app/(account)/layout.tsx      | 11 +++++++++--
 src/app/(auth)/login/page.tsx     |  8 +++++++-
 src/app/(auth)/register/page.tsx  |  7 ++++---
 src/app/(auth)/signup/page.tsx    |  7 ++++---
 src/app/(store)/checkout/page.tsx | 24 ++++++++++++++++--------
 src/server/queries/account.ts     |  9 +++------
 src/server/queries/club.ts        |  7 ++-----
 src/server/queries/orders.ts      |  7 ++-----
 src/server/queries/vouchers.ts    |  9 +++------
 src/styles/account.css            | 15 +++++++++++++++
 src/styles/auth-page.css          | 14 ++++++++++++++
 src/styles/cart-page.css          | 11 +++++++++++
 src/styles/checkout-page.css      |  8 +++++++-
 14 files changed, 98 insertions(+), 40 deletions(-)
 (new: scripts/v08-lighthouse.mjs, src/lib/supabase/request-user.ts, docs/V08/)
```

No frozen file was touched. Every edited file belongs to an open route
(cart, checkout, login/register, account) or to the server reads behind them.
