import HeroCategorySidebar from '@/components/home/HeroCategorySidebar'
import HeroPromoBanners from '@/components/home/HeroPromoBanners'
import HeroSlider from '@/components/home/HeroSlider'
import { HERO_SINGLEFILE_SLIDES, HERO_SLIDER_HEIGHT } from '@/lib/hero-singlefile-data'
import { ELECTRO_HERO } from '@/lib/electro-hero-tokens'

export default function HeroExact() {
  return (
    <section
      aria-label="אזור ראשי"
      dir="ltr"
      style={{
        gridTemplateColumns: ELECTRO_HERO.grid.columns,
        minHeight: HERO_SLIDER_HEIGHT,
      }}
      className="mx-auto grid w-full max-w-page grid-cols-1 border-b border-gray-200 font-sans lg:grid-cols-[200px_minmax(0,1fr)_225px] lg:items-stretch"
    >
      <HeroPromoBanners />
      <HeroSlider slides={HERO_SINGLEFILE_SLIDES} />
      <HeroCategorySidebar />
    </section>
  )
}
