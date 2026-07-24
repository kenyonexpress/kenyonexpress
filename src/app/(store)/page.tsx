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
      {/* Live: strip ends y688, USP block y761-896, deals items y898.
          Header lock leaves our strip ~69px lower; keep the post-strip gap
          tight so deals still land at y898 (mt 35 + benefit ~76 + pt 15). */}
      <div className="mt-[35px]">
        <BenefitBar />
      </div>
      <DealsOfTheDay />
    </>
  )
}
