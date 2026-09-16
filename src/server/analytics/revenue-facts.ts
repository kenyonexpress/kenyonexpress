import { log } from '@/lib/observability/log'
import 'server-only'

import { createHash } from 'node:crypto'
import { CHECKOUT_VARIANT_COOKIE, resolveCheckoutVariant } from '@/lib/analytics/checkout-variant'
import { type RevenueFactKind, buildRevenueFact } from '@/lib/analytics/revenue-fact'
import { isAxiomEnabled, revenueDataset, shipAxiomEvent } from '@/lib/observability/axiom'
import { createAdminClient } from '@/lib/supabase/admin'
import { cashbackTierForUser } from '@/server/analytics/cashback-tier'
import { readAttributionSnapshot } from '@/server/analytics/track'
import { cookies } from 'next/headers'

/**
 * The checkout variant the SHOPPER's browser cached, mirrored into a cookie
 * by checkout-variant.ts. Read for purchases only: a refund runs in an admin's
 * browser, whose cookie says nothing about the order being refunded.
 */
async function shopperCheckoutVariant(kind: RevenueFactKind): Promise<string | null> {
  if (kind !== 'purchase') return null
  try {
    const raw = (await cookies()).get(CHECKOUT_VARIANT_COOKIE)?.value
    return raw ? resolveCheckoutVariant(raw) : null
  } catch {
    return null
  }
}

// Revenue facts for the Axiom cohort dashboard. Same three rules as track.ts:
// not consent-gated (a ledger fact about a transaction the customer made),
// never throws into the caller, and money is COPIED from the ledger amount the
// caller already holds, never computed here.
//
// Entirely inert without AXIOM_TOKEN + AXIOM_DATASET: no query runs, no fetch
// is made. With them set, one cheap indexed read (the customer's first paid
// order) and one wallet read (cashback tier) precede a fire-and-forget POST.

export type RevenueFactContext = {
  kind: RevenueFactKind
  orderId: string
  userId: string
  /** Positive integer agorot from the ledger row. */
  amountAgorot: number
  occurredAt: Date
  productTypes?: readonly string[]
}

/**
 * Opaque, stable, and NOT reversible to a user id from Axiom alone: the first
 * 16 hex characters of a keyed hash. `dcount(customer_key)` in APL needs a
 * value that is the same for every fact of one customer and nothing more.
 */
export function customerKeyFor(userId: string): string {
  const salt = process.env.AXIOM_TOKEN ?? ''
  return createHash('sha256').update(`${salt}:${userId}`).digest('hex').slice(0, 16)
}

async function firstPaidOrder(userId: string): Promise<{ orderId: string; paidAt: string } | null> {
  const admin = createAdminClient()
  const { data, error } = await admin
    .from('orders')
    .select('id, paid_at')
    .eq('user_id', userId)
    .is('deleted_at', null)
    .not('paid_at', 'is', null)
    .order('paid_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (error) {
    log.warn('analytics.revenue_fact_first_order_failed', { userId, reason: error.message })
    return null
  }
  if (!data?.paid_at) return null
  return { orderId: data.id, paidAt: data.paid_at }
}

/**
 * Ships one revenue fact. Resolves once the fact is BUILT; the network call
 * is not awaited, matching the log leg. Nothing here can throw.
 */
export async function recordRevenueFact(context: RevenueFactContext): Promise<void> {
  if (!isAxiomEnabled()) return
  const dataset = revenueDataset()
  if (!dataset) return
  try {
    const [firstOrder, cashbackTier, attribution] = await Promise.all([
      firstPaidOrder(context.userId),
      cashbackTierForUser(context.userId),
      readAttributionSnapshot(),
    ])
    const fact = buildRevenueFact({
      kind: context.kind,
      orderId: context.orderId,
      amountAgorot: context.amountAgorot,
      occurredAt: context.occurredAt.toISOString(),
      firstOrder,
      cashbackTier,
      checkoutVariant: await shopperCheckoutVariant(context.kind),
      productTypes: context.productTypes,
      utm: attribution?.last ?? attribution?.first ?? null,
      customerKey: customerKeyFor(context.userId),
    })
    void shipAxiomEvent(fact, { dataset })
  } catch (error) {
    log.warn('analytics.revenue_fact_failed', {
      orderId: context.orderId,
      kind: context.kind,
      err: error,
    })
  }
}
