import { PackageX } from 'lucide-react'

/**
 * The sold-out state of a product page, said once and said plainly.
 *
 * A coupon that has run out has not "אזל מהמלאי" -- there is no stock, the
 * deal closed -- and the two need different words. `isCoupon` is what picks
 * between them, and the same pair is used by the buy button and the sticky
 * bar so the page never says both at once.
 */
export default function SoldOutBadge({
  isCoupon = false,
  className = '',
}: {
  isCoupon?: boolean
  className?: string
}) {
  return (
    <p
      className={`inline-flex items-center gap-2 rounded-lg bg-surface-hover px-3 py-2 text-sm font-bold text-heading ${className}`}
    >
      <PackageX size={16} aria-hidden="true" className="text-price" />
      {isCoupon ? 'הדיל נסגר' : 'אזל מהמלאי'}
    </p>
  )
}
