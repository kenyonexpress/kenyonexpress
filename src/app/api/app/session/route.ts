import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/utils/rate-limit'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

/**
 * Hands the app's session to the WebView, by minting the same auth cookies the
 * website itself uses.
 *
 * THE PROBLEM THIS SOLVES. The app holds its session in the native keychain and
 * sends it as a bearer header. A WebView is a browser: it sends cookies and
 * knows nothing about that header. So the checkout page loaded inside the app
 * would render as a logged-out shopper, and `beginCheckout` would refuse it -
 * even though the app is unambiguously signed in.
 *
 * WHY NOT REBUILD CHECKOUT AS AN API INSTEAD. That was the alternative, and it
 * was rejected: it would mean a second implementation of the money path, with
 * its own cart validation, settlement and idempotency, drifting from the one
 * `submitCheckout` runs. D10 in the mobile architecture says the commerce is
 * not rebuilt at any stage. One endpoint that converts a proven session into a
 * cookie is a far smaller surface than a parallel checkout.
 *
 * WHAT IT DOES NOT DO. It mints nothing. `setSession` hands Supabase a
 * refresh/access pair the caller ALREADY holds and asks it to validate them and
 * write the cookies; a caller without a valid pair gets an error and no cookie.
 * There is no elevation here: whoever can call this successfully could already
 * act as that user with the tokens they used to call it.
 *
 * The app must pair this with `sharedCookiesEnabled` on the WebView, or the
 * cookie lands in a jar the WebView does not read.
 */

const bodySchema = z.object({
  access_token: z.string().min(20).max(4000),
  refresh_token: z.string().min(10).max(4000),
})

async function handlePOST(request: NextRequest): Promise<NextResponse> {
  // Keyed by IP, because there is by definition no identity yet. Generous
  // enough for an app that re-establishes on every cold start, tight enough
  // that this cannot be used to grind tokens.
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'
  const allowed = await checkRateLimit(`app-session:${ip}`, 30, 600)
  if (!allowed) return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_request' }, { status: 400 })
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.setSession({
    access_token: parsed.data.access_token,
    refresh_token: parsed.data.refresh_token,
  })

  if (error || !data.user) {
    // Deliberately unspecific. Distinguishing "expired" from "never valid"
    // tells a caller which half of a stolen pair is still good.
    log.warn('app.session_bridge_rejected', { reason: error?.message ?? 'no user' })
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }

  return NextResponse.json({ ok: true, user_id: data.user.id })
}

/** Sign-out inside the app has to clear the WebView's jar too, or the next
 * checkout opens as the previous account. */
async function handleDELETE(): Promise<NextResponse> {
  const supabase = await createClient()
  await supabase.auth.signOut()
  return NextResponse.json({ ok: true })
}

export const POST = withRequestLog('/api/app/session', handlePOST)
export const DELETE = withRequestLog('/api/app/session', handleDELETE)
