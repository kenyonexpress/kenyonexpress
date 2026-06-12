/**
 * Hero slider data from refs/ke_live_singlefile-hero-extract.json (rs-19 only).
 * Source: refs/ke_live_singlefile.html — RevSlider block rev_slider_6_1.
 */
import type { HeroSlide } from '@/components/home/HeroSlider'
import { HERO_SLIDER_IMAGES } from '@/lib/assets'

/** rs-19 slide background — user spec #eef4f7 (file had #eef7f9) */
export const HERO_SLIDER_BG = '#eef4f7'

export const HERO_SLIDER_HEIGHT = 470

/** Raw rs-19 layers as extracted from SingleFile DOM */
export const SINGLEFILE_RS19_LAYERS = [
  {
    id: 'slider-6-slide-19-layer-5',
    type: 'text' as const,
    text: 'האפליקציה',
    fontSize: 58,
    lineHeight: 58,
    fontWeight: 300,
    color: '#333e48',
    top: 52,
    insetStart: 31,
    letterSpacing: undefined,
  },
  {
    id: 'slider-6-slide-19-layer-3',
    type: 'text' as const,
    text: 'בקרוב',
    fontSize: 51,
    lineHeight: 51,
    fontWeight: 300,
    color: '#333e48',
    top: 124,
    insetStart: 101,
    letterSpacing: '-1px',
  },
  {
    id: 'slider-6-slide-19-layer-11',
    type: 'image' as const,
    src: HERO_SLIDER_IMAGES[1],
    top: -1,
    widthPercent: 50.4,
    minHeight: 425,
  },
] as const

/**
 * Single visible slide — rs-19 typography; headline per build spec (welcome).
 * Image: redPhone from public/images/hero/slider/ (iPhone asset on disk).
 */
export const HERO_SINGLEFILE_SLIDES: HeroSlide[] = [
  {
    id: 'rs-19',
    variant: 'welcome',
    title: 'ברוכים הבאים',
    title_secondary: 'לקניון Express',
    title_secondary_indent: true,
    image_url: HERO_SLIDER_IMAGES[1],
    link_url: '/products',
    imageLayout: { offsetTop: -1, widthPercent: 50.4, minHeight: 425 },
  },
]
