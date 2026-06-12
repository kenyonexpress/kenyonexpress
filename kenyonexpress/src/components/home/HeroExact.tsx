import HeroCategorySidebar from '@/components/home/HeroCategorySidebar'
import HeroPromoBanners from '@/components/home/HeroPromoBanners'
import HeroSlider from '@/components/home/HeroSlider'
import { HERO_SINGLEFILE_SLIDES, HERO_SLIDER_HEIGHT } from '@/lib/hero-singlefile-data'

export default function HeroExact() {
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
