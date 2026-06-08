import CategorySidebar from '@/components/store/CategorySidebar'
import HeroSlider, { type HeroSlide } from '@/components/store/HeroSlider'
import PromoBanners from '@/components/store/PromoBanners'
import { HERO_SLIDES } from '@/lib/assets'
import { createClient } from '@/lib/supabase/server'

// Static fallback (KE_LIVE_SPEC.md) used when the hero_slides table is empty or
// unavailable, so the uploaded slide images still render.
const FALLBACK_SLIDES: HeroSlide[] = [
  {
    id: 'fallback-1',
    title: 'ברוכים הבאים לקניון Express',
    subtitle: 'מסדרים לך בילוי. . .',
    image_url: HERO_SLIDES[0],
    link_url: '/products',
  },
  {
    id: 'fallback-2',
    title: 'THE NEW STANDARD',
    subtitle: 'PRODUCT PREMIUM',
    image_url: HERO_SLIDES[1],
    link_url: '/products',
  },
  {
    id: 'fallback-3',
    title: 'ממשק מהיר ונוח',
    subtitle: null,
    image_url: HERO_SLIDES[2],
    link_url: '/products',
  },
]

export default async function HomeHeroSection() {
  const supabase = await createClient()
  const { data } = await supabase
    .from('hero_slides')
    .select('id, title, subtitle, image_url, link_url')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })

  const dbSlides = (data ?? []) as HeroSlide[]
  const slides = dbSlides.length > 0 ? dbSlides : FALLBACK_SLIDES

  return (
    <section
      aria-label="אזור ראשי"
      className="grid grid-cols-1 lg:grid-cols-[270px_1fr_270px] min-h-[440px] border-b border-gray-200 max-w-page mx-auto w-full"
    >
      <CategorySidebar />
      <HeroSlider slides={slides} />
      <PromoBanners />
    </section>
  )
}
