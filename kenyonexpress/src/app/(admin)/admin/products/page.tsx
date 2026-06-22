import ProductForm from '@/components/admin/ProductForm'
import ProductsTable, { type ProductRow } from '@/components/admin/ProductsTable'
import { productListParamsSchema } from '@/lib/admin/page-params'
import { createClient } from '@/lib/supabase/server'
import { Plus } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'

export const metadata = { title: 'מוצרים' }

const PAGE_SIZE = 20

const STATUS_FILTERS = [
  { value: '', label: 'הכל' },
  { value: 'active', label: 'פעיל' },
  { value: 'draft', label: 'טיוטה' },
  { value: 'paused', label: 'מושהה' },
  { value: 'archived', label: 'ארכיון' },
] as const

const adminBtn =
  'inline-flex items-center gap-2 rounded-lg border border-black/10 bg-brand px-4 py-2 text-sm font-semibold text-brand-dark transition-colors hover:bg-[#fedd26]'

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function AdminProductsPage({ searchParams }: Props) {
  const raw = await searchParams
  const parsed = productListParamsSchema.safeParse({
    q: typeof raw.q === 'string' ? raw.q : undefined,
    status: typeof raw.status === 'string' ? raw.status : undefined,
    page: typeof raw.page === 'string' ? raw.page : undefined,
    new: raw.new === '1' ? '1' : undefined,
    edit: typeof raw.edit === 'string' ? raw.edit : undefined,
  })

  const params = parsed.success ? parsed.data : { page: 1 }
  const { q, status, page, new: isNew, edit } = params
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  const supabase = await createClient()

  let query = supabase
    .from('products')
    .select(
      'id, name_he, slug, status, kenyon_price, type, is_featured, created_at, categories(name_he)',
      { count: 'exact' },
    )
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .range(from, to)

  if (status) query = query.eq('status', status)
  if (q) query = query.ilike('name_he', `%${q}%`)

  const [{ data: products, count }, { data: categories }] = await Promise.all([
    query,
    supabase.from('categories').select('id, name_he').eq('is_active', true).order('name_he'),
  ])

  let editingProduct = null
  let variants = null
  if (edit) {
    const [{ data: product }, { data: productVariants }] = await Promise.all([
      supabase.from('products').select('*').eq('id', edit).single(),
      supabase.from('product_variants').select('*').eq('product_id', edit).is('deleted_at', null),
    ])
    if (!product) notFound()
    editingProduct = product
    variants = productVariants ?? []
  }

  const rows: ProductRow[] = (products ?? []).map((p) => {
    const category = Array.isArray(p.categories) ? p.categories[0] : p.categories
    return {
      id: p.id,
      name_he: p.name_he,
      slug: p.slug,
      status: p.status,
      kenyon_price: p.kenyon_price,
      type: p.type,
      is_featured: p.is_featured,
      category_name: category?.name_he ?? null,
    }
  })

  const total = count ?? 0
  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-[#000000]">מוצרים</h1>
        <Link href="/admin/products?new=1" className={adminBtn}>
          <Plus size={15} />
          מוצר חדש
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {STATUS_FILTERS.map((f) => {
          const sp = new URLSearchParams()
          if (f.value) sp.set('status', f.value)
          if (q) sp.set('q', q)
          const href = sp.toString() ? `/admin/products?${sp}` : '/admin/products'
          return (
            <Link
              key={f.value || 'all'}
              href={href}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                (status ?? '') === f.value
                  ? 'bg-[#fed700] text-[#000000]'
                  : 'border border-black/10 text-black/60 hover:bg-[#fed700]/30 hover:text-[#000000]'
              }`}
            >
              {f.label}
            </Link>
          )
        })}

        <form method="GET" action="/admin/products" className="ms-auto flex gap-2">
          {status && <input type="hidden" name="status" value={status} />}
          <input
            name="q"
            defaultValue={q}
            placeholder="חיפוש בשרת..."
            className="rounded-lg border border-black/10 bg-[#FFFFFF] px-3 py-1.5 text-xs text-[#000000] focus:outline-none focus:ring-2 focus:ring-[#fed700]"
          />
          <button
            type="submit"
            className="rounded-lg border border-black/10 px-3 py-1.5 text-xs font-medium text-black/70 transition-colors hover:bg-[#fed700]/30"
          >
            סינון
          </button>
        </form>
      </div>

      {(isNew || editingProduct) && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-[#000000]">
            {editingProduct ? 'עריכת מוצר' : 'מוצר חדש'}
          </h2>
          <ProductForm
            product={editingProduct ?? undefined}
            variants={variants ?? []}
            categories={categories ?? []}
          />
          <Link href="/admin/products" className="text-xs text-black/40 hover:underline">
            סגור טופס
          </Link>
        </div>
      )}

      <ProductsTable products={rows} />

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          {page > 1 && (
            <Link
              href={`/admin/products?${new URLSearchParams({
                ...(status ? { status } : {}),
                ...(q ? { q } : {}),
                page: String(page - 1),
              })}`}
              className="rounded-lg border border-black/10 px-3 py-1.5 text-xs transition-colors hover:bg-[#fed700]/30"
            >
              הקודם
            </Link>
          )}
          <span className="text-xs text-black/50">
            עמוד {page} מתוך {totalPages} ({total} מוצרים)
          </span>
          {page < totalPages && (
            <Link
              href={`/admin/products?${new URLSearchParams({
                ...(status ? { status } : {}),
                ...(q ? { q } : {}),
                page: String(page + 1),
              })}`}
              className="rounded-lg border border-black/10 px-3 py-1.5 text-xs transition-colors hover:bg-[#fed700]/30"
            >
              הבא
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
