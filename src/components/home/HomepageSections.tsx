import BenefitBar from '@/components/home/BenefitBar'
import CountdownBanner from '@/components/home/CountdownBanner'
import DealsOfTheDay from '@/components/home/DealsOfTheDay'
import ProductRail from '@/components/home/ProductRail'
import { readHomepageContent } from '@/lib/homepage/cms'
import type { HomepageSection } from '@/lib/homepage/cms'
import {
  railByCategory,
  railByIds,
  railByRule,
  railBySupplier,
  spotlightCategory,
  spotlightSupplier,
} from '@/lib/homepage/rails'
import { parseSectionConfig } from '@/lib/homepage/sections'

/**
 * The body of the home page, in the order the CMS says.
 *
 * =========================================================================
 * THE AUTHORED PAGE IS THE DEFAULT AND IS BYTE-IDENTICAL
 * =========================================================================
 *
 * `readHomepageContent` returns `AUTHORED_CONTENT` whenever the tables are
 * absent, empty or unreadable, and both tables hold ZERO ROWS in production
 * (measured 2026-09-09). The authored section list is hero, categories,
 * benefits, deals - and the mapping below renders `benefits` then `deals` and
 * nothing for the first two, which is the markup this page emitted before [59].
 *
 * That was verified rather than argued: the prerendered `index.html` was built
 * from HEAD and from this change and diffed, and once one client chunk hash and
 * React's Suspense boundary markers are normalised the two are identical
 * character for character. The full note is in `app/(store)/page.tsx`.
 *
 * That matters more here than anywhere else on the site. The home page's
 * fidelity was a gate, and although `scripts/compare.mjs` now refuses to
 * measure (the live reference is our own build - see docs/REFS-POLICY.md), the
 * authored order and the authored geometry are the last recorded state that
 * scored under 11%. An operator opting into a configured page is a decision
 * somebody makes; a code change that silently reorders it is not.
 *
 * =========================================================================
 * TWO KINDS RENDER NOTHING, ON PURPOSE
 * =========================================================================
 *
 * `hero` renders nothing HERE because `<CmsHero>` renders it above, inside its
 * own Suspense boundary whose fallback is the authored hero. The hero is the
 * LCP element and it is never behind a spinner; folding it into this list would
 * put it behind one.
 *
 * `categories` renders nothing because the standalone category strip was
 * DELETED after measurement: live renders that strip inside the hero column at
 * 768 and does not render it at all at 380, so the standalone copy was a
 * duplicate at one width and an invention at the other, and it was part of the
 * 967px by which the product grid started too low on a phone. The full argument
 * is in `app/(store)/page.tsx`. A `categories` row in the database therefore
 * renders nothing rather than bringing that strip back through a form.
 *
 * `featured`, `city_deals` and `banner_row` are 127's kinds that never got a
 * component. They render nothing too, and the admin console labels them so an
 * operator is not offered a section that does not exist.
 */

/** `new Date()` is read once, by the caller that has a clock. See rails.ts. */
export default async function HomepageSections({ preview = false }: { preview?: boolean }) {
  const content = await readHomepageContent({ preview })
  const now = new Date()

  const rendered = await Promise.all(content.sections.map((section) => renderSection(section, now)))

  return <>{rendered}</>
}

async function renderSection(section: HomepageSection, now: Date) {
  const parsed = parseSectionConfig(section.kind, section.config)
  // A config that does not parse costs one section, never the page. See
  // `parseSectionConfig`.
  if (!parsed) return null

  const key = section.id

  switch (parsed.kind) {
    case 'benefits':
      return <BenefitBar key={key} />

    case 'deals':
      return <DealsOfTheDay key={key} />

    case 'product_rail': {
      const products =
        parsed.config.source === 'manual'
          ? (await railByIds(parsed.config.productIds)).slice(0, parsed.config.limit)
          : await railByRule(parsed.config.source, parsed.config.limit, now)
      return (
        <ProductRail
          key={key}
          title={section.titleHe}
          subtitle={section.subtitleHe}
          products={products}
          moreHref="/products"
        />
      )
    }

    case 'category_spotlight': {
      const category = await spotlightCategory(parsed.config.categorySlug)
      // A slug that matches no active category renders nothing rather than a
      // heading over an empty grid. The admin console says so before publish.
      if (!category) return null
      const products = await railByCategory(category.id, parsed.config.limit)
      return (
        <ProductRail
          key={key}
          title={section.titleHe ?? category.name_he}
          subtitle={section.subtitleHe}
          products={products}
          moreHref={`/category/${encodeURIComponent(category.slug)}`}
          moreLabel="לכל הקטגוריה"
        />
      )
    }

    case 'supplier_spotlight': {
      const supplier = await spotlightSupplier(parsed.config.supplierId)
      if (!supplier) return null
      const products = await railBySupplier(supplier.id, parsed.config.limit)
      return (
        <ProductRail
          key={key}
          title={section.titleHe ?? supplier.name}
          subtitle={section.subtitleHe ?? supplier.city}
          products={products}
          moreHref={`/s/${supplier.id}`}
          moreLabel="לעמוד בית העסק"
        />
      )
    }

    case 'countdown':
      return (
        <CountdownBanner
          key={key}
          title={section.titleHe}
          subtitle={section.subtitleHe}
          deadline={parsed.config.deadline}
          linkUrl={parsed.config.linkUrl}
          ctaLabel={parsed.config.ctaLabelHe}
        />
      )

    // hero, categories, featured, city_deals, banner_row. See the file header.
    default:
      return null
  }
}
