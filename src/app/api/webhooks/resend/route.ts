import { countEmailEvent, suppressEmail } from '@/lib/email/suppression'
import { log } from '@/lib/observability/log'
import { withRequestLog } from '@/lib/observability/with-request-log'
import { type ResendEvent, decideEvent } from '@/server/email/resend-events'
import { verifySvixSignature } from '@/server/email/svix'
import { type NextRequest, NextResponse } from 'next/server'

/**
 * Receiver for Resend's delivery webhook.
 *
 * WHAT IT IS FOR. `email_suppressions` has existed since 095 and
 * `fn_enqueue_notification` has consulted it ever since, and it has never held
 * a row - because a bounce and a complaint are reported exactly once, here, and
 * until now nothing was listening. So a hard-bounced address was mailed again
 * by the next cron and an address whose owner pressed "spam" was mailed for as
 * long as they had an account. That is paid for by every other recipient, in
 * the sending domain's reputation.
 *
 * AUTH IS THE SVIX SIGNATURE, AND AN UNCONFIGURED DEPLOY IS A CLOSED ONE.
 * Without `RESEND_WEBHOOK_SECRET` every request gets 401 - the same stance
 * `CRON_SECRET` takes on the cron routes and `TWILIO_*` takes on the WhatsApp
 * webhook. The alternative, accepting unsigned posts when no secret is set, is
 * an unauthenticated endpoint that writes the suppression list: anyone could
 * post `email.bounced` for any address and stop that person receiving the
 * coupon they paid for.
 *
 * IT ALWAYS ANSWERS 200 ONCE THE SIGNATURE IS GOOD, even when the write fails.
 * Svix retries a non-2xx with backoff for hours, and a retry storm caused by a
 * database blip would arrive as duplicate counter increments - inflating
 * exactly the numbers this endpoint exists to make trustworthy. A failed write
 * is logged and dropped, which loses one event; a retried write corrupts a
 * daily total in a way nothing can later distinguish from real traffic.
 *
 * IT STORES NO ADDRESS EXCEPT ON THE SUPPRESSION LIST. The counters are per
 * (day, template, event). There is no row that says who opened what, and no
 * column that could be joined to make one.
 */

// NO `export const dynamic = 'force-dynamic'`. `cacheComponents` refuses that
// segment config outright ("not compatible with nextConfig.cacheComponents"),
// and it is not needed: the handler reads request headers and the request body,
// which is what makes a route dynamic. Declaring it as well is how a route that
// builds today stops building on the next Next upgrade.

function unauthorized(reason: string): NextResponse {
  log.warn('email.webhook_refused', { reason })
  return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
}

async function handle(request: NextRequest): Promise<NextResponse> {
  // Read ONCE, as text. Svix signs the raw bytes, and a parse-then-restringify
  // changes key order and number formatting, so the signature would fail for
  // reasons that look like a wrong secret.
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
    // Signed but unparseable. 400 rather than 200: this is the one failure that
    // a retry cannot fix and that nobody should be told is fine.
    return NextResponse.json({ error: 'bad_json' }, { status: 400 })
  }

  const decision = decideEvent(event)

  if (decision.counter) {
    await countEmailEvent(decision.template, decision.counter)
  }

  if (decision.suppress) {
    const written = await suppressEmail(
      decision.suppress.email,
      decision.suppress.reason,
      `resend:${event.type}`,
      // The provider's own words about why, capped by 207's CHECK. Not the
      // whole payload: it carries the recipient's address a second time and a
      // message id, and neither belongs in a column read by an operator.
      typeof event.data?.bounce === 'object' && event.data.bounce !== null
        ? JSON.stringify(event.data.bounce).slice(0, 1000)
        : undefined,
    )
    // The address is NOT logged. A log line naming a person who complained is
    // the same profile the counters were designed not to build.
    log.info('email.suppression_recorded', {
      reason: decision.suppress.reason,
      template: decision.template,
      written,
    })
  }

  return NextResponse.json({ ok: true })
}

export const POST = withRequestLog('/api/webhooks/resend', handle)
