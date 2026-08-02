import { CONSENT_COOKIE, isTrackingAllowed } from '@/lib/analytics/consent'
import { ingestBatchSchema } from '@/lib/analytics/events'
import { GUEST_SESSION_COOKIE, parseGuestSessionToken } from '@/lib/cart/guest-session'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/utils/rate-limit'
import { type NextRequest, NextResponse } from 'next/server'

// Behavioral event ingest. Deliberately silent: every outcome that is not a
// programming error returns 204, because a browser has nothing useful to do
// with an analytics error and the SDK must never retry into a loop.
//
// The route owns three things the client is not trusted with:
//   user_id       resolved from the session cookie, never from the payload
//   anonymous_id  read from the httpOnly ke_session_id cookie (the same guest
//                 id that carts use, so guest behavior joins guest carts)
//   ip / user_agent  truncated and bot-classified inside the ingest function

const RATE_LIMIT_PER_MINUTE = 120

const noContent = () => new NextResponse(null, { status: 204 })

/** Same-origin gate: an analytics endpoint has no cross-site callers. */
function originAllowed(request: NextRequest): boolean {
  const origin = request.headers.get('origin')
  if (!origin) return true // sendBeacon and same-origin fetch may omit it
  try {
    return new URL(origin).host === request.nextUrl.host
  } catch {
    return false
  }
}

function clientIp(request: NextRequest): string | null {
  const forwarded = request.headers.get('x-forwarded-for')
  const ip = forwarded?.split(',')[0]?.trim() || request.headers.get('x-real-ip')?.trim()
  return ip || null
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!originAllowed(request)) return noContent()

  // sendBeacon sends a Blob typed application/json; fetch sets it explicitly.
  const contentType = request.headers.get('content-type') ?? ''
  if (!contentType.includes('application/json')) return noContent()

  const cookieConsent = request.cookies.get(CONSENT_COOKIE)?.value
  if (!isTrackingAllowed(cookieConsent)) return noContent()

  const ip = clientIp(request)
  const allowed = await checkRateLimit(`analytics:ip:${ip ?? 'unknown'}`, RATE_LIMIT_PER_MINUTE, 60)
  if (!allowed) return noContent()

  let payload: unknown
  try {
    payload = await request.json()
  } catch {
    return noContent()
  }

  const parsed = ingestBatchSchema.safeParse(payload)
  if (!parsed.success) return noContent()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const anonymousId = parseGuestSessionToken(request.cookies.get(GUEST_SESSION_COOKIE)?.value)

  const events = parsed.data.events.map((event) => ({
    ...event,
    anonymous_id: anonymousId,
  }))

  const admin = createAdminClient()
  const { error } = await admin.rpc('fn_ingest_analytics_events', {
    p_events: events,
    p_user_id: user?.id ?? null,
    p_ip: ip,
    p_user_agent: request.headers.get('user-agent'),
  })

  if (error) {
    // Worth a server log (it means the pipeline is down), never a client error.
    console.error('analytics ingest failed:', error.message)
  }

  return noContent()
}
