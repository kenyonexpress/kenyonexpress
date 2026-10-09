/**
 * PostHog product analytics over the public HTTP capture endpoint.
 *
 * Deliberately SDK-free: neither posthog-js nor posthog-node is installed, and
 * a plain fetch to /capture/ is all the capture contract needs. That is also
 * what makes this file importable from any runtime (server components, route
 * handlers, the edge, the browser) without a bundler split, because there is
 * nothing here but env reads, one localStorage touch behind a window guard,
 * and fetch.
 *
 * Entirely inert without NEXT_PUBLIC_POSTHOG_KEY: init does nothing, every
 * trackEvent returns immediately, and no network call is made. Tests, CI and
 * local dev therefore need no configuration and see no traffic.
 *
 * Nothing here throws or rejects. Analytics failing must never become an error
 * the caller has to handle, let alone one the customer sees.
 */

const KEY = process.env.NEXT_PUBLIC_POSTHOG_KEY
const HOST = (process.env.NEXT_PUBLIC_POSTHOG_HOST ?? 'https://us.i.posthog.com').replace(
  /\/+$/,
  '',
)

/** localStorage key for the anonymous id, stable across visits in one browser. */
const STORAGE_KEY = 'ke_ph_distinct_id'

/**
 * THE SAME ID, MIRRORED WHERE THE SERVER CAN READ IT.
 *
 * A PostHog funnel is a sequence of events sharing one `distinct_id`. The
 * browser's half of the commerce funnel (`view_product`, `add_to_cart`,
 * `checkout_step`) is keyed on the localStorage id above. The half that says
 * money moved is emitted SERVER-side and always will be: `purchase` is
 * deliberately not fired from the browser, because a browser purchase is lost
 * every time a tab closes on the payment redirect.
 *
 * The server cannot read localStorage, and the id it does have -- the guest
 * session cookie -- is `httpOnly`, so the BROWSER cannot read that one. Two
 * halves of one funnel, each holding an id the other cannot see, is a funnel
 * that reports a hundred checkouts and zero purchases.
 *
 * So the id is mirrored into a cookie the server can read on the next request.
 * Deliberately NOT httpOnly: this is the value JavaScript owns and writes, and
 * a flag that stopped the browser reading its own id would only mean two
 * sources of truth again. It carries no authority - nothing is authorised by
 * it, it selects an analytics bucket - and `SameSite=Lax` keeps it off
 * cross-site requests.
 */
export const POSTHOG_ID_COOKIE = 'ke_ph_id'

/** Thirty days, matching the guest session cookie so the two expire together. */
const ID_COOKIE_MAX_AGE = 60 * 60 * 24 * 30

/**
 * Best effort by construction. `document.cookie` throws in a sandboxed frame
 * and is a silent no-op when the user blocks storage; in both cases the server
 * simply falls back to the guest session id and the funnel degrades to two
 * halves rather than failing.
 */
function mirrorIdToCookie(id: string): void {
  if (typeof document === 'undefined') return
  try {
    const secure = window.location.protocol === 'https:' ? '; Secure' : ''
    document.cookie = `${POSTHOG_ID_COOKIE}=${encodeURIComponent(id)}; Max-Age=${ID_COOKIE_MAX_AGE}; Path=/; SameSite=Lax${secure}`
  } catch {
    // Storage blocked. See above.
  }
}

/** Fallback id when there is no browser storage: one per server process. */
let processDistinctId: string | null = null

