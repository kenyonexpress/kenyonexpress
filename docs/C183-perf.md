# C183: first-load JS under 200 KB gz, AVIF/WebP, Heebo subset preload

Measured 2026-11-03 on `closeout/v1-final` from `b0d450c6f` plus this diff, `pnpm build` + `pnpm start` on :3483.

## Result per part

| Part | State |
|---|---|
| First-load JS under 200 KB gz | **Done.** Every storefront route measured is 186.5 to 198.6 KB. It was 292.6 to 371.3 KB before. |
| AVIF/WebP via next/image | **Already in place, verified.** `formats: ['image/avif', 'image/webp']`. Every raster `<img>` on home, product and /c/<slug> goes through `/_next/image`. The 3 that don't are the SVG logo and a `<picture>` whose SVG source wins. |
| Preload Heebo subset | **BLOCKED locked-component.** The only `Heebo()` call is in `src/app/layout.tsx` (forbidden): `subsets: ['latin','hebrew']`, `preload: false`. C117, C123 and C139 hit the same block. |
| Visual gate | product, category: pass at all 3 widths. home: 768 and 1440 pass. **home 380 fails at 13.86%.** That number is byte-identical to the 2026-11-02 run at `ab8046696`, from before this work (see below). |

## How "first-load JS" is measured

The served HTML lists the scripts. This sums gzip -9 of every `<script src="/_next/…">` except `noModule`, because modern browsers never fetch the polyfill. The 38.5 KB `noModule` polyfill is the only difference from `route-bundle-gate.mjs`, which counts it.

```
$ /tmp/c183/html-js.sh http://localhost:3483 / /products /cart /checkout /product/<אייפון-13> /c /c/tel-aviv /category /search
/                                  http=200 scripts=17  first-load-js-gz=197.6 KB
/products                          http=200 scripts=17  first-load-js-gz=195.8 KB
/cart                              http=200 scripts=16  first-load-js-gz=189.9 KB
/checkout                          http=200 scripts=17  first-load-js-gz=198.6 KB
/product/%D7%90%D7%99%D7%99%D7%A4%D7%95%D7%9F-13 http=200 scripts=17  first-load-js-gz=197.9 KB
/c                                 http=200 scripts=15  first-load-js-gz=186.5 KB
/c/tel-aviv                        http=200 scripts=16  first-load-js-gz=191.6 KB
/category                          http=200 scripts=15  first-load-js-gz=186.5 KB
/search                            http=200 scripts=16  first-load-js-gz=193.1 KB
```

### Before and after (route-bundle-gate, which includes the 38.5 KB polyfill)

```
before (build of b0d450c6f):
  /              340.8 KB   22 chunks  budget  315  OVER
  /products      336.9 KB   23 chunks  budget  316  OVER
  /cart          331.1 KB   22 chunks  budget  314  OVER
  /checkout      342.7 KB   23 chunks  budget  319  OVER
  route-js-report: /(store)/product/[slug]/page  409.8
after:
  /              236.2 KB   18 chunks  budget  239  ok
  /products      234.4 KB   18 chunks  budget  237  ok
  /cart          228.6 KB   17 chunks  budget  231  ok
  /checkout      237.2 KB   18 chunks  budget  240  ok
  route-js-report: /(store)/product/[slug]/page  240.7 (before the related-cards split)
```

All four routes were over their ratchet before this item. The ratchets are lowered to the new numbers + 2 KB in `scripts/route-bundle-budgets.json`.

## What moved, found with source maps (`SENTRY_KEEP_SOURCEMAPS=1`)

| Change | Why it was on the first load |
|---|---|
| Sentry behind `src/lib/observability/sentry-client.ts` (`loadSentry()`) | `instrumentation-client.ts`, `error.tsx`, `global-error.tsx` and `SentryUserSync` each did `import * as Sentry`, which put core, browser, browser-utils and tracing on every route (~150 KB raw). |
| `CartProvider`: `import('sonner')` on first feedback | A static `toast` import shipped all of sonner, 34 KB raw, even though `<Toaster>` was already deferred. Both resolve to the same module instance. |
| `UserMenuDropdown` → lazy `UserMenuSignedIn` | The Radix menu, popper, floating-ui, focus-scope and remove-scroll (~60 KB raw) loaded for guests, who never see that menu. |
| `NewsletterSignup`, `TurnstileWidget`: react-turnstile via `next/dynamic` | Both render nothing until an effect or arm event, so no markup changes. |
| `useProductLive`, `useProductPurchaseCount`: Supabase client imported in the effect | Auth, realtime, storage and postgrest (~220 KB raw) were on the product page for sockets that only open after hydration. |
| `MegaMenu` panel → `MegaMenuPanel.tsx` (lazy, warmed on pointer enter or focus) | It only renders on hover. |
| `ConsentBanner`: `ConsentSettings` lazy, mounted only when opened | It only appears when opened from the banner. |
| `CheckoutForm`: `ShippingPhoneVerification` lazy; `ProductInfo`: `CouponPricing` lazy | Both render conditionally. They stay SSR'd when they apply. |
| `RelatedProducts` uses `LazyProductCard` (client `next/dynamic`) | The related cards are below the fold. They are still server-rendered (5 card nodes in the HTML), and the chunk is `<link rel="preload" fetchPriority="low">`. Calling `dynamic()` from the server component did not split: measured 203.4 KB, so that approach was reverted. |
| `@/components/mobile` barrel → direct imports (4 sites) | Saved 0.8 KB. |

