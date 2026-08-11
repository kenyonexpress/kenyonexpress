'use client'

import { type VendorActionState, updateVendorStatus } from '@/server/actions/admin/vendors'
import { useActionState } from 'react'

interface Props {
  vendorId: string
  currentStatus: 'pending' | 'active' | 'suspended'
}

const INITIAL: VendorActionState = null

export default function VendorDetailClient({ vendorId, currentStatus }: Props) {
  const [statusState, statusAction, statusPending] = useActionState(updateVendorStatus, INITIAL)

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

      {/*
        The commission card was removed on 2026-08-11. A supplier-level rate
        contradicts the per-product rule in AGENTS.md, and it was the only
        writer of vendors.commission_rate.
      */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-2">
        <h3 className="font-semibold text-gray-800">עמלת פלטפורמה</h3>
        <p className="text-xs text-gray-600">
          העמלה נקבעת לכל מוצר בנפרד, במסך עריכת המוצר. לספק אחד יכולים להיות מוצרים באחוזים שונים,
          ולכן אין כאן עמלה אחת לעדכן.
        </p>
      </div>
    </div>
  )
}
