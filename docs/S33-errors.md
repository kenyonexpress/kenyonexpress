# S33: error, loading and empty states (06.11.2026)

Queue item S33. The 404, the 500 and the offline page already existed (G7, `16f7f7258`), and so did an empty cart and an empty orders list. This item added what was missing and fixed what measuring turned up:

- `global-error.tsx` now looks like the other error pages and has a retry, a title and support links.
- Six `loading.tsx` files, on one shared component. Not one per route group: two groups have none, and two have it on a single segment. The reasons are measured and are in the next section.
- An empty state with a way forward for the orders list and the coupons list. `/account/vouchers` and `/account/my-vouchers` redirect to `/account/coupons`, so that one is the vouchers empty state.
- Three defects found on the way: `/coupons/<not-a-uuid>` answered 500, every product or category 404 nested a second `<main>`, and the big code digits on the error pages failed contrast.

Everything below was measured on `next build` + `next start` (port 3333, `VERCEL= CARDCOM_USE_MOCK=true`), headless Chromium, 06.11.2026. Production answers 503 under `MAINTENANCE_MODE` and was not measured.

## Where a loading.tsx can and cannot go

A `loading.tsx` is a Suspense boundary above every page under it. It took three builds to find where that is safe here, because it has two costs and neither shows in source.

**Build 1: one at the root of every group.** Unknown slugs stopped answering 404:

| URL | before | with a group-level `loading.tsx` |
|---|---|---|
| `/product/zzz-nope` | 404 | 200 |
| `/category/zzz-nope` | 404 | 200 |
| `/s/zzz-nope` | 404 | 200 |
| `/city/zzz-nope` | 404 | 200 |
| `/coupons/<unknown uuid>` | 404 | 200 |

The shell goes out with the status line before `notFound()` runs. This is the soft 404 that `/category/[slug]` and `/coupons/[id]` were rebuilt to stop.

