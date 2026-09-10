'use client'

import { SegmentErrorBoundary } from '@/components/errors/SegmentErrorBoundary'
import { t } from '@/lib/i18n/messages'

/**
 * The (main) group: the coupon listings and the newsletter page. The same escape
 * as the root boundary, but rendered inside the group's own layout, so the chrome
 * survives the error rather than being replaced by it.
 */
export default function MainError({
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
      boundary="main"
      title={t('errorBoundary.mainTitle')}
      body={t('errorBoundary.bodyGeneric')}
      homeHref="/"
      homeLabel={t('errorBoundary.home')}
    />
  )
}
