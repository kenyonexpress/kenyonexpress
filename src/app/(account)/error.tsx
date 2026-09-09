'use client'

import { SegmentErrorBoundary } from '@/components/errors/SegmentErrorBoundary'

/**
 * The account boundary. A customer looking at their orders or vouchers who
 * hits a throw should land back in their account, not on the storefront with
 * whatever they were checking abandoned.
 */
export default function AccountError({
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
      boundary="account"
      title="משהו השתבש באזור האישי"
      body="התקלה נרשמה אצלנו. אפשר לנסות לטעון מחדש, או לחזור לאזור האישי."
      homeHref="/account"
      homeLabel="לאזור האישי"
    />
  )
}
