import { CacheControl } from '@/lib/cache/http'
import {
  buildStreetLookupUrl,
  normalizeStreetLookupQuery,
  parseStreetLookupResponse,
  rankStreetSuggestions,
} from '@/lib/checkout/street-autocomplete'
import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { rateLimit, tooManyRequests } from '@/lib/rate-limit'
import { getClientIp } from '@/lib/utils/rate-limit'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * Street suggestions for the checkout address: city + typed prefix in, up to
 * eight street names out (UX17).
 *
 * WHY A ROUTE AND NOT A FETCH FROM THE FORM. The same three reasons as the
 * postal lookup next door: the registry is a third party, the browser would
 * meet CORS on a host we do not control, and the shopper's IP would be in
 * front of data.gov.il on every keystroke. Here the query is normalised,
 * rate-limited per IP, given a short deadline, and its answer ranked and
 * capped before anything reaches the form.
 *
 * WHAT AN EMPTY LIST MEANS. "No suggestion": the lookup is switched off, did
 * not answer in time, or knows no such street. All three are 200 with
 * `streets: []`, because to the form they are the same thing - leave the
 * field to the shopper - and a 5xx here would surface as a checkout error on
 * a field that accepts anything typed. The one non-200 that is not a refusal
 * is 400 for a malformed query, so the form's contract (a city and at least
 * two typed characters) is visible in the network tab rather than swallowed.
 */

const LOOKUP_TIMEOUT_MS = 4_000

function noSuggestion(configured: boolean): NextResponse {
  return NextResponse.json(
    { streets: [], configured },
    // Not cached: a timed-out answer must not be remembered for a day.
    { headers: { 'Cache-Control': CacheControl.private } },
  )
}

async function handleGET(request: NextRequest): Promise<Response> {
  const params = request.nextUrl.searchParams
  const query = normalizeStreetLookupQuery({ city: params.get('city'), prefix: params.get('q') })
  if (!query) {
    return NextResponse.json({ streets: [], error: 'invalid_query' }, { status: 400 })
  }

  const ip = await getClientIp()
  const decision = await rateLimit('street-lookup', ip)
  if (!decision.allowed) {
    return tooManyRequests(decision, { streets: [], error: 'rate_limited' })
  }

  const url = buildStreetLookupUrl(query)
  if (!url) return noSuggestion(false)

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), LOOKUP_TIMEOUT_MS)
  let body: string
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    })
    if (!response.ok) {
      log.warn('street_lookup.upstream_status', { status: response.status })
      return noSuggestion(true)
    }
    body = await response.text()
  } catch (error) {
    log.warn('street_lookup.upstream_failed', { reason: String(error) })
    return noSuggestion(true)
  } finally {
    clearTimeout(timer)
  }

  const streets = rankStreetSuggestions(parseStreetLookupResponse(body), query)
  return NextResponse.json(
    { streets, configured: true },
    // A city's streets change when the registry changes, which is seldom;
    // the query carries no one's identity, so two shoppers typing the same
    // prefix in the same city are one registry call.
    { headers: { 'Cache-Control': CacheControl.streets } },
  )
}

export const GET = withRequestLog('/api/checkout/streets', handleGET)
