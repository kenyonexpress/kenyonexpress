import { cookies } from 'next/headers'

export const GUEST_SESSION_COOKIE = 'ke_session_id'
const SESSION_MAX_AGE = 60 * 60 * 24 * 30

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
  cookieStore.set(GUEST_SESSION_COOKIE, sessionId, {
    httpOnly: true,
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE,
    path: '/',
  })
  return sessionId
}

export async function getGuestSessionId(): Promise<string | null> {
  const cookieStore = await cookies()
  return parseGuestSessionToken(cookieStore.get(GUEST_SESSION_COOKIE)?.value)
}
