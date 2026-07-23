import CouponForm from '@/components/admin/CouponForm'
import CouponsTable, { type CouponRow } from '@/components/admin/CouponsTable'
import { couponListParamsSchema } from '@/lib/admin/page-params'
import { requireAdminPage } from '@/lib/admin/rbac'
import { createClient } from '@/lib/supabase/server'
import { Plus } from 'lucide-react'
import Link from 'next/link'
import { notFound } from 'next/navigation'

export const metadata = { title: 'קופונים' }

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

export default async function AdminCouponsPage({ searchParams }: Props) {
  const raw = await searchParams
  const parsed = couponListParamsSchema.safeParse({
    status: typeof raw.status === 'string' ? raw.status : undefined,
    new: raw.new === '1' ? '1' : undefined,
    edit: typeof raw.edit === 'string' ? raw.edit : undefined,
  })

  const params = parsed.success ? parsed.data : {}
  const { status, new: isNew, edit } = params

  await requireAdminPage()
  const supabase = await createClient()

  let query = supabase
    .from('coupon_deals')
    .select('id, title_he, business_name, original_price, platform_price, status, valid_until')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (status) query = query.eq('status', status)

  const [{ data: deals }, { data: vendors }] = await Promise.all([
    query,
    supabase
      .from('vendors')
      .select('id, business_name')
      .eq('status', 'active')
      .order('business_name'),
  ])

  let editingDeal = null
  if (edit) {
    const { data: deal } = await supabase.from('coupon_deals').select('*').eq('id', edit).single()
    if (!deal) notFound()
    editingDeal = deal
  }

  const rows: CouponRow[] = (deals ?? []).map((d) => ({
    id: d.id,
    title_he: d.title_he,
    business_name: d.business_name,
    original_price: d.original_price,
    platform_price: d.platform_price,
    status: d.status,
    valid_until: d.valid_until,
  }))

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-[#000000]">קופונים</h1>
        <Link href="/admin/coupons?new=1" className={adminBtn}>
          <Plus size={15} />
          קופון חדש
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => (
          <Link
            key={f.value || 'all'}
            href={f.value ? `/admin/coupons?status=${f.value}` : '/admin/coupons'}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              (status ?? '') === f.value
                ? 'bg-[#fed700] text-[#000000]'
                : 'border border-black/10 text-black/60 hover:bg-[#fed700]/30 hover:text-[#000000]'
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      {(isNew || editingDeal) && (
        <div className="space-y-2">
          <h2 className="text-sm font-semibold text-[#000000]">
            {editingDeal ? 'עריכת קופון' : 'קופון חדש'}
          </h2>
          <CouponForm deal={editingDeal ?? undefined} vendors={vendors ?? []} />
          <Link href="/admin/coupons" className="text-xs text-black/40 hover:underline">
            סגור טופס
          </Link>
        </div>
      )}

      <CouponsTable deals={rows} />
    </div>
  )
}
