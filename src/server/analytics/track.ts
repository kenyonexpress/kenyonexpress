import 'server-only'

import { ATTRIBUTION_COOKIE, type Attribution, parseAttribution } from '@/lib/analytics/attribution'
import type { ServerEventName } from '@/lib/analytics/events'
import { GUEST_SESSION_COOKIE, parseGuestSessionToken } from '@/lib/cart/guest-session'
import { createAdminClient } from '@/lib/supabase/admin'
import { cookies } from 'next/headers'

// Server-side analytics writes. Three rules hold everywhere in this file:
//   1. Nothing here is gated on cookie consent. These are records of a
//      transaction the user initiated, not browser telemetry.
//   2. Nothing here can throw into the caller. A checkout must never fail
//      because an analytics insert did.
//   3. Money is never written here. Revenue is read from orders / order_items.

type ServerEventInput = {
  eventName: ServerEventName
  props: Record<string, unknown>
  userId: string | null
  path?: string
}

/**
 * Emits a server-origin event through the same validated ingest path the
 * browser uses, so the registry stays the single gate for every write.
 */
export async function trackServerEvent(input: ServerEventInput): Promise<void> {
  try {
    const cookieStore = await cookies()
    const anonymousId = parseGuestSessionToken(cookieStore.get(GUEST_SESSION_COOKIE)?.value)
    const attribution = parseAttribution(cookieStore.get(ATTRIBUTION_COOKIE)?.value)

    const admin = createAdminClient()
    await admin.rpc('fn_ingest_analytics_events', {
      p_events: [
        {
          event_id: crypto.randomUUID(),
          event_name: input.eventName,
          occurred_at: new Date().toISOString(),
          source: 'server',
          source_app: 'shop',
          anonymous_id: anonymousId,
          session_id: anonymousId,
          path: input.path ?? null,
          utm: attribution?.last ?? null,
          props: input.props,
        },
      ],
      p_user_id: input.userId,
      p_ip: null,
      p_user_agent: null,
    })
  } catch (error) {
    console.error('trackServerEvent failed:', error instanceof Error ? error.message : error)
  }
}

/**
 * Records that a guest id and a user id are the same person, so pre-login
 * behavior can be attributed at query time. Written at login and again at
 * checkout: two cheap upserts beat one missed link.
 */
export async function linkAnalyticsIdentity(userId: string): Promise<void> {
  try {
    const cookieStore = await cookies()
    const anonymousId = parseGuestSessionToken(cookieStore.get(GUEST_SESSION_COOKIE)?.value)
    if (!anonymousId) return

    const admin = createAdminClient()
    await admin
      .from('analytics_identity_links')
      .upsert(
        { anonymous_id: anonymousId, user_id: userId },
        { onConflict: 'anonymous_id,user_id' },
      )
  } catch (error) {
    console.error('linkAnalyticsIdentity failed:', error instanceof Error ? error.message : error)
  }
}

/**
 * The attribution snapshot frozen onto orders.attribution at checkout. Written
 * once, never updated after payment: a report of last October must not move
 * because the customer clicked a new campaign in March.
 */
export async function readAttributionSnapshot(): Promise<Attribution | null> {
  try {
    const cookieStore = await cookies()
    return parseAttribution(cookieStore.get(ATTRIBUTION_COOKIE)?.value)
  } catch {
    return null
  }
}

/**
 * Stamps the attribution snapshot onto a freshly created order.
 *
 * Deliberately a separate UPDATE rather than a column on the INSERT: the
 * orders.attribution column arrives with migration 033, and checkout must keep
 * working on an environment where 033 has not been applied yet. A missing
 * column costs one failed update and a log line, not a lost sale.
 */
export async function stampOrderAttribution(orderId: string): Promise<void> {
  try {
    const attribution = await readAttributionSnapshot()
    if (!attribution?.first && !attribution?.last) return

    const admin = createAdminClient()
    const { error } = await admin
      .from('orders')
      .update({ attribution })
      .eq('id', orderId)
      .is('attribution', null)

    if (error) console.error('stampOrderAttribution failed:', error.message)
  } catch (error) {
    console.error('stampOrderAttribution failed:', error instanceof Error ? error.message : error)
  }
}
