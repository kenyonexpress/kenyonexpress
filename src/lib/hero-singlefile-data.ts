/**
 * Hero slider — rs-18 welcome copy from refs/ke_live_home.html (RevSlider layer-2…7).
 */
import type { HeroSlide } from '@/components/home/HeroSlider'
import { HERO_SLIDER_IMAGES } from '@/lib/assets'

export const HERO_SLIDER_BG = '#eef4f7'

export const HERO_SLIDER_HEIGHT = 422

const WELCOME_SLIDE: HeroSlide = {
  id: 'rs-18',
  variant: 'welcome',
  title: 'ברוכים הבאים',
  title_secondary: 'לקניון Express',
  title_secondary_indent: true,
  tagline: 'מסדרים לך בילוי . . .',
  promo_small: 'SIMPLY THE',
  promo_large: 'BEST',
  image_url: HERO_SLIDER_IMAGES[0],
  link_url: '/products',
  imageLayout: { offsetTop: 21, widthPercent: 49.8, minHeight: 495 },
}

const PREMIUM_SLIDE: HeroSlide = {
  id: 'rs-35',
  variant: 'product',
  title: 'PREMIUM',
  title_secondary: 'PRODUCT',
  standard_line: 'THE NEW STANDARD',
  promo_small: 'SIMPLY THE',
  promo_large: 'BEST',
  image_url: HERO_SLIDER_IMAGES[1],
  link_url: '/products',
  imageLayout: { offsetTop: -15, widthPercent: 58.7, minHeight: 447 },
}

/** 5 RevSlider slides — rs-18, rs-35, rs-20, rs-33, rs-19 (active in singlefile) */
export const HERO_SINGLEFILE_SLIDES: HeroSlide[] = [
  WELCOME_SLIDE,
  PREMIUM_SLIDE,
  {
    id: 'rs-20',
    variant: 'product',
    title: 'ממשק',
    title_secondary: 'מהיר ונוח',
    title_indent: true,
    standard_line: 'THE NEW STANDARD',
    promo_small: 'SIMPLY THE',
    promo_large: 'BEST',
    image_url: HERO_SLIDER_IMAGES[2],
    link_url: '/products',
    imageLayout: { offsetTop: 17, widthPercent: 49.3, minHeight: 376 },
  },
  {
    id: 'rs-33',
    variant: 'product',
    title: 'תצוגה',
    title_secondary: 'מושלמת',
    title_indent: true,
    standard_line: 'THE NEW STANDARD',
    promo_small: 'SIMPLY THE',
    promo_large: 'BEST',
    image_url: HERO_SLIDER_IMAGES[3],
    link_url: '/products',
    imageLayout: { offsetTop: 9, widthPercent: 51.5, minHeight: 392 },
  },
  {
    id: 'rs-19',
    variant: 'app',
    title: 'האפליקציה',
    title_secondary: 'בקרוב',
    title_secondary_indent: true,
    image_url: HERO_SLIDER_IMAGES[6],
    badge_image_url: HERO_SLIDER_IMAGES[5],
    link_url: '/products',
    imageLayout: { offsetTop: -1, widthPercent: 50.4, minHeight: 425 },
  },
]
