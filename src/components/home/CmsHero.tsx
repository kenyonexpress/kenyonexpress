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
 * absent, empty or unreadable, so on every deployment until
 * `migrations/pending/127` is applied the replacement is identical to the thing
 * it replaces.
 */
export default async function CmsHero() {
  const homepage = await readHomepageContent()
  return <HeroSection slides={homepage.heroSlides} />
}
