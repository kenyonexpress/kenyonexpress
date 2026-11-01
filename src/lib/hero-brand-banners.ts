/**
 * C137 hero brand banners (decision 02.11.2026): one Apple products banner and
 * one Tesla products banner, real images only.
 *
 * Images are the old site's own uploads (content source only): the Apple and
 * Tesla marks from its "Shop the Hottest Products" ad blocks
 * (wp-content/uploads/2022/03/apple-140-new, tesla-logo-main, converted to
 * WebP), and the catalogue photograph of the iPhone 13 product
 * (public/images/products, the R2 mirror). No Tesla product exists in the
 * catalogue, so that banner carries the mark alone and links to the shop.
 */
export type HeroBrandBanner = {
  id: 'apple' | 'tesla'
  title: string
  subtitle: string
  cta: string
  logo: string
  photo: string | null
  href: string
}

export const APPLE_BANNER: HeroBrandBanner = {
  id: 'apple',
  title: 'מוצרי Apple',
  subtitle: 'אייפון ואוזניות AirPods',
  cta: 'לרכישה',
  logo: '/images/hero/brands/apple-logo.webp',
  photo: '/images/products/maxresdefault-1-600x600.webp',
  href: '/product/אייפון-13',
}

export const TESLA_BANNER: HeroBrandBanner = {
  id: 'tesla',
  title: 'מוצרי Tesla',
  subtitle: 'אביזרים ומוצרים לרכב החשמלי',
  cta: 'לכל המוצרים',
  logo: '/images/hero/brands/tesla-logo.webp',
  photo: null,
  href: '/products',
}

export const HERO_BRAND_BANNERS: readonly HeroBrandBanner[] = [APPLE_BANNER, TESLA_BANNER]
