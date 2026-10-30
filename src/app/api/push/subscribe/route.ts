import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { rateLimit, tooManyRequests } from '@/lib/rate-limit'
import { requestIp } from '@/lib/rate-limit/request-ip'
import { createAdminClient } from '@/lib/supabase/admin'
import { type NextRequest, NextResponse } from 'next/server'

async function handlePOST(request: NextRequest): Promise<Response> {
  const decision = await rateLimit('push-subscribe', requestIp(request))
  if (!decision.allowed) return tooManyRequests(decision)
  try {
    const subscription = await request.json()

    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
      return NextResponse.json({ error: 'Invalid subscription' }, { status: 400 })
    }

    const authHeader = request.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const token = authHeader.slice(7)
    const supabase = createAdminClient()

    const { data, error: authError } = await supabase.auth.getUser(token)
    if (authError || !data.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        user_id: data.user.id,
        endpoint: subscription.endpoint,
        keys_p256dh: subscription.keys.p256dh,
        keys_auth: subscription.keys.auth,
      },
      { onConflict: 'user_id,endpoint' },
    )

    if (error) {
      log.error('push.subscribe_save_failed', { reason: error.message })
      return NextResponse.json({ error: 'Failed to save subscription' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    log.error('push.subscribe_failed', {
      reason: error instanceof Error ? error.message : 'unknown',
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const POST = withRequestLog('/api/push/subscribe', handlePOST)
