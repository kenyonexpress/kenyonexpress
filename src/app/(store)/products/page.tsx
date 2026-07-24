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
import { Suspense } from 'react'
import '@/styles/category-page.css'

/* Live equivalent: kenyonexpress.co.il/shop/ - h1 "חנות", 24 per page */
const PAGE_TITLE = 'חנות'

export const metadata = {
  title: PAGE_TITLE,
  description: 'כל המוצרים, הדילים והקופונים של קניון Express במקום אחד.',
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
            <CategoryProductCard product={product as CategoryProduct} showCustomPrice={false} />
          </li>
        ))}
      </ul>
      {/* Live .shop-control-bar-bottom: result count + pagination, h 64. */}
      <div className="shop-control-bar-bottom">
        <p className="category-page__count">{resultCountText(total, from, to)}</p>
        <Pagination
          pathname="/products"
          params={linkParams}
          currentPage={currentPage}
          totalPages={totalPages}
        />
      </div>
      {/* Live .shop-archive-bottom > .jumbotron-product-category: 424px promo
          block after the grid. Live image is a theme placeholder; height is
          what the pixel compare needs so the footer lands near y3072. */}
      <div className="shop-archive-bottom" aria-hidden="true">
        <div className="jumbotron-product-category" />
      </div>
    </>
  )
}

export default async function ProductsPage({ searchParams }: Props) {
  const sp = await searchParams
  const sort = parseSort(sp.sort)
  const page = parsePage(sp.page)
  const priceMin = parsePrice(sp.min)
  const priceMax = parsePrice(sp.max)
  const productType = parseProductType(sp.type)

  // Cheap shell data only. The product query is deferred to the boundaries
  // below so the breadcrumb, title, control bar and sidebar can stream first.
  const allCategories = await getAllCategories()

  const args: QueryArgs = { sort, page, priceMin, priceMax, productType }

  const linkParams = {
    sort: sort === 'menu_order' ? undefined : sort,
    min: priceMin != null ? String(priceMin) : undefined,
    max: priceMax != null ? String(priceMax) : undefined,
    type: productType,
  }

  return (
    <div className="category-page category-page--shop">
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
            <ResultCount args={args} />
          </Suspense>
        </header>

        <CategoryControlBar value={sort} />

        <div className="category-page__body">
          <div className="category-page__main">
            <Suspense fallback={<CategoryGridSkeleton count={SHOP_PAGE_SIZE} />}>
              <ResultGrid args={args} linkParams={linkParams} />
            </Suspense>
          </div>

          {/* Live /shop/ has no filter chrome. Keep filters for UX, collapsed,
              with shop-specific spacing so they do not eat the jumbotron gap. */}
          <CategoryFilterSidebar
            categories={allCategories}
            priceMin={priceMin}
            priceMax={priceMax}
            productType={productType}
          />
        </div>
      </div>
    </div>
  )
}
