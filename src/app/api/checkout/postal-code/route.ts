import { CacheControl } from '@/lib/cache/http'
import {
  buildPostalLookupUrl,
  normalizePostalLookupQuery,
  parsePostalLookupResponse,
} from '@/lib/checkout/postal-autofill'
import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { rateLimit, tooManyRequests } from '@/lib/rate-limit'
import { getClientIp } from '@/lib/utils/rate-limit'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * Postal-code suggestion for the checkout address: city + street + house in,
 * a 7-digit code out, or null.
 *
 * WHY A ROUTE AND NOT A FETCH FROM THE FORM. The provider is a third party
 * reached with a URL that is configuration (`ISRAEL_POST_ZIP_LOOKUP_URL`);
 * calling it from the browser would publish that URL, run into CORS on a
 * host we do not control, and put the shopper's IP in front of Israel Post
 * on every keystroke. Here the request is normalised, rate-limited per IP,
 * given a short deadline, and its answer validated before anything reaches
 * the form.
 *
 * WHAT A NULL MEANS. "No suggestion": the provider is not configured, did not
 * answer in time, or answered with nothing that is a code. All three are 200
 * with `zip: null`, because to the form they are the same thing - leave the
 * field for the shopper - and a 5xx here would surface as a checkout error on
 * a field that is optional.
 *
 * The one non-200 that is not a refusal is 400 for a malformed query, so the
 * form's contract (three non-empty fields) is visible in the network tab
 * rather than swallowed into a null.
 */

const LOOKUP_TIMEOUT_MS = 4_000

function noSuggestion(configured: boolean): NextResponse {
  return NextResponse.json(
    { zip: null, configured },
    // Not cached: an unconfigured or timed-out answer must not be remembered
    // for a day against an address that has a code.
    { headers: { 'Cache-Control': CacheControl.private } },
  )
}

async function handleGET(request: NextRequest): Promise<Response> {
  const params = request.nextUrl.searchParams
  const query = normalizePostalLookupQuery({
    city: params.get('city'),
    street: params.get('street'),
    houseNumber: params.get('house'),
  })
  if (!query) {
    return NextResponse.json({ zip: null, error: 'invalid_query' }, { status: 400 })
  }

  const ip = await getClientIp()
  const decision = await rateLimit('postal-lookup', ip)
  if (!decision.allowed) return tooManyRequests(decision, { zip: null, error: 'rate_limited' })

  const url = buildPostalLookupUrl(query)
  if (!url) return noSuggestion(false)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS)
  let body: string
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json, text/plain, text/html' },
    })
    if (!response.ok) {
      log.warn('postal_lookup.upstream_status', { status: response.status })
      return noSuggestion(true)
    }
    body = await response.text()
  } catch (error) {
    log.warn('postal_lookup.upstream_failed', { reason: String(error) })
    return noSuggestion(true)
  } finally {
    clearTimeout(timer)
  }

  const zip = parsePostalLookupResponse(body)
  if (!zip) return noSuggestion(true)

  return NextResponse.json(
    { zip, configured: true },
    // A house's code does not change day to day, and the query carries no
    // one's identity. Shared caching is what stops two shoppers on one
    // street from being two provider calls.
    { headers: { 'Cache-Control': CacheControl.postalCode } },
  )
}

export const GET = withRequestLog('/api/checkout/postal-code', handleGET)
