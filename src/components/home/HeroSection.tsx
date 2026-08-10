import HeroCategorySidebar from '@/components/home/HeroCategorySidebar'
import HeroPromoBanners from '@/components/home/HeroPromoBanners'
import HeroSlider, { type HeroSlide } from '@/components/home/HeroSlider'
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
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <HeroSlider slides={slides} />
      </div>
      <HeroPromoBanners />
    </section>
  )
}