**Build 2: moved off `(store)` and `(main)`, kept on `(auth)`, `(legal)` and `/search`.** The statuses were right again, but the prerendered HTML of five pages now painted the loading state where the page had been, with the real content swapped in by an inline script: `/forgot-password`, `/mfa`, `/reset-password`, `/signup/confirm` and `/search` (where it replaced the page's own `SearchPageFallback`). The five `/legal/*` pages are permanent redirects, so a file there is never painted at all.

**Final build.** The file sits only where pages read at request time behind a frame and have no slug that must miss:

| where | file | what it covers |
|---|---|---|
| `(account)` | group root | all 20 account shells; keeps the `.account-content__pending` box (V08) and puts the state inside it |
| `(admin)` | group root | the page inside the panel frame, which keeps its own fallback one level up |
| `(supplier)` | group root | same, for the supplier panel |
| `(supplier-public)` | group root | in practice `/supplier/apply` |
| `(store)` | `cart/` only | a client navigation to the cart that has to wait; `/cart` is prerendered whole |
| `(main)` | `newsletter/` only | the confirm and unsubscribe pages |
| `(auth)` | none | every page has its own boundary inside `AuthFrame` |
| `(legal)` | none | every page is a `permanentRedirect` |

`(store)/checkout` has none on purpose: its return pages answer the payment provider with HTTP redirects, and a boundary above them would turn those into streamed ones.

## What changed

| file | change |
|---|---|
| `src/components/error-pages/RouteLoading.tsx`, `src/styles/route-loading.css` | New. The one loading state: an `<output>` (status role, polite) with a Hebrew label, a ring and three bones. Palette redefined locally like `error-pages.css`. Stops moving under `prefers-reduced-motion`. |
| `src/app/(account)/loading.tsx`, `(admin)`, `(supplier)`, `(supplier-public)`, `(store)/cart`, `(main)/newsletter` | New. Six files on `RouteLoading`. |
| `src/app/global-error.tsx` | Rebuilt inline (it cannot depend on a stylesheet): logo, code, title, text, retry (`reset()`), a plain-anchor way home, digest, support by mail and WhatsApp, and a `<title>`. Copy comes from the same catalog keys as the 500. Sentry capture now tagged `boundary=global-error`. |
| `src/components/account/AccountEmptyState.tsx`, `src/styles/account.css` | New. Icon on brand yellow, the sentence, what will appear here, one primary button. |
| `src/app/(account)/account/orders/page.tsx`, `coupons/page.tsx` | Empty branch uses `AccountEmptyState`. Coupons had one grey sentence and no link; it now links to `/products`. |
| `src/components/cart/CartLineItem.tsx` | The empty cart's two strings moved to the catalog. Same text, same classes; the markup is unchanged. |
| `src/components/error-pages/NotFoundPage.tsx`, `src/app/not-found.tsx` | The 404 body moved to a shared component that can render as `main` or `div`. |
| `src/app/(store)/not-found.tsx`, `(main)`, `(account)`, `(admin)` | New. The same 404 as a `<div>`, because these layouts already have a `<main>`. |
| `src/components/error-pages/ErrorPageFrame.tsx`, `src/components/errors/SegmentErrorBoundary.tsx`, `src/app/(supplier-public)/error.tsx` | `as` / `landmark` props, so a boundary inside a layout is a `<div>`. `(supplier-public)` has no layout and keeps `<main>`. |
| `src/styles/error-pages.css` | The code digits are heading ink over a yellow band, not yellow on white. |
| `src/lib/coupon-deals.ts` | `getCouponDeal` answers null for an id that is not a uuid, without querying. The guard is in front of the cached read because `generateMetadata` makes the same read before the page body does. |
| `scripts/error-states-check.mjs`, `package.json` | New, `pnpm errors:check`. Reads the prerendered shells and fails if the loading state is painted outside `/account` and `/supplier/apply`; then checks 31 status codes and the 404 document. |
| `messages/he.json`, `messages/en.json` | New keys: `errorPages.loading`, `account.ordersPage.emptyHint`, `account.couponsPage.*`, `cartPage.empty`, `cartPage.backToShop`. |
| `scripts/hebrew-literal-scan.mjs` | Ceiling 561 to 558 (three literals moved to the catalog). |
| `src/lib/cached-reads-fail-loudly.test.ts` | The `getCouponDeal` fixture id is now a well-formed uuid; `'deal-1'` no longer reaches the read the test exists to fail. |
| tests | New: `loading-coverage.test.tsx` (12), `error-landmarks.test.tsx` (7), `global-error.test.tsx` (6), `account-empty-state.test.tsx` (3), `coupon-deals.test.ts` (6). |
| `docs/UI-PARITY-REPORT.md` | One `REFUSED` row, written by `compare.mjs` (see below). |

## Measured

### `pnpm errors:check` on the final build

Condensed from the script's output (it prints one line per check):

```
1. prerendered shells: where the loading state is painted
  355 shells read, loading state painted in 21
  ok    painted only under /account and on /supplier/apply
  ok    account shells carry it (20)
  ok    every account shell still holds .account-content__pending (V08)
  ok    /cart.html, /forgot-password.html, /reset-password.html, /mfa.html prerendered whole
2. status codes: 31 of 31 as expected
  200  / /products /product/barbecue /cart /login /forgot-password /search?q=a /coupons /faq /offline /offline.html
  404  /zzz-nope /product/zzz-nope /category/zzz-nope /s/zzz-nope /city/zzz-nope /blog/zzz-nope
       /page/zzz-nope /order/zzz /coupons/<unknown uuid> /coupons/zzz-nope
  307  /checkout /account/orders /account/coupons /account/vouchers /admin /supplier /supplier/apply
  308  /legal/terms /legal/privacy
  410  /wishlist
3. the error documents: 7 of 7 markers
error-states check: PASS   (45 ok, 0 failed, exit 0)
```

`/coupons/zzz-nope` answered 500 before this item (Postgres 22P02, logged as `coupon_deal.read_failed`). It answers 404 now.

### Against the build before this item

A baseline was taken from the S32 build before any edit.

- Status codes: 25 of 25 URLs identical (`diff` empty).
- Painted markup (HTML outside `<script>`, asset hashes and the port normalised): `/products`, `/product/barbecue`, `/cart`, `/login`, `/coupons`, `/faq` and the unknown-category 404 are identical. On `/` the shell is byte-identical (188,278 characters) and the same nine streamed segments arrive, in a different order.

### In the browser, at 380, 768 and 1440

| state | horizontal overflow | targets | axe |
|---|---|---|---|
| `global-error` | 0 at all three | retry 93x46, home 106x46, mail 84x44, WhatsApp 63x44, logo loads | 0 (before the fixes: `document-title` and `color-contrast`, both serious) |
| 404 on `/product/zzz-nope` (status 404) | 0 | button 128x44, one `<main>` | the three `<main>` landmark findings and `color-contrast` are gone; two moderate findings remain, both in the store layout's chrome and present on `/faq` too |
| 404 on `/zzz-nope` (1440 only) | 0 | button 128x44 | 0 |
| empty cart | 0 | CTA 158x44 | not run (markup unchanged) |
| empty orders | 0 | button 121x44, icon 64x64 | 0 |
| empty coupons | 0 | button 120x44, icon 64x64 | 0 |
| account loading | 0 | box 320 tall inside a pending box of 900 / 900 / 402 | 0 |

Computed colours: button `rgb(254, 215, 0)` with ink `rgb(51, 62, 72)`; loading ring top `rgb(254, 215, 0)` on `rgb(221, 221, 221)`; label `rgb(51, 62, 72)` 14px/700.

CLS on `/account/orders`, signed in: 0.0199 at 380 and 0.0259 at 1440. There is no number from before this item to compare with.

### Gates

| gate | result |
|---|---|
| `pnpm build` | exit 0, 428 of 428 static pages |
| `pnpm type-check` | 0 errors |
| `pnpm lint` | exit 0; i18n gate 558 literals at ceiling 558 |
| `pnpm test` | 8271 passed, 0 failed, 13 skipped (8235 after S32) |
| freeze gate | `git diff design-locked-2026-10-19 -- <frozen paths>` is empty |
| `compare.mjs --page=cart --widths=380,768,1440` | refused, exit 5: the live cart is the maintenance page, so there is no reference. No number exists. |

## Not measured

- **The empty orders and coupons pages with a real empty account.** The E2E customer owns orders and coupons, and no account was created in the production database for this. The component's own markup was put into the real signed-in page frame and measured there. The branch that renders it is pinned by a test, not by a browser.
- **`global-error` during a real root-layout failure.** It was rendered from the component and measured on the app's origin. Nothing was broken to trigger it.
- **The loading state in the admin and supplier panels**, and the new 404 inside the account and admin frames. All four sit behind a sign-in (admin also behind TOTP). The account loading state was captured from the prerendered shell.
- **`compare.mjs` on the account pages.** No reference capture of an empty Electro orders list exists, and the cart gate has no reference at all today.
- **Production.**

## Decisions made alone

- **No `loading.tsx` on `(auth)` and `(legal)`, and segment-level only on `(store)` and `(main)`**, against the item's "per route group". A group-level file there costs a 404 or a first paint, as measured above. `loading-coverage.test.tsx` names the two exempt groups and fails if a file is put above a page that calls `notFound()`.
- **The empty cart was left as it is.** It was rebuilt to the live page in V01; only its strings moved to the catalog.
- **The 404 code digits changed colour** on the 404, the 500 and `global-error`: ink over a yellow band instead of yellow on white (1.4:1).
- **Fixed outside the list:** the 500 on `/coupons/<not-a-uuid>` and the nested `<main>` on group 404s and group error boundaries.

## Found and left alone

- `/faq` has a `<main>` of its own inside the store layout's `<main>` (axe: three landmark findings). Other content pages were not checked.
- The store layout's chrome carries two moderate axe findings on every page (`landmark-unique` on the toast region, `region` on the top bar). The layout is frozen.
