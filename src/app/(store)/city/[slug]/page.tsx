import CategoryGridSkeleton from '@/components/category/CategoryGridSkeleton'
import CategoryProductCard from '@/components/category/CategoryProductCard'
import Pagination from '@/components/category/Pagination'
import { ABOVE_FOLD_CARD_COUNT } from '@/components/category/above-fold'
import {
  CITY_PAGE_SIZE,
  type CityDeals,
  type CityPageTarget,
  allCityPageSlugs,
  cityPageDescription,
  cityPageHref,
  cityPageTitle,
  citySlugsOf,
  dealCountLabel,
  loadCityDealsCached,
  pageOfDeals,
  resolveCityPage,
} from '@/lib/city-page'
import { blurEntryFor, firstImageOf } from '@/lib/images/blur'
import {
  type JsonLdNode,
  buildBreadcrumbJsonLd,
  buildItemListJsonLd,
  jsonLdScript,
} from '@/lib/seo/json-ld'
import { publicPageMetadata } from '@/lib/seo/page-metadata'
import { MapPin, Store, Tag } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import '@/styles/category-page.css'

/**
 * `/city/[slug]`: every local deal in one Israeli city, or in one of live's
 * seventeen regions (STEP 64, extending D19).
 *
 * WHY ONE ROUTE. D19 built this file for the region menu: live serves its
 * seventeen regions at `/city/<hebrew-slug>` and a menu whose every item 404s
 * is worse than the flat link it replaced. STEP 64 is the city landing page
 * that comment reserved for "J3": the same route now also answers the thirteen
 * ASCII city slugs of `geo/cities.ts`, and a region page aggregates the deals
 * of the cities it contains instead of bouncing to `/products?city=`. How a
 * segment resolves, where a deal is placed, and every "why not" live in
 * `lib/city-page.ts`. This file is the frame, the chips and the grid.
 *
 * LOCAL SEO, WITHOUT INVENTION. The title and H1 carry the city name as the
 * keyword, the description names the city twice in natural Hebrew, the
 * breadcrumb climbs city -> region -> home, and the city is published as a
 * schema.org `Place` with the municipal coordinate from `geo/cities.ts`. No
 * `LocalBusiness`: the only address fact in the database is a city name, and a
 * `LocalBusiness` node claims a street door nobody has typed. Merchants link to
 * their own storefront, where the facts about them live.
 *
 * THE EMPTY CASE IS A REAL ANSWER. Measured 2026-10-08, no active product or
 * supplier carries a city, so every one of these pages is empty in production
 * today. `orFail` throws on a read error, so an empty grid here means the
 * catalogue has nothing placed in this city, and the page says exactly that.
 *
 * NO RATING ANYWHERE. Not a star, not a number, not a sort by it; the page
 * test greps this file and the data module for the words.
 */

type Props = {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ page?: string | string[] }>
}

const SITE_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://kenyonexpress.co.il'

function parsePage(raw: string | string[] | undefined): number {
  const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : 1
  return Number.isFinite(n) && n >= 1 ? n : 1
}

/**
 * All thirty, prerendered: thirteen cities and seventeen regions. Both sets
 * are constants in the repo, so there is nothing to gain from generating them
 * on demand, and a crawler hitting a cold city page is exactly the case worth
 * having warm.
 */
export function generateStaticParams() {
  return allCityPageSlugs().map((slug) => ({ slug }))
}

function nameOf(target: CityPageTarget): string {
  return target.kind === 'city' ? target.city.name : target.region.name
}

function slugOf(target: CityPageTarget): string {
  return target.kind === 'city' ? target.city.slug : target.region.slug
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const target = resolveCityPage(decodeURIComponent(slug))

  // The body calls notFound(), which emits noindex through app/not-found.tsx.
  // State it here too, so a crawler that only reads metadata never treats the
  // empty shell as an indexable page.
  if (!target) {
    return {
      title: 'עיר לא נמצאה',
      description: 'העיר או האזור לא נמצאו בקניון אקספרס.',
      robots: { index: false, follow: true },
    }
  }

  const name = nameOf(target)
  // The same page is reachable with `?page=`, and without a canonical each
  // page competes as its own URL.
  return publicPageMetadata({
    title: cityPageTitle(name),
    description: cityPageDescription(name),
    path: cityPageHref(slugOf(target)),
  })
}

