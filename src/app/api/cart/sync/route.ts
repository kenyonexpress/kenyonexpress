import { CacheControl } from '@/lib/cache/http'
import { CART_SYNC_MAX_LINES, type CartSyncRejected, cartLineKey } from '@/lib/cart/sync-queue'
import type { CartView } from '@/lib/cart/types'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { rateLimit, rateLimitHeaders } from '@/lib/rate-limit'
import { createClient } from '@/lib/supabase/server'
import { getClientIp } from '@/lib/utils/rate-limit'
import { addToCart, getCart, removeFromCart, updateCartItem } from '@/server/actions/cart'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

/**
 * Replays the cart writes a shopper made with no network.
 *
 * The page (or the service worker, through Background Sync) posts the queue
 * from `lib/cart/sync-queue.ts`: one entry per line, each the ABSOLUTE
 * quantity the line should end at. This route decides what that means
 * against the cart it actually holds, and every decision goes through the
 * same server actions a live press would: `addToCart` for a line the cart
 * does not have, `updateCartItem` for one it does, `removeFromCart` for a
 * zero. So the stock check, the price, the platform-percent snapshot and the
 * per-shopper write budget are the live ones, and a queued line can no more
 * buy at a stale price than a live one can.
 *
 * WHY A ROUTE AND NOT A SERVER ACTION. A service worker cannot invoke a
 * Server Function: that transport is a form post with an action id the
 * worker does not have. A route handler is a plain POST both callers can
 * make with the shopper's own cookies. The CSRF gate is the proxy's
 * (`isCrossSiteApiMutation`), the same one every other cookie-scoped write
 * under /api sits behind.
 *
 * PER-LINE FAILURE IS NOT A FAILURE. A line that is now out of stock is
 * reported in `rejected` and the rest still land. Answering 4xx for it would
 * make the page drop the whole queue over one sold-out item; answering 5xx
 * would make Background Sync retry it for a day. The response is 200 with
 * the cart as it stands and the lines it would not take.
 *
 * THE LIMITER IS ON TOP OF, NOT INSTEAD OF, THE ACTIONS' OWN. Each action
 * spends `cart_write` for the shopper exactly as a live press does, so a
 * 50-line replay costs 50 of the hourly 120. The explicit call here is what
 * turns "too many" into a 429 with `Retry-After` for the worker, rather than
 * a 200 whose every line reads "יותר מדי פעולות".
 */

const uuid = z.string().uuid()

const lineSchema = z.object({
  product_id: uuid,
  variant_id: uuid.nullable().default(null),
  quantity: z.number().int().min(0).max(99),
})

const bodySchema = z.object({
  lines: z.array(lineSchema).min(1).max(CART_SYNC_MAX_LINES),
})

type Line = z.infer<typeof lineSchema>

/** Last entry per line wins, in arrival order, which is how the queue was written. */
function dedupe(lines: Line[]): Line[] {
  const byKey = new Map<string, Line>()
  for (const line of lines) byKey.set(cartLineKey(line.product_id, line.variant_id), line)
  return [...byKey.values()]
}

async function handlePOST(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const identifier = user ? `user:${user.id}` : `ip:${await getClientIp()}`

  const decision = await rateLimit('cart_write', identifier)
  if (!decision.allowed) {
    return NextResponse.json(
      { ok: false, error: 'rate_limited' },
      {
        status: 429,
        headers: { ...rateLimitHeaders(decision), 'cache-control': CacheControl.private },
      },
    )
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'invalid_request' },
      { status: 400, headers: { 'cache-control': CacheControl.private } },
    )
  }

  let cart: CartView = await getCart()
  const held = new Map(
    cart.items.map((item) => [cartLineKey(item.product_id, item.variant_id), item]),
  )
  const rejected: CartSyncRejected[] = []

  for (const line of dedupe(parsed.data.lines)) {
    const key = cartLineKey(line.product_id, line.variant_id)
    const existing = held.get(key)

    if (line.quantity === 0) {
      // A removal of a line the server never had is already true.
      if (!existing) continue
      const result = await removeFromCart(line.product_id, line.variant_id)
      if (result.ok) {
        cart = result.cart
        held.delete(key)
      } else {
        rejected.push({
          product_id: line.product_id,
          variant_id: line.variant_id,
          error: result.error,
        })
      }
      continue
    }

    if (existing && existing.quantity === line.quantity) continue

    const result = existing
      ? await updateCartItem(line.product_id, line.variant_id, line.quantity)
      : await addToCart(line.product_id, line.variant_id, line.quantity)
    if (result.ok) {
      cart = result.cart
      const now = result.cart.items.find(
        (item) => cartLineKey(item.product_id, item.variant_id) === key,
      )
      if (now) held.set(key, now)
      else held.delete(key)
    } else {
      rejected.push({
        product_id: line.product_id,
        variant_id: line.variant_id,
        error: result.error,
      })
    }
  }

  return NextResponse.json(
    { ok: true, cart, rejected },
    { headers: { 'cache-control': CacheControl.private } },
  )
}

export const POST = withRequestLog('/api/cart/sync', handlePOST)
