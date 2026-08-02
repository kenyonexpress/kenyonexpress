import CategoryBreadcrumb, { defaultHomeCrumb } from '@/components/category/CategoryBreadcrumb'
import CategoryControlBar from '@/components/category/CategoryControlBar'
import CategoryFilterSidebar from '@/components/category/CategoryFilterSidebar'
import CategoryGridSkeleton from '@/components/category/CategoryGridSkeleton'
import CategoryProductCard, {
  type CategoryProduct,
} from '@/components/category/CategoryProductCard'
import Pagination from '@/components/category/Pagination'
import {
  type ProductTypeFilter,
  SHOP_PAGE_SIZE,
  getAllCategories,
  getShopProductsCached,
  parseProductType,
} from '@/lib/category-page'
import { type SortValue, parseSort } from '@/lib/category-tokens'
import type { Metadata } from 'next'
import { Suspense } from 'react'
import '@/styles/category-page.css'

/* Live equivalent: kenyonexpress.co.il/shop/ - h1 "חנות", 24 per page */
const PAGE_TITLE = 'חנות'

/**
 * NOT ISR. This page reads `searchParams` - page number, sort, filters - which
 * makes it dynamic by definition: there is no single HTML for `/products` to
 * cache, there is one per combination a shopper picks. Declaring `revalidate`
 * here asked Next to prerender it anyway, and every request then failed the
 * render with DYNAMIC_SERVER_USAGE. In production that is not a slow page, it
 * is an error page with no `dir="rtl"` on `<html>`, which is how the E2E suite
 * found it: 31 specs failing on a missing RTL attribute that the layout does
 * set. Caching for this route belongs in the data layer, not the route segment.
 */
export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  title: PAGE_TITLE,
  description: 'כל המוצרים, הדילים והקופונים של קניון אקספרס במקום אחד.',
  alternates: { canonical: '/products' },
  openGraph: {
    title: PAGE_TITLE,
    description: 'כל המוצרים, הדילים והקופונים של קניון אקספרס במקום אחד.',
    url: '/products',
    locale: 'he_IL',
    siteName: 'קניון אקספרס',
    type: 'website',
  },
}

type Props = {
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

function resultCountText(total: number, from: number, to: number): string {
  if (total === 1) return 'מציג תוצאה יחידה'
  if (to - from + 1 >= total) return `מציגים את כל ⁦${total}⁩ התוצאות`
  return `מציג ${from}–${to} מתוך ${total} תוצאות`
}

type QueryArgs = {
  sort: SortValue
  page: number
  priceMin?: number
  priceMax?: number
  productType?: ProductTypeFilter
}

function pageWindow(total: number, page: number) {
  const totalPages = Math.max(1, Math.ceil(total / SHOP_PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const from = (currentPage - 1) * SHOP_PAGE_SIZE + 1
  const to = Math.min(currentPage * SHOP_PAGE_SIZE, total)
  return { totalPages, currentPage, from, to }
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

/** Header count. Shares one query with the grid via getShopProductsCached. */
async function ResultCount({ args }: { args: QueryArgs }) {
  const { total } = await getShopProductsCached(args)
  if (total === 0) return null
  const { from, to } = pageWindow(total, args.page)
  return <p className="category-page__count">{resultCountText(total, from, to)}</p>
}

async function ResultGrid({
  args,
  linkParams,
}: {
  args: QueryArgs
  linkParams: Record<string, string | undefined>
}) {
  const { items, total } = await getShopProductsCached(args)

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
        {items.map((product) => (
          <li key={product.id} className="category-products__item">
            <CategoryProductCard product={product as CategoryProduct} />
          </li>
        ))}
      </ul>
      <Pagination
        pathname="/products"
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

async function ShopResultCount({ searchParams }: Props) {
  const { args } = await shopArgs(searchParams)
  return <ResultCount args={args} />
}

async function ShopControlBar({ searchParams }: Props) {
  const { args } = await shopArgs(searchParams)
  return <CategoryControlBar value={args.sort} />
}

async function ShopGrid({ searchParams }: Props) {
  const { args, linkParams } = await shopArgs(searchParams)
  return <ResultGrid args={args} linkParams={linkParams} />
}

async function ShopSidebar({ searchParams }: Props) {
  const [{ args }, allCategories] = await Promise.all([shopArgs(searchParams), getAllCategories()])
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

        {/* Live /shop/ carries this section between the breadcrumb and the H1.
            Its carousel renders no items on live, so the section is the heading
            rule alone. Without it every landmark below sits ~62px too high. */}
        <div className="shop-carousel-head">
          <h2 className="shop-carousel-head__title">Recommended Products</h2>
        </div>

        <header className="category-page__header">
          <h1 className="category-page__title">{PAGE_TITLE}</h1>
          <Suspense fallback={null}>
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
