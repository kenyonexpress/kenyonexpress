import CategoryBreadcrumb, { defaultHomeCrumb } from '@/components/category/CategoryBreadcrumb'
import CategoryControlBar from '@/components/category/CategoryControlBar'
import CategoryFilterSidebar from '@/components/category/CategoryFilterSidebar'
import CategoryProductCard, {
  type CategoryProduct,
} from '@/components/category/CategoryProductCard'
import Pagination from '@/components/category/Pagination'
import { SHOP_PAGE_SIZE, getAllCategories, getShopProducts } from '@/lib/category-page'
import { parseSort } from '@/lib/category-tokens'
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

export default async function ProductsPage({ searchParams }: Props) {
  const sp = await searchParams
  const sort = parseSort(sp.sort)
  const page = parsePage(sp.page)
  const priceMin = parsePrice(sp.min)
  const priceMax = parsePrice(sp.max)

  const [allCategories, { items, total }] = await Promise.all([
    getAllCategories(),
    getShopProducts({ sort, page, priceMin, priceMax }),
  ])

  const totalPages = Math.max(1, Math.ceil(total / SHOP_PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const from = (currentPage - 1) * SHOP_PAGE_SIZE + 1
  const to = Math.min(currentPage * SHOP_PAGE_SIZE, total)
  const countText = resultCountText(total, from, to)

  const linkParams = {
    sort: sort === 'menu_order' ? undefined : sort,
    min: priceMin != null ? String(priceMin) : undefined,
    max: priceMax != null ? String(priceMax) : undefined,
  }

  return (
    <div className="category-page">
      <div className="category-page__inner">
        <CategoryBreadcrumb items={[defaultHomeCrumb(), { label: PAGE_TITLE }]} />

        <header className="category-page__header">
          <h1 className="category-page__title">{PAGE_TITLE}</h1>
          {total > 0 && <p className="category-page__count">{countText}</p>}
        </header>

        <CategoryControlBar value={sort} />

        <div className="category-page__body">
          <div className="category-page__main">
            {items.length > 0 ? (
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
                <p className="category-page__count category-page__count--bottom">{countText}</p>
              </>
            ) : (
              <div className="category-page__empty">
                <p>לא נמצאו מוצרים התואמים את הבחירה שלך.</p>
              </div>
            )}
          </div>

          <CategoryFilterSidebar
            categories={allCategories}
            priceMin={priceMin}
            priceMax={priceMax}
          />
        </div>
      </div>
    </div>
  )
}
