import HeroCategorySidebar from '@/components/home/HeroCategorySidebar'
import HeroPromoBanners from '@/components/home/HeroPromoBanners'
import HeroSlider from '@/components/home/HeroSlider'
import { ELECTRO_HERO } from '@/lib/electro-hero-tokens'
import { HERO_FALLBACK_SLIDES } from '@/lib/hero-slides-fallback'
import { resolveHeroSlides } from '@/lib/ke-live-hero-data'
import { createClient } from '@/lib/supabase/server'

export default async function HeroSection() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('hero_slides')
    .select('id, title, subtitle, image_url, link_url')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  const dbSlides = data ?? []
  const slides =
    dbSlides.length > 0 ? resolveHeroSlides(dbSlides) : HERO_FALLBACK_SLIDES

  return (
    <section
      aria-label="אזור ראשי"
      dir="ltr"
      style={{
        gridTemplateColumns: ELECTRO_HERO.grid.columns,
        minHeight: ELECTRO_HERO.grid.rowHeight,
      }}
      className="mx-auto grid w-full max-w-page grid-cols-1 border-b border-gray-200 font-sans lg:items-start"
    >
      <HeroPromoBanners />
      <HeroSlider slides={slides} />
      <HeroCategorySidebar />
    </section>
  )
}
