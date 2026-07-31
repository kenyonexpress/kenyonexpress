/**
 * Push alerts to a phone, for the failures that need a person tonight.
 *
 * ntfy.sh, over plain fetch. This is a single POST with a text body, and the
 * whole point is that it works when other things do not: no SDK, no auth
 * handshake, no dependency that can break the alert about the thing that broke.
 *
 * WHY THIS EXISTS ALONGSIDE SENTRY. Sentry is the record; this is the
 * interrupt. ARCHITECTURE-OPS sets out five alerts and nothing else, because
 * this is a single operator with a phone and an alert that does not lead to an
 * action is noise that kills the channel. So the rule is: capture broadly in
 * Sentry, alert narrowly here, and only for money.
 */

// No `server-only` import, deliberately. This module makes one outbound fetch
// and reads two env vars; the marker would buy nothing and would put the
// alerting path beyond the reach of a unit test, which is the one part of an
// incident response that has to be known to work BEFORE the incident.
const TOPIC = process.env.NTFY_TOPIC ?? 'kenyon-ofir-limit'
const BASE = process.env.NTFY_BASE_URL ?? 'https://ntfy.sh'

export type AlertPriority = 'default' | 'high' | 'urgent'

export type AlertArgs = {
  title: string
  message: string
  priority?: AlertPriority
  tags?: string[]
}

/**
 * Never throws and never rejects. Every caller is already on a failure branch,
 * and an error thrown while reporting an error becomes the error the customer
 * sees.
 */
export async function sendAlert(args: AlertArgs): Promise<boolean> {
  if (process.env.ALERTS_ENABLED === 'false') return false

  try {
    const res = await fetch(`${BASE}/${TOPIC}`, {
      method: 'POST',
      headers: {
        // ntfy reads these as ASCII; a Hebrew title would arrive mangled, so
        // titles are English and the body carries the Hebrew.
        Title: args.title,
        Priority: args.priority ?? 'high',
        Tags: (args.tags ?? ['warning']).join(','),
      },
      body: args.message,
      // A hung alert must not hold a webhook open: Cardcom retries on timeout,
      // and a retry storm caused by our own alerting is worse than a missed
      // push.
      signal: AbortSignal.timeout(4000),
    })
    return res.ok
  } catch {
    return false
  }
}

/**
 * The two conditions ARCHITECTURE-OPS classes as immediate: a failure on the
 * money path, and a failure to redeem a voucher a customer already paid for.
 *
 * Deliberately NOT called for catalogue render errors, 404s, validation
 * failures or rate limits. Those are Sentry's job. A phone that buzzes for a
 * crawler hitting a dead URL is a phone whose owner stops looking at it, and
 * then the one alert that mattered arrives to an audience of nobody.
 */
export async function alertMoneyFailure(args: {
  stage: string
  orderId?: string | null
  paymentId?: string | null
  voucherId?: string | null
  error: unknown
}): Promise<void> {
  const detail = args.error instanceof Error ? args.error.message : String(args.error)

  await sendAlert({
    title: `KE money path: ${args.stage}`,
    priority: 'urgent',
    tags: ['rotating_light'],
    // Identifiers only, never amounts or customer details: this is an
    // unauthenticated public topic unless NTFY_TOPIC is a private one, and it
    // is a handle for looking the incident up rather than a report of it.
    message: [
      `שלב: ${args.stage}`,
      args.orderId ? `הזמנה: ${args.orderId}` : null,
      args.paymentId ? `תשלום: ${args.paymentId}` : null,
      args.voucherId ? `שובר: ${args.voucherId}` : null,
      `שגיאה: ${detail.slice(0, 300)}`,
    ]
      .filter(Boolean)
      .join('\n'),
  })
}
