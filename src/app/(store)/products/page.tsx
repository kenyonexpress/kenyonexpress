import CatalogGrid from '@/components/category/CatalogGrid'
import { CatalogViewBody, CatalogViewProvider } from '@/components/category/CatalogViewProvider'
import CategoryActiveFilters from '@/components/category/CategoryActiveFilters'
import CategoryBreadcrumb, { defaultHomeCrumb } from '@/components/category/CategoryBreadcrumb'
import CategoryControlBar from '@/components/category/CategoryControlBar'
import CategoryFilterSidebar from '@/components/category/CategoryFilterSidebar'
import CategoryGridSkeleton from '@/components/category/CategoryGridSkeleton'
import CategoryProductCard, {
  type CategoryProduct,
} from '@/components/category/CategoryProductCard'
import Pagination from '@/components/category/Pagination'
import { ABOVE_FOLD_CARD_COUNT } from '@/components/category/above-fold'
import { pageWindow, parsePage, parsePrice, resultCountText } from '@/lib/catalog-archive'
import { activeFilterCount } from '@/lib/category-filters'
import {
  type ProductTypeFilter,
  SHOP_PAGE_SIZE,
  getAllCategories,
  getShopProductsCached,
  parseProductType,
} from '@/lib/category-page'
import { type SortValue, parseSort } from '@/lib/category-tokens'
import { blurEntryFor, firstImageOf } from '@/lib/images/blur'
import { attachPriceHistory } from '@/lib/pricing/price-history-read'
import { publicPageMetadata } from '@/lib/seo/page-metadata'
import { Suspense } from 'react'
import '@/styles/category-page.css'

/* Live equivalent: kenyonexpress.co.il/shop/ - h1 "חנות", 24 per page */
const PAGE_TITLE = 'חנות'

// Canonical on the bare path: sort, page, price and type are query strings on
// the same archive, and without it each filtered view competes as its own page.
export const metadata = publicPageMetadata({
  title: PAGE_TITLE,
  description: 'כל המוצרים, הדילים והקופונים של קניון Express במקום אחד.',
  path: '/products',
})

type Props = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

type QueryArgs = {
  sort: SortValue
  page: number
  priceMin?: number
  priceMax?: number
  productType?: ProductTypeFilter
}

/**
 * Everything this page reads out of the URL, in one place.
 *
 * Takes the PROMISE, not the resolved object. `searchParams` is request-time
 * data, and awaiting it in the page body puts the whole route behind it: under
 * `cacheComponents` that is the "Uncached data was accessed outside of
 * <Suspense>" build error, and before the flag it was one more reason every
 * storefront response was `no-store`. Handing the promise to the components
 * that actually need it keeps the breadcrumb, the heading and the page frame in
 * the static shell. React dedupes it, so the four callers below are one await.
 */
async function shopArgs(searchParams: Props['searchParams']) {
  const sp = await searchParams
  const sort = parseSort(sp.sort)
  const args: QueryArgs = {
    sort,
    page: parsePage(sp.page),
    priceMin: parsePrice(sp.min),
    priceMax: parsePrice(sp.max),
    productType: parseProductType(sp.type),
  }
  const linkParams = {
    sort: sort === 'menu_order' ? undefined : sort,
    min: args.priceMin != null ? String(args.priceMin) : undefined,
    max: args.priceMax != null ? String(args.priceMax) : undefined,
    type: args.productType,
  }
  return { args, linkParams }
}

/**
 * A PAGE PAST THE END IS NOT AN EMPTY FILTER, AND IT USED TO SAY IT WAS.
 *
 * `?page=9999` offsets past the last row. The grid came back empty and printed
 * "nothing matches your selection", blaming filters the shopper never set, and
 * the header printed nothing at all.
 *
 * The header printing nothing is the tell, and it is why the obvious clamp does
 * not work: PostgREST answers an out-of-range `range()` with no rows AND NO
 * COUNT, so `total` comes back 0 and cannot tell "past the end" from "nothing
 * matched". A second read of page 1 is what recovers the real total, and it
 * only ever runs on a page that already had nothing to show.
 *
 * Both boundaries call this rather than the query, so the count and the grid
 * agree about which page they are describing. `cache` makes the repeat a
 * pointer copy within the request.
 */
async function shopPageOrLast(args: QueryArgs) {
  const first = await getShopProductsCached(args)
  if (first.items.length > 0 || args.page <= 1) return first

  const head = await getShopProductsCached({ ...args, page: 1 })
  if (head.total === 0) return first

  const lastPage = Math.max(1, Math.ceil(head.total / SHOP_PAGE_SIZE))
  return lastPage === 1 ? head : getShopProductsCached({ ...args, page: lastPage })
}

/** Header count. Shares one query with the grid via getShopProductsCached. */
async function ResultCount({ args }: { args: QueryArgs }) {
  const { total } = await shopPageOrLast(args)
  if (total === 0) return null
  const { from, to } = pageWindow(total, args.page, SHOP_PAGE_SIZE)
  return <p className="category-page__count">{resultCountText(total, from, to)}</p>
}

