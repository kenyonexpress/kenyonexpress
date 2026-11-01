# C130 — HOME DESIGN LOCK

Reference: `refs/electro-home-v7.html` (frozen captures `refs/electro-home-v7_{380,768,1440}.png`). Dev server on :3317 against live Supabase (REST 200).

## Done
- Home order below the hero: deal of the day, categories row, featured, hot coupons, brands, newsletter, then infinite deals until exhausted, then the footer (`src/app/(store)/page.tsx`, `src/components/home/HomeSections.tsx`, `src/lib/home-data.ts`).
- Standalone city cards row removed from the home page; no location filter or prompt anywhere in the new sections (nationwide only, 15.10.2026).
- Infinite scroll: `/api/home/deals?offset=` pages of 12. Playwright run to the end: `{ cards: 43, end: 'done', footer: true, sw: 1440 }`; API offsets 0/12/24/36 return 12/12/12/7 and `nextOffset` null at 36.
- Card label rule: `src/components/product-card/CardLabel.tsx`, used by ProductCard, ProductDealCard(+Mobile), CategoryProductCard and the PDP eyebrow. Coupon/service/recurring (and `is_coupon_enabled`, same precedence as `lib/commerce/product-type.ts`) show city + pin, "כל הארץ" only when the business has no city; physical shows the category, no city. Centered in `product-card-deals.css`. `type`/`is_coupon_enabled` added to the card selects (home, search, related, category, city).
- Hero images: all five slides in `src/lib/hero-singlefile-data.ts` carry real catalogue photos; `HeroMobile.tsx` is now a scroll-snap carousel of them (was a text-only block).
- Overlap root cause fixed in `src/styles/tokens.css`: the hero height / inset utilities were plain classes in `@layer utilities`, so `md:h-hero-tablet`, `lg:h-hero-desktop` etc. never existed and the hero stayed 300px with its strip and promo cards spilling over the next section. Converted to `@utility`. Measured hero bottom vs content bottom: 768 → 582.3 / 581.3, 1440 → 761.3 / 785.9 (the 25px is a rotated decorative stamp on a promo card, no text). 380 → 402 / 402.
- Screenshots: `docs/C130/{before,after,home}-{380,768,1440}.png`, `c-slug-*.png`, `home-end-1440.png`.

## Gate: NOT MET
`node scripts/compare.mjs --page=home --width=<w> --mine=http://localhost:3317/`
```
380: OVERALL first 2600px: 46.26%
768: OVERALL first 2600px: 41.03%
1440: OVERALL first 2600px: 27.97%
```
Before this item: 380 37.84%, 768 38.67%, 1440 34.09%. Target is under 11% at all three; it is not met (380 and 768 are worse than before). The reference first 2600px is Electro's English demo layout (deals carousel, promo banners, tabbed lists); this page's required section order and Hebrew catalogue content differ from it, and the hero and header, the largest bands, are locked. 768/1440 runs needed `COMPARE_ALLOW_PENDING_IMAGES=1` (4 lazy images unloaded at the shutter).

## BLOCKED locked-component
- City cards still render inside the hero: `src/components/home/HeroSection.tsx` imports and mounts `CitiesRow` (hidden below md). Removing it needs an edit to the locked file. `CitiesRow.tsx` is kept so that import resolves.
- Header (3 icons wishlist/account/cart, yellow counter, no "0 ₪" beside the cart): `layout/MainHeader.tsx` / `Header.tsx` are locked. The screenshots still show the price next to the cart.

## Findings
- Data: 40 of 43 imaged active products are `type='physical'`, `is_coupon_enabled=false`, but are services (massage, hotels, restaurants) with a city. By the rule they show their category, not a city. Retyping them is a catalogue decision; no migration written.
- "R2 images": products are served from `public/images/products/` (R2 base URL not configured), so hero slides use those files.
- Pre-existing `tsc` errors from merge 788c1af1a (7 files) are untouched; none are in files changed here.

## Tests
`vitest run src/components 'src/app/(store)'` 114 files / 1053 tests pass; `src/styles` 9 files / 89 tests pass.

RESULT: BLOCKED locked-component (hero city strip, header icons) + gate not met
