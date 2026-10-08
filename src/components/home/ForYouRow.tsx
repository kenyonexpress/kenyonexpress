'use client'

import ProductCard, { type Product } from '@/components/ProductCard'
import { trackingAllowed } from '@/lib/analytics/commerce-client'
import { POSTHOG_ID_COOKIE } from '@/lib/observability/posthog'
import { readRecentViews } from '@/lib/recommendations/recent-views'
import { MIN_STRIP } from '@/lib/recommendations/rules'
import { useEffect, useState } from 'react'

export const FOR_YOU_ENDPOINT = '/api/recommendations/for-you'

export const FOR_YOU_TITLE = 'מותאם לך'

function hasPostHogId(): boolean {
  if (typeof document === 'undefined') return false
  return new RegExp(`(?:^|; )${POSTHOG_ID_COOKIE}=`).test(document.cookie)
}

/**
 * Builds the request, or null when there is nothing to personalise on: no
 * consent, or neither a PostHog id nor a recent view. Exported for the test;
 * the component never fetches when this is null.
 */
export function forYouRequestUrl(options: {
  allowed: boolean
  seeds: readonly string[]
  hasDistinctId: boolean
}): string | null {
  if (!options.allowed) return null
  if (options.seeds.length === 0 && !options.hasDistinctId) return null
  const params = new URLSearchParams()
  if (options.seeds.length > 0) params.set('seed', options.seeds.join(','))
  const query = params.toString()
  return query ? `${FOR_YOU_ENDPOINT}?${query}` : FOR_YOU_ENDPOINT
}

/**
 * The personalised home row (STEP 57), from the visitor's own `view_item`
 * history.
 *
 * A CLIENT ISLAND, SO THE HOME PAGE STAYS STATIC. The page is prerendered
 * and its first 2600px are measured against the live site; a server-rendered
 * personalised row would make the route dynamic for every visitor, bots
 * included, and stream under them. This mounts empty, decides in the browser
 * whether there is anything to personalise on, and only then asks
 * `/api/recommendations/for-you`. Visitors without consent, without a PostHog
 * id and without a recent view make no request and see no row: nothing is
 * reserved, so nothing above or below moves for them.
 *
 * CONSENT. Reading `ke_recent_views` and sending the PostHog id are behavioural
 * tracking, so both sit behind the same `trackingAllowed()` the capture does.
 * The id travels as the `ke_ph_id` cookie the server already mirrors, not as
 * a query parameter, so a visitor can only ever ask about themselves.
 */
export default function ForYouRow() {
  const [products, setProducts] = useState<Product[]>([])

  useEffect(() => {
    const url = forYouRequestUrl({
      allowed: trackingAllowed(),
      seeds: readRecentViews(),
      hasDistinctId: hasPostHogId(),
    })
    if (!url) return
    const controller = new AbortController()
    void (async () => {
      try {
        const res = await fetch(url, { signal: controller.signal, cache: 'no-store' })
        if (!res.ok) return
        const body = (await res.json()) as { products?: unknown }
        if (!Array.isArray(body.products)) return
        setProducts(body.products as Product[])
      } catch {
        // A missing row is the correct failure mode for a recommendation.
      }
    })()
    return () => controller.abort()
  }, [])

  if (products.length < MIN_STRIP) return null

  return (
    <section
      aria-labelledby="for-you-title"
      dir="rtl"
      data-for-you
      className="mx-auto w-full max-w-deals px-deals-pad pb-10 font-sans md:px-deals-pad-md xl:px-0"
    >
      <h2 id="for-you-title" className="m-0 mb-4 text-section-title font-bold text-heading">
        {FOR_YOU_TITLE}
      </h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {products.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </div>
    </section>
  )
}
