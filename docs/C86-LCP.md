# C86 LCP-MOBILE-95

RESULT: BLOCKED locked-component (gate: mobile perf >= 95 at 380 and 768 on /, /product/barbecue, one category not met)

## Change shipped
`src/components/home/CitiesRow.tsx`: city illustrations `loading="eager"` -> `loading="lazy"`. The row is `hidden sm:block`, so at 380
the ~20 SVGs were fetched while `display:none`. Lazy hidden images are not fetched; from 768 the row is in the viewport and still loads.
Effect on `/` at 380: FCP 2.0 s -> 1.5 s, perf 83 -> 84. No pixel change (images paint identically when visible).

## Measurements (fresh `pnpm build` + `next start :7902`, Lighthouse 13 CLI, mobile, simulated throttling, explicit width, 1 run each)
| route | 380 perf / LCP | 768 perf / LCP |
|-------|----------------|----------------|
| /                         | 84 / 4.5 s | 82 / 4.7 s |
| /product/barbecue         | 82 / 4.8 s | 84 / 4.6 s |
| /category/hot-deals       | 85 / 4.2 s | 81 / 4.5 s (grid empty, migration 306 unapplied, not representative) |
| control /offline (near-empty page) | 89 / 3.7 s | - |
| control /terms            | 83 / 4.6 s | - |

## Why it cannot reach 95 without a locked file
- At 380 the home LCP element is already NOT an image: it is the consent banner paragraph (observed LCP 102 ms, simulated 4.45 s).
  The home hero at 380 is text-only `HeroMobile`. "Hero image priority/sizes/AVIF" has no effect there; deal images are already AVIF via next/image.
- Even `/offline`, a near-empty page, scores only 89 (LCP 3.7 s), so the ceiling is the shared shell, not page content. The shell is
  `src/app/layout.tsx` (banner, Heebo `next/font` config and preload decision, AnalyticsProvider, ThirdPartyTags, InstallPrompt,
  ServiceWorkerRegistrar, Speed Insights) plus the ~400 KB / 30-chunk script set it pulls. Heebo preload and deferring that JS are
  layout.tsx edits, which is forbidden.
- Making the banner "not the LCP element" is a banner/layout change too: the banner is mounted and ordered from layout.tsx, and
  ConsentBanner's own comment records that shrinking it moved LCP to a later element and dropped perf into the 70s.
- Observed (unthrottled) metrics are healthy: FCP/LCP 100-150 ms, TBT 20 ms, CLS <= 0.036. The gap is Lantern's pessimistic graph
  (see docs/PERFORMANCE-BUDGET.md).

## Not done (needs locked files)
Heebo subset preload, root-level JS deferral, banner restructure, hero priority (HeroSection/HeroSlider, desktop only).
