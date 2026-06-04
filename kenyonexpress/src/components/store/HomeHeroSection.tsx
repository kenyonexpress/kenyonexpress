import CategorySidebar from '@/components/store/CategorySidebar'
import HeroSlider from '@/components/store/HeroSlider'
import PromoBanners from '@/components/store/PromoBanners'

export default function HomeHeroSection() {
  return (
    <section
      aria-label="אזור ראשי"
      className="grid grid-cols-1 lg:grid-cols-[260px_1fr_260px] min-h-[440px] border-b border-gray-200 max-w-screen-xl mx-auto w-full"
    >
      <CategorySidebar />
      <HeroSlider />
      <PromoBanners />
    </section>
  )
}
