import { PUSHABLE_KINDS, type PushContent, buildPushContent } from '@/lib/push/templates'

/**
 * Single entry point for the web push feature (C105 / rc5 F14).
 *
 * The transport lives in `@/lib/push/web-push` (server only), the per-kind copy
 * in `@/lib/push/templates`, and the outbox drain in `@/lib/push/dispatch`.
 * This file is the map between the five product triggers and the outbox kinds
 * that carry them, and it is safe to import from client code (no secrets, no
 * server-only imports).
 */

export const PUSH_TRIGGERS = {
  /** Voucher expires in 7 days; enqueued by enqueue_expiring_voucher_notices. */
  expiry_t7: { kind: 'voucher_expiring', days: 7 },
  /** Voucher expires tomorrow. */
  expiry_t1: { kind: 'voucher_expiring', days: 1 },
  order_status: { kind: 'order_status_changed' },
  invoice_ready: { kind: 'invoice_ready' },
  security_alert: { kind: 'security_alert' },
} as const

export type PushTrigger = keyof typeof PUSH_TRIGGERS

/** True when the public VAPID key a browser needs to subscribe is present. */
export function isPushSubscribable(
  publicKey: string | undefined = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
): boolean {
  return Boolean(publicKey)
}

/** Builds the notification for a trigger, or null if the kind owes no push. */
export function pushContentFor(
  trigger: PushTrigger,
  payload: Record<string, unknown>,
  siteUrl: string,
): PushContent | null {
  const spec = PUSH_TRIGGERS[trigger]
  const withDays = 'days' in spec ? { ...payload, days_remaining: spec.days } : payload
  return buildPushContent(spec.kind, withDays, siteUrl)
}

export { PUSHABLE_KINDS }
