import HeroCategorySidebar from '@/components/home/HeroCategorySidebar'
import HeroPromoBanners from '@/components/home/HeroPromoBanners'
import HeroSlider from '@/components/home/HeroSlider'
import { HERO_SLIDER_HEIGHT } from '@/lib/hero-singlefile-data'
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
      dir="rtl"
      style={{ minHeight: HERO_SLIDER_HEIGHT, height: HERO_SLIDER_HEIGHT }}
      className="mx-auto flex w-full max-w-page flex-col border-b border-gray-200 font-sans lg:flex-row lg:items-stretch"
    >
      <HeroCategorySidebar />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <HeroSlider slides={slides} />
      </div>
      <HeroPromoBanners />
    </section>
  )
}
