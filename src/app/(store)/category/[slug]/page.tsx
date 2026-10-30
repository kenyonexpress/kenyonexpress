import CategoryFilterChips from '@/components/CategoryFilterChips'
import ViewTracker from '@/components/analytics/ViewTracker'
import CategoryBreadcrumb, { defaultHomeCrumb } from '@/components/category/CategoryBreadcrumb'
import CategoryControlBar from '@/components/category/CategoryControlBar'
import CategoryFilterSidebar from '@/components/category/CategoryFilterSidebar'
import CategoryFilteredGrid from '@/components/category/CategoryFilteredGrid'
import CategoryGridSkeleton from '@/components/category/CategoryGridSkeleton'
import CategoryHeroBanner from '@/components/category/CategoryHeroBanner'
import type { CategoryProduct } from '@/components/category/CategoryProductCard'
import {
  CATEGORY_PAGE_SIZE,
  CATEGORY_SKELETON_CARDS,
  type CollectionRule,
  type ProductTypeFilter,
  categoryMetaDescription,
  collectionRule,
  getAllCategorySlugs,
  getCategoryBySlug,
  getCategoryParent,
  getCategoryPriceBounds,
  getCategoryProductsCached,
  getCategorySuppliersFilter,
  getCategoryTagsFilter,
  parseProductType,
} from '@/lib/category-page'
import { type SortValue, parseSort } from '@/lib/category-tokens'
import { buildBreadcrumbJsonLd, jsonLdScript } from '@/lib/seo/json-ld'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import '@/styles/category-page.css'
import { alternatesFor } from '@/lib/seo/alternates'

