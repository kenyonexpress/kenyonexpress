import type { OrderLifecycleEvent, OrderLifecycleStatus } from '@/server/domain/orders/lifecycle'
import { transitionLifecycle } from '@/server/domain/orders/lifecycle'

export type AuditActor = 'system' | 'webhook' | 'cron' | 'admin' | `user:${string}`

export type LifecycleTransitionPlan = {
  from: OrderLifecycleStatus
  to: OrderLifecycleStatus
  event: OrderLifecycleEvent
  audit: {
    from_status: OrderLifecycleStatus
    to_status: OrderLifecycleStatus
    event: OrderLifecycleEvent
    actor: AuditActor
    provider_event_id: string | null
    payload: Record<string, unknown>
  }
  timestamps: {
    paid_at?: true
    fulfilled_at?: true
    refunded_at?: true
  }
}

/**
 * Pure planner: validates transition and builds the audit row payload.
 * Persistence happens in the Stripe finalize / cron modules.
 */
export function planLifecycleTransition(input: {
  from: OrderLifecycleStatus
  event: OrderLifecycleEvent
  actor: AuditActor
  providerEventId?: string | null
  payload?: Record<string, unknown>
}): LifecycleTransitionPlan {
  const to = transitionLifecycle(input.from, input.event)
  const timestamps: LifecycleTransitionPlan['timestamps'] = {}
  if (to === 'paid') timestamps.paid_at = true
  if (to === 'fulfilled') timestamps.fulfilled_at = true
  if (to === 'refunded') timestamps.refunded_at = true

  return {
    from: input.from,
    to,
    event: input.event,
    audit: {
      from_status: input.from,
      to_status: to,
      event: input.event,
      actor: input.actor,
      provider_event_id: input.providerEventId ?? null,
      payload: input.payload ?? {},
    },
    timestamps,
  }
}
