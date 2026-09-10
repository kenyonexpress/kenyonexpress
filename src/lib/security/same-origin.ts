/**
 * THE ORIGIN CHECK FOR STATE-CHANGING ROUTE HANDLERS.
 *
 * Server actions do not need this: Next validates `Origin` against the
 * forwarded host for every action call and refuses a mismatch. Route handlers
 * get no such treatment - they are ordinary HTTP endpoints - and this project
 * has eight mutating ones that authenticate from a COOKIE, because
 * `authenticateRequest` prefers the cookie over the bearer header by design
 * (`src/lib/supabase/bearer.ts`). A cookie is exactly what a cross-origin form
 * post rides on.
 *
 * WHAT WAS ALREADY TRUE, MEASURED BEFORE THIS FILE WAS WRITTEN. On 2026-09-10
 * the live site set `ke_session_id=...; Secure; HttpOnly; SameSite=lax`, and
 * `src/lib/supabase/cookie-options.ts` records that the Supabase auth cookies
 * carry `sameSite: 'lax'` too. Browsers withhold Lax cookies on a cross-SITE
 * POST, so the textbook attack - `evil.com` posts a form at our redeem endpoint -
 * already arrives with no session and answers 401. This file is not a claim that
 * those routes were wide open.
 *
 * WHAT IT DOES CLOSE. `SameSite=Lax` is a SITE rule, not an ORIGIN rule.
 * `blog.kenyonexpress.co.il` is the same site as `www.kenyonexpress.co.il`, so a
 * request from a sibling subdomain is same-site, carries the session cookie, and
 * needs no preflight when it is a form post. This project ran WordPress on a
 * sibling host until the DNS cutover, which is the concrete version of that
 * threat rather than a hypothetical one. An origin check is a different axis from
 * the cookie attribute, and it is the axis that a subdomain takeover moves along.
 *
 * WHY A CHECK AND NOT A TOKEN. The section that commissioned this asked for
 * "CSRF tokens on state-changing routes". A synchronizer token needs somewhere to
 * live: a session store to compare against, or a signed double-submit cookie, and
 * every caller has to be taught to send it - including the Expo app, whose
 * requests are not browser requests at all. `Origin` is already sent by every
 * browser on every POST, cannot be forged by page JavaScript, and needs no state.
 * The requirement is met on a different mechanism, and this paragraph is here so
 * that is a recorded decision rather than a quiet reinterpretation.
 *
 * WHY EACH ROUTE CALLS IT INSTEAD OF A WRAPPER DOING IT. Every one of these
 * handlers is already wrapped in `withRequestLog`, so enforcing there would have
 * been one edit and would have covered future routes automatically. It is
 * deliberately not done: `docs/OWASP-TOP-10.md` records that a flat grep for the
 * server-action guard reports 0 of 84 guarded and is wrong, because that guard is
 * two hops in. Burying an authorization decision inside an observability wrapper
 * is how that happens. The call is visible at the route, and
 * `src/__tests__/security/mutating-route-guards.test.ts` fails when a new
 * cookie-authenticated mutation forgets it.
 */

/**
 * The host this request was addressed to, as the edge saw it.
 *
 * `x-forwarded-host` first, because on Vercel `request.url`'s host can be the
 * deployment URL rather than the domain the browser typed, and comparing an
 * Origin of `www.kenyonexpress.co.il` against a deployment hostname would refuse
 * every legitimate request.
 */
export function requestHost(request: Request): string | null {
  const forwarded = request.headers.get('x-forwarded-host')?.split(',')[0]?.trim()
  if (forwarded) return forwarded

  const host = request.headers.get('host')?.trim()
  if (host) return host

  try {
    return new URL(request.url).host
  } catch {
    return null
  }
}

/**
 * True when this request did not come from another origin's page.
 *
 * ABSENT `Origin` IS ALLOWED, and that is the load-bearing decision here. The
 * Expo app calls four of these routes with React Native's `fetch`, which sends no
 * `Origin` at all because there is no page and no CORS; so does every
 * server-to-server caller. Refusing a missing header would break the till app
 * and buy nothing, because the attack this defends against is a BROWSER making
 * the request, and a browser always sends `Origin` on a POST.
 *
 * A literal `null` origin IS refused. That is what a sandboxed iframe or a
 * `data:` document sends, and a same-site sandboxed frame does carry the cookie.
 * Nothing legitimate here sends it: the app sends no header and the WebView sends
 * the real host.
 */
export function isSameOriginRequest(request: Request): boolean {
  const origin = request.headers.get('origin')
  if (origin === null) return true

  const host = requestHost(request)
  if (!host) return false

  try {
    return new URL(origin).host === host
  } catch {
    // Includes the literal string `null`, which is not a parseable URL.
    return false
  }
}