async function ResultGrid({
  args,
  linkParams,
}: {
  args: QueryArgs
  linkParams: Record<string, string | undefined>
}) {
  const { items: page, total } = await shopPageOrLast(args)

  if (page.length === 0) {
    return (
      <div className="category-page__empty">
        <p>לא נמצאו מוצרים התואמים את הבחירה שלך.</p>
      </div>
    )
  }

  // The history marks (STEP 59): one cached read for the grid.
  const items = await attachPriceHistory(page)
  const { totalPages, currentPage, from, to } = pageWindow(total, args.page, SHOP_PAGE_SIZE)

  return (
    <>
      {/* See the same note on the category page: the server renders this
          page's cards and the numbered pages, CatalogGrid (UX22) appends the
          next pages inside the same <ul> in continuous mode. */}
      <CatalogGrid
        page={currentPage}
        totalPages={totalPages}
        total={total}
        pageSize={SHOP_PAGE_SIZE}
        from={from}
        to={to}
        pagination={
          <Pagination
            pathname="/products"
            params={linkParams}
            currentPage={currentPage}
            totalPages={totalPages}
          />
        }
      >
        {items.map((product, index) => {
          // Same contract as the category page: see ABOVE_FOLD_CARD_COUNT.
          const asset = blurEntryFor(firstImageOf(product.images))
          return (
            <li key={product.id} className="category-products__item">
              <CategoryProductCard
                product={product as CategoryProduct}
                priority={index === 0}
                eager={index < ABOVE_FOLD_CARD_COUNT}
                blurDataURL={asset?.blur}
                dimensions={asset ? { w: asset.w, h: asset.h } : undefined}
              />
            </li>
          )
        })}
      </CatalogGrid>
    </>
  )
}

async function ShopResultCount({ searchParams }: Props) {
  const { args } = await shopArgs(searchParams)
  return <ResultCount args={args} />
}

async function ShopControlBar({ searchParams }: Props) {
  const { args, linkParams } = await shopArgs(searchParams)
  return <CategoryControlBar value={args.sort} activeFilterCount={activeFilterCount(linkParams)} />
}

/** The active-filter strip (UX14). Null on the bare archive, so nothing moves there. */
async function ShopActiveFilters({ searchParams }: Props) {
  const { linkParams } = await shopArgs(searchParams)
  return <CategoryActiveFilters pathname="/products" params={linkParams} />
}

async function ShopGrid({ searchParams }: Props) {
  const { args, linkParams } = await shopArgs(searchParams)
  return <ResultGrid args={args} linkParams={linkParams} />
}

async function ShopSidebar({ searchParams }: Props) {
  const [{ args, linkParams }, allCategories] = await Promise.all([
    shopArgs(searchParams),
    getAllCategories(),
  ])
  return (
    <CategoryFilterSidebar
      categories={allCategories}
      priceMin={args.priceMin}
      priceMax={args.priceMax}
      productType={args.productType}
      activeCount={activeFilterCount(linkParams)}
    />
  )
}

export default function ProductsPage({ searchParams }: Props) {
  return (
    <div className="category-page">
      <div className="category-page__inner">
        <CategoryBreadcrumb items={[defaultHomeCrumb(), { label: PAGE_TITLE }]} />

        {/* Live /shop/ carries this section between the breadcrumb and the H1.
            Its carousel renders no items on live, so the section is the heading
            rule alone. Without it every landmark below sits ~62px too high.

            Live prints the heading in English ("Recommended Products") because
            it runs the Electro theme untranslated. The STRUCTURE is what live
            sources here -- the section, its rule and its 62px -- and the string
            is Hebrew, like every other string a customer reads. */}
        <div className="shop-carousel-head">
          <h2 className="shop-carousel-head__title">מוצרים מומלצים</h2>
        </div>

        <header className="category-page__header">
          <h1 className="category-page__title">{PAGE_TITLE}</h1>
          {/* The count's box, held open while it streams - the same reason the
              control bar below keeps its own empty shell. */}
          <Suspense
            fallback={
              <div className="category-page__count category-page__count--pending" aria-hidden />
            }
          >
            <ShopResultCount searchParams={searchParams} />
          </Suspense>
        </header>

        {/* The bar itself cannot be the fallback: it is a client component that
            calls `useSearchParams`, which is request data, and a fallback has to
            be prerenderable. So the shell holds the bar's BOX - same class, so
            the same measured 45.89px min-height, radius and `--cat-bar` fill -
            and the controls land in it. Rendering `<CategoryControlBar>` here
            instead type-checks and then fails the build. */}
        {/* The grid / list preference (UX14) is one client context around the
            bar that sets it, the body that carries it as `data-view`, and the
            cards that read it. Server children pass through untouched. */}
        <CatalogViewProvider>
          <Suspense fallback={<div className="category-control-bar" aria-hidden="true" />}>
            <ShopControlBar searchParams={searchParams} />
          </Suspense>

          {/* No fallback: the strip has no height on the bare archive and
              streams in only when a facet is set. */}
          <Suspense fallback={null}>
            <ShopActiveFilters searchParams={searchParams} />
          </Suspense>

          <CatalogViewBody>
            <div className="category-page__main">
              <Suspense fallback={<CategoryGridSkeleton count={SHOP_PAGE_SIZE} />}>
                <ShopGrid searchParams={searchParams} />
              </Suspense>
            </div>

            <Suspense fallback={<div className="category-sidebar" aria-hidden="true" />}>
              <ShopSidebar searchParams={searchParams} />
            </Suspense>
          </CatalogViewBody>
        </CatalogViewProvider>
      </div>
    </div>
  )
}
