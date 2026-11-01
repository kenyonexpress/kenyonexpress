/**
 * The CSRF gate for route handlers, in one pure function.
 *
 * WHAT IT PROTECTS. Server Actions carry Next's own Origin check, so every
 * form on this site is already covered. Route handlers under /api are not:
 * a handler that reads the session cookie and writes on POST is reachable
 * from a form on any other site, because the browser attaches the cookie to
 * that cross-site POST just as it does to ours. `SameSite=Lax` on every cookie
 * (see cookie-attributes.test.ts) already withholds the session from a
 * cross-site POST in every current browser, and this gate is the second
 * layer for the browsers and the cookies that rule does not reach. Two
 * layers, because one of them has been wrong before: the guest-cart cookie
 * shipped without `secure` for months while two copies of its options agreed
 * with each other.
 *
 * HOW IT DECIDES. The order is the OWASP one, and each step answers only
 * when it can:
 *
 *   1. `Sec-Fetch-Site`. Set by every current browser, never by a script the
 *      page runs, and impossible to forge from a cross-site page. `same-origin`
 *      and `none` (a typed URL, a bookmark) are ours; `cross-site` and
 *      `same-site` are not. `same-site` is treated as foreign on purpose: this
 *      site has no sibling subdomain that should post to it, so a request from
 *      one is an attacker's `evil.kenyonexpress.co.il` in the best case.
 *   2. `Origin`. Sent on every cross-origin request and every POST. Compared
 *      by host, against every host the request claims to be for. `null` is a
 *      sandboxed frame or a redirect chain, and neither should be writing.
 *   3. `Referer`. The last resort, for a browser that sends neither of the
 *      above. Stripped by `Referrer-Policy` on some paths, present on most.
 *   4. Nothing. A request with none of the three has no browser context: a
 *      Cardcom callback, a QStash delivery, the till app, an uptime monitor.
 *      Those authenticate with a secret or a bearer token, never a cookie, so
 *      CSRF does not apply to them and the gate says so rather than guessing.
 *
 * The verdict is a string and not a boolean because 'no-browser-context' is
 * a different fact from 'same-origin', and a route that wants to insist on a
 * browser (the analytics beacon) can tell the two apart.
 */
export type RequestSite = 'same-origin' | 'cross-site' | 'no-browser-context'

/** Methods that must never change state, so a cross-site one is harmless. */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export function isMutatingMethod(method: string | null | undefined): boolean {
  return !SAFE_METHODS.has((method ?? 'GET').toUpperCase())
}

/** The host of an Origin or Referer value, or null when it is not a URL. */
function hostOf(value: string): string | null {
  try {
    return new URL(value).host.toLowerCase()
  } catch {
    return null
  }
}

/**
 * Every host this request may legitimately be addressed to. Behind Vercel the
 * `Host` header is the custom domain and `x-forwarded-host` repeats it; on a
 * laptop only `Host` is set. All of them are ours, so any of them matching
 * the Origin is enough.
 */
export function requestHosts(headers: Headers, urlHost: string): Set<string> {
  const hosts = new Set<string>()
  if (urlHost) hosts.add(urlHost.toLowerCase())
  for (const name of ['x-forwarded-host', 'host']) {
    const raw = headers.get(name)
    if (!raw) continue
    for (const part of raw.split(',')) {
      const host = part.trim().toLowerCase()
      if (host) hosts.add(host)
    }
  }
  return hosts
}

export function requestSite(headers: Headers, urlHost: string): RequestSite {
  const fetchSite = headers.get('sec-fetch-site')?.trim().toLowerCase()
  if (fetchSite === 'same-origin' || fetchSite === 'none') return 'same-origin'
  if (fetchSite === 'cross-site' || fetchSite === 'same-site') return 'cross-site'

  const hosts = requestHosts(headers, urlHost)

  const origin = headers.get('origin')
  if (origin !== null) {
    const host = hostOf(origin)
    return host !== null && hosts.has(host) ? 'same-origin' : 'cross-site'
  }

  const referer = headers.get('referer')
  if (referer !== null) {
    const host = hostOf(referer)
    return host !== null && hosts.has(host) ? 'same-origin' : 'cross-site'
  }

  return 'no-browser-context'
}

/**
 * The one question the proxy asks: is this a state-changing call to a route
 * handler from a page that is not ours. No path is exempt, because the paths
 * that take server-to-server traffic (webhooks, cron, the till app) never
 * carry a browser's headers and fall through to 'no-browser-context' on their
 * own. An exemption list would be a second place to keep in step with the
 * route tree, and it would be wrong the first time a route moved.
 */
export function isCrossSiteApiMutation(request: {
  method: string
  headers: Headers
  nextUrl: { pathname: string; host: string }
}): boolean {
  if (!request.nextUrl.pathname.startsWith('/api/')) return false
  if (!isMutatingMethod(request.method)) return false
  return requestSite(request.headers, request.nextUrl.host) === 'cross-site'
}

/** The body of the 403, so a client and a log line see the same word. */
export const CROSS_SITE_REJECTION = { ok: false, error: 'cross_site_request' } as const
