import { cookies, headers } from 'next/headers'
import { GUEST_SESSION_COOKIE, guestSessionCookieOptions } from './guest-session-cookie'

export { GUEST_SESSION_COOKIE }

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** Plain UUID or HMAC-signed `{uuid}.{sig}` guest cart token from proxy / server actions. */
export function parseGuestSessionToken(raw: string | undefined): string | null {
  if (!raw) return null
  const uuid = raw.includes('.') ? (raw.split('.')[0] ?? '') : raw
  return UUID_RE.test(uuid) ? uuid : null
}

/** Ensure a guest session id exists; returns the UUID used as carts.session_id. */
export async function ensureGuestSessionId(): Promise<string> {
  const cookieStore = await cookies()
  const existing = parseGuestSessionToken(cookieStore.get(GUEST_SESSION_COOKIE)?.value)
  if (existing) return existing

  const sessionId = crypto.randomUUID()
  // The options come from the shared builder rather than being written out
  // again here. They used to be written twice — once here and once in the proxy
  // — and `secure` was missing from both, which is what two copies buys.
  const requestHeaders = await headers()
  cookieStore.set(
    GUEST_SESSION_COOKIE,
    sessionId,
    guestSessionCookieOptions(requestHeaders.get('x-forwarded-proto')),
  )
  return sessionId
}

export async function getGuestSessionId(): Promise<string | null> {
  const cookieStore = await cookies()
  return parseGuestSessionToken(cookieStore.get(GUEST_SESSION_COOKIE)?.value)
}
