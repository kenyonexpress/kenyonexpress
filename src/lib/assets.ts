// Central registry of static image asset paths (files under /public).
// All components must read image paths from here — never hardcode paths inline.
// To swap an asset, change the path here only.

export const LOGO = '/images/logo.webp'
export const LOGO_FOOTER = '/images/logo-footer.webp'

/** Homepage hero slider — refs/content-map.md block 4 */
export const HERO_SLIDER_IMAGES = [
  '/images/hero/slider/ios13-iphone-11pro-airpods-pro-setup-animation-steps.gif',
  '/images/hero/slider/redPhone-1-1.png',
  '/images/hero/slider/Smartwatches1.png',
  '/images/hero/slider/iapdlap.png',
  '/images/hero/slider/slider-img-3.png',
  '/images/hero/slider/Screen-Shot-2021-11-12-at-0.20.17.png',
  '/images/hero/slider/Screen-Shot-2021-11-09-at-6.41.46.png',
] as const

/** @deprecated use HERO_SLIDER_IMAGES */
export const HERO_SLIDES = HERO_SLIDER_IMAGES

/** 3 stacked side banners — electro `.slider-das-block`, refs/content-map.md block 5 */
export const SIDE_BANNERS = [
  '/images/hero/side-banners/tesla-logo-main.webp',
  '/images/hero/side-banners/apple-140-new.webp',
  '/images/hero/side-banners/home-sl-da-3.webp',
] as const

/** @deprecated use SIDE_BANNERS */
export const PROMO = SIDE_BANNERS

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

export const HERO_ICONS = {
  logo: '/images/hero/icons/Kenyonexpress-190x50-1.png',
  payment: '/images/hero/icons/patment-icon.webp',
} as const
