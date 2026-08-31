import 'server-only'

import {
  type BillingInterval,
  type SubscriptionStatus,
  cadenceLabel,
  isBillingInterval,
  isExhausted,
} from '@/lib/commerce/recurring'
import { log } from '@/lib/observability/log'
import {
  type PendingSubscriptionRow,
  pendingTable,
  selectPending,
} from '@/lib/supabase/pending-schema'
import { createClient } from '@/lib/supabase/server'

/**
 * The customer's subscriptions, as their account page needs them.
 *
 * Reads through the request-scoped client, so RLS decides ownership and this
 * function never has to filter by user id itself - the same rule every other
 * account query follows.
 *
 * 135 is not applied, so `subscriptions` does not exist in production.
 * A missing table is reported as an empty list and logged at info, not error:
 * a customer with no subscriptions and a database with no subscriptions table
 * look the same to the person reading the page, and neither is a fault. Any
 * OTHER failure is surfaced, because "your subscriptions failed to load" and
 * "you have none" must not look alike.
 */
export interface AccountSubscription {
  id: string
  productId: string
  productName: string | null
  productSlug: string | null
  status: SubscriptionStatus
  amountAgorot: number
  interval: BillingInterval
  intervalCount: number
  cadence: string
  nextChargeAt: string | null
  lastChargeAt: string | null
  /** Retries are spent; the customer has to act. */
  needsAttention: boolean
  canceledAt: string | null
}

export type SubscriptionsResult =
  | { ok: true; subscriptions: AccountSubscription[] }
  | { ok: false; reason: 'unavailable' }

function toStatus(value: string): SubscriptionStatus {
  return value === 'active' || value === 'past_due' || value === 'paused' || value === 'canceled'
    ? value
    : 'canceled'
}

export async function getMySubscriptions(): Promise<SubscriptionsResult> {
  const supabase = await createClient()

  const result = await selectPending<PendingSubscriptionRow>(() =>
    supabase
      .from(pendingTable('subscriptions'))
      .select(
        'id, product_id, status, amount_agorot, billing_interval, billing_interval_count, next_charge_at, last_charge_at, failed_attempts, canceled_at',
      )
      .order('created_at', { ascending: false }),
  )

  if (!result.ok) {
    if (result.missing) {
      log.info('subscriptions.table_absent', { reason: '135 not applied' })
      return { ok: true, subscriptions: [] }
    }
    log.error('subscriptions.read_failed', { reason: result.message })
    return { ok: false, reason: 'unavailable' }
  }

  const rows = result.rows
  if (rows.length === 0) return { ok: true, subscriptions: [] }

  // Product names in one round trip rather than one per row. The products table
  // exists regardless of 135, so this read is typed normally.
  const productIds = [...new Set(rows.map((r) => r.product_id))]
  const { data: products } = await supabase
    .from('products')
    .select('id, name_he, slug')
    .in('id', productIds)

  const byId = new Map((products ?? []).map((p) => [p.id, p]))

  return {
    ok: true,
    subscriptions: rows.map((row) => {
      const product = byId.get(row.product_id)
      const interval: BillingInterval = isBillingInterval(row.billing_interval)
        ? row.billing_interval
        : 'monthly'
      const count = row.billing_interval_count ?? 1

      return {
        id: row.id,
        productId: row.product_id,
        productName: product?.name_he ?? null,
        productSlug: product?.slug ?? null,
        status: toStatus(row.status),
        amountAgorot: row.amount_agorot,
        interval,
        intervalCount: count,
        cadence: cadenceLabel(interval, count),
        nextChargeAt: row.next_charge_at,
        lastChargeAt: row.last_charge_at,
        needsAttention: isExhausted({ failed_attempts: row.failed_attempts ?? 0 }),
        canceledAt: row.canceled_at,
      }
    }),
  }
}
