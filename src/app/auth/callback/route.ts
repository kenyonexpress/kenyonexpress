import { safeNextPath } from '@/lib/auth/safe-next'
import { GUEST_SESSION_COOKIE, parseGuestSessionToken } from '@/lib/cart/guest-session'
import { createClient } from '@/lib/supabase/server'
import { mergeGuestCart } from '@/server/actions/cart'
import { cookies } from 'next/headers'
import { type NextRequest, NextResponse } from 'next/server'

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
      const cookieStore = await cookies()
      const sessionId = parseGuestSessionToken(cookieStore.get(GUEST_SESSION_COOKIE)?.value)
      if (sessionId) {
        await mergeGuestCart(session.user.id, sessionId)
        cookieStore.delete(GUEST_SESSION_COOKIE)
      }
      return NextResponse.redirect(new URL(safeNext, origin))
    }
  }

  return NextResponse.redirect(new URL('/login?error=auth_callback_error', origin))
}
