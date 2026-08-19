import ViewTracker from '@/components/analytics/ViewTracker'
import CategoryBreadcrumb, { defaultHomeCrumb } from '@/components/category/CategoryBreadcrumb'
import CategoryControlBar from '@/components/category/CategoryControlBar'
import CategoryFilterSidebar from '@/components/category/CategoryFilterSidebar'
import CategoryGridSkeleton from '@/components/category/CategoryGridSkeleton'
import CategoryProductCard, {
  type CategoryProduct,
} from '@/components/category/CategoryProductCard'
import Pagination from '@/components/category/Pagination'
import CityTags from '@/components/geo/CityTags'
import {
  CATEGORY_PAGE_SIZE,
  type CollectionRule,
  type ProductTypeFilter,
  collectionRule,
  getAllCategories,
  getAllCategorySlugs,
  getCategoryBySlug,
  getCategoryParent,
  getCategoryProductsCached,
  parseCity,
  parseProductType,
} from '@/lib/category-page'
import { type SortValue, parseSort } from '@/lib/category-tokens'
import { type Coordinates, parseNear, sortByDistance } from '@/lib/geo/distance'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import '@/styles/category-page.css'

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

/* Live WooCommerce result-count wording */
function resultCountText(total: number, from: number, to: number): string {
  if (total === 1) return 'מציג תוצאה יחידה'
  if (to - from + 1 >= total) return `מציגים את כל ⁦${total}⁩ התוצאות`
  return `מציג ${from}–${to} מתוך ${total} תוצאות`
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
export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const category = await getCategoryBySlug(slug)
  return {
    title: category?.name_he ?? 'קטגוריה',
    description: category?.description_he ?? undefined,
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
  /**
   * Nearest-first origin. NOT part of the cached query key: the cache is keyed
   * by everything else and the distance sort is applied to the result, so two
   * customers standing in different places share one cached page instead of
   * minting a cache entry per coordinate.
   */
  near?: Coordinates | null
  /** The collection rule for this slug, if it is one of the three. */
  collection?: CollectionRule
}

/**
 * The cache key: everything except `near`.
 *
 * `near` is a per-customer coordinate. Letting it reach the cached read would
 * mint a separate cache entry for every distinct pair of coordinates on earth,
 * which is the same as having no cache at all. The distance sort is applied to
 * the cached result instead.
 */
function cacheableArgs(args: QueryArgs) {
  const { near: _near, ...rest } = args
  return rest
}

function pageWindow(total: number, page: number) {
  const totalPages = Math.max(1, Math.ceil(total / CATEGORY_PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const from = (currentPage - 1) * CATEGORY_PAGE_SIZE + 1
  const to = Math.min(currentPage * CATEGORY_PAGE_SIZE, total)
  return { totalPages, currentPage, from, to }
}

/** Header count. Shares one query with the grid via getCategoryProductsCached. */
async function ResultCount({ args }: { args: QueryArgs }) {
  const { total } = await getCategoryProductsCached(cacheableArgs(args))
  if (total === 0) return null
  const { from, to } = pageWindow(total, args.page)
  return <p className="category-page__count">{resultCountText(total, from, to)}</p>
}

async function ResultGrid({
  args,
  pathname,
  linkParams,
}: {
  args: QueryArgs
  pathname: string
  linkParams: Record<string, string | undefined>
}) {
  const { items, total } = await getCategoryProductsCached(cacheableArgs(args))

  // Nearest first, applied after the cached read. `sortByDistance` returns the
  // list unchanged when there is no origin, so the default page is untouched.
  const ordered = args.near ? sortByDistance(items, args.near) : items

  if (items.length === 0) {
    return (
      <div className="category-page__empty">
        <p>לא נמצאו מוצרים התואמים את הבחירה שלך.</p>
      </div>
    )
  }

  const { totalPages, currentPage, from, to } = pageWindow(total, args.page)

  return (
    <>
      <ul className="category-products">
        {ordered.map((product) => (
          <li key={product.id} className="category-products__item">
            <CategoryProductCard product={product as CategoryProduct} />
          </li>
        ))}
      </ul>
      <Pagination
        pathname={pathname}
        params={linkParams}
        currentPage={currentPage}
        totalPages={totalPages}
      />
      <p className="category-page__count category-page__count--bottom">
        {resultCountText(total, from, to)}
      </p>
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
            <CategoryGridSkeleton count={CATEGORY_PAGE_SIZE} />
          </div>
          <div className="category-sidebar" aria-hidden="true" />
        </div>
      </div>
    </div>
  )
}

export default function CategoryPage(props: Props) {
  return (
    <Suspense fallback={<CategoryPageFallback />}>
      <CategoryPageBody {...props} />
    </Suspense>
  )
}

async function CategoryPageBody({ params, searchParams }: Props) {
  const { slug } = await params
  const sp = await searchParams
  const sort = parseSort(sp.sort)
  const page = parsePage(sp.page)
  const priceMin = parsePrice(sp.min)
  const priceMax = parsePrice(sp.max)
  const productType = parseProductType(sp.type)
  const city = parseCity(sp.city)
  const near = parseNear(sp.near)

  const category = await getCategoryBySlug(slug)
  if (!category) notFound()

  // Cheap shell data only. The product query is deferred to the boundaries
  // below so the breadcrumb, title, control bar and sidebar can stream first.
  const [parent, allCategories] = await Promise.all([
    category.parent_id ? getCategoryParent(category.parent_id) : Promise.resolve(null),
    getAllCategories(),
  ])

  const args: QueryArgs = {
    categoryId: category.id,
    category: { name_he: category.name_he, slug: category.slug },
    sort,
    page,
    priceMin,
    priceMax,
    productType,
    city,
    near,
    // hot-deals / under-99 / new are collections, and nothing falls into a
    // collection on its own. Undefined for the nine taxonomies, which keep
    // matching on category_id alone.
    collection: collectionRule(category.slug),
  }

  const pathname = `/category/${category.slug}`
  const linkParams = {
    sort: sort === 'menu_order' ? undefined : sort,
    min: priceMin != null ? String(priceMin) : undefined,
    max: priceMax != null ? String(priceMax) : undefined,
    type: productType,
  }

  const crumbs = [
    defaultHomeCrumb(),
    ...(parent ? [{ label: parent.name_he, href: `/category/${parent.slug}` }] : []),
    { label: category.name_he },
  ]

  return (
    <div className="category-page">
      <ViewTracker event="view_category" props={{ category_id: category.id }} />
      <div className="category-page__inner">
        <CategoryBreadcrumb items={crumbs} />

        <header className="category-page__header">
          <h1 className="category-page__title">{category.name_he}</h1>
          {/* The count's box, held open while it streams. See the note on the
              same boundary in search/page.tsx: a null fallback inserts a line
              into the header on resolve and moves everything below it. */}
          <Suspense
            fallback={
              <div className="category-page__count category-page__count--pending" aria-hidden />
            }
          >
            <ResultCount args={args} />
          </Suspense>
        </header>

        <CategoryControlBar value={sort} />

        {/* The city picker. Same component as the row under the hero, so the
            two cannot drift apart in behaviour or in what "one city" means. */}
        <Suspense fallback={null}>
          <CityTags className="mt-3" />
        </Suspense>

        <div className="category-page__body">
          <div className="category-page__main">
            <Suspense fallback={<CategoryGridSkeleton count={CATEGORY_PAGE_SIZE} />}>
              <ResultGrid args={args} pathname={pathname} linkParams={linkParams} />
            </Suspense>
          </div>

          <CategoryFilterSidebar
            categories={allCategories}
            currentSlug={category.slug}
            priceMin={priceMin}
            priceMax={priceMax}
            productType={productType}
          />
        </div>
      </div>
    </div>
  )
}
