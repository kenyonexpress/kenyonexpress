import CategoryBreadcrumb, { defaultHomeCrumb } from '@/components/category/CategoryBreadcrumb'
import CategoryControlBar from '@/components/category/CategoryControlBar'
import CategoryFilterSidebar from '@/components/category/CategoryFilterSidebar'
import CategoryGridSkeleton from '@/components/category/CategoryGridSkeleton'
import type { CategoryProduct } from '@/components/category/CategoryProductCard'
import ProductShopFeed from '@/components/category/ProductShopFeed'
import {
  type ProductTypeFilter,
  SHOP_PAGE_SIZE,
  getAllCategories,
  getShopProductsCached,
  parseProductType,
} from '@/lib/category-page'
import { type SortValue, parseSort } from '@/lib/category-tokens'
import { shopHasMore } from '@/lib/products-feed'
import { attachRatings } from '@/server/queries/reviews'
import { Suspense } from 'react'
import '@/styles/category-page.css'

const PAGE_TITLE = 'חנות'

export const metadata = {
  title: PAGE_TITLE,
  description: 'כל המוצרים, הדילים והקופונים של קניון Express במקום אחד.',
  /**
   * Sort, price and type query strings still compete as their own URLs.
   * Pagination is no longer in the URL: further pages load through
   * GET /api/products, so the canonical stays the listing itself.
   */
  alternates: { canonical: '/products' },
}

type Props = {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

function parsePrice(raw: string | string[] | undefined): number | undefined {
  if (typeof raw !== 'string') return undefined
  const n = Number.parseFloat(raw)
  return Number.isFinite(n) && n >= 0 ? n : undefined
}

function resultCountText(total: number, shown: number): string {
  if (total === 1) return 'מציג תוצאה יחידה'
  if (shown >= total) return `מציגים את כל ⁦${total}⁩ התוצאות`
  return `מציג ${shown} מתוך ${total} תוצאות`
}

type QueryArgs = {
  sort: SortValue
  priceMin?: number
  priceMax?: number
  productType?: ProductTypeFilter
}

async function shopArgs(searchParams: Props['searchParams']) {
  const sp = await searchParams
  return {
    sort: parseSort(sp.sort),
    priceMin: parsePrice(sp.min),
    priceMax: parsePrice(sp.max),
    productType: parseProductType(sp.type),
  } satisfies QueryArgs
}

async function ResultCount({ args }: { args: QueryArgs }) {
  const { items, total } = await getShopProductsCached({ ...args, page: 1, limit: SHOP_PAGE_SIZE })
  if (total === 0) return null
  return <p className="category-page__count">{resultCountText(total, items.length)}</p>
}

async function ShopResultCount({ searchParams }: Props) {
  const args = await shopArgs(searchParams)
  return <ResultCount args={args} />
}

async function ShopControlBar({ searchParams }: Props) {
  const args = await shopArgs(searchParams)
  return <CategoryControlBar value={args.sort} />
}

async function ShopGrid({ searchParams }: Props) {
  const args = await shopArgs(searchParams)
  const { items, total } = await getShopProductsCached({ ...args, page: 1, limit: SHOP_PAGE_SIZE })
  const rated = await attachRatings(items as CategoryProduct[])
  return (
    <ProductShopFeed
      key={`${args.sort}:${args.priceMin ?? ''}:${args.priceMax ?? ''}:${args.productType ?? ''}`}
      initialProducts={rated}
      hasMore={shopHasMore(1, SHOP_PAGE_SIZE, total)}
      totalCount={total}
      sort={args.sort}
      priceMin={args.priceMin}
      priceMax={args.priceMax}
      productType={args.productType}
    />
  )
}

async function ShopSidebar({ searchParams }: Props) {
  const [args, allCategories] = await Promise.all([shopArgs(searchParams), getAllCategories()])
  return (
    <CategoryFilterSidebar
      categories={allCategories}
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

        <div className="shop-carousel-head">
          <h2 className="shop-carousel-head__title">מוצרים מומלצים</h2>
        </div>

        <header className="category-page__header">
          <h1 className="category-page__title">{PAGE_TITLE}</h1>
          <Suspense
            fallback={
              <div className="category-page__count category-page__count--pending" aria-hidden />
            }
          >
            <ShopResultCount searchParams={searchParams} />
          </Suspense>
        </header>

        <Suspense fallback={<div className="category-control-bar" aria-hidden="true" />}>
          <ShopControlBar searchParams={searchParams} />
        </Suspense>

        <div className="category-page__body">
          <div className="category-page__main">
            <Suspense fallback={<CategoryGridSkeleton count={6} />}>
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