type Props = {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

function parsePage(raw: string | string[] | undefined): number {
  const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : 1
  return Number.isFinite(n) && n >= 1 ? n : 1
}

function parsePrice(raw: string | string[] | undefined): number | undefined {
  if (typeof raw !== 'string') return undefined
  const n = Number.parseFloat(raw)
  return Number.isFinite(n) && n >= 0 ? n : undefined
}

/**
 * Reads through `getCategoryBySlug`, NOT a fresh `createClient()`.
 *
 * It used to run its own `categories` query on the request-scoped client, and
 * that single line was the whole of this route's per-request cost: measured on
 * a clean build, TTFB is 4ms and the full response was 273-327ms, against a
 * warm keep-alive round trip to this Supabase project of 266-313ms. One query,
 * not the PPR hole. `getCategoryBySlug` is `use cache` and already selects
 * these exact two columns behind the same `is_active` filter, so this is the
 * same answer off the same cache entry the body below reads.
 */
export async function generateMetadata({ params, searchParams: spPromise }: Props) {
  const { slug } = await params
  const sp = await spPromise
  const category = await getCategoryBySlug(slug)

  // A slug nobody has: the body calls notFound(), which emits noindex through
  // app/not-found.tsx. State it here too, so a crawler that only reads metadata
  // never treats the empty shell as an indexable page.
  if (!category) {
    return {
      title: 'קטגוריה לא נמצאה',
      description: 'הקטגוריה לא נמצאה או שאינה פעילה בקניון EXPRESS.',
      robots: { index: false, follow: true },
    }
  }

  // Almost no category row carries description_he -- /category/hot-deals, the
  // one linked from the home page, is one of them -- and `undefined` here meant
  // the page shipped with no <meta name="description"> at all. Lighthouse SEO
  // scored it 92 against 100 for every page that has one. Same fallback shape
  // as the PDP in lib/product-seo.ts: a short Hebrew line built from the name
  // the page already shows, rather than invented marketing copy.
  const description = category.description_he?.trim() || categoryMetaDescription(category.name_he)

  // Fetch product count for og:title to match H1 format: "N מבצעים זמינים"
  const sort = parseSort(sp.sort)
  const page = parsePage(sp.page)
  const priceMin = parsePrice(sp.min)
  const priceMax = parsePrice(sp.max)
  const productType = parseProductType(sp.type)
  const supplierId = typeof sp.supplier === 'string' ? sp.supplier : undefined
  const tag = typeof sp.tag === 'string' ? sp.tag : undefined

  const args: QueryArgs = {
    categoryId: category.id,
    category: { name_he: category.name_he, slug: category.slug },
    sort,
    page,
    priceMin,
    priceMax,
    productType,
    supplierId,
    tag,
    collection: collectionRule(category.slug),
  }

  const { total } = await getCategoryProductsCached(args)
  const ogTitle = total > 0 ? `${total} מבצעים זמינים` : category.name_he

  return {
    title: category.name_he,
    description,
    alternates: alternatesFor(`/category/${encodeURIComponent(category.slug)}`),
    openGraph: {
      title: ogTitle,
      description,
      url: `/category/${encodeURIComponent(category.slug)}`,
      type: 'website',
      locale: 'he_IL',
    },
  }
}

/**
 * The 12 active categories, prerendered.
 *
 * Uncapped on purpose, unlike the product page's 200: this table is the site's
 * navigation, it is twelve rows, and it does not grow with the catalogue. The
 * helper has existed in `category-page.ts` since that file was written and had
 * no caller.
 */
export async function generateStaticParams() {
  const slugs = await getAllCategorySlugs()
  return slugs.map((slug) => ({ slug }))
}

type QueryArgs = {
  categoryId: string
  category: { name_he: string; slug: string }
  sort: SortValue
  page: number
  priceMin?: number
  priceMax?: number
  productType?: ProductTypeFilter
  city?: string
  supplierId?: string
  tag?: string
  /** The collection rule for this slug, if it is one of the three. */
  collection?: CollectionRule
}

function cacheableArgs(args: QueryArgs) {
  return args
}

function pageWindow(total: number, page: number) {
  const totalPages = Math.max(1, Math.ceil(total / CATEGORY_PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const from = (currentPage - 1) * CATEGORY_PAGE_SIZE + 1
  const to = Math.min(currentPage * CATEGORY_PAGE_SIZE, total)
  return { totalPages, currentPage, from, to }
}

/**
 * A page past the end is not an empty filter. Same helper as /products, for the
 * same reason: PostgREST answers an out-of-range `range()` with no rows AND no
 * count, so `total` comes back 0 and cannot tell "past the end" from "nothing
 * matched". The second read of page 1 only runs on a page that already had
 * nothing to show, and both boundaries call this so they describe one page.
 */
async function categoryPageOrLast(args: QueryArgs) {
  const first = await getCategoryProductsCached(cacheableArgs(args))
  if (first.items.length > 0 || args.page <= 1) return first

  const head = await getCategoryProductsCached(cacheableArgs({ ...args, page: 1 }))
  if (head.total === 0) return first

  const lastPage = Math.max(1, Math.ceil(head.total / CATEGORY_PAGE_SIZE))
  return lastPage === 1
    ? head
    : getCategoryProductsCached(cacheableArgs({ ...args, page: lastPage }))
}

/** Header count for H1 - returns just the total in "N מבצעים זמינים" format */
async function ResultCountText({ args }: { args: QueryArgs }) {
  const { total } = await categoryPageOrLast(args)
  if (total === 0) return null
  return <>{total} מבצעים זמינים</>
}

async function ResultGrid({
  args,
  linkParams,
  usePagination,
}: {
  args: QueryArgs
  linkParams: Record<string, string | undefined>
  usePagination?: boolean
}) {
  const { items, total } = await categoryPageOrLast(args)

  if (items.length === 0) {
    return (
      <div className="category-page__empty">
        <p>לא נמצאו מוצרים התואמים את הבחירה שלך.</p>
      </div>
    )
  }

  const { totalPages, currentPage } = pageWindow(total, args.page)

  return (
    <>
      <CategoryFilteredGrid
        items={items as CategoryProduct[]}
        total={total}
        currentPage={currentPage}
        totalPages={totalPages}
        pageSize={CATEGORY_PAGE_SIZE}
        categorySlug={args.category.slug}
        params={linkParams}
        usePagination={usePagination}
      />
    </>
  )
}

/**
 * The static shell of a category page.
 *
 * Unlike /products, there is no part of this route that is knowable without the
 * URL: the breadcrumb, the H1 and the sidebar's current-category marker all
 * come out of `params.slug`. So the shell is the page's FRAME at its real
 * dimensions - the same wrappers, the same grid skeleton the body already used
 * - and the whole body streams into it.
 *
 * `category-page__title--pending` holds one line of H1 so the grid does not
 * start high and drop.
 *
 * The `use cache` half of that note is DONE: every read below now goes through
 * `lib/category-page.ts` on `createPublicClient`, and `generateMetadata` was
 * the last cookie-bound query on the route. The response still carries
 * `x-nextjs-postponed`, and it has to -- `CategoryPageBody` awaits
 * `searchParams` for sort, page and the price filter, which is per-request by
 * definition. What changed is what the hole COSTS: the full response went from
 * 273-327ms to 6-14ms, because the hole no longer contains a round trip.
 * Locked by `lib/catalogue-render-path.test.ts`.
 */
function CategoryPageFallback() {
  return (
    <div className="category-page">
      <div className="category-page__inner">
        <CategoryBreadcrumb items={[defaultHomeCrumb()]} />
        <header className="category-page__header">
          {/* A div, not an empty <h1>. The heading's text is the category name
              and the category name is the URL, so there is nothing to put in it
              yet - and a document that briefly carries a heading with no
              accessible name is worse for a screen reader than one that briefly
              carries no heading. Same classes, so the same line box. */}
          <div className="category-page__title category-page__title--pending" aria-hidden="true" />
        </header>
        {/* The bar's box, not the bar: `CategoryControlBar` calls
            `useSearchParams`, and a prerendered fallback cannot read the
            request. Same class, so the same measured 45.89px. */}
        <div className="category-control-bar" aria-hidden="true" />
        <div className="category-page__body">
          <div className="category-page__main">
            <CategoryGridSkeleton count={CATEGORY_SKELETON_CARDS} />
          </div>
          <div className="category-sidebar" aria-hidden="true" />
        </div>
      </div>
    </div>
  )
}

/**
 * THE SLUG LOOKUP SITS OUTSIDE THE BOUNDARY SO THAT A DEAD SLUG CAN STILL 404.
 *
 * It used to live in `CategoryPageBody`, inside the `<Suspense>`, and the cost
 * of that was measured, not theorised: `/category/no-such-slug` answered
 * **`200 OK`** with `x-nextjs-postponed: 1`. The shell had already been
 * committed to the wire by the time `notFound()` ran, so the status line could
 * not be changed and the not-found page was served under a success code - a
 * soft 404 on an infinite family of crawlable URLs.
 *
 * Hoisting it costs nothing, and that is the part that is not obvious. The
 * twelve real slugs come from `generateStaticParams`, so `params` resolves at
 * BUILD time and `getCategoryBySlug` is `use cache`: the outer component still
 * finishes during the prerender and the shell below is still postponed on
 * `searchParams` alone. Measured after the change: a real category keeps
 * `x-nextjs-postponed: 1`, and an unknown slug answers `404`.
 *
 * `/product/[slug]` reached the same place from the other direction - see the
 * note above `ProductPage` - which is why the two routes now behave alike.
 */
export default async function CategoryPage(props: Props) {
  const { slug } = await props.params
  const category = await getCategoryBySlug(slug)
  if (!category) notFound()

  return (
    <Suspense fallback={<CategoryPageFallback />}>
      <CategoryPageBody {...props} category={category} />
    </Suspense>
  )
}

async function CategoryPageBody({
  searchParams,
  category,
}: Omit<Props, 'params'> & {
  category: NonNullable<Awaited<ReturnType<typeof getCategoryBySlug>>>
}) {
  const sp = await searchParams
  const sort = parseSort(sp.sort)
  const page = parsePage(sp.page)
  const priceMin = parsePrice(sp.min)
  const priceMax = parsePrice(sp.max)
  const productType = parseProductType(sp.type)
  const supplierId = typeof sp.supplier === 'string' ? sp.supplier : undefined
  const tag = typeof sp.tag === 'string' ? sp.tag : undefined
  const usePagination = sp.paginate === '1'

  // Cheap shell data only. The product query is deferred to the boundaries
  // below so the breadcrumb, title, control bar and sidebar can stream first.
  const [parent, suppliers, tags, priceBounds] = await Promise.all([
    category.parent_id ? getCategoryParent(category.parent_id) : Promise.resolve(null),
    getCategorySuppliersFilter(category.id),
    getCategoryTagsFilter(category.id),
    getCategoryPriceBounds(category.id),
  ])

  const args: QueryArgs = {
    categoryId: category.id,
    category: { name_he: category.name_he, slug: category.slug },
    sort,
    page,
    priceMin,
    priceMax,
    productType,
    supplierId,
    tag,
    collection: collectionRule(category.slug),
  }

  const pathname = `/category/${category.slug}`
  const linkParams = {
    sort: sort === 'menu_order' ? undefined : sort,
    min: priceMin != null ? String(priceMin) : undefined,
    max: priceMax != null ? String(priceMax) : undefined,
    type: productType,
    supplier: supplierId,
    tag,
  }

  const crumbs = [
    defaultHomeCrumb(),
    ...(parent ? [{ label: parent.name_he, href: `/category/${parent.slug}` }] : []),
    { label: category.name_he },
  ]

  // The same trail the visible breadcrumb renders, as BreadcrumbList: the two
  // are built from one `crumbs` array so they cannot disagree.
  const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://www.kenyonexpress.co.il'
  const breadcrumbLd = buildBreadcrumbJsonLd(
    [
      { name: 'בית', path: '/' },
      ...(parent ? [{ name: parent.name_he, path: `/category/${parent.slug}` }] : []),
      { name: category.name_he, path: pathname },
    ],
    siteUrl,
  )

  // ItemList schema for product grid
  const itemListLd = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: category.name_he,
    url: `${siteUrl}${pathname}`,
  }

  return (
    <div className="category-page">
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD has no other insertion point, and jsonLdScript escapes every angle bracket.
        dangerouslySetInnerHTML={{ __html: jsonLdScript(breadcrumbLd) }}
      />
      <script
        type="application/ld+json"
        // biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD has no other insertion point, and jsonLdScript escapes every angle bracket.
        dangerouslySetInnerHTML={{ __html: jsonLdScript(itemListLd) }}
      />
      <ViewTracker event="view_category" props={{ category_id: category.id }} />
      <div className="category-page__inner">
        <CategoryBreadcrumb items={crumbs} />
        <CategoryHeroBanner imageUrl={category.image_url} categoryName={category.name_he} />

        <header className="category-page__header">
          <h1 className="category-page__title">
            {category.name_he}
            <span className="category-page__title-count">
              <Suspense fallback=" ...">
                <ResultCountText args={args} />
              </Suspense>
            </span>
          </h1>
        </header>

        <CategoryControlBar value={sort} />

        <Suspense fallback={null}>
          <CategoryFilterChips />
        </Suspense>

        <div className="category-page__body">
          <div className="category-page__main">
            <Suspense fallback={<CategoryGridSkeleton count={CATEGORY_PAGE_SIZE} />}>
              <ResultGrid args={args} linkParams={linkParams} usePagination={usePagination} />
            </Suspense>
          </div>

          <CategoryFilterSidebar
            priceMin={priceMin}
            priceMax={priceMax}
            categoryMinPrice={priceBounds.minPrice}
            categoryMaxPrice={priceBounds.maxPrice}
            productType={productType}
            suppliers={suppliers}
            tags={tags}
            categoryId={category.id}
            categorySlug={category.slug}
            categoryName={category.name_he}
          />
        </div>
      </div>
    </div>
  )
}
