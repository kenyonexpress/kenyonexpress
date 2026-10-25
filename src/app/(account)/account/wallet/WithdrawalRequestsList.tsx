'use client'

import { formatPayoutMethod, formatPayoutStatus, formatWalletAmount } from '@/lib/wallet/display'
import type { PayoutRequest } from '@/lib/wallet/types'

export default function WithdrawalRequestsList({ requests }: { requests: PayoutRequest[] }) {
  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-'
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
        return 'text-yellow-700 bg-yellow-50'
      case 'approved':
        return 'text-blue-700 bg-blue-50'
      case 'completed':
        return 'text-green-700 bg-green-50'
      case 'rejected':
        return 'text-red-700 bg-red-50'
      default:
        return 'text-gray-700 bg-gray-50'
    }
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500">
              תאריך בקשה
            </th>
            <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500">
              סכום
            </th>
            <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500">
              שיטה
            </th>
            <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500">
              סטטוס
            </th>
            <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500">
              הערות
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {requests.map((request) => (
            <tr key={request.id}>
              <td className="px-4 py-3 text-sm text-gray-900">
                {formatDate(request.requested_at)}
              </td>
              <td className="px-4 py-3 text-sm font-medium text-gray-900">
                {formatWalletAmount(request.amount_agorot)}
              </td>
              <td className="px-4 py-3 text-sm text-gray-700">
                {formatPayoutMethod(request.payout_method)}
              </td>
              <td className="px-4 py-3 text-sm">
                <span
                  className={`inline-flex px-2 py-1 rounded text-xs font-medium ${getStatusColor(request.status)}`}
                >
                  {formatPayoutStatus(request.status)}
                </span>
              </td>
              <td className="px-4 py-3 text-sm text-gray-600">
                {request.rejection_reason || request.admin_note || '-'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
