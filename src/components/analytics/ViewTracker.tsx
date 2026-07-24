'use client'

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
}: {
  event: Extract<ClientEventName, 'view_product' | 'view_category'>
  props: Record<string, unknown>
}) {
  const key = JSON.stringify(props)

  useEffect(() => {
    track(event, JSON.parse(key) as Record<string, unknown>)
  }, [event, key])

  return null
}
