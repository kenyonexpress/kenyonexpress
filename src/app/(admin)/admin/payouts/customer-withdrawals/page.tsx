import { requireSection } from '@/lib/admin/rbac'
import { log } from '@/lib/observability/log'
import { createClient } from '@/lib/supabase/server'
import { formatPayoutMethod, formatPayoutStatus, formatWalletAmount } from '@/lib/wallet'
import type { PayoutRequest } from '@/lib/wallet'
import CustomerPayoutActions from './CustomerPayoutActions'

export const metadata = { title: 'משיכות לקוחות' }

const formatDate = (dateString: string | null) => {
  if (!dateString) return '—'
  return new Date(dateString).toLocaleDateString('he-IL', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const getStatusColor = (status: PayoutRequest['status']) => {
  switch (status) {
    case 'pending':
      return 'bg-yellow-100 text-yellow-800'
    case 'approved':
      return 'bg-blue-100 text-blue-800'
    case 'completed':
      return 'bg-green-100 text-green-800'
    case 'rejected':
      return 'bg-red-100 text-red-800'
    default:
      return 'bg-gray-100 text-gray-800'
  }
}

export default async function CustomerPayoutsPage() {
  await requireSection('payments')

  const supabase = await createClient()

  // Get all withdrawal requests
  const { data: allRequests, error: requestsError } = await supabase
    .from('customer_wallet_payouts')
    .select(
      `
      *,
      profiles!customer_wallet_payouts_user_id_fkey(email, full_name)
    `,
    )
    .order('requested_at', { ascending: false })
    .limit(100)

  if (requestsError) {
    log.error('withdrawals_list_failed', { err: requestsError })
  }

  const requests = (allRequests ?? []).map((row) => ({
    ...row,
    user_email: (row.profiles as any)?.email ?? '',
    user_name: (row.profiles as any)?.full_name ?? null,
  }))

  const pendingRequests = requests.filter((r) => r.status === 'pending')
  const completedRequests = requests.filter((r) => r.status === 'completed')
  const rejectedRequests = requests.filter((r) => r.status === 'rejected')

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">משיכות לקוחות</h1>
        <p className="mt-1 text-sm text-gray-500">
          בקשות משיכת יתרה מארנק לקוחות. יש לאשר ולטפל בכל בקשה באופן ידני.
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
          <p className="text-sm text-yellow-800">ממתינות לטיפול</p>
          <p className="text-2xl font-bold text-yellow-900">{pendingRequests.length}</p>
        </div>
        <div className="bg-green-50 p-4 rounded-lg border border-green-200">
          <p className="text-sm text-green-800">הושלמו</p>
          <p className="text-2xl font-bold text-green-900">{completedRequests.length}</p>
        </div>
        <div className="bg-red-50 p-4 rounded-lg border border-red-200">
          <p className="text-sm text-red-800">נדחו</p>
          <p className="text-2xl font-bold text-red-900">{rejectedRequests.length}</p>
        </div>
      </div>

      {/* Pending Requests */}
      {pendingRequests.length > 0 && (
        <section className="bg-white rounded-lg shadow">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">בקשות ממתינות</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    לקוח
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    סכום
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    שיטה
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    פרטים
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    תאריך בקשה
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    פעולות
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {pendingRequests.map((request) => (
                  <tr key={request.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900">
                        {request.user_name || 'ללא שם'}
                      </div>
                      <div className="text-sm text-gray-500">{request.user_email}</div>
                    </td>
                    <td className="px-6 py-4 text-sm font-semibold text-gray-900">
                      {formatWalletAmount(request.amount_agorot)}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-700">
                      {formatPayoutMethod(request.payout_method)}
                    </td>
                    <td className="px-6 py-4 text-sm">
                      {request.payout_method === 'bank_transfer' && request.bank_details && (
                        <div className="text-xs text-gray-600 font-mono">
                          <div>חשבון: {(request.bank_details as any).account_number}</div>
                          <div>סניף: {(request.bank_details as any).branch_code}</div>
                          <div>אסמכתא: {(request.bank_details as any).reference_id}</div>
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600">
                      {formatDate(request.requested_at)}
                    </td>
                    <td className="px-6 py-4">
                      <CustomerPayoutActions requestId={request.id} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* All Requests */}
      <section className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">כל הבקשות</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  לקוח
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  סכום
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  שיטה
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  סטטוס
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  תאריך בקשה
                </th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                  הערות
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {requests.map((request) => (
                <tr key={request.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <div className="text-sm font-medium text-gray-900">
                      {request.user_name || 'ללא שם'}
                    </div>
                    <div className="text-sm text-gray-500">{request.user_email}</div>
                  </td>
                  <td className="px-6 py-4 text-sm font-semibold text-gray-900">
                    {formatWalletAmount(request.amount_agorot)}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-700">
                    {formatPayoutMethod(request.payout_method)}
                  </td>
                  <td className="px-6 py-4">
                    <span
                      className={`inline-flex px-2 py-1 text-xs font-semibold rounded ${getStatusColor(request.status)}`}
                    >
                      {formatPayoutStatus(request.status)}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {formatDate(request.requested_at)}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {request.rejection_reason || request.admin_note || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}