export default async function CityPage({ params, searchParams }: Props) {
  const { slug } = await params
  const target = resolveCityPage(decodeURIComponent(slug))
  if (!target) notFound()

  const name = nameOf(target)
  const path = cityPageHref(slugOf(target))
  const region = target.region
  const deals = await loadCityDealsCached(citySlugsOf(target))

  // City -> region -> home, so a crawler reads the geography the way the
  // visitor climbs it. A city outside every region, or a region page, has the
  // two-step trail.
  const trail = [{ name: 'בית', path: '/' }]
  if (target.kind === 'city' && target.region) {
    trail.push({ name: target.region.name, path: cityPageHref(target.region.slug) })
  }
  trail.push({ name, path })
  const breadcrumbLd = buildBreadcrumbJsonLd(trail, SITE_URL)

  // The city as a place, with its municipal coordinate: public geographic fact
  // from geo/cities.ts, rounded to about 11 m there. A region has no single
  // point, so a region page publishes the breadcrumb alone.
  const placeLd: JsonLdNode | null =
    target.kind === 'city'
      ? {
          '@context': 'https://schema.org',
          '@type': 'Place',
          name: target.city.name,
          url: `${SITE_URL.replace(/\/+$/, '')}${path}`,
          address: {
            '@type': 'PostalAddress',
            addressLocality: target.city.name,
            addressCountry: 'IL',
          },
          geo: {
            '@type': 'GeoCoordinates',
            latitude: target.city.lat,
            longitude: target.city.lng,
          },
        }
      : null

  return (
    <div dir="rtl" className="category-page mx-auto max-w-page px-gutter py-8">
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD has no other insertion point, and jsonLdScript escapes every angle bracket.
        dangerouslySetInnerHTML={{
          __html: jsonLdScript(placeLd ? [breadcrumbLd, placeLd] : breadcrumbLd),
        }}
      />

      <nav aria-label="מסלול ניווט" className="mb-4 text-sm text-muted">
        {trail.map((crumb, index) => {
          const last = index === trail.length - 1
          return (
            <span key={crumb.path}>
              {index > 0 ? (
                <span className="px-2" aria-hidden="true">
                  /
                </span>
              ) : null}
              {last ? (
                <span className="text-heading">{crumb.name}</span>
              ) : (
                <Link href={crumb.path} className="hover:underline">
                  {crumb.name}
                </Link>
              )}
            </span>
          )
        })}
      </nav>

      <header className="mb-6 max-w-3xl">
        <h1 className="mb-2 text-2xl font-bold text-heading">{cityPageTitle(name)}</h1>
        <p className="text-base leading-relaxed text-muted">
          {target.kind === 'city' ? (
            <>
              כל הקופונים והמבצעים של בתי עסק ב{name} במקום אחד: מסעדות, ספא, בילויים וקניות ב{name}{' '}
              במחיר מוזל. קונים כאן, מגיעים לבית העסק עם השובר, והוא נסרק פעם אחת בקופה.
              {region ? (
                <>
                  {' '}
                  {name} היא חלק מאזור{' '}
                  <Link href={cityPageHref(region.slug)} className="underline hover:text-heading">
                    {region.name}
                  </Link>
                  .
                </>
              ) : null}
            </>
          ) : (
            <>
              כל הקופונים והמבצעים של בתי עסק באזור {name}, לפי יישוב. בחרו יישוב כדי לראות את
              הדילים שלו, או גללו לכל הדילים באזור.
            </>
          )}
        </p>
      </header>

      <CityChips target={target} deals={deals} />

      <Suspense fallback={<CategoryGridSkeleton count={CITY_PAGE_SIZE} />}>
        <CityDealGrid target={target} name={name} path={path} searchParams={searchParams} />
      </Suspense>

      <div className="mt-10 flex flex-wrap gap-3">
        <Link
          href="/products"
          className="inline-flex min-h-touch-min items-center rounded-md bg-brand px-5 py-2 text-sm font-bold text-primary-foreground transition-opacity hover:opacity-90"
        >
          לכל הדילים
        </Link>
        <Link
          href="/merchants"
          className="inline-flex min-h-touch-min items-center rounded-md border border-border px-5 py-2 text-sm text-heading transition-colors hover:bg-surface-hover"
        >
          כל בתי העסק
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

const CHIP =
  'inline-flex min-h-touch-min items-center gap-1 rounded-md border border-border px-3 py-1.5 text-sm text-heading transition-colors hover:bg-surface-hover'

/**
 * The rows above the grid. On a region page: its cities, each with a count,
 * each a link to the city page. On a city page: the merchants with a deal here
 * (into `/s/[id]`), the categories those deals sit in (into the archive), and
 * the other cities of the same region, so a visitor who picked the wrong city
 * is one tap from the right one and every city page links its neighbours.
 */
function CityChips({ target, deals }: { target: CityPageTarget; deals: CityDeals }) {
  if (target.kind === 'region') {
    if (target.cities.length === 0) return null
    return (
      <section className="mb-6" aria-labelledby="city-chips-cities">
        <h2 id="city-chips-cities" className="mb-2 text-sm font-semibold text-heading">
          יישובים באזור
        </h2>
        <ul className="flex flex-wrap gap-2">
          {target.cities.map((city) => (
            <li key={city.slug}>
              <Link href={cityPageHref(city.slug)} className={CHIP}>
                <MapPin size={14} aria-hidden="true" />
                {city.name}
                <span className="text-muted">
                  · {dealCountLabel(deals.perCity[city.slug] ?? 0)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    )
  }

  const neighbours = (target.region?.cities ?? [])
    .filter((slug) => slug !== target.city.slug)
    .map((slug) => ({ slug }))

  return (
    <>
      {deals.merchants.length > 0 ? (
        <section className="mb-4" aria-labelledby="city-chips-merchants">
          <h2 id="city-chips-merchants" className="mb-2 text-sm font-semibold text-heading">
            בתי עסק ב{target.city.name}
          </h2>
          <ul className="flex flex-wrap gap-2">
            {deals.merchants.map((merchant) => (
              <li key={merchant.id}>
                <Link href={`/s/${merchant.id}`} className={CHIP}>
                  <Store size={14} aria-hidden="true" />
                  {merchant.name}
                  <span className="text-muted">· {dealCountLabel(merchant.dealCount)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {deals.categories.length > 0 ? (
        <section className="mb-4" aria-labelledby="city-chips-categories">
          <h2 id="city-chips-categories" className="mb-2 text-sm font-semibold text-heading">
            תחומים ב{target.city.name}
          </h2>
          <ul className="flex flex-wrap gap-2">
            {deals.categories.map((category) => (
              <li key={category.slug}>
                <Link href={`/category/${encodeURIComponent(category.slug)}`} className={CHIP}>
                  <Tag size={14} aria-hidden="true" />
                  {category.name_he}
                  <span className="text-muted">· {dealCountLabel(category.dealCount)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {neighbours.length > 0 ? (
        <section className="mb-6" aria-labelledby="city-chips-neighbours">
          <h2 id="city-chips-neighbours" className="mb-2 text-sm font-semibold text-heading">
            ערים סמוכות
          </h2>
          <ul className="flex flex-wrap gap-2">
            {neighbours.map(({ slug }) => (
              <li key={slug}>
                <NeighbourChip slug={slug} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  )
}

function NeighbourChip({ slug }: { slug: string }) {
  const target = resolveCityPage(slug)
  if (!target || target.kind !== 'city') return null
  return (
    <Link href={cityPageHref(slug)} className={CHIP}>
      <MapPin size={14} aria-hidden="true" />
      {target.city.name}
    </Link>
  )
}

async function CityDealGrid({
  target,
  name,
  path,
  searchParams,
}: {
  target: CityPageTarget
  name: string
  path: string
  searchParams: Promise<{ page?: string | string[] }>
}) {
  const raw = await searchParams
  const page = parsePage(raw.page)
  const { deals } = await loadCityDealsCached(citySlugsOf(target))
  const { items, currentPage, totalPages, from, to } = pageOfDeals(deals, page)

  // Name and URL per deal, numbered from where this page starts in the whole
  // list: the product page's own `Product` node holds the price, and two copies
  // drift. Empty in, null out, and the empty state says so in words.
  const itemListLd = buildItemListJsonLd({
    name: cityPageTitle(name),
    path,
    entries: items.map((deal) => ({ name: deal.name_he, path: `/product/${deal.slug}` })),
    startPosition: from,
    siteUrl: SITE_URL,
  })

  if (deals.length === 0) {
    return (
      <section className="max-w-3xl" data-testid="city-empty">
        <p className="text-base text-muted">
          עדיין אין דילים ב{name}. אפשר לראות את כל הדילים באתר, ואם יש לכם עסק ב{name}, נשמח
          שתצטרפו ותהיו הראשונים כאן.
        </p>
      </section>
    )
  }

  return (
    <>
      {itemListLd ? (
        <script
          type="application/ld+json"
          // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD has no other insertion point, and jsonLdScript escapes every angle bracket.
          dangerouslySetInnerHTML={{ __html: jsonLdScript(itemListLd) }}
        />
      ) : null}

      <p className="mb-4 text-sm text-muted">
        {deals.length === 1
          ? 'מציג תוצאה יחידה'
          : to - from + 1 >= deals.length
            ? `מציגים את כל ⁦${deals.length}⁩ התוצאות`
            : `מציג ${from}–${to} מתוך ${deals.length} תוצאות`}
      </p>

      <ul
        className="category-grid grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4"
        data-testid="city-deals"
      >
        {items.map((deal, index) => {
          // Same contract as the category page: see ABOVE_FOLD_CARD_COUNT.
          const asset = blurEntryFor(firstImageOf(deal.images))
          return (
            <li key={deal.id}>
              <CategoryProductCard
                product={deal}
                priority={index === 0}
                eager={index < ABOVE_FOLD_CARD_COUNT}
                blurDataURL={asset?.blur}
                dimensions={asset ? { w: asset.w, h: asset.h } : undefined}
              />
            </li>
          )
        })}
      </ul>

      {totalPages > 1 ? (
        <Pagination pathname={path} params={{}} currentPage={currentPage} totalPages={totalPages} />
      ) : null}
    </>
  )
}
