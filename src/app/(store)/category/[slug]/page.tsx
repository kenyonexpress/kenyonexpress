import CategoryBreadcrumb, { defaultHomeCrumb } from '@/components/category/CategoryBreadcrumb'
import CategoryControlBar from '@/components/category/CategoryControlBar'
import CategoryProductCard, {
  type CategoryProduct,
} from '@/components/category/CategoryProductCard'
import Pagination from '@/components/category/Pagination'
import {
  CATEGORY_PAGE_SIZE,
  getCategoryBySlug,
  getCategoryParent,
  getCategoryProducts,
} from '@/lib/category-page'
import { parseSort } from '@/lib/category-tokens'
import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
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

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const supabase = await createClient()
  const { data } = await supabase
    .from('categories')
    .select('name_he, description_he')
    .eq('slug', slug)
    .eq('is_active', true)
    .single()
  return {
    title: data?.name_he ?? 'קטגוריה',
    description: data?.description_he ?? undefined,
  }
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { slug } = await params
  const sp = await searchParams
  const sort = parseSort(sp.sort)
  const page = parsePage(sp.page)
  const priceMin = parsePrice(sp.min)
  const priceMax = parsePrice(sp.max)

  const category = await getCategoryBySlug(slug)
  if (!category) notFound()

  const [parent, { items, total }] = await Promise.all([
    category.parent_id ? getCategoryParent(category.parent_id) : Promise.resolve(null),
    getCategoryProducts({
      categoryId: category.id,
      category: { name_he: category.name_he, slug: category.slug },
      sort,
      page,
      priceMin,
      priceMax,
    }),
  ])

  const totalPages = Math.max(1, Math.ceil(total / CATEGORY_PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)
  const from = (currentPage - 1) * CATEGORY_PAGE_SIZE + 1
  const to = Math.min(currentPage * CATEGORY_PAGE_SIZE, total)
  const countText = resultCountText(total, from, to)

  const pathname = `/category/${category.slug}`
  const linkParams = {
    sort: sort === 'menu_order' ? undefined : sort,
    min: priceMin != null ? String(priceMin) : undefined,
    max: priceMax != null ? String(priceMax) : undefined,
  }

  const crumbs = [
    defaultHomeCrumb(),
    ...(parent ? [{ label: parent.name_he, href: `/category/${parent.slug}` }] : []),
    { label: category.name_he },
  ]

  return (
    <div className="category-page">
      <div className="category-page__inner">
        <CategoryBreadcrumb items={crumbs} />

        <header className="category-page__header">
          <h1 className="category-page__title">{category.name_he}</h1>
          {total > 0 && <p className="category-page__count">{countText}</p>}
        </header>

        <CategoryControlBar value={sort} />

        {/* Measured on the live archive (refs/category-tokens.json): sidebar.present
            is false and the grid spans the full 1170px container, so the product
            area has no aside. */}
        <div className="category-page__body">
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
                pathname={pathname}
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
      </div>
    </div>
  )
}
