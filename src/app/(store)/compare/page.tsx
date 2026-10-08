import ComparePageView from '@/components/compare/ComparePageView'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'השוואת מוצרים',
  robots: { index: false, follow: false },
}

/**
 * Fully static, like `/cart` and `/wishlist`: the list of ids is in the
 * browser, and the columns are one client read after hydration inside
 * `ComparePageView`. Nothing here is per request, so the route stays in the
 * static shell under `cacheComponents`.
 *
 * Unindexed on purpose: the page has no content of its own until a shopper
 * fills it, and a crawler would only ever see the empty state.
 */
export default function ComparePage() {
  return <ComparePageView />
}
