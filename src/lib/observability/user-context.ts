/**
 * WHO HIT THE ERROR, WITHOUT LEARNING ANYTHING ELSE ABOUT THEM.
 *
 * MEASURED 2026-09-10: nothing in this repository ever called `Sentry.setUser`,
 * and `sendDefaultPii` is `false` in both configs. So every event carried no user
 * dimension at all - which reads as privacy and behaves as blindness. "Is this
 * one shopper or two hundred", "is this the customer who just phoned", and "did
 * my fix stop it for the person who reported it" are all unanswerable, and
 * Sentry's own de-duplication counts events rather than people.
 *
 * A UUID AND NOTHING ELSE. No email, no username, no IP. The id is already the
 * only identifier used in logs (`docs/MONITORING.md`), it joins to `profiles`
 * for anyone who has database access and to nothing at all for anyone who does
 * not, and it is what `sendDefaultPii: false` is protecting - the email and the
 * IP - so this adds the attribution without adding the exposure.
 *
 * WHY IT IS READ FROM THE COOKIE AND NOT FROM A SESSION CALL. The one place
 * every server-side error passes through is `onRequestError`, which is handed
 * headers and nothing else. Asking Supabase who the caller is from there is a
 * network round trip on a path that is already failing - the worst possible
 * moment to add one - and the 68 `auth.getUser()` call sites in the app are not
 * a choke point anybody can maintain.
 *
 * THE SIGNATURE IS NOT VERIFIED, AND THAT IS THE HONEST TRADE. This decodes the
 * JWT payload and reads `sub`. A caller who forges a token can therefore attach
 * somebody else's uuid, or a made-up one, to THEIR OWN error events. That buys
 * an attacker nothing - it is a label on a crash report, not an authorization
 * decision, and no code path reads it back - and verifying it would mean either
 * the round trip above or the JWT secret in a module that has no other use for
 * it. Stated here so nobody later reads a Sentry user id as proof of identity.
 */

/** `sb-<project-ref>-auth-token`, plus the `.0`/`.1` chunks of a long one. */
const AUTH_COOKIE = /^sb-[A-Za-z0-9-]+-auth-token(?:\.(\d+))?$/

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function base64UrlToString(value: string): string | null {
  try {
    return Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
  } catch {
    return null
  }
}

/**
 * The access token out of the cookie header, reassembled from its chunks.
 *
 * `@supabase/ssr` writes the session as `base64-` + base64url(JSON) and splits
 * it across `name.0`, `name.1`, ... when it exceeds the cookie size limit. Order
 * matters and the header does not promise one, so the chunks are sorted by index
 * rather than by appearance.
 */
function accessTokenFromCookieHeader(header: string): string | null {
  const chunks: { index: number; value: string }[] = []

  for (const pair of header.split(';')) {
    const separator = pair.indexOf('=')
    if (separator < 0) continue
    const name = pair.slice(0, separator).trim()
    const match = AUTH_COOKIE.exec(name)
    if (!match) continue
    chunks.push({
      index: match[1] ? Number(match[1]) : 0,
      value: decodeURIComponent(pair.slice(separator + 1).trim()),
    })
  }
  if (chunks.length === 0) return null

  const joined = chunks
    .sort((a, b) => a.index - b.index)
    .map((chunk) => chunk.value)
    .join('')

  if (!joined.startsWith('base64-')) {
    // An older encoding wrote the JSON directly, and some versions wrote the
    // bare access token. Both are still readable.
    if (joined.startsWith('{')) return parseSession(joined)
    return joined.includes('.') ? joined : null
  }

  const decoded = base64UrlToString(joined.slice('base64-'.length))
  return decoded ? parseSession(decoded) : null
}

function parseSession(json: string): string | null {
  try {
    const session = JSON.parse(json) as { access_token?: unknown }
    return typeof session.access_token === 'string' ? session.access_token : null
  } catch {
    // A partial cookie write leaves the browser holding chunks from two
    // generations, which decode to invalid JSON. @supabase/ssr treats that as
    // "no session" and so does this.
    return null
  }
}

/** The `sub` claim, if the cookie holds a token that carries a uuid in it. */
export function userIdFromCookieHeader(header: string | string[] | undefined): string | null {
  if (!header) return null
  const single = Array.isArray(header) ? header.join('; ') : header

  const token = accessTokenFromCookieHeader(single)
  if (!token) return null

  const payload = token.split('.')[1]
  if (!payload) return null

  const decoded = base64UrlToString(payload)
  if (!decoded) return null

  try {
    const claims = JSON.parse(decoded) as { sub?: unknown }
    return typeof claims.sub === 'string' && UUID.test(claims.sub) ? claims.sub : null
  } catch {
    return null
  }
}
