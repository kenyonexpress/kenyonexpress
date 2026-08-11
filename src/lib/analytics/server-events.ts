import { createHash } from 'node:crypto'
import {
  type CommerceEventInput,
  buildGaPayload,
  buildMetaPayload,
} from '@/lib/analytics/ecommerce'
import { log } from '@/lib/observability/log'

/**
 * The purchase, reported from the SERVER after the money is confirmed.
 *
 * WHY THIS EXISTS WHEN THE BROWSER COULD FIRE IT. A browser-side purchase event
 * is fired on the thank-you page, which means it is lost whenever the shopper
 * closes the tab on the payment provider's redirect, whenever an ad blocker
 * eats the request - which most Israeli shoppers run - and whenever the payment
 * settles by webhook minutes after the browser gave up. Every one of those is a
 * real sale reported as nothing, and the ad platforms optimise spend against
 * the number they were given.
 *
 * So the authoritative purchase is sent from `finalizeOrder`, at the moment the
 * order actually became paid, over the two vendors' server APIs.
 *
 * DEDUPLICATION IS THE WHOLE RISK, and both vendors solve it the same way: an
 * event id the browser and the server both send. GA4 keys on
 * `transaction_id`; Meta keys on `event_id`. Both are the ORDER ID here, so a
 * purchase reported twice - once by a browser that did survive, once by
 * finalize - is counted once. Getting this wrong inflates reported revenue,
 * which is the direction that makes an ad budget look profitable when it is not.
 *
 * EVERY IDENTIFIER IS HASHED BEFORE IT LEAVES. Meta requires SHA-256 of a
 * normalised email or phone; sending the raw value is both a policy violation
 * and a plain leak of a customer's address to an advertising network.
 *
 * NOTHING HERE CAN FAIL A FINALIZE. The card is already charged by the time
 * this runs; an analytics call that threw would leave an order incomplete over
 * a marketing metric.
 */

const GA4_ENDPOINT = 'https://www.google-analytics.com/mp/collect'
const META_ENDPOINT_BASE = 'https://graph.facebook.com/v21.0'

export interface ServerPurchaseInput extends CommerceEventInput {
  orderId: string
  /** Raw email. Hashed here; never sent as-is. */
  email?: string | null
  /** E.164 phone. Hashed here; never sent as-is. */
  phone?: string | null
  /** The analytics session/client id, when the browser recorded one. */
  clientId?: string | null
}

/**
 * Meta's normalisation, which is part of the hash contract: lower-cased and
 * trimmed for email, digits only for phone. A hash of a differently-normalised
 * string simply never matches, and the failure is silent - the event lands and
 * matches nobody.
 */
export function hashIdentifier(
  value: string | null | undefined,
  kind: 'email' | 'phone',
): string | null {
  if (!value) return null
  const normalised = kind === 'email' ? value.trim().toLowerCase() : value.replace(/\D/g, '')
  if (!normalised) return null
  return createHash('sha256').update(normalised).digest('hex')
}

export interface ServerAnalyticsConfig {
  ga4MeasurementId: string | null
  ga4ApiSecret: string | null
  metaPixelId: string | null
  metaAccessToken: string | null
}

export function readServerAnalyticsConfig(
  env: Record<string, string | undefined> = process.env,
): ServerAnalyticsConfig {
  const clean = (value: string | undefined) => {
    const trimmed = value?.trim()
    return trimmed ? trimmed : null
  }
  return {
    ga4MeasurementId: clean(env.NEXT_PUBLIC_GA4_MEASUREMENT_ID),
    ga4ApiSecret: clean(env.GA4_API_SECRET),
    metaPixelId: clean(env.NEXT_PUBLIC_META_PIXEL_ID),
    metaAccessToken: clean(env.META_CAPI_TOKEN),
  }
}

export type SendOutcome =
  | { sent: true; vendors: string[] }
  | { sent: false; reason: 'unconfigured' }
  | { sent: false; reason: string }

/**
 * A client id GA4 will accept when the browser never gave us one.
 *
 * Derived from the ORDER ID rather than random, so a replayed finalize produces
 * the same value. A random one would make GA4 count two different users for one
 * purchase, which is worse than a synthetic id.
 */
export function fallbackClientId(orderId: string): string {
  const digest = createHash('sha256').update(orderId).digest('hex')
  // GA4's format is `<random>.<timestamp>`. Both halves derived from the same
  // digest, so the value is stable per order.
  return `${Number.parseInt(digest.slice(0, 8), 16)}.${Number.parseInt(digest.slice(8, 16), 16)}`
}

