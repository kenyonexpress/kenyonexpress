import { AFFILIATE_COOKIE, AFFILIATE_COOKIE_MAX_AGE_S, isLinkCode } from '@/lib/affiliate/rules'
import { loginRedirectUrl } from '@/lib/auth/login-redirect'
import { GUEST_SESSION_COOKIE, guestSessionCookieOptions } from '@/lib/cart/guest-session-cookie'
import { REQUEST_ID_HEADER, resolveRequestId } from '@/lib/observability/request-id'
import { REFERRAL_QUERY_PARAM, normalizeReferralCode } from '@/lib/referrals/code'
import { REFERRAL_COOKIE, referralCookieOptions } from '@/lib/referrals/cookie'
import { CSP_NONCE_HEADER, generateNonce } from '@/lib/security/csp-nonce'
import {
  contentSecurityPolicyFor,
  frameOptionsFor,
  isPaymentFramePath,
  permissionsPolicyFor,
} from '@/lib/security/frame-policy'
import {
  MAINTENANCE_HTML,
  MAINTENANCE_RETRY_AFTER_SECONDS,
  isMaintenanceExempt,
  maintenanceEnabled,
} from '@/lib/security/maintenance'
import { maintenanceFlagOn } from '@/lib/security/maintenance-flag'
import { lookupRedirect } from '@/lib/seo/redirects'
import { wpLegacyTarget } from '@/lib/seo/wp-legacy'
import { requireAnonKey } from '@/lib/supabase/anon-key'
import { recordAffiliateClick } from '@/server/affiliate/clicks'
import { createServerClient } from '@supabase/ssr'
import { type NextFetchEvent, type NextRequest, NextResponse } from 'next/server'

// Next.js 16: middleware.ts is deprecated — this file replaces it.
// The exported function must be named `proxy` (not `middleware`).

/**
 * Continue routing, with the correlation id and CSP nonce attached in both directions.
 *
 * The header set is read back off the request by `withRequestLog`, which is how
 * a route handler four hops downstream logs the same id. `request.headers` is
 * re-read on every call rather than captured once, because `request.cookies.set`
 * below rewrites the cookie header in place and a snapshot taken before the
 * Supabase session refresh would forward the pre-refresh cookies upstream.
 *
 * The CSP nonce is generated per request and injected into both the request
 * (so components can read it via getNonce()) and the response (as part of the
 * Content-Security-Policy header). The path-dependent CSP with nonce replaces
 * the static 'unsafe-inline' fallback from next.config.ts.
 */
function forward(
  request: NextRequest,
  requestId: string,
  nonce: string,
  pathname: string,
): NextResponse {
  const headers = new Headers(request.headers)
  headers.set(REQUEST_ID_HEADER, requestId)
  headers.set(CSP_NONCE_HEADER, nonce)

  const response = NextResponse.next({ request: { headers } })
  response.headers.set(REQUEST_ID_HEADER, requestId)

  // The nonce is NOT put into the CSP. With cacheComponents the page shell is
  // prerendered, so Next's own <script src> chunk tags and its inline
  // __next_f bootstrap carry no nonce; a nonce + 'strict-dynamic' policy blocks
  // every one of them and no page hydrates (verified on `next start`: 23-74
  // blocked scripts per route, no service worker registration, no interaction).
  // Until the shell can be rendered per request, the policy stays on the
  // 'unsafe-inline' form that contentSecurityPolicyFor() emits without a nonce.
  response.headers.set('Content-Security-Policy', contentSecurityPolicyFor(pathname))
  response.headers.set('X-Frame-Options', frameOptionsFor(pathname))
  response.headers.set('Permissions-Policy', permissionsPolicyFor(pathname))

  return response
}

/**
 * The id and security headers on a response this file produces itself: a redirect, a 410.
 *
 * These responses are produced before the main forward() call, so they need to set
 * their own CSP headers. The nonce is unused on these paths (they serve no inline
 * scripts), but the CSP header must still be present to avoid a missing-header downgrade.
 */
function withRequestId<T extends Response>(
  response: T,
  requestId: string,
  pathname: string,
  _nonce: string,
): T {
  response.headers.set(REQUEST_ID_HEADER, requestId)
  response.headers.set('Content-Security-Policy', contentSecurityPolicyFor(pathname))
  response.headers.set('X-Frame-Options', frameOptionsFor(pathname))
  response.headers.set('Permissions-Policy', permissionsPolicyFor(pathname))
  return response
}

