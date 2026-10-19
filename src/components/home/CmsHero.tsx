import HeroSection from '@/components/home/HeroSection'
import { readHomepageContent } from '@/lib/homepage/cms'

/**
 * The hero, with whatever the CMS has configured.
 *
 * IT EXISTS TO BE SUSPENDED. The home page renders `<HeroSection />` - the
 * authored one - as this component's Suspense fallback, so the static shell is
 * byte-identical to what `compare.mjs` measured and the LCP element is never
 * behind a skeleton. This then streams in and replaces it, which only changes
 * anything when an editor has actually configured a slide.
 *
 * `readHomepageContent` returns the authored slides whenever the CMS tables are
 * absent, empty or unreadable, so while nobody has authored a slide the
 * replacement is identical to the thing it replaces. 127 is applied
 * (`homepage_sections` live in production, measured 2026-09-07); what keeps the
 * fallback in play now is that the table is empty, not that it is missing.
 */
export default async function CmsHero() {
  const homepage = await readHomepageContent()
  return <HeroSection slides={homepage.heroSlides} />
}