/**
 * Any GA4 event, from the server, over the Measurement Protocol.
 *
 * GA4 ONLY. Meta has no equivalent for an event that is not one of its standard
 * conversions, and inventing one for `redeem_coupon` would put a redemption in
 * the same reports as a purchase - the money moved weeks earlier, and
 * double-counting it is what makes an ad budget look profitable when it is not.
 *
 * No client id from a browser, so one is derived from the transaction. A random
 * value would make GA4 report two users for one event on a replay.
 */
export async function sendGaEvent(
  name: string,
  input: CommerceEventInput,
  options: { config?: ServerAnalyticsConfig; fetchImpl?: typeof fetch } = {},
): Promise<SendOutcome> {
  const config = options.config ?? readServerAnalyticsConfig()
  if (!config.ga4MeasurementId || !config.ga4ApiSecret) {
    return { sent: false, reason: 'unconfigured' }
  }

  const doFetch = options.fetchImpl ?? fetch
  try {
    const response = await doFetch(
      `${GA4_ENDPOINT}?measurement_id=${encodeURIComponent(config.ga4MeasurementId)}&api_secret=${encodeURIComponent(config.ga4ApiSecret)}`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_id: fallbackClientId(input.transactionId || name),
          non_personalized_ads: true,
          events: [{ name, params: buildGaPayload(input) }],
        }),
      },
    )
    if (response.ok) return { sent: true, vendors: ['ga4'] }
    log.warn('analytics.ga4_event_rejected', { name, status: response.status })
    return { sent: false, reason: `ga4 ${response.status}` }
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'unknown'
    log.warn('analytics.ga4_event_failed', { name, reason })
    return { sent: false, reason }
  }
}

export async function sendServerPurchase(
  input: ServerPurchaseInput,
  options: { config?: ServerAnalyticsConfig; fetchImpl?: typeof fetch } = {},
): Promise<SendOutcome> {
  const config = options.config ?? readServerAnalyticsConfig()
  const doFetch = options.fetchImpl ?? fetch

  const gaReady = Boolean(config.ga4MeasurementId && config.ga4ApiSecret)
  const metaReady = Boolean(config.metaPixelId && config.metaAccessToken)
  if (!gaReady && !metaReady) return { sent: false, reason: 'unconfigured' }

  const vendors: string[] = []
  const eventTime = Math.floor(Date.now() / 1000)

  if (gaReady) {
    const payload = buildGaPayload({ ...input, transactionId: input.orderId })
    try {
      const response = await doFetch(
        `${GA4_ENDPOINT}?measurement_id=${encodeURIComponent(config.ga4MeasurementId as string)}&api_secret=${encodeURIComponent(config.ga4ApiSecret as string)}`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            client_id: input.clientId || fallbackClientId(input.orderId),
            // Non-personalised: this is a server report about a transaction,
            // not a signal for ad targeting, and the browser already carries
            // whatever consent the visitor gave.
            non_personalized_ads: true,
            events: [{ name: 'purchase', params: payload }],
          }),
        },
      )
      // The Measurement Protocol answers 204 and validates NOTHING. A malformed
      // event is accepted and discarded silently, which is why the payload is
      // built by a tested function rather than assembled here.
      if (response.ok) vendors.push('ga4')
      else log.warn('analytics.ga4_purchase_rejected', { status: response.status })
    } catch (error) {
      log.warn('analytics.ga4_purchase_failed', {
        reason: error instanceof Error ? error.message : 'unknown',
      })
    }
  }

  if (metaReady) {
    const payload = buildMetaPayload(input)
    try {
      const response = await doFetch(
        `${META_ENDPOINT_BASE}/${encodeURIComponent(config.metaPixelId as string)}/events`,
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            access_token: config.metaAccessToken,
            data: [
              {
                event_name: 'Purchase',
                event_time: eventTime,
                // The deduplication key. Same value the browser pixel sends, so
                // a purchase seen by both is counted once.
                event_id: input.orderId,
                action_source: 'website',
                user_data: {
                  ...(hashIdentifier(input.email, 'email')
                    ? { em: [hashIdentifier(input.email, 'email')] }
                    : {}),
                  ...(hashIdentifier(input.phone, 'phone')
                    ? { ph: [hashIdentifier(input.phone, 'phone')] }
                    : {}),
                },
                custom_data: payload,
              },
            ],
          }),
        },
      )
      if (response.ok) vendors.push('meta')
      else log.warn('analytics.meta_purchase_rejected', { status: response.status })
    } catch (error) {
      log.warn('analytics.meta_purchase_failed', {
        reason: error instanceof Error ? error.message : 'unknown',
      })
    }
  }

  return vendors.length > 0
    ? { sent: true, vendors }
    : { sent: false, reason: 'no vendor accepted the event' }
}
