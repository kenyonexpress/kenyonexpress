import BenefitBar from '@/components/home/BenefitBar'
import BenefitBarExperiment from '@/components/home/BenefitBarExperiment'
import BrandsRow from '@/components/home/BrandsRow'
import CategoryGrid from '@/components/home/CategoryGrid'
import CmsHero from '@/components/home/CmsHero'
import DealOfTheDay from '@/components/home/DealOfTheDay'
import FlashSaleBanner from '@/components/home/FlashSaleBanner'
import ForYouRow from '@/components/home/ForYouRow'
import HomeNewsletter from '@/components/home/HomeNewsletter'
import HotCoupons from '@/components/home/HotCoupons'
import InfiniteDealsScroll from '@/components/home/InfiniteDealsScroll'
import PopularSearches from '@/components/home/PopularSearches'
import { KE_LIVE_DEALS } from '@/lib/ke-live-deals-data'
import { buildSiteJsonLd, jsonLdScript } from '@/lib/seo/json-ld'
import { publicPageMetadata } from '@/lib/seo/page-metadata'
import { Suspense } from 'react'

export const metadata = publicPageMetadata({
  title: 'קניון EXPRESS — מסדרים לך בילוי',
  description: 'קופונים, דילים ומוצרים במחיר הכי טוב. בפריסה ארצית.',
  path: '/',
})

export default function HomePage() {
  const siteLd = buildSiteJsonLd(process.env.NEXT_PUBLIC_APP_URL ?? 'https://kenyonexpress.co.il')
  const initialProducts = KE_LIVE_DEALS.slice(0, 24)

  return (
    <>
      <div data-home hidden />

      {siteLd.map((node) => (
        <script
          key={node['@type'] as string}
          type="application/ld+json"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD has no other insertion point; jsonLdScript escapes every angle bracket.
          dangerouslySetInnerHTML={{ __html: jsonLdScript(node) }}
        />
      ))}

      <Suspense fallback={null}>
        <CmsHero />
      </Suspense>

      <BenefitBarExperiment>
        <BenefitBar />
      </BenefitBarExperiment>

      <InfiniteDealsScroll initialProducts={initialProducts} />

      <FlashSaleBanner />
      <DealOfTheDay />
      <ForYouRow />
      <CategoryGrid />
      <PopularSearches />
      <HotCoupons />
      <BrandsRow />
      <HomeNewsletter />
    </>
  )
}
