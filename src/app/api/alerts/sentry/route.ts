import { createHmac } from 'node:crypto'
import { decideSentryRelay, formatSentryAlert, parseSentryAlert } from '@/lib/alerts/sentry'
import { sendAlert } from '@/lib/observability/alert'
import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { secretEquals } from '@/lib/security/constant-time'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * The Sentry webhook: Sentry's word that an alert rule fired, relayed to the
 * phone through the same `sendAlert` every money-path alarm uses.
 *
 * WHY. Sentry's own notifications are email, and email is the channel this
 * project measured as unread. The metric alerts `scripts/sentry-alert-rules.mjs`
 * provisions ("Error rate spike", "RLS denial spike") were therefore alerting
 * nobody. This is the leg that makes them reach a person; what is relayed and
 * what is only acknowledged is decided in `lib/alerts/sentry.ts`, where it is
 * unit tested, and the short answer is: metric alerts, and issue alerts from
 * production only.
 *
 * AUTHENTICATION, strongest available first.
 *   - `sentry-hook-signature`: hex HMAC-SHA256 of the raw body with
 *     SENTRY_WEBHOOK_SECRET. This is what a Sentry internal integration sends
 *     (the Client Secret signs every payload), compared in constant time.
 *   - Else the secret itself, in `?secret=` or `x-sentry-webhook-secret`, for
 *     the legacy WebHooks plugin (which signs nothing, so the URL carries it,
 *     the same shape as UptimeRobot) and for a curl check.
 * Unset secret: 401 to everyone. An open relay here would let anyone page
 * the operator at will, which is a denial of the channel.
 *
 * ALWAYS 200 ONCE AUTHENTICATED AND PARSED. Sentry retries a non-2xx, and a
 * payload this side chose not to relay (a laptop's error, an installation
 * handshake) is not a failure to deliver. The body says what happened.
 *
 * Not rate limited: a shared-secret machine route with no session and no
 * cookie (rate-limit/route-coverage.test.ts lists it), and the rule's own
 * frequency in Sentry is the throttle on the phone.
 */

/** A full event payload with breadcrumbs runs to tens of KB; nothing honest is near this. */
const MAX_BODY_BYTES = 512 * 1024

function senderAuthorized(request: NextRequest, rawBody: string): boolean {
  const secret = process.env.SENTRY_WEBHOOK_SECRET ?? ''
  if (!secret) return false
  const signature = request.headers.get('sentry-hook-signature')
  if (signature) {
    const expected = createHmac('sha256', secret).update(rawBody).digest('hex')
    return secretEquals(signature, expected)
  }
  const provided =
    request.nextUrl.searchParams.get('secret') ?? request.headers.get('x-sentry-webhook-secret')
  return secretEquals(provided, secret)
}

async function handlePOST(request: NextRequest): Promise<NextResponse> {
  const rawBody = await request.text()
  if (rawBody.length > MAX_BODY_BYTES) {
    return NextResponse.json({ ok: false, error: 'payload too large' }, { status: 413 })
  }
  if (!senderAuthorized(request, rawBody)) {
    return NextResponse.json({ ok: false }, { status: 401 })
  }

  let json: unknown
  try {
    json = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid json' }, { status: 400 })
  }

  const resource = request.headers.get('sentry-hook-resource')
  const alert = parseSentryAlert(resource, json)
  if (!alert) {
    log.warn('sentry.alert_unparsed', { resource })
    return NextResponse.json({ ok: false, error: 'unrecognised alert' }, { status: 400 })
  }

  const decision = decideSentryRelay(alert)
  const headers = { 'cache-control': 'no-store' }

  if (!decision.relay) {
    log.info('sentry.alert_dropped', { kind: alert.kind, reason: decision.reason })
    return NextResponse.json(
      { ok: true, kind: alert.kind, relayed: false, reason: decision.reason },
      { status: 200, headers },
    )
  }

  const formatted = formatSentryAlert(alert)
  const delivered = await sendAlert(formatted)

  // `error` for the urgent ones: this is the line an operator greps for in
  // the log drain when the phone was silent, and it must sort with the fault.
  const entry = formatted.priority === 'urgent' ? log.error : log.info
  entry('sentry.alert_received', {
    kind: alert.kind,
    title: formatted.title,
    priority: formatted.priority,
    delivered,
  })

  return NextResponse.json(
    { ok: true, kind: alert.kind, relayed: true, delivered },
    { status: 200, headers },
  )
}

export const POST = withRequestLog('/api/alerts/sentry', handlePOST)
