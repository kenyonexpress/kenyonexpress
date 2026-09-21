import SupplierForm from '@/components/admin/SupplierForm'
import { ledgerTotals } from '@/lib/admin/payout-ledger'
import { requireSection } from '@/lib/admin/rbac'
import { summarizeOnboarding } from '@/lib/admin/supplier-onboarding'
import { shekelsFromIls } from '@/lib/money-format'
import { createAdminClient } from '@/lib/supabase/admin'
import { readSupplierLedger } from '@/server/queries/payout-ledger'
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
      // Soft-deleted rows do not open this form. See the note on the same
      // line in admin/products/[id]/edit: there is no restore flow anywhere in
      // the panel, so a deleted id has no destination here, and saving from it
      // would write to a row nothing else reads.
      admin
        .from('suppliers')
        .select('*')
        .eq('id', id)
        .is('deleted_at', null)
        .single(),
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

  const ledger = await readSupplierLedger(id)
  const ledgerSummary = ledgerTotals(ledger.failed ? [] : ledger.lines)

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
        <h2 className="text-sm font-semibold text-gray-700 mb-3 border-b pb-1">יומן תשלומים</h2>
        {ledger.failed ? (
          <p className="text-sm text-red-600">יומן התשלומים לא נטען: {ledger.reason}</p>
        ) : ledger.lines.length === 0 ? (
          <p className="text-sm text-gray-400">אין עדיין שורות תשלום לספק הזה</p>
        ) : (
          <dl className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <dt className="text-xs text-gray-500">שורות</dt>
              <dd className="font-semibold tabular-nums">{ledgerSummary.lines}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">סה"כ לתשלום (דוחות חיים)</dt>
              <dd className="font-semibold tabular-nums">
                {shekelsFromIls(ledgerSummary.owedIls)}
              </dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500">מתוכם שולם</dt>
              <dd className="font-semibold tabular-nums">
                {shekelsFromIls(ledgerSummary.paidIls)}
              </dd>
            </div>
          </dl>
        )}
        <p className="mt-3 flex flex-wrap gap-3 text-xs">
          <Link href={`/admin/payouts?supplier=${id}`} className="text-brand hover:underline">
            דוחות התשלום של הספק
          </Link>
          {!ledger.failed && ledger.lines.length > 0 && (
            <a
              href={`/api/admin/payouts/ledger?supplier=${id}`}
              className="text-brand hover:underline"
            >
              ייצוא היומן ל-CSV
            </a>
          )}
        </p>
      </section>

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
