import type { Breadcrumb, ErrorEvent } from '@sentry/nextjs'
import { redact } from './scrub'
import { scrubEventUser } from './sentry-user'

/**
 * THE ONE `beforeSend` FOR ALL THREE RUNTIMES.
 *
 * Before this module each runtime config carried its own copy of the scrub,
 * and the three had already drifted: the server redacted `extra` and the
 * payment context, the edge did not; the browser redacted query secrets, the
 * edge did not; none of them touched breadcrumbs, `request.data` or the
 * exception message itself. A customer's email in a thrown
 * `new Error(\`user ${email} not found\`)` therefore shipped from every runtime,
 * and a fetch breadcrumb recorded `/api/...?token=...` verbatim.
 *
 * Edge-safe and browser-safe on purpose: plain string work, no Node imports,
 * so `sentry.edge.config.ts` and `instrumentation-client.ts` load the same
 * code the Node runtime does. `scrub.ts` and `sentry-user.ts` are the same
 * kind of module for the same reason.
 *
 * WHAT IS REMOVED, AND WHY EACH ONE.
 *
 * - Headers and cookies, wholesale. They carry the Supabase session and the
 *   Cardcom shared secret; filtering key by key is how a new header leaks.
 * - URLs: the voucher token lives in the PATH of `/redeem/<token>`, where a
 *   key-based scrubber cannot see it, and `?token=`, `?code=`, `?secret=` in
 *   the query (SEC-SCRUB).
 * - `request.data`, `extra` and every context, through the key-pattern scrub
 *   in `scrub.ts` (token, secret, password, key, card...).
 * - `user`: the Supabase uuid and nothing else, whatever a call site set.
 * - Emails and Israeli phone numbers in free text: exception messages,
 *   `message`, breadcrumb messages and breadcrumb data. These are the two
 *   identifiers a thrown error is most likely to interpolate, and the two the
 *   privacy policy promises never leave the first party.
 *
 * WHAT IS NOT REMOVED. Order ids, payment ids, voucher ids, product slugs and
 * the user uuid: they are the handles support already holds, and an event
 * with none of them cannot be acted on. Israeli national ids are nine digits,
 * the same shape as an order number, and are not masked by pattern because
 * the false positives would blank the one field that makes an event useful;
 * no code path interpolates an id number into an error message, and
 * `scrub.ts` catches a field named for one.
 */

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g

/**
 * Israeli mobile and landline numbers, local (`05x-xxx-xxxx`, `0x-xxx-xxxx`)
 * and international (`+972 5x xxx xxxx`). Anchored on both sides so an order
 * number or a timestamp that happens to start with 0 is left alone.
 */
const IL_PHONE =
  /(?<![\d-])(?:\+?972[-\s]?|0)(?:5\d|7[2-9]|[2-489])[-\s]?\d{3}[-\s]?\d{4}(?![\d-])/g

const REDEEM_PATH = /\/redeem\/[^/?#]+/g
const SECRET_QUERY = /([?&])(token|code|secret|access_token|refresh_token|api_key)=[^&#]*/gi

/** The free-text pass: identifiers a human typed or a throw interpolated. */
export function maskIdentifiers(text: string): string {
  return text.replace(EMAIL, '[email]').replace(IL_PHONE, '[phone]')
}

/** The URL pass: a coupon in the path, a credential in the query. */
export function redactUrl(url: string): string {
  return url.replace(REDEEM_PATH, '/redeem/[redacted]').replace(SECRET_QUERY, '$1$2=[redacted]')
}

function scrubText(value: unknown): unknown {
  return typeof value === 'string' ? maskIdentifiers(redactUrl(value)) : value
}

function scrubBreadcrumb(crumb: Breadcrumb): Breadcrumb {
  const out: Breadcrumb = { ...crumb }
  if (typeof out.message === 'string') out.message = maskIdentifiers(redactUrl(out.message))
  if (out.data && typeof out.data === 'object') {
    const data = redact(out.data) as Record<string, unknown>
    for (const [key, value] of Object.entries(data)) data[key] = scrubText(value)
    out.data = data
  }
  return out
}

/**
 * Mutates and returns the event, which is what `beforeSend` expects. Never
 * returns null: dropping is the SDK's `ignoreErrors` job, and a scrubber that
 * can also drop is a scrubber whose every branch has to be read twice.
 */
export function scrubSentryEvent<E extends ErrorEvent>(event: E): E {
  if (event.request) {
    if (event.request.headers) event.request.headers = {}
    if (event.request.cookies) event.request.cookies = {}
    if (typeof event.request.url === 'string') event.request.url = redactUrl(event.request.url)
    if (typeof event.request.query_string === 'string') {
      event.request.query_string = redactUrl(`?${event.request.query_string}`).slice(1)
    } else if (event.request.query_string) {
      // The SDK's other shape: an array of pairs, or a record. Dropped rather
      // than walked; the url above already carries the same information.
      event.request.query_string = undefined
    }
    if (event.request.data !== undefined) {
      event.request.data =
        typeof event.request.data === 'string'
          ? maskIdentifiers(event.request.data)
          : redact(event.request.data)
    }
  }

  event.user = scrubEventUser(event.user)

  if (event.extra) event.extra = redact(event.extra) as Record<string, unknown>
  if (event.contexts) {
    for (const [name, context] of Object.entries(event.contexts)) {
      if (context && typeof context === 'object') {
        event.contexts[name] = redact(context) as Record<string, unknown>
      }
    }
  }

  if (typeof event.message === 'string') event.message = maskIdentifiers(event.message)
  if (event.exception?.values) {
    for (const value of event.exception.values) {
      if (typeof value.value === 'string') value.value = maskIdentifiers(value.value)
    }
  }

  if (event.breadcrumbs) event.breadcrumbs = event.breadcrumbs.map(scrubBreadcrumb)

  return event
}
