/**
 * Hero slider — rs-18 welcome copy from refs/ke_live_home.html (RevSlider layer-2…7).
 */
import type { HeroSlide } from '@/components/home/HeroSlider'
import { HERO_SLIDER_IMAGES } from '@/lib/assets'

export const HERO_SLIDER_BG = '#eef4f7'

/** Desktop / lg+ authored height (full hero row). Kept for callers that need a number. */
export const HERO_SLIDER_HEIGHT = 422

/**
 * Responsive heights measured from refs/ke_live_computed.json home slider
 * (`#rev_slider_6_1_wrapper`) on 2026-08-12:
 *   380 → 193px, 768 → 304px, 1440 → 370px (slider alone; row stays 422 on lg+).
 * Inline `height: 422` on every viewport made the phone/tablet hero ~2× live.
 */
export const HERO_SLIDER_HEIGHT_CLASS =
  'h-[193px] min-h-[193px] md:h-[304px] md:min-h-[304px] lg:h-[422px] lg:min-h-[422px]'

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
  // Measured on kenyonexpress.co.il 2026-07-30. The slider is 728x370 at x=336
  // and this slide's image box is 324x434 at x=654, so relative to the slider it
  // sits at x=318 y=18: width 44.5%, inset 11.8% from the right edge, height 434.
  // The previous 49.8% / flush-right / 495 came from the electro demo.
  imageLayout: { offsetTop: 18, widthPercent: 44.5, insetPercent: 11.8, minHeight: 434 },
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
