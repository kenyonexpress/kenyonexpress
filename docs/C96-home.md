# C96 HOMEPAGE ELECTRO-V7 FINAL SWEEP

Verification only. No page code changed. No forbidden file touched.
Home route: `src/app/(store)/page.tsx`. Footer comes from the layout (`src/components/layout/SiteFooter.tsx`).

## Sections in required order
| # | section | mounted on `/` | note |
|---|---------|----------------|------|
| 1 | hero carousel | YES | `CmsHero`/`HeroSection` (md+), `HeroMobile` (<md). Locked components. |
| 2 | deal-of-day | YES, but out of order | `DealsOfTheDay` is mounted last, after `BenefitBar` and `DealChips`. |
| 3 | categories row | NO | no standalone strip; the page comment says it was removed on purpose to match live at 380/768. |
| 4 | featured | NO | `FeaturedProducts` / `FeaturedProductsTabs` exist, not mounted. |
| 5 | hot coupons | NO | `HotCouponCard` exists, not mounted on `/`. |
| 6 | brands row | NO | `BrandsRow` exists, not mounted. |
| 7 | newsletter | NO (home body) | only the footer newsletter bar. |
| 8 | footer | YES | via layout. |

Also mounted and not in the required list: `CitiesRow` (city links, `sm+`), `BenefitBar`, `DealChips`.

## Infinite scroll
Not present. No IntersectionObserver or pager in `src/components/home/**` or the home page. It cannot be "until exhausted then footer".

## Location chip / "בחר אזור"
- The home body has no location chip.
- The header renders a region menu (`MastheadNav` -> `lib/regions.ts`, 17 regions, live's `secondary-nav`). It is mounted by `src/components/layout/Header.tsx`, which is FORBIDDEN, so it cannot be removed here.
- `CitiesRow` on the home page is a city-link row, which conflicts with "nationwide only" and should be reviewed.
- No "bchar ezor" string in the home body; the Hebrew label only appears in comments and tokens.css.

## compare.mjs gate (<11% at 380 / 768 / 1440), home, docs/UI-PARITY-REPORT.md latest rows 2026-10-30
| width | diff | gate |
|-------|------|------|
| 380 | 12.83% (a later run read 43.32%, flagged WORSE than best-known 30.26%) | FAIL |
| 768 | 13.80% | FAIL |
| 1440 | 5.80% | PASS |
Not re-run: no code changed. Product, /c and /c/<slug> were not measured here.

## Why nothing was fixed
- Mounting categories/featured/coupons/brands/newsletter and infinite scroll adds below-fold height and moves the 380/768 diff, which already fails.
- Region-menu removal needs `Header.tsx` (locked). The mobile gate also depends on the locked hero (LCP).

BLOCKED locked-component home-region-menu (src/components/layout/Header.tsx)

RESULT: BLOCKED gate fails home 380=12.83% 768=13.80% (>11%); 5 of 8 sections not mounted; no infinite scroll; region menu lives in locked Header.tsx
