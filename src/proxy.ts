import { createServerClient } from '@supabase/ssr'
import { type NextRequest, NextResponse } from 'next/server'

// Next.js 16: middleware.ts is deprecated — this file replaces it.
// The exported function must be named `proxy` (not `middleware`).

export async function proxy(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value)
          supabaseResponse = NextResponse.next({ request })
          for (const { name, value, options } of cookiesToSet)
            supabaseResponse.cookies.set(name, value, options)
        },
      },
    },
  )

  // Refresh the Supabase session — do not remove, required for cookie rotation.
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // Route protection
  const needsAuth =
    pathname.startsWith('/account') || pathname === '/checkout' || pathname.startsWith('/checkout/')

  if (needsAuth && !user) {
    const loginUrl = request.nextUrl.clone()
    loginUrl.pathname = '/login'
    loginUrl.searchParams.set('next', pathname)
    return NextResponse.redirect(loginUrl)
  }

  if (pathname.startsWith('/admin')) {
    if (!user) {
      const loginUrl = request.nextUrl.clone()
      loginUrl.pathname = '/login'
      loginUrl.searchParams.set('next', pathname)
      return NextResponse.redirect(loginUrl)
    }
    // Role is authoritative in the profiles table, not app_metadata (which may be stale).
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    // Admin panel is open to panel roles: admin, super_admin,
    // content_uploader, and support (049). Optimistic check only; every page
    // re-gates per section and every server action re-checks its own guard.
    const isPanel =
      profile?.role === 'admin' ||
      profile?.role === 'super_admin' ||
      profile?.role === 'content_uploader' ||
      profile?.role === 'support'
    if (!isPanel) {
      return NextResponse.redirect(new URL('/', request.url))
    }
  }

  // Generate a guest session ID for unauthenticated users (cart tracking)
  if (!user && !request.cookies.get('ke_session_id')) {
    supabaseResponse.cookies.set('ke_session_id', crypto.randomUUID(), {
      httpOnly: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 30,
      path: '/',
    })
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
