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
      className="mx-auto flex h-hero-mobile w-full max-w-hero-row flex-col border-b border-border font-sans md:h-hero-tablet lg:h-hero-desktop lg:flex-row lg:items-stretch"
    >
      <HeroCategorySidebar />
      {/* Live (refs, 1440): the center column is the slider (728x370) with the
          category strip (728x170) UNDER it, inside the same column -- x336..
          x1064, total 593 with the sidebar and the promo column. The strip used
          to render as a separate full-width section below the hero, which put
          five 146px cells on entirely different pixels and was most of the
          y500-700 band difference. */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        {/* Live: slider 728x370 (y148..518), the strip 170 directly under it,
            and the remaining 53px of the 593 column stay white BELOW the strip
            -- the strip is not bottom-anchored. mt-auto put it at the bottom
            and stretched the slider to 423, which is where the y500-700 bands
            came from. */}
        {/* ONE HeroSlider instance, wrapper shape switching by breakpoint:
            fixed 370 at lg (the measured slot), flex-fill below. Two mounted
            instances meant two rotation timers and broke the e2e guard that
            counts exactly one [data-hero-slider]. */}
        <div className="flex min-h-0 flex-1 flex-col md:h-hero-slider-tablet md:min-h-hero-slider-tablet md:flex-none lg:block lg:h-hero-slider-desktop lg:min-h-hero-slider-desktop">
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
