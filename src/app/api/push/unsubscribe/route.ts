import { withRequestLog } from '@/lib/observability/with-request-log'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/utils/rate-limit'
import { type NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

/**
 * Removes the signed-in user's browser push subscription (C14). The same
 * delete `DELETE /api/push/subscribe` does, under the name a client expects.
 * It runs on the user's own client, so the delete_own policy on
 * public.push_subscriptions is the ownership check: another account's endpoint
 * matches no row and the answer is still ok.
 */
const bodySchema = z.object({ endpoint: z.string().url().max(1000) })

async function handlePOST(request: NextRequest): Promise<NextResponse> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  if (!(await checkRateLimit(`push-subscribe:${user.id}`, 30, 3600))) {
    return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_subscription' }, { status: 400 })
  }
  await supabase.from('push_subscriptions').delete().eq('endpoint', parsed.data.endpoint)
  return NextResponse.json({ ok: true })
}

export const POST = withRequestLog('/api/push/unsubscribe', handlePOST)
