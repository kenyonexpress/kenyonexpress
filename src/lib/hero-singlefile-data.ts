/**
 * Hero slider -- rs-18 welcome copy from refs/ke_live_home.html (RevSlider layer-2...7).
 *
 * EVERY `image_url` IS null, AND THAT IS THE CONTENT DECISION, NOT A GAP IN THE
 * DATA. The seven images these slides used to name were Electro's demo
 * photography -- an iPhone 11 Pro with AirPods, an iPad Pro, Samsung Gear
 * smartwatches, a red phone, a MacBook, and a mockup of Electro's own storefront
 * with its name in the masthead -- on a site that sells vouchers for
 * restaurants, spas and hotels. `HeroSlider` renders `BrandPlaceholder` in the
 * slot, which says out loud that the photograph has not been taken yet.
 *
 * Live serves the same seven files from its own uploads, so "source content from
 * live" could not supply a replacement here; see the note on BrandPlaceholder
 * for why that tie goes the way it does.
 */
import type { HeroSlide } from '@/components/home/HeroSlider'

/**
 * The slider's ground. The VALUE is `--color-hero-slider-bg` in
 * `src/styles/tokens.css`; this re-exports the Tailwind utility that property
 * generates, so the colour is named once and the component keeps a single
 * import. Applied as a class rather than an inline style -- an inline hex is a
 * colour no rebrand can reach, which is how #eef4f7 sat outside the palette.
 */
export const HERO_SLIDER_BG_CLASS = 'bg-hero-slider-bg'

// 593, remeasured 2026-09-02: the live hero ROW (sidebar | slider+strip |
// promo blocks) spans y148..y741 at 1440. The old 422 predates the category
// strip moving inside the center column.
export const HERO_SLIDER_HEIGHT = 593

const WELCOME_SLIDE: HeroSlide = {
  id: 'rs-18',
  variant: 'welcome',
  title: 'ברוכים הבאים',
  title_secondary: 'לקניון Express',
  title_secondary_indent: true,
  tagline: 'מסדרים לך בילוי . . .',
  promo_small: 'פשוט',
  promo_large: 'הכי טוב',
  image_url: null,
  link_url: '/products',
  // Measured on kenyonexpress.co.il 2026-07-30. The slider is 728x370 at x=336
  // and this slide's image box is 324x434 at x=654, so relative to the slider it
  // sits at x=318 y=18: width 44.5%, inset 11.8% from the right edge, height 434.
  // The previous 49.8% / flush-right / 495 came from the electro demo.
  imageLayout: { offsetTop: 18, widthPercent: 44.5, insetPercent: 11.8, minHeight: 434 },
}

/**
 * HEBREW, LIKE EVERY OTHER SLIDE.
 *
 * This one and the promo pair below it were the last English left in the hero.
 * They came from the Electro RevSlider export and describe its demo catalogue
 * ("PREMIUM PRODUCT", "THE NEW STANDARD", "SIMPLY THE BEST"); the live site
 * still shows them because it runs the same theme, so `refs/` holds no Hebrew
 * counterpart to copy and these are written, not measured.
 *
 * The display ramp they render through (--text-hero-*) is measured and is
 * unchanged. Hebrew sets narrower than the English it replaces at the same
 * size, which moves the hero band in the pixel comparison; that cost is
 * recorded in STATE.md rather than absorbed by leaving the site in English.
 */
const PREMIUM_SLIDE: HeroSlide = {
  id: 'rs-35',
  variant: 'product',
  title: 'חוויות',
  title_secondary: 'פרימיום',
  standard_line: 'הסטנדרט החדש',
  promo_small: 'פשוט',
  promo_large: 'הכי טוב',
  image_url: null,
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
    standard_line: 'הסטנדרט החדש',
    promo_small: 'פשוט',
    promo_large: 'הכי טוב',
    image_url: null,
    link_url: '/products',
    imageLayout: { offsetTop: 17, widthPercent: 49.3, minHeight: 376 },
  },
  {
    id: 'rs-33',
    variant: 'product',
    title: 'תצוגה',
    title_secondary: 'מושלמת',
    title_indent: true,
    standard_line: 'הסטנדרט החדש',
    promo_small: 'פשוט',
    promo_large: 'הכי טוב',
    image_url: null,
    link_url: '/products',
    imageLayout: { offsetTop: 9, widthPercent: 51.5, minHeight: 392 },
  },
  {
    id: 'rs-19',
    variant: 'app',
    title: 'האפליקציה',
    title_secondary: 'בקרוב',
    title_secondary_indent: true,
    image_url: null,
    link_url: '/products',
    imageLayout: { offsetTop: -1, widthPercent: 50.4, minHeight: 425 },
  },
]
