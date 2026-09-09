import StatusBadge from '@/components/admin/StatusBadge'
import { requireAdminSession } from '@/lib/admin/rbac'
import { createAdminClient } from '@/lib/supabase/admin'
import { CONTACT_FIELD_LABEL_HE, isContactField } from '@/lib/supplier/contact-fields'
import Link from 'next/link'
import ContactRequestActions from './ContactRequestActions'

export const metadata = { title: 'בקשות עדכון פרטי ספק' }

/** PostgREST's schema-cache miss, and Postgres' undefined_table. 225 is pending. */
const TABLE_ABSENT = new Set(['PGRST205', 'PGRST106', '42P01'])

type Row = {
  id: string
  supplier_id: string
  field: string
  current_value: string | null
  requested_value: string
  note: string | null
  created_at: string | null
  suppliers: { name: string | null } | null
}

/**
 * The approval half of section 28's contact-details request.
 *
 * PENDING ONLY. The decided rows are history and belong on the supplier's own
 * page, where the person who filed the request will look for the answer; a queue
 * that accumulates every decision ever made stops being a queue on the day it
 * matters.
 *
 * 225 IS NOT APPLIED, so a missing table renders an explanation rather than an
 * error. An admin opening this page before the migration lands should be told
 * that, not shown a crash.
 */
export default async function SupplierContactRequestsPage() {
  await requireAdminSession()

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('supplier_contact_requests' as never)
    .select(
      'id, supplier_id, field, current_value, requested_value, note, created_at, suppliers(name)',
    )
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(200)

  const notApplied = Boolean(error) && TABLE_ABSENT.has(error?.code ?? '')
  const rows = (data ?? []) as unknown as Row[]

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold text-gray-900">בקשות עדכון פרטי ספק</h1>
        <StatusBadge label={`${rows.length} ממתינות`} variant={rows.length ? 'yellow' : 'green'} />
      </div>
      <p className="text-sm text-gray-500">
        ספקים אינם עורכים את פרטי הקשר שלהם ישירות. אישור כאן כותב את הערך לשורת הספק ורושם שורת
        ביקורת עם מי אישר ומה היה הערך הקודם.
      </p>

      {notApplied ? (
        <p className="rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
          המיגרציה ‏225 עדיין לא הוחלה, ולכן אין טבלת בקשות. עד שתוחל, ספקים אינם יכולים להגיש בקשות
          והמסך הזה יישאר ריק.
        </p>
      ) : null}

      {error && !notApplied ? (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-900">טעינת הבקשות נכשלה.</p>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-start text-xs text-gray-500">
              <th className="px-5 py-3 text-start font-medium">ספק</th>
              <th className="px-5 py-3 text-start font-medium">שדה</th>
              <th className="px-5 py-3 text-start font-medium">כרגע</th>
              <th className="px-5 py-3 text-start font-medium">מבוקש</th>
              <th className="px-5 py-3 text-start font-medium">הערה</th>
              <th className="px-5 py-3 text-start font-medium">הוגשה</th>
              <th className="px-5 py-3 text-start font-medium">פעולות</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row) => {
              const label = isContactField(row.field)
                ? CONTACT_FIELD_LABEL_HE[row.field]
                : row.field
              return (
                <tr key={row.id} className="transition-colors hover:bg-gray-50">
                  <td className="px-5 py-3">
                    <Link
                      href={`/admin/suppliers/${row.supplier_id}`}
                      className="font-medium text-ink underline-offset-2 hover:underline"
                    >
                      {row.suppliers?.name ?? 'ספק'}
                    </Link>
                  </td>
                  <td className="px-5 py-3 text-gray-600">{label}</td>
                  {/* The two values are the decision. They are Latin as often
                      as not (an email, a URL, a phone), so they carry their own
                      direction rather than inheriting the panel's. */}
                  <td className="px-5 py-3 text-gray-500" dir="ltr">
                    {row.current_value || '—'}
                  </td>
                  <td className="px-5 py-3 font-semibold text-gray-900" dir="ltr">
                    {row.requested_value}
                  </td>
                  <td className="px-5 py-3 text-xs text-gray-500">{row.note ?? ''}</td>
                  <td className="px-5 py-3 text-xs text-gray-500">
                    {row.created_at ? new Date(row.created_at).toLocaleDateString('he-IL') : ''}
                  </td>
                  <td className="px-5 py-3">
                    <ContactRequestActions requestId={row.id} label={label} />
                  </td>
                </tr>
              )
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="px-5 py-10 text-center text-gray-400">
                  אין בקשות הממתינות לאישור
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
