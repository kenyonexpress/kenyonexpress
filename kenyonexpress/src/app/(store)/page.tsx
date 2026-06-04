import InfoBar from '@/components/layout/InfoBar'
import HomeHeroSection from '@/components/store/HomeHeroSection'
import CategoryStrip from '@/components/store/CategoryStrip'

export const metadata = {
  title: 'קניון EXPRESS — מסדרים לך בילוי',
  description: 'קופונים, דילים ומוצרים במחיר הכי טוב. בפריסה ארצית.',
}

export default function HomePage() {
  return (
    <>
      <HomeHeroSection />
      <CategoryStrip />
      <InfoBar />
    </>
  )
}
