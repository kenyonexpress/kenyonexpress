import { isRequiredKind } from '@/lib/notifications/preferences'

/**
 * Web push topics (S21): which pushes ONE BROWSER asked for.
 *
 * The per-kind switches on /account/notifications answer "this account"; a
 * topic answers "this browser". Stored per row of `push_subscriptions.topics`
 * (migration 259), default both.
 *
 * THREE CLASSES OF KIND, and the sender treats each differently:
 *
 *   required    order_paid, voucher_issued, voucher_gifted, refund_completed.
 *               Every subscribed browser, topics or not. Same rule as every
 *               other channel in `preferences.ts`: the receipt and the coupon
 *               are the product, not a message about it.
 *   topical     the map below. Sent only to a browser whose topics include it.
 *   untopical   price_drop, back_in_stock, security_alert, welcome. Governed
 *               by the per-kind switch alone, as before S21. A security alert
 *               must not be silenced by a box labelled "order updates".
 */

export const PUSH_TOPICS = ['order_updates', 'expiry'] as const
export type PushTopic = (typeof PUSH_TOPICS)[number]

export const DEFAULT_PUSH_TOPICS: readonly PushTopic[] = PUSH_TOPICS

const KIND_TOPIC: Readonly<Record<string, PushTopic>> = {
  order_shipped: 'order_updates',
  voucher_redeemed: 'order_updates',
  cashback_credited: 'order_updates',
  invoice_ready: 'order_updates',
  referral_bonus_credited: 'order_updates',
  voucher_expiring: 'expiry',
  voucher_expiry_credited: 'expiry',
}

export function isPushTopic(value: unknown): value is PushTopic {
  return typeof value === 'string' && (PUSH_TOPICS as readonly string[]).includes(value)
}

/** The topic a kind belongs to, or null for required and untopical kinds. */
export function topicForKind(kind: string): PushTopic | null {
  if (isRequiredKind(kind)) return null
  return KIND_TOPIC[kind] ?? null
}

/**
 * Does a browser with these topics get this kind?
 *
 * `topics` undefined or null means the row predates 259 (or 259 is not
 * applied on this database): the browser gets everything, which is what it
 * got before topics existed.
 */
export function subscriptionWantsKind(
  kind: string,
  topics: readonly string[] | null | undefined,
): boolean {
  const topic = topicForKind(kind)
  if (topic === null) return true
  if (topics == null) return true
  return topics.includes(topic)
}

/**
 * Client input to a clean, de-duplicated, ordered list. `undefined` is the
 * default (both); anything that is not an array of known topics is null, and
 * the caller refuses it rather than guessing.
 */
export function normalizeTopics(input: unknown): PushTopic[] | null {
  if (input === undefined) return [...DEFAULT_PUSH_TOPICS]
  if (!Array.isArray(input) || input.length > PUSH_TOPICS.length * 2) return null
  if (!input.every(isPushTopic)) return null
  return PUSH_TOPICS.filter((t) => input.includes(t))
}
