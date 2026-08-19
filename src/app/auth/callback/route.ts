import { safeNextPath } from '@/lib/auth/safe-next'
import { GUEST_SESSION_COOKIE, parseGuestSessionToken } from '@/lib/cart/guest-session'
import { log } from '@/lib/observability/log'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { mergeGuestCart } from '@/server/actions/cart'
import { linkAnalyticsIdentity } from '@/server/analytics/track'
import { cookies } from 'next/headers'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * The welcome mail, queued on EVERY successful exchange and landing exactly once.
 *
 * There is no "has this user been welcomed" column and there is deliberately no
 * trigger. `notification_outbox.dedupe_key` is UNIQUE and
 * `fn_enqueue_notification` inserts ON CONFLICT DO NOTHING, so `welcome:<uid>`
 * makes the second login onwards a no-op at the database. Idempotence lives in
 * one place instead of being a flag somebody has to remember to set.
 *
 * Best-effort: this runs between an exchanged auth code and a redirect, and a
 * queue that is unavailable must not turn a successful sign-in into
 * `?error=auth_callback_error`.
 */
async function enqueueWelcomeOnce(user: { id: string; email?: string }): Promise<void> {
  if (!user.email) return
  try {
    const admin = createAdminClient()
    const { data: profile } = await admin
      .from('profiles')
      .select('full_name')
      .eq('id', user.id)
      .maybeSingle()
    const { error } = await admin.rpc('fn_enqueue_notification', {
      p_kind: 'welcome',
      p_email: user.email,
      p_dedupe: `welcome:${user.id}`,
      p_payload: { full_name: profile?.full_name ?? null },
      p_user_id: user.id,
    })
    if (error) log.warn('auth.welcome_not_queued', { reason: error.message })
  } catch (error) {
    log.warn('auth.welcome_threw', {
      reason: error instanceof Error ? error.message : 'unknown',
    })
  }
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')
  const safeNext = safeNextPath(searchParams.get('next'))

  if (code) {
    const supabase = await createClient()
    const {
      data: { session },
      error,
    } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && session) {
      await enqueueWelcomeOnce(session.user)
      const cookieStore = await cookies()
      const sessionId = parseGuestSessionToken(cookieStore.get(GUEST_SESSION_COOKIE)?.value)
      if (sessionId) {
        await mergeGuestCart(supabase, session.user.id, sessionId)
        // Before the cookie is cleared: this is the last moment the guest id
        // and the user id are both known.
        await linkAnalyticsIdentity(session.user.id, sessionId)
        cookieStore.delete(GUEST_SESSION_COOKIE)
      }
      return NextResponse.redirect(new URL(safeNext, origin))
    }
  }

  /*
    THE DESTINATION SURVIVES THE FAILURE, BECAUSE THE NEXT STEP IS A RETRY.

    Everything that lands here arrived from somewhere: /account, /checkout/return,
    a product page. On success `safeNext` carries that through. On failure it used
    to be dropped, so a customer whose code had expired - one refresh of a magic
    link, one slow trip through Google - signed in again and arrived at the home
    page instead of the page they were trying to reach, with nothing to tell them
    why. The retry is one click away on the screen this redirects to, and
    `LoginForm` already threads `next` into all three of its forms.

    Safe to append for the same reason it was safe to redirect to: this is
    `safeNextPath` output, so it is a plain same-site path or `/`. `/` is left
    off rather than written out, to keep the bare failure URL exactly as it was.
  */
  const failed = new URL('/login?error=auth_callback_error', origin)
  if (safeNext !== '/') failed.searchParams.set('next', safeNext)
  return NextResponse.redirect(failed)
}
