import DealChips from '@/components/catalog/DealChips'
import CategoryBreadcrumb, { defaultHomeCrumb } from '@/components/category/CategoryBreadcrumb'
import CategoryControlBar from '@/components/category/CategoryControlBar'
import CategoryFilterSidebar from '@/components/category/CategoryFilterSidebar'
import CategoryGridSkeleton from '@/components/category/CategoryGridSkeleton'
import type { CategoryProduct } from '@/components/category/CategoryProductCard'
import ShopGridWithInfiniteScroll from '@/components/shop/ShopGridWithInfiniteScroll'
import { parseDealChips } from '@/lib/catalog/deal-chips'
import {
  type ProductTypeFilter,
  SHOP_PAGE_SIZE,
  getShopProductsCached,
  parseProductType,
} from '@/lib/category-page'
import { type SortValue, parseSort } from '@/lib/category-tokens'
import { loadGalleryAssetsForProducts } from '@/lib/images/gallery-assets'
import { Suspense } from 'react'
import '@/styles/category-page.css'
import { alternatesFor } from '@/lib/seo/alternates'

/* Live equivalent: kenyonexpress.co.il/shop/ - h1 "חנות", 24 per page */
const PAGE_TITLE = 'חנות'

export const metadata = {
  title: PAGE_TITLE,
  description: 'כל המוצרים, הדילים והקופונים של קניון Express במקום אחד.',
  // Same reasoning as the category route, and this page had it missing. The
  // shop is reachable with sort, page and type query strings, and without a
  // canonical every permutation competes as its own page: `?sort=price&page=3`
  // and `?sort=new&page=3` are the same catalogue in a different order, not two
  // documents. Static rather than computed, because the canonical is `/products`
  // whatever the query says, which is the whole point of declaring it.
  alternates: alternatesFor('/products'),
}

type Props = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

type ViewMode = '4-col' | '3-col' | '2-col' | 'list'

function parsePrice(raw: string | string[] | undefined): number | undefined {
  if (typeof raw !== 'string') return undefined
  const n = Number.parseFloat(raw)
  return Number.isFinite(n) && n >= 0 ? n : undefined
}

function parseViewMode(raw: string | string[] | undefined): ViewMode {
  if (typeof raw === 'string' && ['3-col', '2-col', 'list'].includes(raw)) {
    return raw as ViewMode
  }
  return '4-col'
}

function resultCountText(total: number): string {
  if (total === 0) return 'לא נמצאו מוצרים'
  if (total === 1) return 'מציג תוצאה יחידה'
  return `מציגים ⁦${total}⁩ תוצאות`
}

type QueryArgs = {
  sort: SortValue
  priceMin?: number
  priceMax?: number
  productType?: ProductTypeFilter
  weekend?: boolean
  freeShipping?: boolean
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
  const viewMode = parseViewMode(sp.view)
  const args: QueryArgs = {
    sort,
    priceMin: parsePrice(sp.min),
    priceMax: parsePrice(sp.max),
    productType: parseProductType(sp.type),
    ...(() => {
      const chips = parseDealChips(sp)
      return { weekend: chips.weekend, freeShipping: chips.freeShipping }
    })(),
  }
  const linkParams = {
    sort: sort === 'menu_order' ? undefined : sort,
    min: args.priceMin != null ? String(args.priceMin) : undefined,
    max: args.priceMax != null ? String(args.priceMax) : undefined,
    type: args.productType,
    weekend: args.weekend ? '1' : undefined,
    free_shipping: args.freeShipping ? '1' : undefined,
  }
  return { args, linkParams, viewMode }
}

/** Header count. */
async function ResultCount({ args }: { args: QueryArgs }) {
  const { total } = await getShopProductsCached({
    ...args,
    page: 1,
  })
  if (total === 0) return null
  return <p className="category-page__count">{resultCountText(total)}</p>
}

async function ResultGrid({
  args,
  linkParams,
  viewMode,
}: {
  args: QueryArgs
  linkParams: Record<string, string | undefined>
  viewMode: ViewMode
}) {
  const { items, total } = await getShopProductsCached({
    ...args,
    page: 1,
  })
  const assets = await loadGalleryAssetsForProducts(items)

  if (items.length === 0) {
    return (
      <div className="category-page__empty">
        <p>לא נמצאו מוצרים התואמים את הבחירה שלך.</p>
      </div>
    )
  }

  const itemsWithAssets = items.map((item) => ({ ...(item as CategoryProduct), assets }))

  return (
    <ShopGridWithInfiniteScroll
      initialItems={itemsWithAssets}
      totalCount={total}
      pageSize={SHOP_PAGE_SIZE}
      params={linkParams}
      viewMode={viewMode}
    />
  )
}

async function ShopResultCount({ searchParams }: Props) {
  const { args } = await shopArgs(searchParams)
  return <ResultCount args={args} />
}

async function ShopControlBar({ searchParams }: Props) {
  const { args } = await shopArgs(searchParams)
  return <CategoryControlBar value={args.sort} />
}

async function ShopGrid({ searchParams }: Props) {
  const { args, linkParams, viewMode } = await shopArgs(searchParams)
  return <ResultGrid args={args} linkParams={linkParams} viewMode={viewMode} />
}

async function ShopSidebar({ searchParams }: Props) {
  const { args } = await shopArgs(searchParams)
  return (
    <CategoryFilterSidebar
      priceMin={args.priceMin}
      priceMax={args.priceMax}
      productType={args.productType}
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
        <Suspense fallback={<div className="category-control-bar" aria-hidden="true" />}>
          <ShopControlBar searchParams={searchParams} />
        </Suspense>
        <Suspense fallback={null}>
          <DealChips />
        </Suspense>

        <div className="category-page__body">
          <div className="category-page__main">
            <Suspense fallback={<CategoryGridSkeleton count={SHOP_PAGE_SIZE} />}>
              <ShopGrid searchParams={searchParams} />
            </Suspense>
          </div>

          <Suspense fallback={<div className="category-sidebar" aria-hidden="true" />}>
            <ShopSidebar searchParams={searchParams} />
          </Suspense>
        </div>
      </div>
    </div>
  )
}
