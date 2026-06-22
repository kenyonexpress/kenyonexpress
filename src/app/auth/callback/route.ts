import { createClient } from '@/lib/supabase/server'
import { mergeGuestCart } from '@/server/actions/cart'
import { cookies } from 'next/headers'
import { type NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/'
  const safeNext = next.startsWith('/') ? next : '/'

  if (code) {
    const supabase = await createClient()
    const {
      data: { session },
      error,
    } = await supabase.auth.exchangeCodeForSession(code)

    if (!error && session) {
      const cookieStore = await cookies()
      const sessionId = cookieStore.get('ke_session_id')?.value
      if (sessionId) {
        await mergeGuestCart(session.user.id, sessionId)
        cookieStore.delete('ke_session_id')
      }
      return NextResponse.redirect(new URL(safeNext, origin))
    }
  }

  return NextResponse.redirect(new URL('/login?error=auth_callback_error', origin))
}
