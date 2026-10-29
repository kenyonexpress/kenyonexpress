# G102 — PRODUCT-ELECTRO parity

Result: BLOCKED (gate fails; no page code changed).

## Findings (2026-10-30)
- `/product/[slug]` is `src/app/(store)/product/[slug]/page.tsx` (383 lines). It already ships gallery, title, price,
  add-to-cart, wishlist, share, WhatsApp, tabs and a related row (C02, F52, F59). Not a locked file.
- Gate run: `COMPARE_ALLOW_PENDING_IMAGES=1 COMPARE_ALLOW_GRID_MISMATCH=1 node scripts/compare.mjs --page=product --widths=380,768,1440`
  against local dev, slug `מוצר-לדוגמא`:
  - 380 = 54.22%, 768 = 41.81%, 1440 = 26.23% (all FAIL vs the 11% gate and the 25% mobile / 15% desktop targets).
  - Without `COMPARE_ALLOW_GRID_MISMATCH=1` the gate refuses: the reference shows 1 related card, the local page 4.
- The reference used by the script is the localized WordPress snapshot (`refs/localized/ke_live_product.html`), not
  `refs/electro-product-fresh.html`. It loads 59-98 failed requests (stylesheets and scripts), so part of every
  number is the degraded reference, not our layout. The bands that diverge most at 1440 are the tabs and the related row
  (y 1100-1800, 32-67%).

## Not done
Closing 26-54 points needs the product DOM rebuilt against `refs/electro-product-fresh*` and the gate pointed at that
reference. No passing measurement exists, so DONE would be false.

RESULT: BLOCKED parity 54.22/41.81/26.23 vs 11% gate (reference snapshot degraded, grid-count mismatch)
