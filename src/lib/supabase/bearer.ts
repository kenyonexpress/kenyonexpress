import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import type { User } from '@supabase/supabase-js'

/**
 * Authenticates a request that may come from the website OR from the app.
 *
 * The site's session lives in cookies, which `@supabase/ssr` reads. The app
 * holds its session in the native keychain and sends it as
 * `Authorization: Bearer <access_token>`, which nothing in the cookie client
 * looks at. Every route the app shares with the site needs both.
 *
 * COOKIE FIRST, AND THAT ORDER MATTERS. A browser cannot be made to send a
 * bearer header it did not choose to send, but a page CAN be made to carry a
 * cookie by a cross-site navigation. Preferring the cookie means the site's own
 * requests are never interpreted through an attacker-supplied header.
 *
 * The token is verified against Supabase on every call - `getUser(token)` is a
 * round trip to the auth server, not a local JWT decode. That is the point: a
 * revoked session must stop working immediately, and a locally-verified
 * signature would keep accepting it until it expired.
 */
export type RequestIdentity = {
  user: User
  /** How the caller proved who they are. Useful for logs, never for authorization. */
  via: 'cookie' | 'bearer'
}

function bearerToken(header: string | null): string | null {
  if (!header) return null
  const match = /^Bearer\s+(.+)$/i.exec(header.trim())
  const token = match?.[1]?.trim()
  return token && token.length > 0 ? token : null
}

export async function authenticateRequest(request: Request): Promise<RequestIdentity | null> {
  const cookieClient = await createServerClient()
  const {
    data: { user: cookieUser },
  } = await cookieClient.auth.getUser()
  if (cookieUser) return { user: cookieUser, via: 'cookie' }

  const token = bearerToken(request.headers.get('authorization'))
  if (!token) return null

  const anon = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
  const {
    data: { user },
  } = await anon.auth.getUser(token)
  return user ? { user, via: 'bearer' } : null
}

/** Exported for tests: the header parse is where a malformed value slips through. */
export const __test = { bearerToken }
