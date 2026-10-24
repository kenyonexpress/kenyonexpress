import type { Database } from '@/types/database'
import { Check } from 'lucide-react'

type VerificationStatus = Database['public']['Enums']['supplier_verification_status']

interface SupplierVerificationBadgeProps {
  status: VerificationStatus
  supplierName?: string
  className?: string
}

/**
 * Badge displaying supplier verification status.
 * Only shows for verified suppliers.
 */
export default function SupplierVerificationBadge({
  status,
  supplierName,
  className = '',
}: SupplierVerificationBadgeProps) {
  if (status !== 'verified') {
    return null
  }

  return (
    <div
      className={`inline-flex items-center gap-1 bg-blue-50 text-blue-700 px-2 py-1 rounded text-xs font-semibold ${className}`}
      title={supplierName ? `${supplierName} - ספק מאומת` : 'ספק מאומת'}
      aria-label={supplierName ? `${supplierName} - ספק מאומת` : 'ספק מאומת'}
    >
      <Check size={12} className="shrink-0" />
      <span>ספק מאומת</span>
    </div>
  )
}
