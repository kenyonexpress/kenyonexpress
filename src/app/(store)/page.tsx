import BenefitBar from '@/components/home/BenefitBar'
import DealsOfTheDay from '@/components/home/DealsOfTheDay'
import HeroSection from '@/components/home/HeroSection'
import CategoryStrip from '@/components/store/CategoryStrip'
import { buildSiteJsonLd, jsonLdScript } from '@/lib/seo/json-ld'
import type { Metadata } from 'next'

/** ISR: home refreshes at most every 2 minutes. */
export const revalidate = 120

export const metadata: Metadata = {
  title: { absolute: 'קניון אקספרס | קופונים ומבצעים' },
  description: 'קופונים, דילים ומוצרים במחיר הכי טוב. בפריסה ארצית.',
  alternates: { canonical: '/' },
  openGraph: {
    title: 'קניון אקספרס | קופונים ומבצעים',
    description: 'קופונים, דילים ומוצרים במחיר הכי טוב. בפריסה ארצית.',
    url: '/',
    locale: 'he_IL',
    siteName: 'קניון אקספרס',
    type: 'website',
  },
}

/** refs/ke_live_singlefile.html section order: hero → categories → features → product grid */
export default function HomePage() {
  const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://kenyonexpress.co.il'
  const siteLd = buildSiteJsonLd(siteUrl)

  return (
    <>
      {siteLd.map((node) => (
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD; jsonLdScript escapes <
        <script
          key={String(node['@type'])}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: jsonLdScript(node) }}
        />
      ))}
      <HeroSection />
      <CategoryStrip />
      <div className="mt-[50px]">
        <BenefitBar />
      </div>
      <DealsOfTheDay />
    </>
  )
}
