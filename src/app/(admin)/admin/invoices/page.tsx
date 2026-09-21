import StatusBadge from '@/components/admin/StatusBadge'
import {
  INVOICE_STATUS_LABEL_HE,
  INVOICE_STATUS_VARIANT,
  INVOICE_TYPE_LABEL_HE,
  canRequeueInvoice,
  parseInvoiceSearch,
} from '@/lib/admin/invoices'
import { requireSection } from '@/lib/admin/rbac'
import { formatAgorot } from '@/lib/money'
import { searchInvoices } from '@/server/queries/invoices'
import Link from 'next/link'
import RequeueInvoiceButton from './RequeueInvoiceButton'

export const metadata = { title: 'חשבוניות' }

const STATUSES = ['pending', 'issued', 'failed', 'dead'] as const

/**
 * Section 56's "admin invoice search and reissue". Search by document number,
 * by customer address, or by a full order id; filter by queue state. Reissue
 * is a requeue for anything the provider never produced, and the document
 * link for anything it did.
 */
export default async function AdminInvoicesPage(props: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  await requireSection('payments', 'read')
  const raw = await props.searchParams
  const q = typeof raw.q === 'string' ? raw.q : ''
  const statusRaw = typeof raw.status === 'string' ? raw.status : ''
  const status = (STATUSES as readonly string[]).includes(statusRaw) ? statusRaw : null
  const search = parseInvoiceSearch(q)
  const { rows, error } = await searchInvoices({ search, status })

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-xl font-bold text-gray-900">חשבוניות</h1>
        <StatusBadge label={`${rows.length} בתצוגה`} variant="gray" />
      </div>
      <p className="text-sm text-gray-500">
        המסמכים מונפקים אוטומטית אחרי כל תשלום: קבלה על קופון, חשבונית מס/קבלה על מוצר פיזי,
        וחשבונית זיכוי על החזר. מסמך שנכשל חוזר לתור מכאן; מסמך שהונפק אינו מונפק שוב, הקישור שלו
        הוא המסמך.
      </p>

      <form className="flex flex-wrap items-end gap-3" method="get">
        <div>
          <label htmlFor="invoice-q" className="block text-xs text-gray-500">
            מספר מסמך, אימייל לקוח או מזהה הזמנה מלא
          </label>
          <input
            id="invoice-q"
            name="q"
            defaultValue={q}
            dir="ltr"
            className="mt-1 w-80 rounded-lg border border-gray-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label htmlFor="invoice-status" className="block text-xs text-gray-500">
            סטטוס
          </label>
          <select
            id="invoice-status"
            name="status"
            defaultValue={status ?? ''}
            className="mt-1 rounded-lg border border-gray-300 px-3 py-2 text-sm"
          >
            <option value="">הכל</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {INVOICE_STATUS_LABEL_HE[s]}
              </option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-semibold text-white"
        >
          חיפוש
        </button>
      </form>

      {error ? (
        <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-900">
          טעינת החשבוניות נכשלה: {error}
        </p>
      ) : null}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50 text-xs text-gray-500">
              <th className="px-4 py-3 text-start font-medium">מסמך</th>
              <th className="px-4 py-3 text-start font-medium">סוג</th>
              <th className="px-4 py-3 text-start font-medium">הזמנה</th>
              <th className="px-4 py-3 text-start font-medium">לקוח</th>
              <th className="px-4 py-3 text-start font-medium">סכום</th>
              <th className="px-4 py-3 text-start font-medium">מע״מ</th>
              <th className="px-4 py-3 text-start font-medium">סטטוס</th>
              <th className="px-4 py-3 text-start font-medium">פעולות</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((row) => (
              <tr key={row.id} className="transition-colors hover:bg-gray-50">
                <td className="px-4 py-3" dir="ltr">
                  {row.documentUrl ? (
                    <a
                      href={row.documentUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-ink underline-offset-2 hover:underline"
                    >
                      {row.documentNumber ?? row.id.slice(0, 8)}
                    </a>
                  ) : (
                    <span className="text-gray-500">{row.documentNumber ?? '—'}</span>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-700">
                  {INVOICE_TYPE_LABEL_HE[row.documentType] ?? row.documentType}
                </td>
                <td className="px-4 py-3" dir="ltr">
                  <Link
                    href={`/admin/orders/${row.orderId}`}
                    className="underline-offset-2 hover:underline"
                  >
                    {row.orderRef}
                  </Link>
                </td>
                <td className="px-4 py-3 text-gray-600" dir="ltr">
                  {row.customerEmail ?? '—'}
                </td>
                <td className="px-4 py-3 font-semibold text-gray-900" dir="ltr">
                  {formatAgorot(row.totalAgorot)}
                </td>
                <td className="px-4 py-3 text-gray-600" dir="ltr">
                  {formatAgorot(row.vatAgorot)}
                  {row.vatPercent !== null ? ` (${row.vatPercent}%)` : ''}
                </td>
                <td className="px-4 py-3">
                  <StatusBadge
                    label={INVOICE_STATUS_LABEL_HE[row.status] ?? row.status}
                    variant={INVOICE_STATUS_VARIANT[row.status] ?? 'gray'}
                  />
                  {row.lastError ? (
                    <div
                      className="mt-1 max-w-xs truncate text-xs text-red-700"
                      title={row.lastError}
                    >
                      {row.lastError}
                    </div>
                  ) : null}
                </td>
                <td className="px-4 py-3">
                  {canRequeueInvoice(row.status) ? <RequeueInvoiceButton id={row.id} /> : null}
                </td>
              </tr>
            ))}
            {rows.length === 0 && !error ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-gray-400">
                  אין חשבוניות תואמות
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  )
}
