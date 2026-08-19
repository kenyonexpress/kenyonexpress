import { loginRedirectUrl } from '@/lib/auth/login-redirect'
import { GUEST_SESSION_COOKIE, guestSessionCookieOptions } from '@/lib/cart/guest-session-cookie'
import { REQUEST_ID_HEADER, resolveRequestId } from '@/lib/observability/request-id'
import { isPaymentFramePath } from '@/lib/security/frame-policy'
import { lookupRedirect } from '@/lib/seo/redirects'
import { createServerClient } from '@supabase/ssr'
import { type NextRequest, NextResponse } from 'next/server'

// Next.js 16: middleware.ts is deprecated — this file replaces it.
// The exported function must be named `proxy` (not `middleware`).

/**
 * Continue routing, with the correlation id attached in both directions.
 *
 * The header set is read back off the request by `withRequestLog`, which is how
 * a route handler four hops downstream logs the same id. `request.headers` is
 * re-read on every call rather than captured once, because `request.cookies.set`
 * below rewrites the cookie header in place and a snapshot taken before the
 * Supabase session refresh would forward the pre-refresh cookies upstream.
 */
function forward(request: NextRequest, requestId: string): NextResponse {
  const headers = new Headers(request.headers)
  headers.set(REQUEST_ID_HEADER, requestId)
  const response = NextResponse.next({ request: { headers } })
  response.headers.set(REQUEST_ID_HEADER, requestId)
  return response
}

/** The id on a response this file produces itself: a redirect, a 410. */
function withRequestId<T extends Response>(response: T, requestId: string): T {
  response.headers.set(REQUEST_ID_HEADER, requestId)
  return response
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Minted here and nowhere else, so one visitor request is one id no matter
  // how many handlers, actions and modules it passes through. An inbound
  // `x-request-id` wins when it is well formed: a trace that started at a load
  // balancer or an uptime monitor stays one trace. This is a string operation
  // and one header read, so it does not disturb the ordering the tunnel guard
  // below depends on.
  const requestId = resolveRequestId(request.headers)

  // The Sentry tunnel. First, before the redirect lookup and before the session
  // refresh: it carries no session, it is posted to by the browser SDK on a page
  // that may already be broken, and it is never a legacy WordPress path.
  //
  // This guard arrived from feat/observability written to run first and merged
  // into a position BELOW `supabase.auth.getUser()`, where its own comment had
  // stopped describing it: every error report was paying for a token refresh.
  // Neither branch was wrong on its own, which is how the two of them produced
  // it.
  if (pathname.startsWith('/monitoring')) return forward(request, requestId)

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
        return withRequestId(new NextResponse(null, { status: 410 }), requestId)
      }
      const url = request.nextUrl.clone()
      url.pathname = hit.target
      // The query string is dropped on purpose: the targets are canonical
      // paths, and carrying `?ref=` or a stale WooCommerce `?product=` through
      // would produce duplicate URLs for one page.
      url.search = ''
      return withRequestId(NextResponse.redirect(url, 301), requestId)
    }
  }

  let supabaseResponse = forward(request, requestId)

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
          supabaseResponse = forward(request, requestId)
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
  //
  // The supplier area is the portal's, and its two public doors are excluded by
  // name so a supplier can actually reach a login form.
  //
  // NOT taken from the portal branch: it also listed `pathname === '/checkout'`
  // and a bare `/checkout/` prefix. The first breaks guest checkout outright,
  // which is the whole point of the paragraph above, and the second would catch
  // `/checkout/frame-return` and put a login form inside Cardcom's iframe.
  const supplierPublic = pathname === '/supplier/login' || pathname === '/supplier/access-denied'
  const needsAuth =
    pathname.startsWith('/account') ||
    pathname.startsWith('/coupon/') ||
    (pathname.startsWith('/checkout/') && !isPaymentFramePath(pathname)) ||
    (pathname.startsWith('/supplier') && !supplierPublic)

  if (needsAuth && !user) {
    return withRequestId(NextResponse.redirect(loginRedirectUrl(request.nextUrl)), requestId)
  }

  if (pathname.startsWith('/admin')) {
    if (!user) {
      return withRequestId(NextResponse.redirect(loginRedirectUrl(request.nextUrl)), requestId)
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
      return withRequestId(NextResponse.redirect(new URL('/', request.url)), requestId)
    }
  }

  // Generate a guest session ID for unauthenticated users (cart tracking).
  //
  // The options are the shared builder's, not a second copy. This block and
  // `ensureGuestSessionId` each used to spell them out, and `secure` was absent
  // from both — neither looked wrong, because each matched the other.
  if (!user && !request.cookies.get(GUEST_SESSION_COOKIE)) {
    supabaseResponse.cookies.set(
      GUEST_SESSION_COOKIE,
      crypto.randomUUID(),
      guestSessionCookieOptions(
        request.headers.get('x-forwarded-proto') ?? request.nextUrl.protocol,
      ),
    )
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
