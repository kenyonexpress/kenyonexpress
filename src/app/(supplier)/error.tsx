'use client'

import { SegmentErrorBoundary } from '@/components/errors/SegmentErrorBoundary'

/**
 * The supplier boundary.
 *
 * The person reading this is standing at a till with a customer in front of
 * them, mid-redemption, on a phone. The root boundary's escape hatch is "לדף
 * הבית" and it goes to the storefront, which is not where they were and not
 * anywhere they can finish what they started. This one keeps them inside the
 * scanner.
 */
export default function SupplierError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <SegmentErrorBoundary
      error={error}
      reset={reset}
      boundary="supplier"
      title="משהו השתבש"
      body="התקלה נרשמה אצלנו. אפשר לנסות שוב, או לחזור למסך הסריקה ולסרוק את הקוד מחדש."
      homeHref="/scan"
      homeLabel="למסך הסריקה"
    />
  )
}
