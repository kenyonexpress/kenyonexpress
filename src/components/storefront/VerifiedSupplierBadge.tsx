import { t } from '@/lib/i18n/messages'
import { BadgeCheck } from 'lucide-react'

/**
 * "ספק מאומת" beside a supplier's name. Rendered only when the caller's
 * `verified` came from `decideSupplierVerification`: an approved application
 * or a real redemption at the counter, never the status column's default.
 * Nothing here decides; the badge is the last step of a decision made from
 * data, which is why it takes a boolean and not the supplier.
 */
export default function VerifiedSupplierBadge({ className = '' }: { className?: string }) {
  return (
    <span
      className={`pdp-verified${className ? ` ${className}` : ''}`}
      data-testid="supplier-verified"
    >
      <BadgeCheck size={14} aria-hidden="true" />
      {t('pdp.supplierVerified')}
    </span>
  )
}
