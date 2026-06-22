import HeroCategorySidebar from '@/components/home/HeroCategorySidebar'
import HeroPromoBanners from '@/components/home/HeroPromoBanners'
import HeroSlider from '@/components/home/HeroSlider'
import { HERO_SINGLEFILE_SLIDES, HERO_SLIDER_HEIGHT } from '@/lib/hero-singlefile-data'

/** refs/ke_live_singlefile.html — rs-19 active, 422px; 3 columns (RTL): category column (right) | slider (center) | promo blocks (left) */
export default function HeroSection() {
  return (
    <section
      aria-label="אזור ראשי"
      dir="rtl"
      style={{ minHeight: HERO_SLIDER_HEIGHT, height: HERO_SLIDER_HEIGHT }}
      className="mx-auto flex w-full max-w-page flex-col border-b border-gray-200 font-sans lg:flex-row lg:items-stretch"
    >
      <HeroCategorySidebar />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <HeroSlider slides={HERO_SINGLEFILE_SLIDES} />
      </div>
      <HeroPromoBanners />
    </section>
  )
}
