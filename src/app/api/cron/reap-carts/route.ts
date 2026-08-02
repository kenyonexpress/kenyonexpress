import { createAdminClient } from '@/lib/supabase/admin'
import { type NextRequest, NextResponse } from 'next/server'

/** Batches per invocation. 10 x 500 is 5,000 carts, far above any real day. */
const MAX_BATCHES = 10

/**
 * Deletes carts nobody has touched since `expires_at`.
 *
 * `public.carts.expires_at` has existed from the start, defaults to 30 days out,
 * and is pushed forward by every single cart write, so a row past it is a cart
 * abandoned for a month. Nothing had ever deleted by it: the table held 253 rows
 * with 0 expired only because the oldest was 11 days old, and it grows from real
 * traffic and from roughly 15 rows per E2E run.
 *
 * The predicate lives in `fn_reap_expired_carts` (101), not here. What is
 * disposable is a property of the column, and a batch limit in SQL cannot be
 * widened by a caller. This route only drives it until it stops finding rows.
 *
 * WHAT THIS DELIBERATELY DOES NOT DELETE. Under the growth migrations
 * `abandoned_cart_nudges.cart_id` was NOT NULL ... ON DELETE CASCADE, which
 * would have made this route a second, silent deleter of the recovery history
 * that `v_abandoned_cart_recovery` reports on. 101 changes it to SET NULL. The
 * nudge is a fact about a person and an order; the cart is only where it
 * happened, and it is the cart that expires.
 *
 * Auth: Vercel Cron sends Authorization: Bearer CRON_SECRET.
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET
  // `!secret` closes the route in the absence of a secret rather than opening it.
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  const admin = createAdminClient()
  let reaped = 0

  for (let batch = 0; batch < MAX_BATCHES; batch += 1) {
    const { data, error } = await admin.rpc(
      'fn_reap_expired_carts' as never,
      {
        p_limit: 500,
      } as never,
    )

    if (error) {
      // Report what was already deleted. Each batch commits on its own, so a
      // failure partway through is not "nothing happened", and reading it that
      // way is how a backlog gets swept twice.
      console.error('fn_reap_expired_carts failed:', error.message)
      return NextResponse.json({ ok: false, reaped, error: error.message }, { status: 500 })
    }

    const deleted = Number(data ?? 0)
    reaped += deleted
    // A short batch means the backlog is drained; anything else is a wasted
    // round trip against a table shoppers are writing to.
    if (deleted < 500) break
  }

  return NextResponse.json({ ok: true, reaped })
}
