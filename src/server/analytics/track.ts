import { log } from '@/lib/observability/log'
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
    const { data: accepted, error } = await admin.rpc('fn_ingest_analytics_events', {
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

    // POSTGREST RETURNS ITS ERRORS, IT DOES NOT THROW THEM.
    //
    // The `try` around this block only ever caught the cookie reads and a
    // network failure. An ingest that the database refused -- a bad grant, a
    // constraint, a malformed payload -- came back as a resolved promise
    // carrying `{ error }`, was assigned to nothing, and vanished. Rule 2 at
    // the top of this file says analytics must never throw into a checkout, and
    // that is still honoured: this logs and returns.
    if (error) {
      log.error('analytics.track_failed', { eventName: input.eventName, err: error })
      return
    }

    // THE EVENT WAS ACCEPTED BY THE CONNECTION AND THROWN AWAY BY THE FUNCTION.
    //
    // `fn_ingest_analytics_events` filters every event against a name whitelist
    // and `CONTINUE`s past anything not on it -- no error, no log, HTTP 200 --
    // then returns the number it kept. One event in, zero back, means this one
    // was discarded at the door.
    //
    // MEASURED against production on 2026-09-06 by reading the deployed
    // function body: the live whitelist is page_view, view_product,
    // view_category, add_to_cart, remove_from_cart, checkout_step, web_vital
    // and whatsapp_click. `begin_checkout`, `purchase`, `voucher_redeemed` and
    // `order_refunded` are on none of it, so EVERY server-side money event this
    // file emits is currently going nowhere, and has been since migration 151
    // narrowed the list.
    //
    // `migrations/pending/169` adds the four names and is the actual fix; it
    // needs approval before it touches production. This does not fix the loss.
    // It makes the loss visible, which is the part that can be done without
    // approval -- silent data loss on the money funnel is indistinguishable
    // from no data at all, and the version of this that logs nothing is how it
    // survived from 151 until now.
    if (typeof accepted === 'number' && accepted < 1) {
      log.error('analytics.event_rejected', {
        eventName: input.eventName,
        detail:
          'fn_ingest_analytics_events accepted 0 of 1 events: this event name is not on the database whitelist and was discarded. See migrations/pending/169.',
      })
    }
  } catch (error) {
    log.error('analytics.track_failed', { eventName: input.eventName, err: error })
  }
}

/**
 * Records that a guest id and a user id are the same person, so pre-login
 * behavior can be attributed at query time. Written at login and again at
 * checkout: two cheap upserts beat one missed link.
 *
 * The login callback clears the guest cookie once it has merged the guest cart,
 * so the guest id is gone from that point on. That makes the link written there
 * the only chance to connect a visitor's pre-login browsing to their account,
 * which is why the caller can pass the id explicitly instead of relying on a
 * cookie that is about to be deleted.
 */
export async function linkAnalyticsIdentity(
  userId: string,
  explicitAnonymousId?: string | null,
): Promise<void> {
  try {
    const cookieStore = await cookies()
    const anonymousId =
      explicitAnonymousId ?? parseGuestSessionToken(cookieStore.get(GUEST_SESSION_COOKIE)?.value)
    if (!anonymousId) return

    const admin = createAdminClient()
    await admin
      .from('analytics_identity_links')
      .upsert(
        { anonymous_id: anonymousId, user_id: userId },
        { onConflict: 'anonymous_id,user_id' },
      )
  } catch (error) {
    log.error('analytics.identity_link_failed', { err: error })
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

    if (error) log.error('analytics.order_attribution_failed', { reason: error.message })
  } catch (error) {
    log.error('analytics.order_attribution_failed', { err: error })
  }
}
