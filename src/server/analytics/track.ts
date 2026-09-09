import { log } from '@/lib/observability/log'
import 'server-only'

import { ATTRIBUTION_COOKIE, type Attribution, parseAttribution } from '@/lib/analytics/attribution'
import type { ServerEventName } from '@/lib/analytics/events'
import { GUEST_SESSION_COOKIE, parseGuestSessionToken } from '@/lib/cart/guest-session'
import { POSTHOG_ID_COOKIE, isPostHogEnabled, trackEvent } from '@/lib/observability/posthog'
import { createAdminClient } from '@/lib/supabase/admin'
import { syncCashbackTierPersonProperty } from '@/server/analytics/cashback-tier'
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
 * WHICH IDENTITY A SERVER EVENT IS FILED UNDER, in one place.
 *
 * The browser's PostHog id first, because that is the ONLY value that makes a
 * funnel join: the client half of the funnel is keyed on it, and matching it
 * here is the whole reason `posthog.ts` mirrors it into a readable cookie.
 *
 * Then the guest session id, for a visitor whose browser blocked the mirror,
 * and last the user id. The user id is deliberately the fallback and not the
 * first choice: PostHog joins a funnel on `distinct_id` alone, so preferring it
 * would split every logged-in shopper's journey into an anonymous browsing half
 * and a separate purchasing half. `linkAnalyticsIdentity` already records the
 * guest-to-user link for the first-party tables, which is where that question
 * gets answered properly.
 *
 * A cookie value is attacker-controllable, so it is length-capped and used for
 * nothing but bucketing. Nothing here authorises anything.
 */
function serverDistinctId(
  postHogCookie: string | undefined,
  fallbacks: { anonymousId: string | null; userId: string | null },
): string | undefined {
  const mirrored = postHogCookie?.trim()
  if (mirrored && mirrored.length > 0 && mirrored.length <= 128) return mirrored
  return fallbacks.anonymousId ?? fallbacks.userId ?? undefined
}

/**
 * Scalars only, and never money.
 *
 * `EventProperties` is typed to scalars precisely so a whole order or profile
 * cannot be attached by accident, and rule 3 at the top of this file says
 * revenue is read from `orders` / `order_items` rather than written here. What
 * travels is the join keys an analyst needs to get from a PostHog funnel back
 * to the row that holds the money.
 */
function postHogProps(input: ServerEventInput): Record<string, string | number | boolean | null> {
  const props: Record<string, string | number | boolean | null> = {
    source: 'server',
    user_id: input.userId,
  }
  for (const key of ['order_id', 'code', 'product_id', 'payment_id', 'step'] as const) {
    const value = input.props[key]
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      props[key] = value
    }
  }
  return props
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

    // POSTHOG GETS THESE FOUR OR IT HAS NO CONVERSION EVENT AT ALL.
    //
    // Measured 2026-09-07. `trackCommerce` fans the BROWSER's commerce events
    // out to PostHog, and the four names this function emits are the only ones
    // that say money moved. None of them can arrive that way:
    // `purchase` is deliberately not fired from the browser (a tab closing on
    // the payment redirect loses it), and `voucher_redeemed` happens on a
    // supplier's till through an API route with no browser of ours in it. So
    // PostHog's funnel ended at `checkout_step` and had nothing to convert to.
    //
    // Fired before the awaited RPC rather than after it, because `trackEvent`
    // returns synchronously and a slow or failing database round trip must not
    // decide whether the funnel event was sent.
    const distinctId = serverDistinctId(cookieStore.get(POSTHOG_ID_COOKIE)?.value, {
      anonymousId,
      userId: input.userId,
    })
    if (isPostHogEnabled()) {
      trackEvent(input.eventName, postHogProps(input), { distinctId })
    }

    // `analytics_events.session_id` IS NOT NULL, AND A SERVER EVENT OFTEN HAS
    // NO SESSION TO NAME.
    //
    // `session_id: anonymousId` sent NULL whenever the guest cookie was absent,
    // and `fn_ingest_analytics_events` inserts it straight through. MEASURED
    // against production 2026-09-09, in a transaction that was rolled back:
    // the insert raises 23502 and the whole RPC fails, which arrives here as
    // `{ error }`, is logged as `analytics.track_failed`, and loses the event.
    //
    // WHICH EVENTS THAT IS: exactly the ones with no browser of ours in the
    // request. `voucher_redeemed` fires on a supplier's till through an API
    // route, `purchase` fires from finalize behind the Cardcom return, and
    // `order_refunded` fires from an admin action. `begin_checkout` is the one
    // that had a guest cookie and therefore the one that worked. So three of
    // the four money events could not land, for a reason unrelated to the
    // whitelist that 180 fixed.
    //
    // The fallback is per EVENT and not per user: a marker keyed on the user
    // would collapse months of unrelated server events into one "session".
    // `server:` prefixed so nobody reads it as a real browsing session, and
    // `anonymous_id` stays honestly null. Nothing groups by `session_id` today
    // -- no view or matview in production reads this table at all -- so this
    // cannot skew an existing query.
    const eventId = crypto.randomUUID()
    const admin = createAdminClient()
    const { data: accepted, error } = await admin.rpc('fn_ingest_analytics_events', {
      p_events: [
        {
          event_id: eventId,
          event_name: input.eventName,
          occurred_at: new Date().toISOString(),
          source: 'server',
          source_app: 'shop',
          anonymous_id: anonymousId,
          session_id: anonymousId ?? `server:${eventId}`,
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
    // 180 IS APPLIED AND THIS GUARD IS NO LONGER ABOUT THESE FOUR NAMES.
    //
    // The comment here used to say the live whitelist held only the client
    // names and that every server money event was going nowhere, and to point
    // at `migrations/pending/180` -- in the log line itself, which shipped that
    // path into production logs. MEASURED 2026-09-09 by reading the deployed
    // `fn_ingest_analytics_events`: the whitelist now carries all four, and a
    // rolled-back probe accepted 1 of 1 for each of `begin_checkout`,
    // `purchase`, `voucher_redeemed` and `order_refunded`, and 0 of 1 for an
    // invented name. The whitelist half is fixed; the loss that survived it was
    // the NOT NULL `session_id` handled above.
    //
    // The guard stays, because it is the only signal that an event name was
    // dropped at the door: the function `CONTINUE`s past an unknown name with
    // no error, no log and HTTP 200. It now means what it says rather than
    // naming a file that is no longer pending.
    //
    // NOT A PROOF OF A WRITE. The deployed function increments its counter
    // after `ON CONFLICT (event_id) DO NOTHING`, so a duplicate `event_id`
    // would return 1 with nothing inserted. Every id here is a fresh
    // `randomUUID`, which is why that is recorded rather than worked around.
    if (typeof accepted === 'number' && accepted < 1) {
      log.error('analytics.event_rejected', {
        eventName: input.eventName,
        detail:
          'fn_ingest_analytics_events accepted 0 of 1 events: this event name is not on the database whitelist and was discarded.',
      })
    }

    // Every trackServerEvent call is a wallet-relevant money moment, so the
    // person's cashback_tier is refreshed here, AFTER the funnel event went
    // out and the first-party write settled. Best effort inside its own
    // module; a failure costs a stale cohort label, nothing else.
    if (input.userId) {
      await syncCashbackTierPersonProperty(input.userId, distinctId)
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
