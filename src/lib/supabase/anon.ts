import { requestIdFetch } from '@/lib/supabase/request-id-fetch'
import { createClient } from '@supabase/supabase-js'

// Server-side clients that carry NO elevated key.
//
// WHY THIS EXISTS
//
// The whole cart ran on `createAdminClient()` — a service_role key that bypasses
// every policy on every table — to read the public catalogue and to touch one
// guest cart row. Neither needs it. `products`, `product_variants` and `coupons`
// all carry public read policies, and `public.carts` carries a policy written
// for precisely this case:
//
//   session_id = (current_setting('request.cookies', true)::json ->> 'session_id')
//
// PostgREST fills `request.cookies` from the Cookie header of the request it
// receives, so a guest cart is reachable with the anon key alone, by sending the
// session id as a cookie. Verified against the hosted project before this file
// was written: insert, select, update and delete all answer 2xx with the header,
// and the same select answers `[]` without it, so the policy is what is doing
// the work rather than the `session_id=eq.` filter.
//
// Two things follow. The obvious one is that an unauthenticated, public request
// path stops running with a key that could read every order and every payout.
// The second is that the guest cart now works anywhere the anon key works, which
// is what it always should have been.

function anonEnv(): { url: string; key: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) {
    throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY')
  }
  return { url, key }
}

/**
 * Catalogue reads: products, variants, active coupons.
 *
 * Deliberately not the `@supabase/ssr` server client. That one adopts the
 * visitor's session, which would make a catalogue read return a different set of
 * rows for an admin than for a shopper — the cart would then price a line the
 * shopper cannot see. This client is always exactly `anon`.
 *
 * One behavioural difference from the service-role client it replaces: a product
 * whose status leaves 'active' is no longer returned at all, so its cart line
 * disappears instead of rendering as unavailable. The money path is unchanged —
 * such a line was already excluded from the commission engine and could never be
 * charged — and `validateProductForCart` still answers "המוצר לא זמין", because
 * a row it cannot read is the same `!product` branch it already had.
 */
export function createPublicClient() {
  const { url, key } = anonEnv()
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: requestIdFetch },
  })
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/**
 * The guest cart, under the policy written for it.
 *
 * `sessionId` is re-validated as a UUID here even though every caller already
 * parsed it out of the cookie with `parseGuestSessionToken`. It is about to be
 * interpolated into an HTTP header, and a header built from a value that reached
 * the server from a browser is worth checking twice; a CR or LF in it would be a
 * request-splitting bug rather than a bad cart.
 *
 * Exactly one cookie is sent, and it is constructed here. The visitor's real
 * Cookie header — auth tokens included — is never forwarded to PostgREST.
 */
export function createGuestCartClient(sessionId: string) {
  if (!UUID_RE.test(sessionId)) {
    throw new Error('createGuestCartClient: session id is not a UUID')
  }
  const { url, key } = anonEnv()
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Cookie: `session_id=${sessionId}` }, fetch: requestIdFetch },
  })
}
