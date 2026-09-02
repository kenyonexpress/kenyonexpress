import HeroCategorySidebar from '@/components/home/HeroCategorySidebar'
import HeroPromoBanners from '@/components/home/HeroPromoBanners'
import HeroSlider, { type HeroSlide } from '@/components/home/HeroSlider'
import CategoryStrip from '@/components/store/CategoryStrip'
import { HERO_SINGLEFILE_SLIDES, HERO_SLIDER_HEIGHT } from '@/lib/hero-singlefile-data'

/** refs/ke_live_singlefile.html — rs-19 active, 422px; 3 columns (RTL): category column (right) | slider (center) | promo blocks (left) */
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
      style={{ minHeight: HERO_SLIDER_HEIGHT, height: HERO_SLIDER_HEIGHT }}
      className="mx-auto flex w-full max-w-hero-row flex-col border-b border-gray-200 font-sans lg:flex-row lg:items-stretch"
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
        <div className="flex min-h-0 flex-1 flex-col lg:block lg:h-[370px] lg:min-h-[370px] lg:flex-none">
          <HeroSlider slides={slides} />
        </div>
        <div className="hidden lg:block">
          <CategoryStrip inHero />
        </div>
      </div>
      <HeroPromoBanners />
    </section>
  )
}
