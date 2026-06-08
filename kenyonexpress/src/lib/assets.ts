// Central registry of static image asset paths (files under /public).
// All components must read image paths from here — never hardcode paths inline.
// To swap an asset, change the path here only.

export const LOGO = '/images/logo.webp'
export const LOGO_FOOTER = '/images/logo-footer.webp'

export const HERO_SLIDES = [
  '/images/hero/slide-1.jpg',
  '/images/hero/slide-2.jpg',
  '/images/hero/slide-3.jpg',
] as const

export const PROMO = [
  '/images/promo/hottest.jpg',
  '/images/promo/deals.jpg',
  '/images/promo/laptops.jpg',
] as const

export const CATEGORIES = {
  under99: '/images/categories/under-99.jpg',
  pets: '/images/categories/pets.jpg',
  hotels: '/images/categories/hotels.jpg',
  courses: '/images/categories/courses.jpg',
  kids: '/images/categories/kids.jpg',
} as const
