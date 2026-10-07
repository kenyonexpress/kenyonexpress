import { requireSection } from '@/lib/admin/rbac'
import { RETURN_DESTINATION_LABELS, RETURN_REASONS } from '@/lib/returns/policy'
import { listReturnRequestsForAdmin } from '@/server/queries/returns'
import Link from 'next/link'
import ReturnRequestAdmin from '../[id]/ReturnRequestAdmin'

export const metadata = { title: 'בקשות החזרה' }

/**
 * /admin/orders/returns (STEP 44): the queue of customer return requests
 * awaiting a decision, oldest notice first because the 14-day clock runs on
 * the notice. Each card decides in place; the order link is for context.
 */
export default async function ReturnsQueuePage() {
  await requireSection('orders', 'write')
  const [open, recent] = await Promise.all([
    listReturnRequestsForAdmin({ states: ['requested', 'approved'] }),
    listReturnRequestsForAdmin({
      states: ['executing', 'completed', 'rejected', 'failed'],
      limit: 30,
    }),
  ])

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">בקשות החזרה</h1>
        <Link href="/admin/orders" className="text-sm text-blue-700 hover:underline">
          לכל ההזמנות
        </Link>
      </div>

      <section className="space-y-4">
        <h2 className="font-semibold text-gray-700">ממתינות להחלטה ({open.length})</h2>
        {open.length === 0 ? (
          <p className="text-sm text-gray-500">אין בקשות פתוחות.</p>
        ) : (
          open.map((request) => (
            <div key={request.id} className="space-y-1">
              <p className="text-sm text-gray-600">
                <Link
                  href={`/admin/orders/${request.orderId}`}
                  className="text-blue-700 hover:underline"
                >
                  הזמנה {request.orderId.slice(0, 8).toUpperCase()}
                </Link>
                {request.customerName ? ` · ${request.customerName}` : ''}
                {request.customerEmail ? ` · ${request.customerEmail}` : ''}
              </p>
              <ReturnRequestAdmin request={request} compact />
            </div>
          ))
        )}
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold text-gray-700">טופלו לאחרונה</h2>
        {recent.length === 0 ? (
          <p className="text-sm text-gray-500">עדיין אין.</p>
        ) : (
          <table className="w-full text-sm bg-white border border-gray-200 rounded-xl overflow-hidden">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="p-2 text-right">RMA</th>
                <th className="p-2 text-right">הזמנה</th>
                <th className="p-2 text-right">סיבה</th>
                <th className="p-2 text-right">יעד</th>
                <th className="p-2 text-right">מצב</th>
              </tr>
            </thead>
            <tbody>
              {recent
                .slice()
                .reverse()
                .map((request) => (
                  <tr key={request.id} className="border-t border-gray-100">
                    <td className="p-2" dir="ltr">
                      {request.rma}
                    </td>
                    <td className="p-2">
                      <Link
                        href={`/admin/orders/${request.orderId}`}
                        className="text-blue-700 hover:underline"
                      >
                        {request.orderId.slice(0, 8).toUpperCase()}
                      </Link>
                    </td>
                    <td className="p-2">
                      {request.reasonCode
                        ? RETURN_REASONS[request.reasonCode].label
                        : request.ground}
                    </td>
                    <td className="p-2">{RETURN_DESTINATION_LABELS[request.destination]}</td>
                    <td className="p-2">{request.state}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  )
}