function randomId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID()
    }
  } catch {
    // Fall through to the timestamp id.
  }
  return `anon-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * Browser: a persistent anonymous id, so one visitor is one distinct_id across
 * pages and visits. Server (or a browser with storage blocked): one id per
 * process, which keeps server events grouped without ever inventing a fake
 * per-user identity the data would then lie about.
 */
function distinctId(): string {
  if (typeof window !== 'undefined') {
    try {
      const existing = window.localStorage.getItem(STORAGE_KEY)
      if (existing) {
        // Re-mirrored on every read, not only on creation: the cookie expires
        // on its own schedule and can be cleared without localStorage going
        // with it, and a returning visitor whose cookie lapsed would otherwise
        // keep an id the server never sees again.
        mirrorIdToCookie(existing)
        return existing
      }
      const created = randomId()
      window.localStorage.setItem(STORAGE_KEY, created)
      mirrorIdToCookie(created)
      return created
    } catch {
      // Storage can be unavailable (private mode, blocked cookies). Best effort.
    }
  }
  if (!processDistinctId) processDistinctId = `server-${randomId()}`
  return processDistinctId
}

/** True when a key is configured, i.e. when events will actually be sent. */
export function isPostHogEnabled(): boolean {
  return Boolean(KEY)
}

/**
 * The id this browser's events are keyed on, for the ONE caller that must not
 * invent its own: the session-replay loader bootstraps posthog-js with it, so
 * a recording and the fetch-path events land on the same person. Server-side
 * it degrades to the per-process id, which no caller should want -- replay is
 * browser-only by nature.
 */
export function currentDistinctId(): string {
  return distinctId()
}

/**
 * The replay loader parks the initialised posthog-js client here. Typed
 * structurally rather than importing the SDK's types: this module must stay
 * importable from every runtime, and the SDK is a lazy, browser-only guest.
 */
type PostHogGlobal = { capture: (event: string, properties?: Record<string, unknown>) => void }

function sdkClient(): PostHogGlobal | null {
  if (typeof window === 'undefined') return null
  const candidate = (window as unknown as { __ke_posthog?: PostHogGlobal }).__ke_posthog
  return candidate && typeof candidate.capture === 'function' ? candidate : null
}

/**
 * With no SDK there is no client object to construct, so init only warms the
 * distinct id (creating and persisting it in the browser before the first
 * event). Idempotent, synchronous, no network. Kept as the explicit entry
 * point so call sites read the same as initSentry and so a future move to a
 * real SDK changes this file only.
 */
export function initPostHog(): void {
  if (!KEY) return
  try {
    distinctId()
  } catch {
    // Best effort by definition.
  }
}

/**
 * Property values are restricted to scalars on purpose: it makes accidentally
 * attaching a whole order, profile or request object a type error instead of a
 * PII leak discovered in the PostHog UI.
 */
export type EventProperties = Record<string, string | number | boolean | null>

export type TrackOptions = {
  /**
   * Overrides the stored anonymous id, e.g. with a user id on the server where
   * there is no browser identity to fall back on.
   */
  distinctId?: string
  /**
   * Person properties to write alongside the event, sent as PostHog's `$set`.
   * Scalars only, same reasoning as EventProperties: person properties are
   * what cohorts filter on, and an object here would be a PII leak with a
   * longer shelf life than any single event. Keys should come from a named
   * constant (see lib/analytics/cashback-tier.ts) so the writer and the
   * cohort definition cannot drift apart.
   */
  set?: EventProperties
}

/**
 * Sends one event to PostHog. Fire and forget: returns immediately, never
 * throws, never rejects, and is a no-op without NEXT_PUBLIC_POSTHOG_KEY.
 *
 * keepalive lets the browser finish the request across a navigation, which is
 * exactly when most commerce events fire. The 4s timeout mirrors alert.ts:
 * nothing on this path may hold a response open.
 */
export function trackEvent(
  event: string,
  properties: EventProperties = {},
  options: TrackOptions = {},
): void {
  if (!KEY) return
  try {
    // When the session-replay loader has mounted posthog-js, route through it:
    // the SDK stamps $session_id, which is what makes an event click through
    // to the exact moment in a recording. The fetch path below cannot know it.
    // The SDK was bootstrapped with this module's distinct id, so the identity
    // is the same either way, and an explicit distinctId override still means
    // "not this browser's id", which only server callers pass -- the SDK never
    // sees those because there is no window there.
    // `$set` travels inside properties on both paths; the capture endpoint and
    // posthog-js both peel it off there and write the person, not the event.
    const withSet = options.set ? { ...properties, $set: options.set } : properties
    const sdk = sdkClient()
    if (sdk && options.distinctId === undefined) {
      sdk.capture(event, { ...withSet, $lib: 'kenyonexpress-fetch' })
      return
    }
    const body = JSON.stringify({
      api_key: KEY,
      event,
      distinct_id: options.distinctId ?? distinctId(),
      properties: { ...withSet, $lib: 'kenyonexpress-fetch' },
      timestamp: new Date().toISOString(),
    })
    void fetch(`${HOST}/capture/`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      keepalive: true,
      signal: AbortSignal.timeout(4_000),
    }).catch(() => {
      // Analytics is best effort by definition.
    })
  } catch {
    // Same: a failure to report must never surface to the caller.
  }
}
