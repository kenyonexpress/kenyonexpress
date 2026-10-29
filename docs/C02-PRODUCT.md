# C02 PRODUCT-ELECTRO-V7

RESULT: BLOCKED gates not met: compare.mjs cannot score product page (local data fallback), Lighthouse mobile 80 < 90

## Path
The task named `apps/web/app/(shop)/product/[slug]/page.tsx`. That path does not exist in this repo; the
product page is `src/app/(store)/product/[slug]/page.tsx`. Work was done there.

## Already present (unchanged)
Gallery (desktop + mobile), breadcrumbs, price/old price, variants, add-to-cart + buy-now, related products,
sticky mobile cart bar, WhatsApp share (`wa.me`) first, native share second.

## Changed
- `ProductInfo.tsx`: removed Facebook share (violates "no social network links"); added `CopyLinkButton` as the
  third share action. Order is now WhatsApp, native share, copy link.
- `components/shared/CopyLinkButton.tsx`: new. Clipboard write, 2s "הקישור הועתק" confirmation, silent on failure.
- `FacebookShareButton.tsx`, `FacebookIcon.tsx`: deleted (no remaining importers).
- `SupplierInfo.tsx`: supplier inquiry link relabelled "פנייה לספק בוואטסאפ"; when the supplier has not opted in
  or has no WhatsApp-capable number, a "פנייה לשירות הלקוחות" link to the store number (`storeWhatsAppLink`) is
  shown instead of a dead end. The empty-state placeholder logic is unchanged.
- `page.tsx` + `product-page.css`: description, shipping/warranty and supplier blocks are native `<details>`
  accordion panels (description and supplier open by default). No client JS. Logical properties only.
- Tests updated: `share-buttons.test.tsx`, `SupplierInfo.test.tsx`. 79 tests pass in `shared` + `storefront`;
  `tsc --noEmit` and `biome check` clean; `pnpm build` passes.

## Gates
| Gate | Result |
|---|---|
| compare.mjs product, 380/768/1440, under 11% | NOT MEASURABLE. Without `COMPARE_ALLOW_GRID_MISMATCH` it refuses (live reference 1 related card, local 4). With the override: 54.2% / 41.8% / 26.2%, but the script flags height ratio 0.57x / 0.43x / 0.35x and "local page failed to load its data and rendered a fallback" (slug `מוצר-לדוגמא` does not resolve locally). Not a valid pixel result. |
| Lighthouse mobile product >= 90 | 80 (LCP 5.2s) on `/product/barbecue`, `next start`. Consistent with M02 history (79-85). LCP-bound; this change adds no weight. |

## To unblock
1. Give the local catalogue a product that matches the live reference (or pin a matching `COMPARE_PRODUCT_SLUG`)
   so compare.mjs scores without the override.
2. Product-page LCP (image/data path) needs its own item; the G23 allowed fixes (AVIF, lazy-load, font subset) apply.
