/**
 * The user half of the Sentry event, in one place for all three runtimes.
 *
 * Two jobs, both about the same rule: an event may carry the Supabase user's
 * UUID and NOTHING else about the person. The UUID is the handle support
 * already holds (orders.user_id, the admin panel, every RLS policy), so it
 * turns "some customer hit this" into "this customer hit this" without giving
 * a third party an email, a name or an IP to retain.
 *
 * Edge-safe on purpose: plain string work and `atob`, no Node imports, so
 * sentry.edge.config.ts and instrumentation-client.ts can both use it.
 */

/**
 * The final gate, run in every `beforeSend`. Whatever any future call site
 * hands to `Sentry.setUser` - a whole Supabase user object with `email` on it
 * being the obvious accident - only the id survives. `sendDefaultPii: false`
 * already keeps the SDK from ADDING ip_address; this keeps us from adding it
 * ourselves.
 */
export function scrubEventUser(user: unknown): { id: string } | undefined {
  if (typeof user !== 'object' || user === null) return undefined
  const id = (user as { id?: unknown }).id
  if (typeof id !== 'string' || id.length === 0) return undefined
  return { id }
}

/**
 * The signed-in user's id, read from the Supabase auth cookie already on the
 * request - no network call, which is what lets withActionContext run this on
 * every one of the ~80 actions without buying each a Supabase round trip.
 *
 * OBSERVABILITY ONLY, NEVER AUTHORIZATION. The JWT is decoded, not verified:
 * a forged cookie could mislabel its own error events and nothing more. Every
 * decision that matters still goes through supabase.auth.getUser().
 *
 * Handles both cookie shapes @supabase/ssr writes: a single
 * `sb-<ref>-auth-token` (optionally `base64-` prefixed) and the chunked
 * `sb-<ref>-auth-token.0`, `.1`, ... form it switches to when the session
 * outgrows one cookie. Anything malformed returns null rather than throwing;
 * this runs on the request path of every action.
 */
export function userIdFromCookieHeader(cookieHeader: string | null | undefined): string | null {
  if (!cookieHeader) return null
  try {
    const session = readAuthCookie(cookieHeader)
    if (!session) return null
    const token = (JSON.parse(session) as { access_token?: unknown }).access_token
    if (typeof token !== 'string') return null
    const payload = token.split('.')[1]
    if (!payload) return null
    const sub = (JSON.parse(base64UrlDecode(payload)) as { sub?: unknown }).sub
    // A UUID is 36 chars; the cap and charset keep a hand-rolled cookie from
    // planting markup or a novel in the Sentry user field.
    if (typeof sub !== 'string' || sub.length === 0 || sub.length > 64) return null
    if (!/^[A-Za-z0-9-]+$/.test(sub)) return null
    return sub
  } catch {
    return null
  }
}

/** The auth cookie's JSON, reassembled from chunks and un-base64ed if needed. */
function readAuthCookie(cookieHeader: string): string | null {
  const chunks: Array<{ index: number; value: string }> = []
  let whole: string | null = null

  for (const pair of cookieHeader.split(';')) {
    const eq = pair.indexOf('=')
    if (eq < 0) continue
    const name = pair.slice(0, eq).trim()
    const match = /^sb-[^=;]+-auth-token(?:\.(\d+))?$/.exec(name)
    if (!match) continue
    const value = decodeURIComponent(pair.slice(eq + 1).trim())
    if (match[1] === undefined) whole = value
    else chunks.push({ index: Number(match[1]), value })
  }

  let raw = whole
  if (raw === null && chunks.length > 0) {
    raw = chunks
      .sort((a, b) => a.index - b.index)
      .map((c) => c.value)
      .join('')
  }
  if (raw === null) return null
  if (raw.startsWith('base64-')) return base64UrlDecode(raw.slice('base64-'.length))
  return raw
}

function base64UrlDecode(input: string): string {
  const base64 = input.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4)
  // atob yields a byte string; the TextDecoder pass is what keeps a Hebrew
  // display name elsewhere in the payload from mangling the JSON around it.
  const bytes = Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}
