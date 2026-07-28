import SupplierForm from '@/components/admin/SupplierForm'
import { requireSection } from '@/lib/admin/rbac'
import { summarizeOnboarding } from '@/lib/admin/supplier-onboarding'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Supplier } from '@/types/database'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import SupplierOnboarding, { type MemberRow } from './SupplierOnboarding'

export const metadata = { title: 'עריכת ספק' }

interface Props {
  params: Promise<{ id: string }>
}

export default async function EditSupplierPage({ params }: Props) {
  const { id } = await params
  await requireSection('suppliers', 'read')

  const admin = createAdminClient()
  const [{ data: supplier }, { data: products }, { data: memberRows }, { data: profiles }] =
    await Promise.all([
      admin.from('suppliers').select('*').eq('id', id).single(),
      admin
        .from('products')
        .select('id, name_he, status, type')
        .eq('supplier_id', id)
        .is('deleted_at', null)
        .order('name_he', { ascending: true }),
      admin
        .from('supplier_members')
        .select('user_id, member_role, is_active')
        .eq('supplier_id', id),
      admin.from('profiles').select('id, email, full_name').order('email'),
    ])

  if (!supplier) notFound()

  const productRows = products ?? []

  // Members carry only a user_id; the readable identity comes from profiles.
  const profileById = new Map(
    (profiles ?? []).map((p) => [p.id, { email: p.email, full_name: p.full_name }]),
  )
  const members: MemberRow[] = ((memberRows ?? []) as MemberRow[]).map((m) => ({
    ...m,
    email: profileById.get(m.user_id)?.email ?? null,
    full_name: profileById.get(m.user_id)?.full_name ?? null,
  }))
  const linked = new Set(members.filter((m) => m.is_active).map((m) => m.user_id))
  const candidates = (profiles ?? []).filter((p) => !linked.has(p.id))

  const summary = summarizeOnboarding({
    supplier: supplier as Supplier,
    activeMemberCount: members.filter((m) => m.is_active).length,
    productCount: productRows.length,
    publishedProductCount: productRows.filter((p) => p.status === 'active').length,
  })

  return (
    <div className="space-y-4 max-w-3xl">
      <h1 className="text-xl font-bold text-gray-900">עריכת ספק: {(supplier as Supplier).name}</h1>

      <SupplierOnboarding
        supplierId={id}
        summary={summary}
        members={members}
        candidates={candidates}
      />

      <SupplierForm supplier={supplier as Supplier} productCount={productRows.length} />

      <section className="bg-white border border-gray-200 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-gray-700 mb-3 border-b pb-1">
          מוצרים של הספק ({productRows.length})
        </h2>
        {productRows.length === 0 ? (
          <p className="text-sm text-gray-400">אין מוצרים משויכים</p>
        ) : (
          <ul className="divide-y divide-gray-100 text-sm">
            {productRows.map((p) => (
              <li key={p.id} className="flex items-center justify-between py-2">
                <Link href={`/admin/products/${p.id}/edit`} className="text-brand hover:underline">
                  {p.name_he}
                </Link>
                <span className="text-xs text-gray-500">
                  {p.type === 'coupon' ? 'קופון' : 'פיזי'} · {p.status}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-gray-500">
          שינוי פרטי הספק חל על הזמנות עתידיות בלבד. שורות הזמנה קיימות שומרות עותק של הזהות מרגע
          הרכישה.
        </p>
      </section>
    </div>
  )
}
