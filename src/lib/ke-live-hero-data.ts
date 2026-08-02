/**
 * Hero content extracted from refs/ke_live_home.html (kenyonexpress.co.il).
 * RevSlider rs-18 … rs-19, slider-das-block banners, departments-menu-v2.
 */
import type { HeroSlide } from '@/components/home/HeroSlider'
import { HERO_SLIDER_IMAGES, SIDE_BANNERS } from '@/lib/assets'
import { ELECTRO_HERO } from '@/lib/electro-hero-tokens'

export const KE_LIVE_HERO = {
  slider: {
    bg: ELECTRO_HERO.slider.bg,
    height: ELECTRO_HERO.slider.height,
    width: ELECTRO_HERO.slider.width,
  },
  dots: {
    size: 12,
    inactive: 'rgba(125, 125, 125, 0.5)',
    active: 'rgb(125, 125, 125)',
    offsetStart: 61,
    offsetBottom: 110,
  },
} as const

/** 5 RevSlider slides — order matches live site */
export const KE_LIVE_SLIDES: HeroSlide[] = [
  {
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
  },
  {
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
  },
  {
    id: 'rs-20',
    variant: 'product',
    title: 'ממשק',
    title_secondary: 'מהיר ונוח',
    /** rs-20 layer-2 xo:78 */
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
    title_secondary_indent: false,
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

export type KeLiveSideBanner = {
  id: string
  href: string
  image: string
  /** Plain text lines; wrap segments in ** for bold (live da-text markup) */
  textHtml: string
}

/** 3 slider-das-block banners — exact English from live site */
export const KE_LIVE_SIDE_BANNERS: KeLiveSideBanner[] = [
  {
    id: 'das-1',
    href: '/category/hot-deals',
    image: SIDE_BANNERS[0],
    textHtml: 'Shop the **Hottest**\nProducts',
  },
  {
    id: 'das-2',
    href: '/category/phones-computers',
    image: SIDE_BANNERS[1],
    textHtml: 'Catch Big **Deals** on\nThe Consoles',
  },
  {
    id: 'das-3',
    href: '/category/phones-computers',
    image: SIDE_BANNERS[2],
    textHtml: 'Laptops Notebooks\n**and More**',
  },
]

export type KeLiveCategoryItem = {
  slug: string
  label: string
  highlight?: boolean
  href?: string
}

/** departments-menu-v2 — menu-all-departments-menu-2 */
type DbHeroRow = {
  id: string
  title: string | null
  subtitle: string | null
  image_url: string | null
  link_url: string | null
}

/** Merge Supabase row with ref slide — ref text wins when DB title is empty */
export function resolveHeroSlide(row: DbHeroRow, index: number): HeroSlide {
  const ref =
    KE_LIVE_SLIDES.find((s) => s.image_url && s.image_url === row.image_url) ??
    KE_LIVE_SLIDES[index] ??
    KE_LIVE_SLIDES[0]!

  const title = row.title?.trim()
  if (!title) {
    return {
      ...ref,
      id: row.id,
      image_url: row.image_url ?? ref.image_url,
      link_url: row.link_url ?? ref.link_url,
    }
  }

  const parts = title.split(/\s+/)
  const mid = Math.ceil(parts.length / 2)
  return {
    ...ref,
    id: row.id,
    title: parts.length <= 1 ? title : parts.slice(0, mid).join(' '),
    title_secondary: parts.length > 1 ? parts.slice(mid).join(' ') : ref.title_secondary,
    tagline: row.subtitle?.trim() || ref.tagline,
    image_url: row.image_url ?? ref.image_url,
    link_url: row.link_url ?? ref.link_url,
  }
}

const SLIDE_IMAGE_ORDER = KE_LIVE_SLIDES.map((s) => s.image_url).filter((url): url is string =>
  Boolean(url),
)

function slideSortKey(imageUrl: string | null): number {
  if (!imageUrl) return SLIDE_IMAGE_ORDER.length
  const index = SLIDE_IMAGE_ORDER.indexOf(imageUrl)
  return index === -1 ? SLIDE_IMAGE_ORDER.length : index
}

/** Canonical order: rs-18 welcome/iPhone first, rs-19 app last */
export function resolveHeroSlides(rows: DbHeroRow[]): HeroSlide[] {
  if (rows.length === 0) return KE_LIVE_SLIDES
  const sorted = [...rows].sort((a, b) => slideSortKey(a.image_url) - slideSortKey(b.image_url))
  return sorted.map((row, index) => resolveHeroSlide(row, index))
}

export const KE_LIVE_CATEGORIES: KeLiveCategoryItem[] = [
  { slug: 'hot-deals', label: 'דילים חמים 🔥', highlight: true },
  { slug: 'under-99', label: 'עד ₪99', highlight: true },
  { slug: 'new', label: 'החדשים', highlight: true },
  { slug: 'restaurants-cafes', label: 'מסעדות ובתי קפה' },
  { slug: 'beauty-health', label: 'יופי בריאות וטיפוח' },
  { slug: 'phones-computers', label: 'טלפונים מחשבים ואביזרים' },
  { slug: 'baby-kids', label: 'תינוקות וילדים' },
  { slug: 'vacation', label: 'צימרים ובתי מלון' },
  { slug: 'pets', label: 'ציוד ומזון לבעלי חיים' },
  { slug: 'professionals', label: 'בעלי מקצוע' },
  {
    slug: 'courses',
    label: 'קורסים Express – בקרוב . . .',
    href: '/category/courses',
  },
]
