import { withRequestLog } from '@/lib/observability/with-request-log'
import { createClient } from '@/lib/supabase/server'
import { getCart } from '@/server/actions/cart'
import { NextResponse } from 'next/server'

/**
 * The cart bootstrap read, moved out of the render tree entirely.
 *
 * `<CartBootstrap>` used to be a server component in a `<Suspense>` hole doing
 * these same two reads. A hole keeps the shell static but the response is still
 * postponed (`x-nextjs-postponed`), and a postponed response cannot be cached
 * as a whole — every storefront route carried `Cache-Control: no-store` because
 * of it. With the reads here, the layouts render no request-time work at all,
 * the storefront prerenders fully static, and the client fetches this once
 * after hydration.
 *
 * The response is per-shopper (cookie-scoped cart, auth state) and must never
 * be cached by any layer, hence the explicit `no-store`. For a first-time
 * guest, `getCart` mints the `ke_session_id` cookie here — a cookie write is
 * legal in a route handler, which is one more reason this read cannot go back
 * into a server component.
 */
async function handleGET() {
  const supabase = await createClient()
  const [cart, { data: auth }] = await Promise.all([getCart(), supabase.auth.getUser()])

  return NextResponse.json(
    { cart, isAuthenticated: auth.user !== null },
    { headers: { 'cache-control': 'no-store' } },
  )
}

export const GET = withRequestLog('/api/cart', handleGET)
