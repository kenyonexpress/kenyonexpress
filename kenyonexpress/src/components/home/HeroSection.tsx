import HeroSlider from '@/components/home/HeroSlider'
import { HERO_SINGLEFILE_SLIDES, HERO_SLIDER_HEIGHT } from '@/lib/hero-singlefile-data'

/** refs/ke_live_singlefile.html — rs-19 active, 422px; sidebar + das sf-hidden at xl capture */
export default function HeroSection() {
  return (
    <section
      aria-label="אזור ראשי"
      dir="rtl"
      style={{ minHeight: HERO_SLIDER_HEIGHT, height: HERO_SLIDER_HEIGHT }}
      className="mx-auto w-full max-w-page border-b border-gray-200 font-sans"
    >
      <HeroSlider slides={HERO_SINGLEFILE_SLIDES} />
    </section>
  )
}
