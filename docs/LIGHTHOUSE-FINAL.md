# Lighthouse final (G23)

Measured 2026-10-25 on a production build (`pnpm build` + `next start -p 3400`), Lighthouse 13, categories performance / accessibility / best-practices / seo. Pages: `/`, `/product/island-of-maldives`, `/c`.

Targets: perf 95+, a11y 100, best-practices 100, SEO 95+.

## Results

Default profile (mobile, `simulate` throttling), after fixes:

| Page | Perf | A11y | BP | SEO | LCP | TBT |
|------|------|------|----|-----|-----|-----|
| / | 87 | 100 | 100 | 100 | 3.7 s | 100 ms |
| /product/island-of-maldives | 64 | 100 | 100 | 100 | 4.9 s | 670 ms |
| /c | 56 | 100 | 100 | 100 | 4.0 s | 6050 ms |

`--throttling-method=provided` (what the build does on this machine, no modelled phone):

| Page | Perf | A11y | BP | SEO | LCP | TBT | CLS |
|------|------|------|----|-----|-----|-----|-----|
| / | 100 | 100 | 100 | 100 | 0.8 s | 50 ms | 0.046 |
| /product/island-of-maldives | 100 | 100 | 100 | 100 | 0.8 s | 0 ms | 0.001 |
| /c | 100 | 100 | 100 | 100 | 1.1 s | 0 ms | 0 |

Before the fixes (first run, simulate): home 87/100/100/100, product 81/100/**92**/100, /c 86/100/100/100.

## Gate status

- a11y 100, best-practices 100, SEO 100: PASS on all three pages.
- Performance 95+: **NOT met** under the default mobile `simulate` profile (56-87). Met under `provided` throttling (100). The simulated numbers on this machine are noisy (other agent jobs were running; `/c` TBT swung 0 ms -> 6050 ms between runs on the same build, see `docs/PERFORMANCE-BUDGET.md`), but home is a stable 87 across runs, so this is not only noise. G23 is therefore BLOCKED on performance.

## What blocked the home score

Lighthouse insights on home: render-blocking CSS (~450 ms est.), LCP 3.7-4.0 s (element render delay), 401 KiB image/cache savings on the deal cards, 55 KiB unused JS. `experimental.inlineCss` was already tried and reverted (see `next.config.ts`); it was not retried.

## Fixes made in this item

1. `src/app/(main)/club/page.tsx`: `/club` (G10) read tiers outside `<Suspense>`, which failed `pnpm build` at prerender ("uncached or runtime data during prerendering"). Tiers now load in a `<ClubTiers>` child under Suspense, as `/coupons` does. Without this no production build, and so no valid Lighthouse run, was possible.
2. `src/lib/security/frame-policy.ts`: CSP `connect-src` allowed `https://*.supabase.co` but not `wss://*.supabase.co`, so the product page's realtime purchase-count channel was blocked. That logged a console error and an Issues-panel entry (best-practices 92). Added `wss://*.supabase.co` plus a test. Product BP is now 100.

## Notes

- `pnpm build` takes ~6 min here because the Sentry source-map upload fails with an invalid token (401); `SENTRY_AUTH_TOKEN=` skips it.
- No forbidden file was edited.
