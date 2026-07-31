import BenefitBar from '@/components/home/BenefitBar'
import DealsOfTheDay from '@/components/home/DealsOfTheDay'
import HeroSection from '@/components/home/HeroSection'
import CategoryStrip from '@/components/store/CategoryStrip'
import { buildSiteJsonLd, jsonLdScript } from '@/lib/seo/json-ld'
import '@/styles/home-handheld.css'

export const metadata = {
  title: 'קניון EXPRESS — מסדרים לך בילוי',
  description: 'קופונים, דילים ומוצרים במחיר הכי טוב. בפריסה ארצית.',
  alternates: { canonical: '/' },
}

/** refs/ke_live_singlefile.html section order: hero → categories → features → product grid */
export default function HomePage() {
  // Organization and WebSite belong on the home page and nowhere else. Emitting
  // them from the root layout would repeat the same two nodes on the checkout,
  // the account area and every product, which says nothing new and dilutes the
  // one page that should carry the site's identity.
  const siteLd = buildSiteJsonLd(process.env.NEXT_PUBLIC_APP_URL ?? 'https://kenyonexpress.co.il')

  return (
    <>
      {siteLd.map((node) => (
        <script
          key={node['@type'] as string}
          type="application/ld+json"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD has no
          // other insertion point; jsonLdScript escapes every angle bracket.
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
