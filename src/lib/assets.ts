// Central registry of static image asset paths (files under /public).
// All components must read image paths from here — never hardcode paths inline.
// To swap an asset, change the path here only.

export const LOGO = '/images/logo.webp'
export const LOGO_FOOTER = '/images/logo-footer.webp'

/**
 * THE HERO'S TEN IMAGES ARE GONE, DELIBERATELY.
 *
 * `HERO_SLIDER_IMAGES` (7) and `SIDE_BANNERS` (3) named Electro's demo
 * photography: an iPhone 11 Pro with AirPods, an iPad Pro, Samsung Gear
 * smartwatches, a red phone, a MacBook, an Apple silhouette, a Tesla mark, and
 * a mockup of Electro's own storefront with its name still in the masthead.
 * Ten consumer-electronics product shots on a site that sells vouchers for
 * restaurants, spas, hotels, courses and tradespeople.
 *
 * The files are deleted from `public/images/hero/` and the slots render
 * `BrandPlaceholder`, which says out loud that the photograph is still to be
 * taken. `scripts/template-asset-scan.mjs` fails the build if any of the ten
 * filenames comes back, by name.
 *
 * Live serves the same ten files from its own uploads, so sourcing the slot
 * from live could not have replaced them; the reasoning is on BrandPlaceholder.
 */

/** Category image banners below hero — refs/content-map.md block 6 */
export const HERO_CATEGORY_BANNERS = {
  kids: '/images/hero/category/e-baby-d2.webp',
  courses: '/images/hero/category/student-849821_1280-600x600.webp',
  hotels: '/images/hero/category/maldives-2-600x488.webp',
  pets: '/images/hero/category/cute-golden-retriever-600x600.webp',
  under99: '/images/categories/under-99.png',
  restaurants: '/images/products/bq-plate-3-600x600.webp',
  beauty: '/images/products/facial-small-600x600.webp',
  phones: '/images/products/maxresdefault-1-600x600.webp',
} as const

/** @deprecated use HERO_CATEGORY_BANNERS */
export const CATEGORIES = HERO_CATEGORY_BANNERS

/**
 * The home page's category tiles, keyed by the category SLUG in the database
 * (`categories.slug`), so `CategoryGrid` can photograph a row it read rather
 * than a constant. A row's own `image_url` (an uploaded image) wins over this
 * map when set.
 *
 * EVERY LIVE TOP-LEVEL SLUG IS HERE, AND THAT IS THE POINT (UX07, 14.10.2026).
 * Production carries thirteen active top-level rows and `image_url` is null on
 * all of them, so this map is the only photograph a tile has. It used to
 * cover eight, which was exactly the grid's eight, so `hot-deals`, `new`,
 * `electronics` and `professionals` were silently sorted to the back and
 * dropped; an operator reordering the menu, or a ninth tile, would have shown
 * the grey placeholder box. The four new ones are ingested live product
 * photographs from the same folder HERO_CATEGORY_BANNERS reads, chosen for
 * the department, not generated. `below-fold-rules.test.ts` pins that every
 * slug in KE_LIVE_CATEGORIES has a file here and that each file exists.
 */
export const CATEGORY_TILE_IMAGES: Readonly<Record<string, string>> = {
  'hot-deals': '/images/products/rm5-600x600.webp',
  'under-99': HERO_CATEGORY_BANNERS.under99,
  new: '/images/products/ice3-600x600.webp',
  'restaurants-cafes': HERO_CATEGORY_BANNERS.restaurants,
  'beauty-health': HERO_CATEGORY_BANNERS.beauty,
  'phones-computers': HERO_CATEGORY_BANNERS.phones,
  'baby-kids': HERO_CATEGORY_BANNERS.kids,
  vacation: HERO_CATEGORY_BANNERS.hotels,
  pets: HERO_CATEGORY_BANNERS.pets,
  electronics: '/images/products/sony3-600x600.webp',
  professionals:
    '/images/products/Free-Photo-_-Client-doing-hair-cut-at-a-barber-shop-salon-600x417.webp',
  courses: HERO_CATEGORY_BANNERS.courses,
}

export const HERO_ICONS = {
  logo: '/images/hero/icons/Kenyonexpress-190x50-1.png',
  payment: '/images/hero/icons/patment-icon.webp',
} as const
