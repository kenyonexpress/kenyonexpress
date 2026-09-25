import { readBoughtThisWeek } from '@/lib/commerce/bought-this-week'
import { boughtThisWeekMessage } from '@/lib/commerce/social-proof'
import { connection } from 'next/server'

/**
 * "N נרכשו השבוע", streamed into the product page beside the scarcity line.
 *
 * Same shape as `StockScarcity` and for the same reason: the number moves with
 * every paid order, so it is read outside the hour-long product cache, behind
 * its own Suspense boundary, and the price and buy button never wait for it.
 *
 * RENDERS NOTHING under the floor or when nothing real was sold. There is no
 * fallback and no rounded phrase; the line is either an exact count of real
 * charges or absent. See `lib/commerce/social-proof.ts`.
 */
export default async function BoughtThisWeek({ productId }: { productId: string }) {
  // The window starts at "now", and the build refuses `new Date()` inside a
  // prerender ("unstable value"). This marks the subtree request-time before
  // the clock is read; the Suspense boundary round it keeps the rest of the
  // page prerendered exactly as before.
  await connection()
  const count = await readBoughtThisWeek(productId)
  const line = boughtThisWeekMessage(count)
  if (!line) return null
  return (
    <output className="pdp-summary__stock pdp-summary__proof" data-testid="bought-this-week">
      {line}
    </output>
  )
}
