/**
 * Hero slider — rs-18 welcome copy from refs/ke_live_home.html (RevSlider layer-2…7).
 * Architecture only: no images until SingleFile has initialized rs-18 layers.
 */
import type { HeroSlide } from '@/components/home/HeroSlider'

export const HERO_SLIDER_BG = '#eef4f7'

export const HERO_SLIDER_HEIGHT = 500

const WELCOME_SLIDE: HeroSlide = {
  id: 'rs-18',
  variant: 'welcome',
  title: 'ברוכים הבאים',
  title_secondary: 'לקניון Express',
  title_secondary_indent: true,
  tagline: 'מסדרים לך בילוי . . .',
  promo_small: 'SIMPLY THE',
  promo_large: 'BEST',
  image_url: null,
  link_url: '/products',
}

/** 5 RevSlider slides — dots match live order; only rs-18 has copy (architecture pass) */
export const HERO_SINGLEFILE_SLIDES: HeroSlide[] = [
  WELCOME_SLIDE,
  { id: 'rs-35', variant: 'product', title: null, image_url: null, link_url: '/products' },
  { id: 'rs-20', variant: 'product', title: null, image_url: null, link_url: '/products' },
  { id: 'rs-33', variant: 'product', title: null, image_url: null, link_url: '/products' },
  { id: 'rs-19', variant: 'app', title: null, image_url: null, link_url: '/products' },
]
