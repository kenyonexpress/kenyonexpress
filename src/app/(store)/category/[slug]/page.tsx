import ProductCard, { type Product } from '@/components/ProductCard'
import CategorySort, { type SortValue } from '@/components/category/CategorySort'
import Pagination from '@/components/category/Pagination'
import { createClient } from '@/lib/supabase/server'
import Link from 'next/link'
import { notFound } from 'next/navigation'

type Props = {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}

const PAGE_SIZE = 24

const VALID_SORTS: SortValue[] = ['newest', 'price_asc', 'price_desc', 'name']

function parseSort(raw: string | string[] | undefined): SortValue {
  return typeof raw === 'string' && (VALID_SORTS as string[]).includes(raw)
    ? (raw as SortValue)
    : 'newest'
}

function parsePage(raw: string | string[] | undefined): number {
  const n = typeof raw === 'string' ? Number.parseInt(raw, 10) : 1
  return Number.isFinite(n) && n >= 1 ? n : 1
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params
  const supabase = await createClient()
  const { data } = await supabase
    .from('categories')
    .select('name_he, description_he')
    .eq('slug', slug)
    .eq('is_active', true)
    .is('deleted_at', null)
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
  const supabase = await createClient()

  const { data: category } = await supabase
    .from('categories')
    .select('id, slug, name_he, description_he, icon_url, parent_id')
    .eq('slug', slug)
    .eq('is_active', true)
    .is('deleted_at', null)
    .single()

  if (!category) notFound()

  // Parent (for breadcrumb) and children (for sub-category navigation)
  const [parentRes, childrenRes] = await Promise.all([
    category.parent_id
      ? supabase
          .from('categories')
          .select('slug, name_he')
          .eq('id', category.parent_id)
          .is('deleted_at', null)
          .single()
      : Promise.resolve({ data: null }),
    supabase
      .from('categories')
      .select('id, slug, name_he')
      .eq('parent_id', category.id)
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('sort_order', { ascending: true }),
  ])
  const parent = parentRes.data
  const children = childrenRes.data ?? []

  // Products in this category, sorted + paginated
  const from = (page - 1) * PAGE_SIZE
  let query = supabase
    .from('products')
    .select('id, slug, name_he, kenyon_price, full_price, images, stock_quantity', {
      count: 'exact',
    })
    .eq('category_id', category.id)
    .eq('status', 'active')
    .is('deleted_at', null)

  switch (sort) {
    case 'price_asc':
      query = query.order('kenyon_price', { ascending: true, nullsFirst: false })
      break
    case 'price_desc':
      query = query.order('kenyon_price', { ascending: false, nullsFirst: false })
      break
    case 'name':
      query = query.order('name_he', { ascending: true })
      break
    default:
      query = query.order('created_at', { ascending: false })
  }

  const { data: products, count } = await query.range(from, from + PAGE_SIZE - 1)

  const items = (products ?? []) as Product[]
  const total = count ?? 0
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const currentPage = Math.min(page, totalPages)

  const pathname = `/category/${category.slug}`

  return (
    <div className="max-w-page mx-auto px-4 py-6 space-y-6">
      {/* Breadcrumb */}
      <nav
        className="text-sm text-gray-500 flex flex-wrap items-center gap-1"
        aria-label="נתיב ניווט"
      >
        <Link href="/" className="hover:text-brand">
          בית
        </Link>
        {parent && (
          <>
            <span aria-hidden>/</span>
            <Link href={`/category/${parent.slug}`} className="hover:text-brand">
              {parent.name_he}
            </Link>
          </>
        )}
        <span aria-hidden>/</span>
        <span className="text-gray-800 font-medium">{category.name_he}</span>
      </nav>

      {/* Category header */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 flex items-center gap-4">
        {category.icon_url ? (
          <img
            src={category.icon_url}
            alt=""
            aria-hidden="true"
            className="w-14 h-14 object-contain"
          />
        ) : (
          <span className="text-5xl" aria-hidden="true">
            🏷️
          </span>
        )}
        <div className="min-w-0">
          <h1 className="text-2xl font-black text-gray-900">{category.name_he}</h1>
          {category.description_he && (
            <p className="text-sm text-gray-500 mt-1">{category.description_he}</p>
          )}
          <p className="text-xs text-gray-400 mt-1">{total} מוצרים</p>
        </div>
      </div>

      {/* Sub-categories */}
      {children.length > 0 && (
        <nav className="flex flex-wrap gap-2" aria-label="תת-קטגוריות">
          {children.map((child) => (
            <Link
              key={child.id}
              href={`/category/${child.slug}`}
              className="rounded-full border border-gray-200 bg-white px-4 py-1.5 text-sm text-gray-700 transition-colors hover:border-brand-primary hover:bg-brand-accent"
            >
              {child.name_he}
            </Link>
          ))}
        </nav>
      )}

      {/* Toolbar: result count + sort */}
      {items.length > 0 && (
        <div className="flex items-center justify-between gap-3 border-b border-gray-100 pb-3">
          <span className="text-sm text-gray-500">
            מציג {from + 1}–{from + items.length} מתוך {total}
          </span>
          <CategorySort value={sort} />
        </div>
      )}

      {/* Product grid */}
      {items.length > 0 ? (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {items.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </div>
          <Pagination
            pathname={pathname}
            params={{ sort: sort === 'newest' ? undefined : sort }}
            currentPage={currentPage}
            totalPages={totalPages}
          />
        </>
      ) : (
        <div className="text-center py-16 text-gray-400 bg-white rounded-xl border border-gray-200">
          <p className="text-5xl mb-3">📦</p>
          <p className="font-semibold text-gray-600">אין מוצרים בקטגוריה זו עדיין</p>
          <p className="text-sm mt-1">בקרוב יתווספו מוצרים חדשים</p>
        </div>
      )}
    </div>
  )
}
