import StatusBadge from '@/components/admin/StatusBadge'
import { requireAdminSession } from '@/lib/admin/rbac'
import { agorot, formatAgorot } from '@/lib/money'
import { createAdminClient } from '@/lib/supabase/admin'
import Link from 'next/link'
import SupplierRequestActions from '../SupplierRequestActions'

export const metadata = { title: 'הצעות מחיר מספקים' }

/** PostgREST's schema-cache miss, and Postgres' undefined_table. 232 is pending. */
const TABLE_ABSENT = new Set(['PGRST205', 'PGRST106', '42P01'])

type Row = {
  id: string
  supplier_id: string
  product_id: string
  current_kenyon_price_agorot: number | null
  proposed_kenyon_price_agorot: number
  note: string | null
  created_at: string | null
  suppliers: { name: string | null } | null
  products: { name_he: string | null; slug: string | null } | null
}

/**
 * The decision half of section 54's price proposals. PENDING ONLY, like the
 * contact-request queue: decided rows live on the supplier's own page.
 *
 * Approval goes through `buildProductMoneyWrite`, so the number in the
 * "proposed" column is what the supplier asked for and not necessarily every
 * column the approval will write; the split and the coupon price are
 * recomputed from the product's current settings around it.
 */
export default async function SupplierPriceProposalsPage() {
  await requireAdminSession()
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('supplier_price_proposals' as never)
    .select(
      'id, supplier_id, product_id, current_kenyon_price_agorot, proposed_kenyon_price_agorot, note, created_at, suppliers(name), products(name_he, slug)',
    )
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(200)
  const notApplied = Boolean(error) && TABLE_ABSENT.has(error?.code ?? '')
  const rows = (data ?? []) as unknown as Row[]

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold text-gray-900">הצעות מחיר מספקים</h1>
        <StatusBadge label={`${rows.length} ממתינות`} variant={rows.length ? 'yellow' : 'green'} />
      </div>
      <p className="text-sm text-gray-500">
        ספק מציע מחיר מדבקה חדש למוצר שלו. אישור מחשב מחדש את כל עמודות הכסף של המוצר דרך אותו מודול
        שטופס המוצר משתמש בו, ורושם שורת ביקורת. דחייה דורשת סיבה שהספק יראה.
      </p>
      {notApplied ? (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          המיגרציה ‏232 עדיין לא הוחלה, ולכן אין טבלת הצעות. עד שתוחל, ספקים אינם יכולים להגיש הצעות
          והמסך הזה יישאר ריק.
        </p>
      ) : null}
      {error && !notApplied ? (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-900">טעינת ההצעות נכשלה.</p>
      ) : null}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-start text-xs text-gray-500">
              <th className="px-5 py-3 text-start font-medium">ספק</th>
              <th className="px-5 py-3 text-start font-medium">מוצר</th>
              <th className="px-5 py-3 text-start font-medium">כרגע</th>
              <th className="px-5 py-3 text-start font-medium">מוצע</th>
              <th className="px-5 py-3 text-start font-medium">הערה</th>
              <th className="px-5 py-3 text-start font-medium">הוגשה</th>
              <th className="px-5 py-3 text-start font-medium">פעולות</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row) => (
              <tr key={row.id} className="transition-colors hover:bg-gray-50">
                <td className="px-5 py-3">
                  <Link
                    href={`/admin/suppliers/${row.supplier_id}`}
                    className="font-medium text-ink underline-offset-2 hover:underline"
                  >
                    {row.suppliers?.name ?? 'ספק'}
                  </Link>
                </td>
                <td className="px-5 py-3 text-gray-700">
                  <Link
                    href={`/admin/products/${row.product_id}`}
                    className="underline-offset-2 hover:underline"
                  >
                    {row.products?.name_he ?? row.product_id.slice(0, 8)}
                  </Link>
                </td>
                <td className="px-5 py-3 text-gray-500" dir="ltr">
                  {row.current_kenyon_price_agorot === null
                    ? '—'
                    : formatAgorot(agorot(row.current_kenyon_price_agorot))}
                </td>
                <td className="px-5 py-3 font-semibold text-gray-900" dir="ltr">
                  {formatAgorot(agorot(row.proposed_kenyon_price_agorot))}
                </td>
                <td className="px-5 py-3 text-gray-500">{row.note ?? '—'}</td>
                <td className="px-5 py-3 text-gray-500">
                  {row.created_at ? new Date(row.created_at).toISOString().slice(0, 10) : '—'}
                </td>
                <td className="px-5 py-3">
                  <SupplierRequestActions
                    id={row.id}
                    kind="price"
                    label={row.products?.name_he ?? 'המוצר'}
                  />
                </td>
              </tr>
            ))}
            {rows.length === 0 && !error ? (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-gray-400">
                  אין הצעות ממתינות
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  )
}
