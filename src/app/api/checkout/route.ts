import { withRequestLog } from '@/lib/observability/with-request-log'
import { rateLimit } from '@/lib/rate-limit'
import { createClient } from '@/lib/supabase/server'
import { beginCheckout } from '@/server/actions/payments/checkout'
import { NextResponse } from 'next/server'

/**
 * POST /api/checkout
 * F64: Begin checkout with rate limiting (10 per hour per user)
 */
async function handle(request: Request): Promise<Response> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // F64: Rate limit 10 per hour per user
  const decision = await rateLimit('begin_checkout', user.id)
  if (!decision.allowed) {
    return NextResponse.json(
      { error: 'יותר מדי ניסיונות — נסו שוב בעוד שעה' },
      {
        status: 429,
        headers: {
          'RateLimit-Limit': decision.limit.toString(),
          'RateLimit-Remaining': (decision.remaining ?? 0).toString(),
          'RateLimit-Reset': decision.resetAtMs?.toString() ?? '',
        },
      },
    )
  }

  const body = await request.json()

  // Delegate to server action
  const result = await beginCheckout(body)

  if (!result.ok) {
    return NextResponse.json({ error: result.error, code: result.code }, { status: 400 })
  }

  return NextResponse.json({ data: result.data })
}

export const POST = withRequestLog('/api/checkout', handle)
