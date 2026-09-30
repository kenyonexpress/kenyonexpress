/**
 * The attributes every Supabase session cookie is written with.
 *
 * `@supabase/ssr` ships `httpOnly: false` as its default, on purpose: its
 * browser client reads the session straight out of `document.cookie`, and a
 * cookie a script cannot read is a browser client that sees no session. This
 * repo gave that trade up on 2026-10-01 (STEP 18). Every sign-in, sign-out,
 * refresh and MFA ceremony already runs in a Server Action or in the proxy,
 * so the only browser-side readers of the session were the account bell, the
 * Sentry user tag and the two MFA screens, and each of those now asks the
 * server instead (`server/actions/session.ts`, `server/actions/mfa.ts`).
 *
 * What the flag buys is exactly one thing: an injected script can no longer
 * read the refresh token. With the CSP in `next.config.ts` that is a second
 * lock on the same door, and it is the lock that holds when the first fails.
 *
 * `secure` follows the scheme the site is served on rather than `NODE_ENV`:
 * `pnpm start` on this machine is `NODE_ENV=production` over plain http (the
 * E2E suite runs against it), and a Secure cookie on an http origin other
 * than localhost is silently dropped, which turns every login into a redirect
 * loop with no error. `NEXT_PUBLIC_APP_URL` is what decides, and it is baked
 * at build time, which is the same moment the cookie policy is decided.
 *
 * `sameSite: 'lax'` and not `'strict'`: the callback from Google and the link
 * in a magic-link mail are both top-level cross-site navigations, and Strict
 * withholds the cookie on exactly those, so the customer would land signed
 * out on the page that was supposed to sign them in.
 *
 * `maxAge` is left to the library (400 days, the browser ceiling). The real
 * lifetime is GoTrue's: the refresh token rotates on every use and a session
 * that stays idle past the project's refresh-token expiry is dead regardless
 * of what the cookie says.
 */

export interface SessionCookieOptions {
  httpOnly: true
  sameSite: 'lax'
  secure: boolean
  path: '/'
}

export function sessionCookieOptions(env: NodeJS.ProcessEnv = process.env): SessionCookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: isServedOverHttps(env),
    path: '/',
  }
}

/**
 * Anything that is not an explicit `http://` origin is treated as https,
 * including an unset variable: a production deploy with the variable missing
 * must fail towards the Secure flag, not away from it.
 */
export function isServedOverHttps(env: NodeJS.ProcessEnv = process.env): boolean {
  const url = env.NEXT_PUBLIC_APP_URL?.trim().toLowerCase() ?? ''
  return !url.startsWith('http://')
}
