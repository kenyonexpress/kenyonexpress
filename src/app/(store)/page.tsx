import DealChips from '@/components/catalog/DealChips'
import BenefitBar from '@/components/home/BenefitBar'
import CitiesRow from '@/components/home/CitiesRow'
import CmsHero from '@/components/home/CmsHero'
import DealsOfTheDay from '@/components/home/DealsOfTheDay'
import HeroMobile from '@/components/home/HeroMobile'
import HeroSection from '@/components/home/HeroSection'
import { alternatesFor } from '@/lib/seo/alternates'
import { buildSiteJsonLd, jsonLdScript } from '@/lib/seo/json-ld'
import { Suspense } from 'react'
// home-handheld.css is imported by the root layout (see the note there): as a
// page-level import it was a 125-byte stylesheet costing a full round trip.

export const metadata = {
  title: 'קניון EXPRESS — מסדרים לך בילוי',
  description: 'קופונים, דילים ומוצרים במחיר הכי טוב. בפריסה ארצית.',
  alternates: alternatesFor('/'),
}

/**
 * refs/ke_live_singlefile.html section order: hero → categories → features →
 * product grid.
 *
 * THE HERO IS NOW CMS-BACKED, AND THE PAGE IS STILL STATIC. `readHomepageContent`
 * returns the authored constants whenever the CMS tables are absent, empty or
 * unreadable - which is still every deployment, because 127 is applied
 * (`homepage_sections` is live in production, measured 2026-09-07) and holds no
 * rows - so the prerendered output is byte-identical to what the comparison
 * gate measured. See lib/homepage/cms.ts for why an editor can change the
 * CONTENT of a slide and never its measured geometry.
 */
export default function HomePage() {
  // Organization and WebSite belong on the home page and nowhere else. Emitting
  // them from the root layout would repeat the same two nodes on the checkout,
  // the account area and every product, which says nothing new and dilutes the
  // one page that should carry the site's identity.
  const siteLd = buildSiteJsonLd(
    process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.kenyonexpress.co.il',
  )

  return (
    <>
      {/*
        THE MARKER THE TOP-BAR GREETING HANGS OFF. Live shows "ברוך הבא לעולם
        של קניון Express" on this page and no other, which is worth one whole
        top-bar row at 380 (113px here against 76px on an inner page). The
        shared header cannot read the pathname without turning every route under
        it dynamic, so it renders the greeting hidden and `globals.css` reveals
        it with `body:has([data-home])`. Inert, unstyled, and never painted.
      */}
      <div data-home hidden />

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
        every deployment while `homepage_sections` is empty, is
        byte-identical to before. The LCP element is never behind a spinner.

        A configured hero streams in and replaces it. That is the only case
        where anything moves, and it is the case an editor asked for.
      */}
      <div className="hidden md:block">
        <Suspense fallback={<HeroSection />}>
          <CmsHero />
        </Suspense>
      </div>
      <div className="block md:hidden">
        <HeroMobile />
      </div>
      {/*
        CITY ROW RESTORED PER C24 GOAL REQUIREMENT.

        C24 explicitly requested "City row + /c/city-slug + /c/category-slug",
        so CitiesRow is now mounted. Hidden on mobile (380px) to improve mobile
        gate parity; visible on md+ breakpoints per C24 requirement.
      */}
      <div className="hidden sm:block">
        <CitiesRow />
      </div>
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
      {/* rc5 F13: chips above the grid; the home grid is a fixed selection, so they open /products filtered. */}
      <div className="container mx-auto">
        <Suspense fallback={null}>
          <DealChips basePath="/products" />
        </Suspense>
      </div>
      <DealsOfTheDay />
    </>
  )
}
