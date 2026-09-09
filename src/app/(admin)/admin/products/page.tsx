import ProductsTable, { type ProductRow } from '@/components/admin/ProductsTable'
import { productListParamsSchema } from '@/lib/admin/page-params'
import { canSeeMoney } from '@/lib/admin/permissions'
import { requireSection } from '@/lib/admin/rbac'
import { ilsToAgorot } from '@/lib/commerce/money'
import { loadReferenceVerdicts } from '@/lib/pricing/price-history'
import { referenceWarning } from '@/lib/pricing/reference-price'
import { createClient } from '@/lib/supabase/server'
import { FileUp, Plus } from 'lucide-react'
import Link from 'next/link'

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
  'inline-flex items-center gap-2 rounded-lg border border-black/10 bg-brand px-4 py-2 text-sm font-semibold text-brand-dark transition-colors hover:bg-brand-primary-hover'

const adminBtnGhost =
  'inline-flex items-center gap-2 rounded-lg border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50'

interface Props {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function AdminProductsPage({ searchParams }: Props) {
  // The (admin) layout only proves panel entry, and `support` has panel entry.
  // Without this the catalog list was the one admin screen a support user could
  // open, while every sibling under /admin/products/* refused them. `read`, not
  // `write`: content_uploader lists and edits, support gets neither.
  const session = await requireSection('catalog', 'read')

  const raw = await searchParams
  const parsed = productListParamsSchema.safeParse({
    q: typeof raw.q === 'string' ? raw.q : undefined,
    status: typeof raw.status === 'string' ? raw.status : undefined,
    page: typeof raw.page === 'string' ? raw.page : undefined,
  })

  const params = parsed.success ? parsed.data : { page: 1 }
  const { q, status, page } = params
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  const supabase = await createClient()

  let query = supabase
    .from('products')
    .select(
      'id, name_he, slug, status, kenyon_price, full_price, type, is_featured, platform_percent, coupon_price_ils, created_at, categories!products_category_id_fkey(name_he)',
      { count: 'exact' },
    )
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .range(from, to)

  if (status) query = query.eq('status', status)
  if (q) query = query.ilike('name_he', `%${q}%`)

  const [{ data: products, count }, { data: categories }] = await Promise.all([
    query,
    supabase.from('categories').select('id, name_he').order('name_he'),
  ])

  /**
   * Whether each struck-through "before" price can be proved.
   *
   * The admin is the ONLY place this is ever said out loud. The storefront's
   * job is to stop showing a claim the record contradicts, silently, because a
   * shopper cannot act on a compliance note. An operator can, and is the only
   * person who can: the fix is either to correct `full_price` or to hold the
   * price long enough for it to be true, and both are decisions rather than
   * code.
   *
   * Batched: one query for the whole page, not one per row. Against the
   * page-scoped `supabase` client, so it inherits the same session.
   */
  const verdicts = await loadReferenceVerdicts(
    supabase,
    (products ?? [])
      .filter((p) => p.kenyon_price != null)
      .map((p) => ({
        productId: p.id,
        currentAgorot: ilsToAgorot(Number(p.kenyon_price)),
        referenceAgorot: p.full_price == null ? null : ilsToAgorot(Number(p.full_price)),
      })),
  )

  const rows: ProductRow[] = (products ?? []).map((p) => {
    const category = Array.isArray(p.categories) ? p.categories[0] : p.categories
    return {
      id: p.id,
      name_he: p.name_he,
      slug: p.slug,
      status: p.status,
      kenyon_price: p.kenyon_price,
      full_price: p.full_price,
      type: p.type,
      is_featured: p.is_featured,
      category_name: category?.name_he ?? null,
      platform_percent: p.platform_percent,
      coupon_price_ils: p.coupon_price_ils,
      reference_warning: referenceWarning(verdicts.get(p.id) ?? { kind: 'not_claimed' }),
    }
  })

  const total = count ?? 0
  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-ink">מוצרים</h1>
        <div className="flex items-center gap-2">
          <Link href="/admin/products/import" className={adminBtnGhost}>
            <FileUp size={15} />
            ייבוא מקובץ
          </Link>
          <Link href="/admin/products/new" className={adminBtn}>
            <Plus size={15} />
            מוצר חדש
          </Link>
        </div>
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
                  ? 'bg-brand-primary text-ink'
                  : 'border border-black/10 text-black/60 hover:bg-brand-primary/30 hover:text-ink'
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
            className="rounded-lg border border-black/10 bg-surface px-3 py-1.5 text-xs text-ink focus:outline-none focus:ring-2 focus:ring-brand-primary"
          />
          <button
            type="submit"
            className="rounded-lg border border-black/10 px-3 py-1.5 text-xs font-medium text-black/70 transition-colors hover:bg-brand-primary/30"
          >
            סינון
          </button>
        </form>
      </div>

      <ProductsTable
        products={rows}
        categories={categories ?? []}
        hidePricing={!canSeeMoney(session.role)}
      />

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          {page > 1 && (
            <Link
              href={`/admin/products?${new URLSearchParams({
                ...(status ? { status } : {}),
                ...(q ? { q } : {}),
                page: String(page - 1),
              })}`}
              className="rounded-lg border border-black/10 px-3 py-1.5 text-xs transition-colors hover:bg-brand-primary/30"
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
              className="rounded-lg border border-black/10 px-3 py-1.5 text-xs transition-colors hover:bg-brand-primary/30"
            >
              הבא
            </Link>
          )}
        </div>
      )}
    </div>
  )
}
