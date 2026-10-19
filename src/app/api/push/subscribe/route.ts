import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { browserSubscriptionSchema } from '@/lib/push/browser-subscription'
import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { checkRateLimit } from '@/lib/utils/rate-limit'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * Stores (POST) or removes (DELETE) the signed-in user's browser push
 * subscription in public.push_subscriptions (rc5 F14). The table lets a user
 * read and delete their own rows but not insert, so the write is the service
 * role's, with the user id from the session and never from the body. An
 * endpoint is unique: a browser that re-subscribes under another account moves
 * to that account.
 */
async function currentUser() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  return user
}

async function handlePOST(request: NextRequest): Promise<NextResponse> {
  const user = await currentUser()
  if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  if (!(await checkRateLimit(`push-subscribe:${user.id}`, 20, 3600))) {
    return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })
  }
  const parsed = browserSubscriptionSchema.safeParse(await request.json().catch(() => null))
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_subscription' }, { status: 400 })
  }
  const { error } = await createAdminClient()
    .from('push_subscriptions')
    .upsert(
      {
        user_id: user.id,
        endpoint: parsed.data.endpoint,
        p256dh: parsed.data.keys.p256dh,
        auth: parsed.data.keys.auth,
        user_agent: request.headers.get('user-agent')?.slice(0, 300) ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'endpoint' },
    )
  if (error) {
    log.error('push.subscribe_failed', { reason: error.message })
    return NextResponse.json({ ok: false, error: 'store_failed' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

async function handleDELETE(request: NextRequest): Promise<NextResponse> {
  const user = await currentUser()
  if (!user) return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  if (!(await checkRateLimit(`push-subscribe:${user.id}`, 20, 3600))) {
    return NextResponse.json({ ok: false, error: 'rate_limited' }, { status: 429 })
  }
  const body = (await request.json().catch(() => null)) as { endpoint?: unknown } | null
  if (typeof body?.endpoint !== 'string') {
    return NextResponse.json({ ok: false, error: 'invalid_subscription' }, { status: 400 })
  }
  // On the user's own client: the delete_own policy is the ownership check.
  const supabase = await createClient()
  await supabase.from('push_subscriptions').delete().eq('endpoint', body.endpoint)
  return NextResponse.json({ ok: true })
}

export const POST = withRequestLog('/api/push/subscribe', handlePOST)
export const DELETE = withRequestLog('/api/push/subscribe', handleDELETE)
