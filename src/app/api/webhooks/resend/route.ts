import { suppressEmail } from '@/lib/email/suppression'
import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { type ResendEvent, decideEvent } from '@/server/email/resend-events'
import { verifySvixSignature } from '@/server/email/svix'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * Receiver for Resend's delivery webhook (bounces and complaints).
 *
 * AUTH IS THE SVIX SIGNATURE, AND AN UNCONFIGURED DEPLOY IS A CLOSED ONE.
 * Without `RESEND_WEBHOOK_SECRET` every request gets 401. Accepting unsigned
 * posts would make an unauthenticated endpoint that writes the suppression
 * list: anyone could post `email.bounced` for any address and stop that person
 * receiving the coupon they paid for.
 *
 * IT ANSWERS 200 ONCE THE SIGNATURE IS GOOD, even when the write fails. Svix
 * retries a non-2xx for hours; a failed write is logged and dropped.
 *
 * THE ADDRESS IS NEVER LOGGED. The per-event log line carries the template and
 * the event class only, which is what the Axiom drain counts on. 207's
 * `email_events_daily` counter table is pending, so the log is the counter.
 */

// No `export const dynamic`: cacheComponents refuses that segment config, and
// reading the request body already makes the route dynamic.

function unauthorized(reason: string): NextResponse {
  log.warn('email.webhook_refused', { reason })
  return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
}

async function handle(request: NextRequest): Promise<NextResponse> {
  // Read ONCE, as text. Svix signs the raw bytes.
  const body = await request.text()

  const verdict = verifySvixSignature({
    secret: process.env.RESEND_WEBHOOK_SECRET,
    headers: {
      id: request.headers.get('svix-id'),
      timestamp: request.headers.get('svix-timestamp'),
      signature: request.headers.get('svix-signature'),
    },
    body,
  })
  if (!verdict.ok) return unauthorized(verdict.reason)

  let event: ResendEvent
  try {
    event = JSON.parse(body) as ResendEvent
  } catch {
    // Signed but unparseable: the one failure a retry cannot fix.
    return NextResponse.json({ error: 'bad_json' }, { status: 400 })
  }

  const decision = decideEvent(event)

  if (decision.counter) {
    log.info('email.event', { event: decision.counter, template: decision.template })
  }

  if (decision.suppress) {
    const written = await suppressEmail(
      decision.suppress.email,
      decision.suppress.reason,
      // The provider's reason, not the payload: the payload names the
      // recipient a second time.
      typeof event.data?.bounce === 'object' && event.data.bounce !== null
        ? JSON.stringify(event.data.bounce).slice(0, 1000)
        : `resend:${event.type}`,
    )
    log.info('email.suppression_recorded', {
      reason: decision.suppress.reason,
      template: decision.template,
      written,
    })
  }

  return NextResponse.json({ ok: true })
}

export const POST = withRequestLog('/api/webhooks/resend', handle)
