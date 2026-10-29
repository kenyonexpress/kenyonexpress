# C01 ELECTRO-V7-PARITY-HOME

RESULT: BLOCKED 78

No page code was changed. Measurements only.

## Path note
The queue names `apps/web/app/(shop)/page.tsx`. That path does not exist. The home route is `src/app/(store)/page.tsx`
(`src/app/(shop)/` is empty). The page already mounts hero, cities row, benefit bar, deal chips and DealsOfTheDay.

## 3 diff numbers (home, compare.mjs, latest ledger rows in docs/UI-PARITY-REPORT.md, 2026-10-28)
| width | diff | gate <11% |
|-------|------|-----------|
| 380   | 12.83% | FAIL |
| 768   | 13.80% | FAIL |
| 1440  | 5.80%  | PASS |

These were not re-run for C01 (no code change, so they would be identical).

## Lighthouse (logs/lighthouse-m01-c268.log, 2026-10-29, route /, fresh next start, 2 runs each)
| viewport | score | LCP |
|----------|-------|-----|
| 380 mobile | 78 | 5.4-5.5 s |
| 768 mobile | 77 | 5.9-6.0 s |
| 1440 desktop | 98 | 1.1 s |

Mobile is below 90. The cause is LCP, which is the hero image. The hero is in LOCKED_COMPONENTS
(`src/components/home/HeroSection.tsx`, `HeroSlider.tsx`), so the fix is not reachable without editing a forbidden file.

## Why no rebuild
- Section order already follows refs/electro-home-v7.html/ke_live_singlefile order.
- Hot coupons, brands strip and featured grid components exist (`HotCouponCard`, `BrandsRow`, `FeaturedProducts`) but are not
  mounted on the home page; mounting them adds below-fold weight and moves the 380/768 diff, which already fails.
- The page is deliberately static and tuned to the comparison gate (see comments in the page file).
