'use client'

import {
  type VendorActionState,
  updateVendorCommission,
  updateVendorStatus,
} from '@/server/actions/admin/vendors'
import { useActionState } from 'react'

interface Props {
  vendorId: string
  currentStatus: 'pending' | 'active' | 'suspended'
  currentCommission: number
}

const INITIAL: VendorActionState = null

export default function VendorDetailClient({ vendorId, currentStatus, currentCommission }: Props) {
  const [statusState, statusAction, statusPending] = useActionState(updateVendorStatus, INITIAL)
  const [commState, commAction, commPending] = useActionState(updateVendorCommission, INITIAL)

  return (
    <div className="grid grid-cols-2 gap-4">
      {/* Status form */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
        <h3 className="font-semibold text-gray-800">עדכון סטטוס</h3>
        <form action={statusAction} className="space-y-3">
          <input type="hidden" name="id" value={vendorId} />
          <select
            name="status"
            defaultValue={currentStatus}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
          >
            <option value="pending">ממתין</option>
            <option value="active">פעיל</option>
            <option value="suspended">מושעה</option>
          </select>
          {statusState && 'error' in statusState && (
            <p className="text-xs text-red-600">{statusState.error}</p>
          )}
          {statusState && 'success' in statusState && (
            <p className="text-xs text-green-600">{statusState.success}</p>
          )}
          <button
            type="submit"
            disabled={statusPending}
            className="w-full bg-brand hover:bg-brand-primary-hover disabled:opacity-60 text-brand-dark text-sm font-semibold rounded-lg py-2 transition-colors"
          >
            {statusPending ? 'שומר...' : 'עדכון סטטוס'}
          </button>
        </form>
      </div>

      {/* Commission form */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
        <h3 className="font-semibold text-gray-800">עמלת פלטפורמה</h3>
        <form action={commAction} className="space-y-3">
          <input type="hidden" name="id" value={vendorId} />
          <div className="relative">
            <input
              name="commission_rate"
              type="number"
              min="0"
              max="100"
              step="0.5"
              defaultValue={currentCommission}
              dir="ltr"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
            />
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
              %
            </span>
          </div>
          {commState && 'error' in commState && (
            <p className="text-xs text-red-600">{commState.error}</p>
          )}
          {commState && 'success' in commState && (
            <p className="text-xs text-green-600">{commState.success}</p>
          )}
          <button
            type="submit"
            disabled={commPending}
            className="w-full bg-brand hover:bg-brand-primary-hover disabled:opacity-60 text-brand-dark text-sm font-semibold rounded-lg py-2 transition-colors"
          >
            {commPending ? 'שומר...' : 'עדכון עמלה'}
          </button>
        </form>
      </div>
    </div>
  )
}
