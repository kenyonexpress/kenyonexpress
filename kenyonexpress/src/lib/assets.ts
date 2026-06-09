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

// 3 mini-banners from the live site: Tesla (Hottest), Apple (Consoles), Laptop (Notebooks).
export const PROMO = [
  '/images/promo/tesla.webp',
  '/images/promo/apple.webp',
  '/images/promo/laptop.webp',
] as const

// Category-strip images extracted from the live site (refs/ke_live_home.html).
export const CATEGORIES = {
  under99: '/images/categories/under-99.png',
  pets: '/images/categories/pets.webp',
  hotels: '/images/categories/hotels.webp',
  courses: '/images/categories/courses.webp',
  kids: '/images/categories/kids.webp',
} as const
