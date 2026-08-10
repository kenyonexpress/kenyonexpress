/**
 * The one place that knows what a link into the app looks like.
 *
 * TWO LINK FAMILIES, AND THEY ARE NOT INTERCHANGEABLE.
 *
 * 1. UNIVERSAL LINKS (`https://kenyonexpress.co.il/...`) are what we put in
 *    emails, push payloads and anything a human might see or share. They open
 *    the app when it is installed and the website when it is not, so a customer
 *    without the app is never shown a dead link. Every one of them is a real
 *    page on the site; that is the requirement, not a nicety.
 *
 * 2. THE CUSTOM SCHEME (`kenyonexpress://`) is an INTERNAL return channel only:
 *    the hosted payment page bouncing back into the app, and the OAuth
 *    redirect. It is never mailed, never shared, and never handed to a browser
 *    that might not have the app - a phone without the app shows an error page
 *    for it. This matches D9 in the mobile architecture, which allows the
 *    scheme for the OAuth redirect and forbids it everywhere else.
 *
 * The checkout return is the one place both exist at once, and the reason is
 * spelled out in `appReturnUrl`.
 */

/** The iOS/Android URL scheme. Must equal `expo.scheme` in apps/mobile/app.json. */
export const APP_SCHEME = 'kenyonexpress'

/** The app-side paths a link can land on. Kept in sync with apps/mobile routes. */
export const APP_PATHS = {
  home: '/',
  coupons: '/coupons',
  coupon: (voucherId: string) => `/coupons/${voucherId}`,
  order: (orderId: string) => `/orders/${orderId}`,
  wallet: '/wallet',
  checkoutReturn: '/checkout/return',
} as const

export type CheckoutReturnStatus = 'success' | 'failed' | 'cancelled'

function stripTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value
}

/**
 * A `kenyonexpress://` URL. `path` is an app path with a leading slash; the
 * scheme's authority component is deliberately left empty (`kenyonexpress:///x`
 * collapses to a host of `x` on some parsers), so the path's first segment
 * becomes the host and Expo Router resolves it the same either way.
 */
export function appSchemeUrl(path: string, params?: Record<string, string | undefined>): string {
  const clean = path.startsWith('/') ? path.slice(1) : path
  const query = params
    ? Object.entries(params)
        .filter(
          (entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1] !== '',
        )
        .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
        .join('&')
    : ''
  return `${APP_SCHEME}://${clean}${query ? `?${query}` : ''}`
}

/** An `https://` link that opens the app when installed and the site when not. */
export function universalLink(siteUrl: string, path: string): string {
  const base = stripTrailingSlash(siteUrl)
  return `${base}${path.startsWith('/') ? path : `/${path}`}`
}

/**
 * Where Cardcom sends the browser when the hosted page finishes inside the
 * app's WebView.
 *
 * IT IS AN https URL, NOT THE SCHEME, AND THAT IS THE WHOLE POINT. Cardcom
 * redirects its own page to whatever we hand it, and a `kenyonexpress://`
 * redirect from a third-party page is blocked outright by iOS WKWebView and
 * shown as an error by Chrome Custom Tabs. So the return lands on a real page
 * on our origin, `/checkout/app-return`, which the app's WebView recognises by
 * PREFIX and closes on. The page itself then also emits the scheme link, which
 * covers the case the WebView never sees the navigation because the user was
 * bounced into a full browser by a 3-D Secure step.
 *
 * Two mechanisms for one hop, and neither is redundant: the interception is the
 * fast path, the scheme redirect is the recovery.
 */
export function appReturnUrl(
  siteUrl: string,
  orderId: string,
  status: CheckoutReturnStatus,
): string {
  const base = stripTrailingSlash(siteUrl)
  const query = `order_id=${encodeURIComponent(orderId)}&status=${encodeURIComponent(status)}`
  return `${base}/checkout/app-return?${query}`
}

/** The prefix the WebView matches on. Any change here is a breaking app change. */
export const APP_RETURN_PATH = '/checkout/app-return'

/** The scheme URL `/checkout/app-return` bounces to. */
export function appReturnDeepLink(orderId: string, status: CheckoutReturnStatus): string {
  return appSchemeUrl(APP_PATHS.checkoutReturn, { order_id: orderId, status })
}

/**
 * Narrows an untrusted `status` query value. Anything unrecognised is treated
 * as a failure rather than a success: the redirect is cosmetic either way (the
 * order's truth comes from `GetLpResult` server-side), and the cheaper mistake
 * is showing "we are checking" to someone who paid.
 */
export function parseReturnStatus(value: unknown): CheckoutReturnStatus {
  if (value === 'success' || value === 'failed' || value === 'cancelled') return value
  return 'failed'
}
