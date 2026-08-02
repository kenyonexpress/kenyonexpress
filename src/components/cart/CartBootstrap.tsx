import CartHydrate from '@/components/cart/CartHydrate'
import { createClient } from '@/lib/supabase/server'
import { getCart } from '@/server/actions/cart'

/**
 * The one request-time read the site chrome needs, isolated so it is the ONLY
 * thing that has to wait.
 *
 * Every route group layout used to `await` these two before rendering anything,
 * which under `cacheComponents` means no route below them has a static shell
 * and, before it, meant every storefront response carried
 * `Cache-Control: no-store`. Here it sits alone behind a `<Suspense>`, so the
 * shell (masthead, footer, and the page itself where the page allows it) is
 * prerendered and this streams in after.
 *
 * MUST stay inside a `<Suspense>` boundary. Rendered bare it puts `cookies()`
 * back on the blocking path and takes the whole group's shell down with it.
 */
export default async function CartBootstrap() {
  const supabase = await createClient()
  const [cart, { data: auth }] = await Promise.all([getCart(), supabase.auth.getUser()])

  return <CartHydrate cart={cart} isAuthenticated={auth.user !== null} />
}
