'use client'

import { SegmentErrorBoundary } from '@/components/errors/SegmentErrorBoundary'
import { t } from '@/lib/i18n/messages'

/**
 * The PUBLIC supplier profile, which is a shopper-facing page rather than the
 * supplier console. Tagged apart from (supplier) on purpose: a spike here is a
 * catalogue problem customers can see, a spike there is a till that stopped
 * working.
 */
export default function SupplierPublicError({
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
      boundary="supplier-public"
      title={t('errorBoundary.supplierPublicTitle')}
      body={t('errorBoundary.bodyGeneric')}
      homeHref="/"
      homeLabel={t('errorBoundary.home')}
    />
  )
}
