'use client'

import { SegmentErrorBoundary } from '@/components/errors/SegmentErrorBoundary'
import { t } from '@/lib/i18n/messages'

/**
 * The legal documents. They render from content files rather than the database,
 * so a throw here is a rendering fault and not an outage - but a terms page
 * showing Next's default English error screen is a compliance page that has
 * stopped saying anything.
 */
export default function LegalError({
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
      boundary="legal"
      title={t('errorBoundary.legalTitle')}
      body={t('errorBoundary.bodyGeneric')}
      homeHref="/"
      homeLabel={t('errorBoundary.home')}
    />
  )
}
