'use client'

import { SegmentErrorBoundary } from '@/components/errors/SegmentErrorBoundary'

/**
 * The admin boundary. Keeps an operator inside the panel instead of dropping
 * them on the storefront home page, which is what the root boundary offers and
 * is never where an admin wanted to go.
 */
export default function AdminError({
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
      boundary="admin"
      title="משהו השתבש בפאנל הניהול"
      body="התקלה נרשמה אצלנו. אפשר לנסות לטעון מחדש, או לחזור ללוח הבקרה."
      homeHref="/admin"
      homeLabel="ללוח הבקרה"
    />
  )
}
