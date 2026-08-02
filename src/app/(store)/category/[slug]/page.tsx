import ViewTracker from '@/components/analytics/ViewTracker'
import CategoryBreadcrumb, { defaultHomeCrumb } from '@/components/category/CategoryBreadcrumb'
import CategoryControlBar from '@/components/category/CategoryControlBar'
import CategoryFilterSidebar from '@/components/category/CategoryFilterSidebar'
import CategoryGridSkeleton from '@/components/category/CategoryGridSkeleton'
import CategoryProductCard, {
  type CategoryProduct,
} from '@/components/category/CategoryProductCard'
import Pagination from '@/components/category/Pagination'
import {
  CATEGORY_PAGE_SIZE,
  type ProductTypeFilter,
  getAllCategories,
  getCategoryBySlug,
  getCategoryParent,
  getCategoryProductsCached,
  parseProductType,
} from '@/lib/category-page'
import { type SortValue, parseSort } from '@/lib/category-tokens'
import { buildBreadcrumbJsonLd, jsonLdScript } from '@/lib/seo/json-ld'
import { createPublicClient } from '@/lib/supabase/public'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Suspense } from 'react'
import '@/styles/category-page.css'

/**
 * NOT ISR, for the same reason as `/products`: this route reads `searchParams`
 * (page, sort, price and brand filters), so it is dynamic by definition and
 * cannot have one cached HTML. `revalidate` here produced a
 * DYNAMIC_SERVER_USAGE render failure on every request instead of a cache hit.
 */
export const dynamic = 'force-dynamic'

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

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params
  const supabase = createPublicClient()
  const { data } = await supabase
    .from('categories')
    .select('name_he, description_he, image_url')
    .eq('slug', slug)
    .eq('is_active', true)
    .single()
  const title = data?.name_he ?? 'קטגוריה'
  const description = data?.description_he ?? undefined
  const path = `/category/${encodeURIComponent(slug)}`
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      title,
      description,
      url: path,
      locale: 'he_IL',
      siteName: 'קניון אקספרס',
      type: 'website',
      ...(data?.image_url ? { images: [{ url: data.image_url }] } : {}),
    },
  }
}

type QueryArgs = {
  categoryId: string
  category: { name_he: string; slug: string }
  sort: SortValue
  page: number
  priceMin?: number
  priceMax?: number
  productType?: ProductTypeFilter
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
  const { total } = await getCategoryProductsCached(args)
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
  const { items, total } = await getCategoryProductsCached(args)

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

export default async function CategoryPage({ params, searchParams }: Props) {
  const { slug } = await params
  const sp = await searchParams
  const sort = parseSort(sp.sort)
  const page = parsePage(sp.page)
  const priceMin = parsePrice(sp.min)
  const priceMax = parsePrice(sp.max)
  const productType = parseProductType(sp.type)

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

  const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://kenyonexpress.co.il'
  const breadcrumbLd = buildBreadcrumbJsonLd(
    [
      { name: 'בית', path: '/' },
      ...(parent ? [{ name: parent.name_he, path: `/category/${parent.slug}` }] : []),
      { name: category.name_he, path: pathname },
    ],
    siteUrl,
  )

  return (
    <div className="category-page">
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: JSON-LD; jsonLdScript escapes < */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdScript(breadcrumbLd) }}
      />
      <ViewTracker event="view_category" props={{ category_id: category.id }} />
      <div className="category-page__inner">
        <CategoryBreadcrumb items={crumbs} />

        <header className="category-page__header">
          <h1 className="category-page__title">{category.name_he}</h1>
          <Suspense fallback={null}>
            <ResultCount args={args} />
          </Suspense>
        </header>

        <CategoryControlBar value={sort} />

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
