/**
 * Hero content extracted from refs/ke_live_home.html (kenyonexpress.co.il).
 * RevSlider rs-18 … rs-19, slider-das-block banners, departments-menu-v2.
 */
import { ELECTRO_HERO } from '@/lib/electro-hero-tokens'
import { agorot } from '@/lib/money'
import { shekelsRounded } from '@/lib/money-format'

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

/**
 * THE DEAD HERO BRANCH WAS CUT ON 2026-09-04, and it was carrying live English.
 *
 * `KE_LIVE_SLIDES`, `KE_LIVE_SIDE_BANNERS`, `resolveHeroSlide` and
 * `resolveHeroSlides` lived here, five slides and three banners deep in Electro
 * demo copy ("Shop the **Hottest** Products", "Catch Big **Deals** on The
 * Consoles") and pointing at ten Electro product photographs. Nothing rendered
 * any of it: the homepage reads `HERO_SINGLEFILE_SLIDES` through
 * `lib/homepage/cms.ts`, and the one importer of the fallback --
 * `lib/hero-slides-fallback.ts` -- had no importer of its own.
 *
 * It was exempt from the Hebrew-copy gate as "a record of what live shows",
 * which is a fair exemption for `refs/` and a bad one for `src/`: a dead export
 * is still shipped English sitting one import away from a page. The record it
 * duplicated is `refs/ke_live_home.html` and `lib/ke-live-revslider-slides.ts`,
 * both of which still hold it.
 *
 * What stays here is what something reads: `KE_LIVE_HERO` (measured geometry)
 * and `KE_LIVE_CATEGORIES` (live's own Hebrew department list).
 */

/**
 * THE "UNDER 99" DEPARTMENT'S LABEL, IN ONE PLACE.
 *
 * It was written by hand in five: the hero rail, the category strip, the
 * masthead nav, the home footer and this list -- and the five did not agree.
 * Four read `עד ₪99`, which puts the sign to the LEFT of the digits in an RTL
 * document (see money-format.ts for the measurement), one read a bare `עד 99`
 * with no currency at all, and the (main) sidebar read `עד %%%`, an unfilled
 * template placeholder that had been shipping as a category name.
 *
 * Built through `shekelsRounded`, so the label is the same price string as every
 * other price on the site: digits, then the sign, inside an LTR isolate.
 */
export const UNDER_99_LABEL = `עד ${shekelsRounded(agorot(9900))}`

export type KeLiveCategoryItem = {
  slug: string
  label: string
  highlight?: boolean
  href?: string
}

/** Live's own department list, in live's own Hebrew. */
export const KE_LIVE_CATEGORIES: KeLiveCategoryItem[] = [
  { slug: 'hot-deals', label: 'דילים חמים 🔥', highlight: true },
  { slug: 'under-99', label: UNDER_99_LABEL, highlight: true },
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