### Sentry still catches what it caught: browser proof

This was a throwaway build with `NEXT_PUBLIC_SENTRY_DSN=http://c183key@127.0.0.1:3999/1` and Playwright intercepting the endpoint. One error was thrown after DOMContentLoaded, before the SDK existed, and one after it loaded:

```
{
 "timeline": [ "load@+488ms", "sentry-chunk@+624ms" ],
 "envelopes": [ "c183-early-before-sdk", "c183-after-sdk,c183-early-before-sdk", "c183-early-before-sdk,c183-after-sdk" ],
 "integrations": [ "InboundFilters", "FunctionToString", "ConversationId", "BrowserApiErrors", "Breadcrumbs",
   "GlobalHandlers", "LinkedErrors", "Dedupe", "HttpContext", "CultureContext", "BrowserSession",
   "BrowserTracing", "NextjsClientStackFrameNormalization", "WebVitals" ]
}
```

What this shows:

- The SDK arrives after `load`.
- The buffered early error is replayed after `init`.
- After that, Sentry's own handlers take over.
- Tracing (tracesSampleRate 1.0) and WebVitals are live.

One loss: a navigation that happens before the SDK loads has no `captureRouterTransitionStart` breadcrumb.

### AVIF negotiation on a home image

```
/_next/image?url=%2Fimages%2Fproducts%2Fmaldives-2-600x488.webp&w=3840&q=95
accept=image/avif,image/webp,*/* -> 200 image/avif 25784B
accept=image/webp,*/* -> 200 image/webp 60368B
accept=*/* -> 200 image/jpeg 73145B
```

## Gates

```
$ pnpm type-check
$ tsc --noEmit
tc=0
$ pnpm lint
Found 26 warnings.
lint=0
$ node node_modules/vitest/vitest.mjs run
 Test Files  871 passed | 3 skipped (874)
      Tests  9629 passed | 39 skipped (9668)
$ node scripts/route-bundle-gate.mjs
  /              236.2 KB   18 chunks  budget  239  ok
  /products      234.4 KB   18 chunks  budget  237  ok
  /cart          228.6 KB   17 chunks  budget  231  ok
  /checkout      237.2 KB   18 chunks  budget  240  ok
$ LOCAL_BASE=http://localhost:3483 node scripts/compare.mjs --page={home,product,category} --widths=380,768,1440
| 2026-11-03 03:49 | home | 380 | 13.86% | **FAIL** | `b0d450c6f-dirty` | ref everything loaded; overall 44.16% (reference blank 15.91%, ours blank 14.39%) |
| 2026-11-03 03:50 | home | 768 | 8.09% | PASS | `b0d450c6f-dirty` | ref everything loaded; overall 36.73% (reference blank 13.63%, ours blank 15.01%) |
| 2026-11-03 03:52 | home | 1440 | 6.88% | PASS | `b0d450c6f-dirty` | ref everything loaded; overall 25.2% (reference blank 9.85%, ours blank 8.47%) |
| 2026-11-03 03:54 | product | 380 | 4.67% | PASS | `b0d450c6f-dirty` | ref everything loaded; overall 39.51% (reference blank 27.5%, ours blank 7.33%) |
| 2026-11-03 03:55 | product | 768 | 5.64% | PASS | `b0d450c6f-dirty` | ref everything loaded; overall 36.26% (reference blank 24.27%, ours blank 6.35%) |
| 2026-11-03 03:57 | product | 1440 | 2.45% | PASS | `b0d450c6f-dirty` | ref everything loaded; overall 21.89% (reference blank 13.77%, ours blank 5.67%) |
| 2026-11-03 03:59 | category | 380 | 3.79% | PASS | `b0d450c6f-dirty` | ref everything loaded; overall 31.43% (reference blank 11.59%, ours blank 16.06%) |
| 2026-11-03 04:01 | category | 768 | 4.89% | PASS | `b0d450c6f-dirty` | ref everything loaded; overall 32.92% (reference blank 11.54%, ours blank 16.49%) |
| 2026-11-03 04:02 | category | 1440 | 1.37% | PASS | `b0d450c6f-dirty` | ref everything loaded; overall 21.09% (reference blank 8.08%, ours blank 11.64%) |
```

The home 380 failure is not from this diff. The row from before this work, in `docs/UI-PARITY-REPORT.md`, has the same number in every field:

```
| 2026-11-02 15:03 | home | 380 | 13.86% | **FAIL** | `ab8046696-dirty` | ref everything loaded; overall 44.16% (reference blank 15.91%, ours blank 14.39%) |
```

Live paints a phone photo at y185-355 in the 380 hero, which puts a floor of about 4 points under the score. The remaining points are header and grid geometry, and the header and hero files are locked.

## To close it

- Heebo: change the `Heebo()` call in `src/app/layout.tsx` to `preload: true` (and optionally `subsets: ['hebrew']`). Only someone allowed to edit that file can do it. Re-measure LCP afterwards, because [24] kept `preload: false` so the font would not compete with the LCP banner.
- Home 380: a separate item, as before C183.
