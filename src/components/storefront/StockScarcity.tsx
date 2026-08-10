import { readLiveStock } from '@/lib/commerce/stock-live'
import {
  couponStockMessageHebrew,
  stockDisplay,
  stockMessageHebrew,
} from '@/lib/commerce/stock-scarcity'

/**
 * "Only 3 left", read live and streamed into the product page.
 *
 * WHY IT IS ITS OWN COMPONENT. `loadProductBySlug` is a `'use cache'` function
 * with an hour's life, and availability changes every time somebody starts or
 * abandons a checkout. Reading it inside the cached subtree made the whole
 * route uncacheable - `next build` refuses that outright under
 * `cacheComponents` with "Uncached data was accessed outside of <Suspense>",
 * which is how the first attempt was caught rather than shipped.
 *
 * So this is the only part of the page that is live, it sits behind its own
 * Suspense boundary, and the price and the buy button paint from cache without
 * waiting for it. That split is right on its own terms too: a scarcity badge is
 * the one line worth arriving a beat late, and the one line that must never be
 * stale.
 *
 * IT RENDERS NOTHING for an untracked product, which is most of the catalogue,
 * and `readLiveStock` skips the query entirely in that case.
 */
export default async function StockScarcity({
  productId,
  trackedLevel,
  isCoupon,
}: {
  productId: string
  /** The cached level, used ONLY to decide whether this product is tracked. */
  trackedLevel: number | null
  isCoupon: boolean
}) {
  const live = await readLiveStock(productId, trackedLevel)
  const display = stockDisplay({
    available: live.available,
    initial: live.initial,
    threshold: live.threshold,
  })

  const line = isCoupon ? couponStockMessageHebrew(display) : stockMessageHebrew(display)
  // Sold out is stated by the main stock line, which reads the cached level.
  // Saying it twice under two different reads is how the two come to disagree
  // on screen.
  if (!line || display.kind === 'sold_out') return null

  return <output className="pdp-summary__stock pdp-summary__stock--low">{line}</output>
}
