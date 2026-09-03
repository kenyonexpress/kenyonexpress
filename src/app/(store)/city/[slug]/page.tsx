import { cityBySlug } from '@/lib/geo/cities'
import { REGIONS, findRegion } from '@/lib/regions'
import { buildBreadcrumbJsonLd, jsonLdScript } from '@/lib/seo/json-ld'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'

/**
 * A region page: `/city/<hebrew-slug>`.
 *
 * WHY IT EXISTS NOW. D19 rebuilt live's `secondary-nav` as a real dropdown of
 * seventeen regions (see RegionMenu.tsx). Those are live URLs with whatever
 * inbound links seventeen pages have accumulated, and a menu whose every item
 * 404s is worse than the flat link it replaced. This route is what makes the
 * menu honest.
 *
 * WHAT IT DELIBERATELY IS NOT. Queue step J3 owns the full city landing page:
 * products by `supplier_branches.city`, a branch map, `LocalBusiness` JSON-LD
 * per branch, the cookie-persisted city selector in the header, sitemap entries
 * and the F3 redirect check. None of that is here. This page resolves the
 * region, names it, and sends the visitor into the catalogue filtered by the
 * municipalities that region contains. J3 EXTENDS this file; it does not
 * replace it, per the queue's own "extend rather than duplicate" rule.
 *
 * THE EMPTY CASE IS A REAL ANSWER, NOT A BUG. Six of the seventeen regions map
 * to no municipality in `geo/cities.ts` -- the only location signal the database
 * actually has, since `suppliers.address` is filled in for none of the live
 * suppliers. Those pages say so plainly instead of rendering an empty grid that
 * reads like a failed query, and they still link to the whole catalogue.
 */

type Props = { params: Promise<{ slug: string }> }

/**
 * All seventeen, prerendered. The set is a static seventeen-row constant, so
 * there is nothing to gain from generating them on demand and a crawler hitting
 * a cold region page is exactly the case worth having warm.
 */
export function generateStaticParams() {
  return REGIONS.map((region) => ({ slug: region.slug }))
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const region = findRegion(decodeURIComponent(slug))

  // An unknown slug renders notFound() below, which emits noindex on its own.
  if (!region) return {}

  return {
    title: `דילים ב${region.name}`,
    description: `קופונים ומבצעים מבתי עסק ב${region.name}. כל שובר נסרק פעם אחת, והתוקף מוצג לפני הרכישה.`,
    alternates: { canonical: `/city/${encodeURIComponent(region.slug)}` },
  }
}

export default async function CityPage({ params }: Props) {
  const { slug } = await params
  const region = findRegion(decodeURIComponent(slug))

  if (!region) notFound()

  // Only the cities this region actually contains AND that the geo table knows.
  // `cityBySlug` returning undefined would mean regions.ts names a slug that
  // geo/cities.ts does not define, so it is filtered rather than rendered blank.
  const cities = region.cities.map((s) => cityBySlug(s)).filter((c) => c !== null)

  // Same shape the category route uses, so the two trails cannot disagree.
  const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://kenyonexpress.co.il'
  const breadcrumbLd = buildBreadcrumbJsonLd(
    [
      { name: 'בית', path: '/' },
      { name: region.name, path: `/city/${encodeURIComponent(region.slug)}` },
    ],
    siteUrl,
  )

  return (
    <div dir="rtl" className="mx-auto max-w-page px-[15px] py-8">
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD has no other insertion point, and jsonLdScript escapes every angle bracket.
        dangerouslySetInnerHTML={{ __html: jsonLdScript(breadcrumbLd) }}
      />

      <nav aria-label="מסלול ניווט" className="mb-4 text-sm text-muted">
        <Link href="/" className="hover:underline">
          דף הבית
        </Link>
        <span className="px-2" aria-hidden="true">
          /
        </span>
        <span>{region.name}</span>
      </nav>

      <h1 className="mb-2 text-2xl font-bold text-heading">דילים ב{region.name}</h1>

      {cities.length > 0 ? (
        <>
          <p className="mb-6 text-muted">
            בתי העסק שאנחנו מכירים באזור הזה נמצאים ביישובים הבאים. בחרו יישוב כדי לראות את הדילים
            שלו.
          </p>
          <ul className="mb-8 flex flex-wrap gap-3">
            {cities.map((city) => (
              <li key={city.slug}>
                <Link
                  href={`/products?city=${encodeURIComponent(city.slug)}`}
                  className="inline-flex min-h-touch-min items-center rounded-md border border-border px-4 py-2 text-sm text-heading transition-colors hover:bg-surface-hover"
                >
                  {city.name}
                </Link>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="mb-8 text-muted">
          עדיין אין אצלנו בית עסק רשום באזור הזה. אפשר לראות את כל הדילים באתר, ואם יש לכם עסק
          באזור, נשמח שתצטרפו.
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <Link
          href="/products"
          className="inline-flex min-h-touch-min items-center rounded-md bg-brand px-5 py-2 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90"
        >
          לכל הדילים
        </Link>
        <Link
          href="/suppliers"
          className="inline-flex min-h-touch-min items-center rounded-md border border-border px-5 py-2 text-sm text-heading transition-colors hover:bg-surface-hover"
        >
          הצטרפו כספקים
        </Link>
      </div>
    </div>
  )
}
