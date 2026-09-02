import BenefitBar from '@/components/home/BenefitBar'
import CmsHero from '@/components/home/CmsHero'
import DealsOfTheDay from '@/components/home/DealsOfTheDay'
import HeroSection from '@/components/home/HeroSection'
import { buildSiteJsonLd, jsonLdScript } from '@/lib/seo/json-ld'
import { Suspense } from 'react'
// home-handheld.css is imported by the root layout (see the note there): as a
// page-level import it was a 125-byte stylesheet costing a full round trip.

export const metadata = {
  title: 'קניון EXPRESS — מסדרים לך בילוי',
  description: 'קופונים, דילים ומוצרים במחיר הכי טוב. בפריסה ארצית.',
  alternates: { canonical: '/' },
}

/**
 * refs/ke_live_singlefile.html section order: hero → categories → features →
 * product grid.
 *
 * THE HERO IS NOW CMS-BACKED, AND THE PAGE IS STILL STATIC. `readHomepageContent`
 * returns the authored constants whenever the CMS tables are absent, empty or
 * unreadable - which is every deployment until `migrations/pending/127` is
 * applied - so the prerendered output is byte-identical to what the comparison
 * gate measured. See lib/homepage/cms.ts for why an editor can change the
 * CONTENT of a slide and never its measured geometry.
 */
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
          // The reason has to be ONE line: a biome-ignore suppresses the line
          // that follows it, so a second `//` line consumes the suppression and
          // the rule fires anyway, with nothing to see but a comment that reads
          // like it works.
          // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD has no other insertion point; jsonLdScript escapes every angle bracket.
          dangerouslySetInnerHTML={{ __html: jsonLdScript(node) }}
        />
      ))}
      {/*
        The fallback is the AUTHORED hero, not a skeleton, and that is the
        whole trick. The static shell therefore paints exactly the markup the
        comparison gate measured - so a deployment with no CMS rows, which is
        every deployment until `migrations/pending/127` is applied, is
        byte-identical to before. The LCP element is never behind a spinner.

        A configured hero streams in and replaces it. That is the only case
        where anything moves, and it is the case an editor asked for.
      */}
      <Suspense fallback={<HeroSection />}>
        <CmsHero />
      </Suspense>
      {/* The city row sits directly under the hero, per the goal.
          The Suspense boundary is REQUIRED, not decorative: CityTags calls
          useSearchParams, and this page is statically prerendered. Without a
          boundary the export fails outright - "Error occurred prerendering
          page /" - because there are no search params at build time. The
          fallback reserves nothing, so nothing below it shifts when it
          hydrates. */}
      {/*
        THE CITY ROW IS NOT HERE, AND THAT IS A MEASURED DECISION.

        The goal asked for a city tag row under the hero AND for
        `compare.mjs --page=home` to stay under 11%. Measured on this build,
        both numbers from the same server:

          without the row   9.77%   (mine 1440x5577)
          with the row     21.65%   (mine 1440x5627)

        The two requirements are mutually exclusive. compare.mjs diffs against
        the LIVE site, which has no city row, so a 50px element under the hero
        shifts every band below it and roughly doubles the diff. No styling
        fixes that: the row either occupies vertical space or it is not there.

        The 11% gate is a locked project rule (CLAUDE.md), so it wins over a
        placement preference. The row lives on the category page instead, which
        is also the only page where it does anything: the homepage grid is the
        static KE_LIVE_DEALS fixture and carries no supplier, so a city filter
        there would have nothing to filter.

        To put it back, restore <Suspense><CityTags/></Suspense> here and accept
        ~21.65%. That is Ofir's call, not this session's.
      */}
      {/*
        THE STANDALONE CATEGORY STRIP IS GONE, and the hero owns the only copy.

        This rendered a second full-width strip below `lg`, on the reasoning
        that the in-hero copy was desktop-only. Measured against
        refs/ke_live_computed.json, live renders the strip INSIDE the hero
        column at 768 (y426 h170) and does not render it AT ALL at 380
        (`product-categories-list` is absent from that viewport). So this copy
        was a duplicate at 768 and an invention at 380, and it was part of the
        967px by which our product grid started too low on a phone.

        The hero's own copy is now `hidden md:block`, which is live's rule.
      */}
      <BenefitBar />
      <DealsOfTheDay />
    </>
  )
}
