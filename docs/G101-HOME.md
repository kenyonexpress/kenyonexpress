# G101 — HOME-ELECTRO parity

Result: BLOCKED (gate could not be measured; no code changed).

## Findings (2026-10-30)
- Home route is `src/app/(store)/page.tsx` (there is no `src/app/page.tsx`; there is no `page-sections` dir, sections live in `src/components/home/`).
- Mounted today: hero (locked), CitiesRow, BenefitBar, DealChips, DealsOfTheDay.
  Not mounted: featured products, hot coupons, brands row, newsletter. Components exist
  (`FeaturedProducts`, `HotCouponCard`, `BrandsRow`) but are not wired into the page.
- `node scripts/compare.mjs --page=home --widths=380,768,1440` on a local dev server:
  - run 1: refused, 8 local images not loaded at shutter time (all image URLs return 200 when fetched directly);
  - with `COMPARE_ALLOW_PENDING_IMAGES=1`: aborts with "structurally different pages", no diff produced.
- Last recorded ledger rows (2026-10-29): home 380 = 43.32%, 768 = 44.73%, 1440 = 39.85%,
  all FAIL vs the 11% gate (and the item's 25/25/15 targets).

## Not done
No edits to `page.tsx` or components: matching Electro v7 DOM 1:1 needs the structural diff
resolved first, and no passing measurement exists, so DONE would be false.

RESULT: BLOCKED gate unmeasurable (structural mismatch + pending images), last measured 40-45% vs 11% gate
