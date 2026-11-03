/**
 * What a Resend webhook event means, as a pure function.
 *
 * Separated from the route so the decisions are testable without a request: a
 * webhook is the one endpoint whose logic is never exercised by using the site,
 * and the interesting cases - a soft bounce that must NOT suppress, an event
 * with no address - only ever arrive from outside.
 */

export type ResendEventType =
  | 'email.sent'
  | 'email.delivered'
  | 'email.delivery_delayed'
  | 'email.bounced'
  | 'email.complained'
  | 'email.opened'
  | 'email.clicked'

/** The counter names 207's CHECK permits. */
export type CounterEvent =
  | 'sent'
  | 'delivered'
  | 'delivery_delayed'
  | 'bounced'
  | 'complained'
  | 'opened'
  | 'clicked'

export type ResendEvent = {
  type: string
  data?: {
    to?: unknown
    tags?: unknown
    bounce?: unknown
    [key: string]: unknown
  }
}

export type EventDecision = {
  /** Null when the event is one we do not count. */
  counter: CounterEvent | null
  /** The address to suppress, and why. Null when nothing should be suppressed. */
  suppress: { email: string; reason: 'hard_bounce' | 'complaint' } | null
  template: string
}

/**
 * The template a send was tagged with.
 *
 * TWO NAMES, because there are two senders. `lib/email/resend.ts` tags
 * `template` and `lib/growth/resend.ts` tags `kind`, and neither is renamed:
 * a tag is attached to mail that is already in flight, and renaming one would
 * orphan every event still to arrive for messages already sent.
 *
 * Resend delivers tags as an object in some payload versions and as an array of
 * `{name, value}` in others. Both are read, because guessing wrong here is a
 * silent fall back to `unknown` for every event.
 */
export function templateFromTags(tags: unknown): string {
  const pick = (name: string, value: unknown): string | null =>
    (name === 'template' || name === 'kind') && typeof value === 'string' && value.length > 0
      ? value
      : null

  if (Array.isArray(tags)) {
    for (const entry of tags) {
      if (typeof entry !== 'object' || entry === null) continue
      const record = entry as { name?: unknown; value?: unknown }
      if (typeof record.name !== 'string') continue
      const found = pick(record.name, record.value)
      if (found) return found
    }
    return 'unknown'
  }

  if (typeof tags === 'object' && tags !== null) {
    for (const [name, value] of Object.entries(tags as Record<string, unknown>)) {
      const found = pick(name, value)
      if (found) return found
    }
  }

  return 'unknown'
}

/** Resend sends `to` as an array; older payloads and tests send a string. */
export function firstRecipient(to: unknown): string | null {
  if (typeof to === 'string') return to.trim().toLowerCase() || null
  if (Array.isArray(to)) {
    const first = to.find((entry) => typeof entry === 'string' && entry.trim().length > 0)
    return typeof first === 'string' ? first.trim().toLowerCase() : null
  }
  return null
}

/**
 * Whether a bounce is permanent.
 *
 * A SOFT BOUNCE MUST NOT SUPPRESS, and this is the single most consequential
 * line in the file. A full mailbox, a greylisting deferral or a receiver having
 * a bad afternoon all arrive as `email.bounced`, and suppressing on those would
 * permanently stop mailing customers whose address is fine - including the
 * coupon they paid for. Resend reports the class in `data.bounce.type`, and
 * anything that is not plainly `Permanent` is treated as temporary.
 *
 * The default is therefore "do not suppress" on an UNRECOGNISED shape, which is
 * the direction whose cost is a bounce we mail again rather than a customer we
 * silently stop mailing.
 */
export function isPermanentBounce(bounce: unknown): boolean {
  if (typeof bounce !== 'object' || bounce === null) return false
  const record = bounce as { type?: unknown; subType?: unknown; sub_type?: unknown }
  const type = typeof record.type === 'string' ? record.type.toLowerCase() : ''
  if (type === 'permanent' || type === 'hardbounce' || type === 'hard_bounce') return true
  const sub =
    typeof record.subType === 'string'
      ? record.subType.toLowerCase()
      : typeof record.sub_type === 'string'
        ? record.sub_type.toLowerCase()
        : ''
  // `Suppressed` is SES saying it has this address on its own list because it
  // bounced before, which is permanent knowledge even when `type` is absent.
  return sub === 'suppressed'
}

const COUNTERS: Record<string, CounterEvent> = {
  'email.sent': 'sent',
  'email.delivered': 'delivered',
  'email.delivery_delayed': 'delivery_delayed',
  'email.bounced': 'bounced',
  'email.complained': 'complained',
  'email.opened': 'opened',
  'email.clicked': 'clicked',
}

/**
 * What to do about one event.
 *
 * Every recognised event is counted, including a soft bounce: "this template
 * bounces a lot" is exactly the thing the counters are for, and dropping soft
 * bounces would make a deliverability problem look like an absence of one.
 * Only permanent bounces and complaints suppress.
 */
export function decideEvent(event: ResendEvent): EventDecision {
  const data = event.data ?? {}
  const template = templateFromTags(data.tags)
  const counter = COUNTERS[event.type] ?? null
  const email = firstRecipient(data.to)

  if (!email) return { counter, suppress: null, template }

  if (event.type === 'email.complained') {
    return { counter, suppress: { email, reason: 'complaint' }, template }
  }
  if (event.type === 'email.bounced' && isPermanentBounce(data.bounce)) {
    return { counter, suppress: { email, reason: 'hard_bounce' }, template }
  }
  return { counter, suppress: null, template }
}