export async function proxy(request: NextRequest, event?: NextFetchEvent) {
  const { pathname } = request.nextUrl

  // Minted here and nowhere else, so one visitor request is one id no matter
  // how many handlers, actions and modules it passes through. An inbound
  // `x-request-id` wins when it is well formed: a trace that started at a load
  // balancer or an uptime monitor stays one trace. This is a string operation
  // and one header read, so it does not disturb the ordering the tunnel guard
  // below depends on.
  const requestId = resolveRequestId(request.headers)

  // Generate CSP nonce for this request. Used to build strict nonce-based CSP
  // headers that replace 'unsafe-inline', achieving A+ on securityheaders.com.
  // The nonce is injected into both request headers (so components can read it
  // via getNonce()) and response CSP headers.
  const nonce = generateNonce()

  // The Sentry tunnel. First, before the redirect lookup and before the session
  // refresh: it carries no session, it is posted to by the browser SDK on a page
  // that may already be broken, and it is never a legacy WordPress path.
  //
  // This guard arrived from feat/observability written to run first and merged
  // into a position BELOW `supabase.auth.getUser()`, where its own comment had
  // stopped describing it: every error report was paying for a token refresh.
  // Neither branch was wrong on its own, which is how the two of them produced
  // it.
  if (pathname.startsWith('/monitoring')) return forward(request, requestId, nonce, pathname)

  // A printed coupon QR lands on /c/<8-digit code>. The category page owns
  // /c/<slug>, and Next refuses two different dynamic segment names ('code'
  // and 'slug') at one path, which stopped the dev server and the build. The
  // QR handler lives at /coupon-qr/<code> and this rewrite keeps the printed
  // URL working; the visitor never sees the internal path.
  const couponQr = /^\/c\/(\d{8})\/?$/.exec(pathname)
  if (couponQr) {
    const url = request.nextUrl.clone()
    url.pathname = `/coupon-qr/${couponQr[1]}`
    return withRequestId(NextResponse.rewrite(url), requestId, pathname, nonce)
  }

  // Maintenance mode (MAINTENANCE_MODE=1). Payments, webhooks, crons, admin and
  // login are exempt; see lib/security/maintenance.ts for why.
  // rc5 F19: also the feature_flags row (cached 30s, fails open). Page visits
  // go to /maintenance; everything else gets the 503 below.
  if (
    pathname !== '/maintenance' &&
    !isMaintenanceExempt(pathname) &&
    (maintenanceEnabled() || (await maintenanceFlagOn()))
  ) {
    const wantsPage =
      request.method === 'GET' && (request.headers.get('accept') ?? '').includes('text/html')
    if (wantsPage) {
      return withRequestId(
        NextResponse.redirect(new URL('/maintenance', request.url), 307),
        requestId,
        pathname,
        nonce,
      )
    }
    return withRequestId(
      new NextResponse(MAINTENANCE_HTML, {
        status: 503,
        headers: {
          'content-type': 'text/html; charset=utf-8',
          'retry-after': String(MAINTENANCE_RETRY_AFTER_SECONDS),
          'cache-control': 'no-store',
        },
      }),
      requestId,
      pathname,
      nonce,
    )
  }

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
    const hit =
      (await lookupRedirect(pathname)) ??
      // Structural WP shapes, the backstop under the seo_redirects table.
      (() => {
        const legacy = wpLegacyTarget(pathname)
        return legacy ? { target: legacy, status: 301 as const } : null
      })()
    if (hit) {
      if (hit.status === 410) {
        // Gone, not missing. A 410 is a decision we made; a 404 is an
        // oversight, and Search Console treats the two differently.
        return withRequestId(new NextResponse(null, { status: 410 }), requestId, pathname, nonce)
      }
      const url = request.nextUrl.clone()
      const [targetPath, targetQuery] = hit.target.split('?', 2)
      url.pathname = targetPath ?? '/'
      // The query string is dropped on purpose: the targets are canonical
      // paths, and carrying `?ref=` or a stale WooCommerce `?product=` through
      // would produce duplicate URLs for one page.
      url.search = targetQuery ? `?${targetQuery}` : ''
      return withRequestId(NextResponse.redirect(url, 301), requestId, pathname, nonce)
    }
  }

  let supabaseResponse = forward(request, requestId, nonce, pathname)

  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, requireAnonKey(), {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      // `headers` is the SECOND argument and it is not decoration. A response
      // that carries a rotated session cookie must not be stored by a CDN or
      // a reverse proxy: a cached one is served to the next visitor, session
      // token included. @supabase/ssr 0.12 passes
      // `Cache-Control: private, no-cache, no-store, must-revalidate,
      // max-age=0` plus `Expires` and `Pragma` here, and an adapter that
      // takes one parameter drops them silently - ours did, and so did the
      // example in every version of this file before 0.12.
      //
      // Only on the FIRST cookie write per client, by the library's design;
      // the object is empty afterwards. That is fine here because the proxy
      // builds a client per request.
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value)
        supabaseResponse = forward(request, requestId, nonce, pathname)
        for (const { name, value, options } of cookiesToSet)
          supabaseResponse.cookies.set(name, value, options)
        for (const [key, value] of Object.entries(headers ?? {}))
          supabaseResponse.headers.set(key, value)
      },
    },
  })

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

  // THE PORTAL IS `/supplier` AND `/supplier/...`, NOT EVERY PATH THAT STARTS
  // WITH THOSE EIGHT LETTERS.
  //
  // This was `pathname.startsWith('/supplier')`, which also matches
  // `/suppliers` - the PUBLIC join-us page with the lead form. Measured: it
  // answered 307 to /login. That page is linked from SiteFooter as the one
  // entry aimed at a business rather than a shopper, and sitemap.ts lists it at
  // priority 0.7 with the note "a business is worth more than a session". So
  // the single page whose job is to win new suppliers demanded a login from
  // every prospect, and Googlebot was sent to a login form for a URL we asked
  // it to index.
  //
  // Exactly the failure the paragraph above already describes for `/checkout`,
  // in the neighbouring clause, made with the same operator.
  const isPortalPath = pathname === '/supplier' || pathname.startsWith('/supplier/')

  const needsAuth =
    pathname.startsWith('/account') ||
    pathname.startsWith('/coupon/') ||
    (pathname.startsWith('/checkout/') && !isPaymentFramePath(pathname)) ||
    (isPortalPath && !supplierPublic)

  if (needsAuth && !user) {
    return withRequestId(
      NextResponse.redirect(loginRedirectUrl(request.nextUrl)),
      requestId,
      pathname,
      nonce,
    )
  }

  if (pathname.startsWith('/admin')) {
    if (!user) {
      return withRequestId(
        NextResponse.redirect(loginRedirectUrl(request.nextUrl)),
        requestId,
        pathname,
        nonce,
      )
    }
    // Role is authoritative in the profiles table, not app_metadata (which may be stale).
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()
    // Admin panel is open to panel roles: admin, super_admin,
    // content_uploader, support (049) and read_only (181, the observer tier —
    // support's SELECT surface, no writes). Optimistic check only; every page
    // re-gates per section and every server action re-checks its own guard.
    const isPanel =
      profile?.role === 'admin' ||
      profile?.role === 'super_admin' ||
      profile?.role === 'content_uploader' ||
      profile?.role === 'support' ||
      profile?.role === 'read_only'
    if (!isPanel) {
      return withRequestId(
        NextResponse.redirect(new URL('/', request.url)),
        requestId,
        pathname,
        nonce,
      )
    }
  }

  // A share link's `?ref=` code, written down before the visit goes anywhere.
  //
  // WHY HERE AND NOT ON THE LANDING PAGE
  //
  // The claim happens at /auth/callback, which is reached from an email client
  // or from Google and therefore carries none of this app's query strings. The
  // code has to be recorded on the click that started the visit, and this is
  // the one place every click passes through.
  //
  // LAST TOUCH, NOT FIRST. Someone holding a code from two weeks ago who then
  // clicks a different friend's link today is attributed to today's link. That
  // is the click that actually did the work, and neither ordering opens an
  // abuse the database does not already close: `fn_claim_referral` refuses a
  // self-referral outright, and `referrals` allows one row per referred person
  // for life, so a code cannot be swapped after a claim in any case.
  //
  // Written only for a code that is genuinely one (eight characters over the
  // 098 alphabet), so `?ref=` carrying a scraper's payload sets nothing.
  //
  // The URL is NOT rewritten to strip the parameter. A redirect would cost a
  // round trip on the most valuable landing this site has, and the duplicate
  // it would be avoiding is already handled: the root layout declares
  // `alternates.canonical`, so `/?ref=ABC12345` is canonical to `/`.
  if (request.method === 'GET') {
    // rc5 F12: the same `?ref=` carries affiliate link codes, which are a
    // different shape (`af` + 10 lowercase) and never match the referral
    // alphabet. Last touch, 30 days, server-read only; the click is counted
    // after the response so the landing never waits on it.
    const affiliateCode = request.nextUrl.searchParams.get(REFERRAL_QUERY_PARAM)
    if (isLinkCode(affiliateCode)) {
      supabaseResponse.cookies.set(AFFILIATE_COOKIE, affiliateCode, {
        httpOnly: true,
        sameSite: 'lax',
        secure: (request.headers.get('x-forwarded-proto') ?? request.nextUrl.protocol).startsWith(
          'https',
        ),
        maxAge: AFFILIATE_COOKIE_MAX_AGE_S,
        path: '/',
      })
      event?.waitUntil(
        recordAffiliateClick({
          code: affiliateCode,
          ip: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null,
          landingPath: request.nextUrl.pathname,
          referer: request.headers.get('referer'),
        }).catch(() => undefined),
      )
    }

    const code = normalizeReferralCode(request.nextUrl.searchParams.get(REFERRAL_QUERY_PARAM))
    if (code && request.cookies.get(REFERRAL_COOKIE)?.value !== code) {
      supabaseResponse.cookies.set(
        REFERRAL_COOKIE,
        code,
        referralCookieOptions(request.headers.get('x-forwarded-proto') ?? request.nextUrl.protocol),
      )
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
