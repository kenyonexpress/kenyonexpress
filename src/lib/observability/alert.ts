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

/**
 * The second sink, and the reason it is a URL and not an SDK.
 *
 * SECTIONS 34 recorded Slack as deliberately not built, on the grounds that
 * there was no workspace to send to and a sink with no destination reports to
 * nobody. That was the right call about a destination and the wrong shape for
 * the code: it left the operator with no way to add one later except a commit.
 *
 * Every other optional integration here -- Resend, Sentry, Meilisearch, QStash,
 * Axiom -- is wired and inert without its variable, and the operator turns it
 * on by setting the variable. This is that, for alerting. `SLACK_WEBHOOK_URL`
 * unset means not a single byte leaves the process, which is the state today;
 * set means the same alert that buzzes the phone also lands in a channel where
 * more than one person can see it.
 *
 * Read once at module load for the same reason `log.ts` gives: the variable
 * cannot change inside a running process.
 */
const SLACK_WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL

/**
 * Fire-and-forget, and strictly additive: ntfy stays the sink whose result
 * `sendAlert` returns. A Slack outage must not be able to turn a delivered
 * push into a reported failure, and an alert path that awaits two hops is an
 * alert path with two ways to hang.
 */
function fanOutToSlack(args: AlertArgs): void {
  if (!SLACK_WEBHOOK_URL) return

  void fetch(SLACK_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // `text` only. Block Kit would render better and would also be a schema
    // that can be wrong; this payload is accepted by an incoming webhook, a
    // workflow webhook and every self-hosted thing that imitates one.
    body: JSON.stringify({ text: `*${args.title}*\n${args.message}` }),
    signal: AbortSignal.timeout(4000),
  }).catch(() => {
    // Same rule as the ntfy path: an error thrown while reporting an error
    // becomes the error the customer sees.
  })
}

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

  fanOutToSlack(args)

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
