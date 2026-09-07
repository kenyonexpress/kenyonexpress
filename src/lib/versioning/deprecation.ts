/**
 * Endpoint deprecation signalling (MEGA 196).
 *
 * The draft this replaces POSTed each call to `/api/deprecations/track`, an
 * endpoint that does not exist in `src/app/api/`, and did it on the hot path of
 * the very handler being deprecated -- a network round trip, unawaited, per
 * request, to a 404. Deprecation is telemetry about our own traffic, so it goes
 * where the rest of this repo's telemetry goes: `log`, which already fans out
 * to console and Axiom and is inert without their env vars.
 *
 * The wire half is two standard headers, so a client can discover the deadline
 * without reading a changelog:
 *   Deprecation: @<unix seconds>   RFC 9745, when it became deprecated
 *   Sunset:      <HTTP-date>       RFC 8594, when it stops answering
 *   Link:        <url>; rel="successor-version"
 */

import { log } from '@/lib/observability/log'

export interface DeprecationNotice {
  /** Route being retired, as a path: `/api/cart/add`. */
  endpoint: string
  /** When it was announced deprecated. */
  deprecatedAt: Date
  /** When it stops answering. Omit while no date is committed to. */
  sunsetAt?: Date
  /** Absolute or relative URL of the replacement. */
  successor?: string
  /** Human-readable migration notes, for logs and docs. Not sent on the wire. */
  guidance?: string
}

/**
 * Response headers announcing the deprecation.
 *
 * Sunset is only emitted when a date exists. An absent Sunset means "no date
 * yet"; inventing one (say, deprecatedAt + 90 days) would put a deadline on the
 * wire that nobody agreed to and that clients would plan against.
 */
export function deprecationHeaders(notice: DeprecationNotice): Record<string, string> {
  const headers: Record<string, string> = {
    // RFC 9745: a Structured Fields Date, `@` then integer Unix seconds.
    Deprecation: `@${Math.floor(notice.deprecatedAt.getTime() / 1000)}`,
  }
  if (notice.sunsetAt) {
    // RFC 8594 wants an IMF-fixdate; toUTCString produces exactly that.
    headers.Sunset = notice.sunsetAt.toUTCString()
  }
  if (notice.successor) {
    headers.Link = `<${notice.successor}>; rel="successor-version"`
  }
  return headers
}

/** True once the sunset moment has passed. False when no sunset is set. */
export function isSunset(notice: DeprecationNotice, now: Date = new Date()): boolean {
  if (!notice.sunsetAt) return false
  return now.getTime() >= notice.sunsetAt.getTime()
}

/** Whole days from `now` to sunset, negative once passed, null when unset. */
export function daysUntilSunset(notice: DeprecationNotice, now: Date = new Date()): number | null {
  if (!notice.sunsetAt) return null
  const ms = notice.sunsetAt.getTime() - now.getTime()
  return Math.floor(ms / 86_400_000)
}

export interface DeprecatedCallContext {
  /** Version the caller asked for, from `resolveApiVersion`. */
  requestedVersion?: string
  /** Caller identity when known. Never a raw token or an email. */
  client?: string
}

/**
 * Records one call to a deprecated endpoint.
 *
 * Fire-and-forget and non-throwing by construction: `log` swallows its own
 * failures, so an instrumentation problem cannot turn a working deprecated
 * response into a 500. Past sunset it logs at error, because answering after
 * the announced date is a broken promise and should page, not scroll by.
 */
export function recordDeprecatedUse(
  notice: DeprecationNotice,
  context: DeprecatedCallContext = {},
  now: Date = new Date(),
): void {
  const fields = {
    endpoint: notice.endpoint,
    deprecated_at: notice.deprecatedAt.toISOString(),
    sunset_at: notice.sunsetAt?.toISOString() ?? null,
    successor: notice.successor ?? null,
    days_until_sunset: daysUntilSunset(notice, now),
    requested_version: context.requestedVersion ?? null,
    client: context.client ?? null,
  }
  if (isSunset(notice, now)) {
    log.error('api.deprecated_endpoint_past_sunset', fields)
    return
  }
  log.warn('api.deprecated_endpoint_used', fields)
}
