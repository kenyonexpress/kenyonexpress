import BenefitBar from '@/components/home/BenefitBar'
import DealsOfTheDay from '@/components/home/DealsOfTheDay'
import HeroSection from '@/components/home/HeroSection'
import CategoryStrip from '@/components/store/CategoryStrip'

export const metadata = {
  title: 'קניון EXPRESS — מסדרים לך בילוי',
  description: 'קופונים, דילים ומוצרים במחיר הכי טוב. בפריסה ארצית.',
}

/** refs/ke_live_singlefile.html section order: hero → categories → features → product grid */
export default function HomePage() {
  return (
    <>
      <HeroSection />
      <CategoryStrip />
      <BenefitBar />
      <DealsOfTheDay />
    </>
  )
}
