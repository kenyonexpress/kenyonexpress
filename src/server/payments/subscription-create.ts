import {
  type BillingInterval,
  isBillingInterval,
  nextChargeAt,
  normalizeIntervalCount,
} from '@/lib/commerce/recurring'
import { log } from '@/lib/observability/log'

/**
 * The missing half of subscriptions: creating one.
 *
 * MEASURED before writing, 2026-09-02: `subscriptions` is live in production,
 * the renewal worker (`api/cron/subscriptions`) charges rows whose
 * `next_charge_at` has passed, `cancelSubscription` ends them -- and nothing
 * anywhere INSERTS one. Renewal and cancellation existed for rows that no code
 * could create. The tables came from 135b, applied; the writer never followed.
 *
 * A subscription is born from a PAID order: checkout runs the first charge with
 * `ChargeAndCreateToken`, the webhook verifies it, finalize persists the card
 * token -- and then this module turns each recurring line into a subscription
 * row that the existing worker can renew. The row is written to the WORKER'S
 * contract (the exact columns its select names), not to a fresh design.
 *
 * IDEMPOTENT ON origin_order_id. finalize replays -- the webhook retries, the
 * DLQ replays -- and a replay must not mint a second subscription for the same
 * order. Existing rows for the order are read first and their product_ids
 * skipped, so a partial failure converges instead of duplicating.
 */

export interface RecurringLineInput {
  productId: string
  supplierId: string | null
  /** The line's snapshotted platform percent, NOT re-read from the product. */
  platformPercent: number | null
}

export interface RecurringProductBilling {
  id: string
  recurring_amount_agorot: number | null
  billing_interval: string | null
  billing_interval_count: number | null
}

export type SubscriptionPlanRefusal =
  | 'guest_has_no_subscription'
  | 'no_payment_token'
  | 'product_not_billable'

export interface PlannedSubscription {
  productId: string
  supplierId: string | null
  amountAgorot: number
  platformPercent: number
  billingInterval: BillingInterval
  billingIntervalCount: number
  nextChargeAtIso: string
}

export type SubscriptionPlan =
  | { ok: true; rows: PlannedSubscription[] }
  | { ok: false; reason: SubscriptionPlanRefusal; productId?: string }

/**
 * Pure. Decides what subscription rows a paid order should produce.
 *
 * REFUSES rather than skips a recurring product with no billing configuration:
 * the customer has already been CHARGED for the first cycle by the time this
 * runs, so silently not creating the subscription would take the money and
 * never renew -- or worse, never deliver. A refusal here is surfaced as an
 * alarm by the caller, which is the difference between a bug someone fixes and
 * one nobody hears about.
 */
export function planSubscriptions(input: {
  userId: string | null
  paymentTokenId: string | null
  lines: RecurringLineInput[]
  products: RecurringProductBilling[]
  now: Date
}): SubscriptionPlan {
  if (input.lines.length === 0) return { ok: true, rows: [] }
  if (!input.userId) return { ok: false, reason: 'guest_has_no_subscription' }
  if (!input.paymentTokenId) return { ok: false, reason: 'no_payment_token' }

  const byId = new Map(input.products.map((p) => [p.id, p]))
  const rows: PlannedSubscription[] = []
  for (const line of input.lines) {
    const product = byId.get(line.productId)
    const amount = product?.recurring_amount_agorot
    const interval = product?.billing_interval
    const count = normalizeIntervalCount(product?.billing_interval_count ?? 1)
    if (
      !product ||
      amount == null ||
      !Number.isInteger(amount) ||
      amount <= 0 ||
      !isBillingInterval(interval) ||
      count == null
    ) {
      return { ok: false, reason: 'product_not_billable', productId: line.productId }
    }
    rows.push({
      productId: line.productId,
      supplierId: line.supplierId,
      amountAgorot: amount,
      // The line's snapshot when it has one; the product's current percent is
      // NOT consulted, because the deal is priced at purchase time.
      platformPercent: line.platformPercent ?? 0,
      billingInterval: interval,
      billingIntervalCount: count,
      // nextChargeAt speaks ISO strings on both ends.
      nextChargeAtIso: nextChargeAt(input.now.toISOString(), interval, count),
    })
  }
  return { ok: true, rows }
}

type SubscriptionRow = {
  user_id: string
  product_id: string
  supplier_id: string | null
  origin_order_id: string
  payment_token_id: string
  status: 'active'
  amount_agorot: number
  platform_percent: number
  billing_interval: string
  billing_interval_count: number
  next_charge_at: string
  last_charge_at: string
  failed_attempts: 0
}

export type SubscriptionAdmin = {
  from: (table: 'subscriptions') => {
    select: (cols: string) => {
      eq: (
        col: 'origin_order_id',
        v: string,
      ) => Promise<{ data: { product_id: string }[] | null; error: { message: string } | null }>
    }
    insert: (rows: SubscriptionRow[]) => Promise<{ error: { message: string } | null }>
  }
}

/** Best-effort is NOT enough here; the caller alarms on a returned error. */
export async function createSubscriptionsForOrder(
  admin: SubscriptionAdmin,
  input: {
    orderId: string
    userId: string
    paymentTokenId: string
    rows: PlannedSubscription[]
    now: Date
  },
): Promise<{ created: number; error: string | null }> {
  if (input.rows.length === 0) return { created: 0, error: null }
  try {
    const existing = await admin
      .from('subscriptions')
      .select('product_id')
      .eq('origin_order_id', input.orderId)
    if (existing.error) return { created: 0, error: existing.error.message }
    const already = new Set((existing.data ?? []).map((r) => r.product_id))
    const toInsert = input.rows.filter((r) => !already.has(r.productId))
    if (toInsert.length === 0) {
      log.info('subscriptions.create_replay', { orderId: input.orderId })
      return { created: 0, error: null }
    }
    const { error } = await admin.from('subscriptions').insert(
      toInsert.map(
        (r): SubscriptionRow => ({
          user_id: input.userId,
          product_id: r.productId,
          supplier_id: r.supplierId,
          origin_order_id: input.orderId,
          payment_token_id: input.paymentTokenId,
          status: 'active',
          amount_agorot: r.amountAgorot,
          platform_percent: r.platformPercent,
          billing_interval: r.billingInterval,
          billing_interval_count: r.billingIntervalCount,
          next_charge_at: r.nextChargeAtIso,
          // The FIRST cycle was the checkout charge that created this row.
          last_charge_at: input.now.toISOString(),
          failed_attempts: 0,
        }),
      ),
    )
    if (error) return { created: 0, error: error.message }
    return { created: toInsert.length, error: null }
  } catch (err) {
    return { created: 0, error: String(err) }
  }
}
