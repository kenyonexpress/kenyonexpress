import HeroCategorySidebar from '@/components/home/HeroCategorySidebar'
import HeroPromoBanners from '@/components/home/HeroPromoBanners'
import HeroSlider, { type HeroSlide } from '@/components/home/HeroSlider'
import CategoryStrip from '@/components/store/CategoryStrip'
import { HERO_SINGLEFILE_SLIDES } from '@/lib/hero-singlefile-data'

/**
 * refs/ke_live_home.html — 3 columns (RTL): category column (right) | slider
 * (centre) | promo blocks (left). (Cited ke_live_singlefile.html, retired in
 * 62eb74956.)
 *
 * THE ROW HAD ONE HEIGHT AT EVERY WIDTH AND LIVE HAS THREE. It was
 * `style={{ height: HERO_SLIDER_HEIGHT }}` -- 593px on a 380px phone, where
 * live is 213. The side columns were already `hidden lg:flex`, so the row kept
 * its full desktop height with nothing in it, and because the entire page sits
 * below the hero the error compounded downward: measured against live, our
 * product grid began 967px too low at 380 and 434px too low at 768, while 1440
 * was exact to the pixel.
 *
 *   width   hero row   slider   category strip   side columns
 *   ------  ---------  -------  ---------------  ------------
 *   380       213       213     absent           absent
 *   768       495       304     170              absent
 *   1440      613       370     170              present
 *
 * The strip is `hidden md:block` and not `hidden lg:block` for the same
 * reason: live renders it at 768 and not at 380.
 */
/**
 * `slides` is optional and defaults to the authored constants.
 *
 * That default is what keeps every other caller - and the comparison gate -
 * working unchanged: the home page passes CMS slides when a database has them,
 * and everything else, including the measured baseline, renders exactly what it
 * rendered before.
 */
export default function HeroSection({
  slides = HERO_SINGLEFILE_SLIDES,
}: { slides?: HeroSlide[] } = {}) {
  return (
    <section
      aria-label="אזור ראשי"
      dir="rtl"
      // px-gutter / md:px-hero-gutter-tablet / lg:px-0: live keeps its Bootstrap container
      // below lg, so the slider, the strip and the feature bar all sit inside
      // a 15px gutter at 380 (slider x15..x365) and 39px at 768 (x39..x728:
      // 9px of centring, 15px container padding, 15px list margin). Ours
      // bled edge to edge at both. Measured UX01, 14.10.2026.
      // No border-b: live draws no rule under the hero row at any of the
      // three widths (columns x400-410 at 1440, x45-60 at 768, x20-30 at 380
      // all read white between the row and the feature bar).
      className="mx-auto flex h-hero-mobile w-full max-w-hero-row flex-col px-gutter font-sans md:h-hero-tablet md:px-hero-gutter-tablet lg:h-hero-desktop lg:flex-row lg:items-stretch lg:px-0"
    >
      <HeroCategorySidebar />
      {/* Live (refs, 1440): the center column is the slider (728x370) with the
          category strip (728x170) UNDER it, inside the same column -- x336..
          x1064, total 593 with the sidebar and the promo column. The strip used
          to render as a separate full-width section below the hero, which put
          five 146px cells on entirely different pixels and was most of the
          y500-700 band difference. */}
      {/* md:w-hero-center-tablet md:self-end: at 768 live's slider and strip are the
          desktop 728 wide, anchored at the container's LEFT edge (x39) and
          running to x767 -- past the 690px container, which is a horizontal
          overflow on live that we do not reproduce (the row still fits the
          768 viewport exactly, so nothing scrolls). self-end is the left
          edge in this dir="rtl" column. Measured UX01, 14.10.2026. */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col md:w-hero-center-tablet md:self-end lg:w-auto lg:self-auto">
        {/* Live: slider 728x370 (y148..518), the strip 170 directly under it,
            and the remaining 53px of the 593 column stay white BELOW the strip
            -- the strip is not bottom-anchored. mt-auto put it at the bottom
            and stretched the slider to 423, which is where the y500-700 bands
            came from. */}
        {/* ONE HeroSlider instance, wrapper shape switching by breakpoint:
            fixed 370 at lg (the measured slot), flex-fill below. Two mounted
            instances meant two rotation timers and broke the e2e guard that
            counts exactly one [data-hero-slider]. */}
        {/* 194 at 380, not the row's 213: live's slider box runs y161..y355
            and the remaining 19px of the row stay white under it, the same
            shape as the 53px under the strip at 1440. Flex-fill painted the
            slider background over the whole row. */}
        <div className="flex h-hero-slider-mobile min-h-0 flex-none flex-col md:h-hero-slider-tablet md:min-h-hero-slider-tablet lg:block lg:h-hero-slider-desktop lg:min-h-hero-slider-desktop">
          <HeroSlider slides={slides} />
        </div>
        <div className="hidden md:block">
          <CategoryStrip inHero />
        </div>
      </div>
      <HeroPromoBanners />
    </section>
  )
}
