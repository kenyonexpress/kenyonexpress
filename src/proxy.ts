import { isPaymentFramePath } from '@/lib/security/frame-policy'
import { lookupRedirect } from '@/lib/seo/redirects'
import { createServerClient } from '@supabase/ssr'
import { type NextRequest, NextResponse } from 'next/server'

// Next.js 16: middleware.ts is deprecated — this file replaces it.
// The exported function must be named `proxy` (not `middleware`).

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // The Sentry tunnel. First, before the redirect lookup and before the session
  // refresh: it carries no session, it is posted to by the browser SDK on a page
  // that may already be broken, and it is never a legacy WordPress path.
  //
  // This guard arrived from feat/observability written to run first and merged
  // into a position BELOW `supabase.auth.getUser()`, where its own comment had
  // stopped describing it: every error report was paying for a token refresh.
  // Neither branch was wrong on its own, which is how the two of them produced
  // it.
  if (pathname.startsWith('/monitoring')) return NextResponse.next({ request })

  // Legacy WordPress URLs, resolved BEFORE the session refresh below.
  //
  // The order is the point. `supabase.auth.getUser()` is a network round trip
  // on every request, and an old URL from 2019 needs no session to be told
  // where it moved to. Googlebot re-crawling a few thousand retired paths
  // should not cost a few thousand token refreshes, and neither should the
  // burst of 404-hunting traffic that follows any cutover.
  //
  // Only GET and HEAD. A 301 on a POST is a request whose body the browser
  // may or may not resend, and a payment callback that gets redirected is a
  // payment we never hear about.
  if (request.method === 'GET' || request.method === 'HEAD') {
    const hit = await lookupRedirect(pathname)
    if (hit) {
      if (hit.status === 410) {
        // Gone, not missing. A 410 is a decision we made; a 404 is an
        // oversight, and Search Console treats the two differently.
        return new NextResponse(null, { status: 410 })
      }
      const url = request.nextUrl.clone()
      url.pathname = hit.target
      // The query string is dropped on purpose: the targets are canonical
      // paths, and carrying `?ref=` or a stale WooCommerce `?product=` through
      // would produce duplicate URLs for one page.
      url.search = ''
      return NextResponse.redirect(url, 301)
    }
  }

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

  // Route protection.
  //
  // `/checkout` itself is deliberately NOT here. It takes guests: the form is
  // fillable without an account and the sign-in happens on the pay press, at
  // which point /auth/callback merges the guest cart into the account. Bouncing
  // an anonymous visitor to /login from here made the account the first thing
  // asked of someone who had not yet seen a price.
  //
  // Its sub-routes still need one. `/checkout/return` and `/checkout/failed`
  // read the shopper's own order, and there is no such thing as a guest's order.
  //
  // `/checkout/frame-return` is the one sub-route that does NOT need a session,
  // and it must not: it is where Cardcom navigates the payment iframe, that
  // navigation is cross-site, and browsers withhold SameSite=Lax cookies on
  // those. Requiring a session there would show a login form inside the payment
  // box of a shopper who has just paid. It carries no order data of its own; it
  // hands the top window a URL and the real confirmation does the authenticating.
  const needsAuth =
    pathname.startsWith('/account') ||
    (pathname.startsWith('/checkout/') && !isPaymentFramePath(pathname))

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
