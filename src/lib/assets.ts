// Central registry of static image asset paths (files under /public).
// All components must read image paths from here — never hardcode paths inline.
// To swap an asset, change the path here only.

/*
 * C137 logo upgrade: a true vector (cart mark as paths, text outlined from
 * Heebo, so it needs no web font) plus 1x/2x/3x PNG rasters of the same art.
 * `-light` is the white-ink variant for the dark footer bar.
 */
export const LOGO = '/images/logo.svg'
export const LOGO_FOOTER = '/images/logo.svg'
export const LOGO_PNG = {
  dark: ['/images/logo.png', '/images/logo@2x.png', '/images/logo@3x.png'],
  light: ['/images/logo-light.png', '/images/logo-light@2x.png', '/images/logo-light@3x.png'],
} as const
export const LOGO_LIGHT = '/images/logo-light.svg'

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
const HERO_CATEGORY_BANNERS = {
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
const _CATEGORIES = HERO_CATEGORY_BANNERS

const _HERO_ICONS = {
  logo: '/images/hero/icons/Kenyonexpress-190x50-1.png',
  payment: '/images/hero/icons/patment-icon.webp',
} as const
