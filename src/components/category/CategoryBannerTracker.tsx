'use client'

import { trackingAllowed } from '@/lib/analytics/commerce-client'
import { bannerEventPath } from '@/lib/category-banners/rules'
import { trackEvent } from '@/lib/observability/posthog'
import { useEffect, useRef } from 'react'

/**
 * The counting half of a category banner (STEP 62). Zero DOM of its own: it
 * mounts beside the server-rendered banner, fires ONE impression when it
 * mounts, and listens for clicks inside the banner's element by id so the
 * banner itself stays a server component.
 *
 * TWO PIPELINES, TWO RULES. The first-party counter (`/api/category-banners/
 * [id]/events`) is an aggregate per banner per day with no visitor
 * identifier, so it fires regardless of consent. The PostHog mirror carries
 * the browser's distinct id, so it fires only behind the same gate every
 * other behavioural capture is behind. A visitor who declined is counted
 * once in a total and nowhere else.
 *
 * `keepalive` lets the click's request finish across the navigation the
 * click causes, which is exactly when it fires. Failures are swallowed:
 * analytics is best effort by definition.
 */
export default function CategoryBannerTracker({
  bannerId,
  categoryId,
  elementId,
}: {
  bannerId: string
  categoryId: string
  elementId: string
}) {
  const impressed = useRef<string | null>(null)

  useEffect(() => {
    if (impressed.current === bannerId) return
    impressed.current = bannerId
    send(bannerId, 'impression')
    if (trackingAllowed()) {
      trackEvent('category_banner_impression', { banner_id: bannerId, category_id: categoryId })
    }
  }, [bannerId, categoryId])

  useEffect(() => {
    const element = document.getElementById(elementId)
    if (!element) return
    const onClick = (event: MouseEvent) => {
      // Only a real link inside the banner is a click; a drag or a text
      // selection on the headline is not.
      const target = event.target as Element | null
      if (!target?.closest('a[href]')) return
      send(bannerId, 'click')
      if (trackingAllowed()) {
        trackEvent('category_banner_click', { banner_id: bannerId, category_id: categoryId })
      }
    }
    element.addEventListener('click', onClick)
    return () => element.removeEventListener('click', onClick)
  }, [bannerId, categoryId, elementId])

  return null
}

function send(bannerId: string, kind: 'impression' | 'click'): void {
  try {
    void fetch(bannerEventPath(bannerId), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind }),
      keepalive: true,
      credentials: 'same-origin',
    }).catch(() => {
      // Best effort.
    })
  } catch {
    // Same.
  }
}
