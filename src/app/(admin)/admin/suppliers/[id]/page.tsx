import SupplierForm from '@/components/admin/SupplierForm'
import { requireSection } from '@/lib/admin/rbac'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Supplier } from '@/types/database'
import Link from 'next/link'
import { notFound } from 'next/navigation'

export const metadata = { title: 'עריכת ספק' }

interface Props {
  params: Promise<{ id: string }>
}

export default async function EditSupplierPage({ params }: Props) {
  const { id } = await params
  await requireSection('suppliers', 'read')

  const admin = createAdminClient()
  const [{ data: supplier }, { data: products }] = await Promise.all([
    admin.from('suppliers').select('*').eq('id', id).single(),
    admin
      .from('products')
      .select('id, name_he, status, type')
      .eq('supplier_id', id)
      .is('deleted_at', null)
      .order('name_he', { ascending: true }),
  ])

  if (!supplier) notFound()

  const productRows = products ?? []

  return (
    <div className="space-y-4 max-w-3xl">
      <h1 className="text-xl font-bold text-gray-900">עריכת ספק: {(supplier as Supplier).name}</h1>

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
