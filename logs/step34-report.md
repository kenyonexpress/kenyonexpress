

## STEP 34, 2026-10-07: first-load JS, measured and gated per route

Everything below is `node scripts/route-js-report.mjs` (gzipped, manifest
union, `noModule` polyfill excluded) or `node scripts/route-js-browser.mjs`
(headless Chromium against `pnpm start` on 3317, consent granted, 4 s after
`load`). Both scripts read the build they name; neither builds.

### Before and after, first load (what the document loads before it is interactive)

| Route | before KB gz | after KB gz | change |
| --- | --- | --- | --- |
| shared root files (every route) | 211.2 | 132.0 | -79.2 |
| `/(store)/page` | 288.3 | 189.9 | -98.4 |
| `/(store)/product/[slug]/page` | 360.2 | 198.4 | -161.8 |
| `/(store)/category/[slug]/page` | 290.3 | 191.8 | -98.5 |
| `/(store)/cart/page` | 288.9 | 190.4 | -98.5 |
| `/(store)/checkout/page` | 295.7 | 197.2 | -98.5 |

In the browser, `/` went from 332 KB on the wire with nothing deferred to
299 KB including everything that now loads at idle; the first-paint share of
that is the 190 KB above. Raw bytes before interactivity: 947 KB to 585 KB.

### What moved, and where it went

| Package | Where it was | KB gz on first load | Now |
| --- | --- | --- | --- |
| `@sentry/nextjs` (tracing on) | shared root, evaluated before hydration | ~79 | `lib/observability/sentry-browser.ts`: idle or first error, through a named-export subset (`sentry-browser-sdk.ts`); early errors buffered and replayed |
| `zod` | `lib/analytics/events.ts` + `attribution.ts`, via the tracker | 14.5 | schemas in `events-schema.ts` (server only); attribution parser by hand; types proven equal at compile time |
| `sonner` | `CartProvider`'s `toast` import, every store route | 11.8 | `lib/ui/toast.ts` imports it on the first `notify()`; `DeferredToaster` for the `(main)` and `(account)` layouts |
| `@supabase/supabase-js` | `use-product-live.ts` on `/product`, `NotificationBell` on `/account/*` | 63.6 | `import()` inside the effect, after hydration |

The namespace trap, found on the second build: `import('@sentry/nextjs')` kept
every export alive and the deferred chunk measured 549,624 bytes with session
replay and feedback inside, for a config that samples replay at 0. Through the
named subset it is 201,283 bytes (62.4 KB gz), which is what the static import
used to cost.

### Removed outright

Five UI primitives nothing imported (`ui/button`, `dropdown-menu`, `form`,
`label`, `select`; `docs/COMPONENT-INVENTORY.md` already said so) and eleven
packages: `react-hook-form`, `@hookform/resolvers`, `@radix-ui/react-select`,
`@radix-ui/react-dropdown-menu`, `@radix-ui/react-label`, `@radix-ui/react-slot`,
`class-variance-authority`, `@radix-ui/react-toast`, `@dnd-kit/core`,
`@dnd-kit/sortable`, `@dnd-kit/utilities`. None was in any client chunk, so
the bundle numbers do not move; the install and the audit surface do.

### The target, honestly

The step asked for under 150 KB on the main route. The shared root alone is
132 KB gzipped: React DOM plus the Next 16 app router, 118 KB of it before a
line of this site's code, plus the instrumentation entry and the scrubber it
registers. The home route's own 58 KB is the cart chrome (provider, bootstrap,
header count, mini-cart: ~29 KB), the root layout's analytics and PWA islands
(14 KB), the image/link/icon helpers (6 KB), the layout router (4 KB) and the
error boundaries (5.5 KB). Getting under 150 means deferring the cart chrome,
which makes the header count appear after idle on every page; that is a
visible UX decision and was not taken here. The budgets at the top of
`scripts/route-js-report.mjs` are therefore the measured values plus headroom
(195 on `/`), enforced in CI right after `pnpm build`, and
`src/__tests__/first-load-client-graph.test.ts` refuses each of the four
static imports above coming back.

### Analyzer

`pnpm analyze` runs `next experimental-analyze` (Turbopack's own; the webpack
`@next/bundle-analyzer` is inert here). `-o` writes
`.next/diagnostics/analyze/` without a server. `pnpm analyze:routes` is the
table above for `/(store)`; `pnpm measure:route-js` is the browser check.

### Gates

```
pnpm test        668 files, 8032 passed, 12 skipped
pnpm type-check  clean
pnpm lint        clean
pnpm build       clean on the third run (first: Supabase timeout at export, a network class this file already records)
gate:route-js    29 storefront routes within budget
```
