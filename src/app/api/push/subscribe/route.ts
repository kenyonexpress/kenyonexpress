import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { type NextRequest, NextResponse } from 'next/server'

import { requestIp } from '@/lib/rate-limit/request-ip'
import { createAdminClient } from '@/lib/supabase/admin'
import { checkRateLimit } from '@/lib/utils/rate-limit'

async function handlePOST(request: NextRequest) {
  if (!(await checkRateLimit(`push-register:${requestIp(request)}`, 60, 3600))) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }

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
      reason: error instanceof Error ? error.message : String(error),
    })
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export const POST = withRequestLog('/api/push/subscribe', handlePOST)
