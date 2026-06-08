import CategorySidebar from '@/components/store/CategorySidebar'
import HeroSlider, { type HeroSlide } from '@/components/store/HeroSlider'
import PromoBanners from '@/components/store/PromoBanners'
import { createClient } from '@/lib/supabase/server'

export default async function HomeHeroSection() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('hero_slides')
    .select('id, title, subtitle, image_url, link_url')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  const slides = (data ?? []) as HeroSlide[]

  return (
    <section
      aria-label="אזור ראשי"
      className="grid grid-cols-1 lg:grid-cols-[260px_1fr_260px] min-h-[440px] border-b border-gray-200 max-w-[1320px] mx-auto w-full"
    >
      <CategorySidebar />
      <HeroSlider slides={slides} />
      <PromoBanners />
    </section>
  )
}
