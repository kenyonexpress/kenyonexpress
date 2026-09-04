import { requestIdFetch } from '@/lib/supabase/request-id-fetch'
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
    {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { fetch: requestIdFetch },
    },
  )
  const {
    data: { user },
  } = await anon.auth.getUser(token)
  return user ? { user, via: 'bearer' } : null
}

/**
 * A client that CARRIES the caller's identity into the database, for the routes
 * whose work happens inside a `SECURITY DEFINER` function that reads
 * `auth.uid()`.
 *
 * `authenticateRequest` above answers "who is this"; this answers "act as
 * them". The two are not interchangeable and using the admin client in place of
 * this one is the bug it exists to prevent: `redeem_voucher` derives the
 * supplier from the caller's own `supplier_members` row, so a service-role
 * connection has no `auth.uid()` and every redemption would be refused - or,
 * worse, a future version that took the supplier as an argument would let a
 * till burn another business's vouchers.
 *
 * Cookie callers already have such a client (`createClient()` from
 * ./server). This is the bearer equivalent, and it is why the routes below
 * branch on `via` rather than always using one.
 */
export async function identityScopedClient(request: Request) {
  const identity = await authenticateRequest(request)
  if (!identity) return null

  if (identity.via === 'cookie') {
    return { identity, client: await createServerClient() }
  }

  const token = bearerToken(request.headers.get('authorization')) as string
  return {
    identity,
    client: createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${token}` }, fetch: requestIdFetch },
      },
    ),
  }
}

/** Exported for tests: the header parse is where a malformed value slips through. */
export const __test = { bearerToken }
