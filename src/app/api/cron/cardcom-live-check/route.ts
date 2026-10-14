import { sendAlert } from '@/lib/observability/alert'
import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import {
  LIVE_READY_MESSAGE,
  assessLiveReadiness,
  touchLaunchReadyFlag,
} from '@/lib/payments/live-readiness'
import { bearerMatches } from '@/lib/security/constant-time'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * Every 30 minutes: are the live Cardcom credentials in this deployment yet?
 *
 * Reads `CARDCOM_USE_MOCK` and `CARDCOM_API_NAME` at request time (never at
 * build time, which is what `pnpm build` would bake in). When mock is off and
 * the API name is a real one, it pushes one line to the phone topic
 * (`kenyon-ofir-limit`, `LIVE_CHECK_NTFY_TOPIC` overrides) and touches
 * `~/ke-goals/LAUNCH-READY.flag` for the local loop. The rules are in
 * lib/payments/live-readiness.ts.
 *
 * ONCE THE FLIP HAS HAPPENED IT GOES QUIET. `CHECKOUT_ENABLED=true` is the
 * action the message asks for; repeating the ask every half hour after it was
 * done is the kind of noise that gets the topic muted before the alert that
 * matters. The flag is still touched, so the loop sees the state either way.
 *
 * NO DATABASE, NO MONEY. It reads three variables and answers. A failed push
 * is a warn line and a field, not a 500: the scheduler going red about a
 * notification would itself be a notification nobody asked for.
 *
 * Auth: the scheduler sends Authorization: Bearer CRON_SECRET, checked in
 * constant time. An unset secret stays closed.
 */

const DEFAULT_TOPIC = 'kenyon-ofir-limit'

async function handleGET(request: NextRequest): Promise<NextResponse> {
  const secret = process.env.CRON_SECRET
  if (!bearerMatches(request.headers.get('authorization'), secret ?? '')) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  const readiness = assessLiveReadiness(process.env)
  const headers = { 'cache-control': 'no-store' }

  if (!readiness.ready) {
    return NextResponse.json({ ok: true, status: 'not_ready', ...readiness }, { headers })
  }

  const flag = await touchLaunchReadyFlag()

  if (readiness.checkoutEnabled) {
    return NextResponse.json({ ok: true, status: 'live', flag, ...readiness }, { headers })
  }

  const notified = await sendAlert({
    title: 'KenyonExpress launch',
    message: LIVE_READY_MESSAGE,
    priority: 'urgent',
    tags: ['rocket'],
    // `||`, not `??`: an empty variable must not post to `ntfy.sh/`.
    topic: process.env.LIVE_CHECK_NTFY_TOPIC || DEFAULT_TOPIC,
  })
  if (notified) {
    log.info('cardcom.live_ready', { flag })
  } else {
    log.warn('cardcom.live_ready_notify_failed', { reason: 'no channel accepted the alert', flag })
  }

  return NextResponse.json({ ok: true, status: 'ready', notified, flag, ...readiness }, { headers })
}

export const GET = withRequestLog('/api/cron/cardcom-live-check', handleGET)
