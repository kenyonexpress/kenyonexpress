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
      if (existing) return existing
      const created = randomId()
      window.localStorage.setItem(STORAGE_KEY, created)
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
    const body = JSON.stringify({
      api_key: KEY,
      event,
      distinct_id: options.distinctId ?? distinctId(),
      properties: { ...properties, $lib: 'kenyonexpress-fetch' },
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
