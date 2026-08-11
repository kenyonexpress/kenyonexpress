'use client'

import { trackCommerce } from '@/lib/analytics/commerce-client'
import type { CommerceItem } from '@/lib/analytics/ecommerce'
import type { ClientEventName } from '@/lib/analytics/events'
import { track } from '@/lib/analytics/tracker'
import { useEffect } from 'react'

/**
 * Emits one view event when a server-rendered page mounts. Exists so pages stay
 * server components: they render a single zero-DOM client child instead of
 * becoming client components just to fire an event.
 *
 * Keyed by the event props, so navigating between two products of the same type
 * reports both.
 */
export default function ViewTracker({
  event,
  props,
  commerceItem,
}: {
  event: Extract<ClientEventName, 'view_product' | 'view_category'>
  props: Record<string, unknown>
  /**
   * Present only on a product page. When set, the same mount also fires GA4's
   * `view_item` and Meta's `ViewContent`.
   *
   * The two pipelines are fired from ONE place rather than from two components,
   * because the failure they would otherwise have is silent: a page that
   * reports a view to the first-party pipeline and not to the ad platforms
   * looks fine in both dashboards and is simply absent from one of them.
   */
  commerceItem?: CommerceItem
}) {
  const key = JSON.stringify(props)
  const commerceKey = commerceItem ? JSON.stringify(commerceItem) : null

  useEffect(() => {
    track(event, JSON.parse(key) as Record<string, unknown>)
  }, [event, key])

  useEffect(() => {
    if (!commerceKey) return
    const item = JSON.parse(commerceKey) as CommerceItem
    // A no-op without consent: `trackCommerce` finds neither vendor global,
    // because `ThirdPartyTags` has not mounted them.
    trackCommerce('view_item', { items: [item], valueAgorot: item.priceAgorot })
  }, [commerceKey])

  return null
}
