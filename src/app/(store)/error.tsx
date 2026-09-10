'use client'

import { SegmentErrorBoundary } from '@/components/errors/SegmentErrorBoundary'
import { t } from '@/lib/i18n/messages'

/**
 * The storefront boundary: category, product, search, cart and order pages.
 * Rendering inside the store layout is the point - the header, the search box and
 * the mini-cart stay on screen, so a shopper whose product page threw can keep
 * browsing instead of being handed a bare apology.
 *
 * Checkout is NOT covered by this file. It has its own boundary one level down,
 * because there the card may already have been charged and the wrong advice is
 * expensive.
 */
export default function StoreError({
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
      boundary="store"
      title={t('errorBoundary.storeTitle')}
      body={t('errorBoundary.bodyGeneric')}
      homeHref="/"
      homeLabel={t('errorBoundary.home')}
    />
  )
}
