import { type Agorot, agorot, percentageOf } from '@/lib/commerce/money'
import { appendPaymentEvent } from '@/server/payments/events'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Internal escrow for coupon lines (order_escrow_holds, migration 070).
 *
 * C3 semantics: no external escrow, no J5. The customer's on-site charge for a
 * coupon line sits in our Cardcom clearing account; the hold row is the
 * internal record that this money is not yet platform revenue. Redemption
 * closes the hold: the platform keeps its fee, computed from the line's
 * purchase-time platform_percent snapshot (per product, mandatory, NO default
 * anywhere per C1), and the remainder becomes supplier_payable, picked up by
 * the settlement batches. Expiry/refund closes it the other way.
 *
 * Active only when ESCROW_FLOW_ENABLED=true; with the flag off the locked
 * default (C11 option A: the whole upfront is platform revenue at paid-time)
 * stays untouched. With the flag on this is C11 option B, decided by owner
 * directive on the checkout goal.
 */

export function isEscrowFlowEnabled(source: NodeJS.ProcessEnv = process.env): boolean {
  return source.ESCROW_FLOW_ENABLED === 'true'
}

type AdminLike = Pick<SupabaseClient, 'from'>

export type EscrowHoldInput = {
  orderId: string
  orderItemId: string
  supplierId: string
  paymentId: string | null
  heldAgorot: Agorot
  /**
   * The line's purchase-time platform_percent snapshot in basis points
   * (order_items.commission_percent_snapshot). The fee is this share of the
   * held amount; there is no default and a missing snapshot is a bug upstream.
   */
  platformPercentBps: number
}

export type EscrowOutcome = { ok: true; replay: boolean } | { ok: false; error: string }

/**
 * Opens the hold for one coupon line and moves the line to escrow_held.
 * Idempotent: order_item_id is UNIQUE, a replay is a no-op.
 */
export async function holdCouponItem(
  admin: AdminLike,
  input: EscrowHoldInput,
): Promise<EscrowOutcome> {
  if (!Number.isSafeInteger(input.platformPercentBps) || input.platformPercentBps < 0) {
    return { ok: false, error: 'platform percent snapshot missing for escrow hold' }
  }
  const fee = percentageOf(input.heldAgorot, input.platformPercentBps)
  const release = agorot(input.heldAgorot - fee)

  const { error } = await admin.from('order_escrow_holds').insert({
    order_item_id: input.orderItemId,
    order_id: input.orderId,
    supplier_id: input.supplierId,
    held_agorot: input.heldAgorot,
    platform_fee_agorot: fee,
    release_agorot: release,
    status: 'held',
  })
  if (error) {
    if (error.message.includes('duplicate')) return { ok: true, replay: true }
    return { ok: false, error: `escrow hold failed: ${error.message}` }
  }

  await admin
    .from('order_items')
    .update({ settlement_status: 'escrow_held', item_status: 'issued' })
    .eq('id', input.orderItemId)
    .in('settlement_status', ['pending', 'paid'])

  await appendPaymentEvent(admin, {
    orderId: input.orderId,
    orderItemId: input.orderItemId,
    paymentId: input.paymentId,
    eventType: 'escrow_held',
    fromState: 'paid',
    toState: 'escrow_held',
    amountAgorot: input.heldAgorot,
    idempotencyKey: `escrow:${input.orderItemId}:hold`,
    metadata: { platform_fee_agorot: fee, release_agorot: release },
  })
  return { ok: true, replay: false }
}

type HoldRow = {
  id: string
  order_id: string
  order_item_id: string
  supplier_id: string
  held_agorot: number
  platform_fee_agorot: number
  release_agorot: number
  status: string
}

/**
 * Closes the hold on redemption: platform keeps the fee, the remainder becomes
 * supplier_payable (via settlement batches over escrow_released lines).
 * CAS on status='held' makes concurrent releases single-winner; the loser
 * replays as a no-op.
 */
export async function releaseEscrowForOrderItem(
  admin: AdminLike,
  orderItemId: string,
  idempotencyKey: string,
): Promise<EscrowOutcome> {
  const { data: hold } = await admin
    .from('order_escrow_holds')
    .select(
      'id, order_id, order_item_id, supplier_id, held_agorot, platform_fee_agorot, release_agorot, status',
    )
    .eq('order_item_id', orderItemId)
    .maybeSingle()
  if (!hold) return { ok: false, error: 'escrow hold not found' }
  const row = hold as HoldRow
  if (row.status === 'released') return { ok: true, replay: true }
  if (row.status !== 'held') {
    return { ok: false, error: `escrow hold not releasable from ${row.status}` }
  }

  const { data: updated, error } = await admin
    .from('order_escrow_holds')
    .update({
      status: 'released',
      released_at: new Date().toISOString(),
      release_idempotency_key: idempotencyKey,
    })
    .eq('id', row.id)
    .eq('status', 'held')
    .select('id')
  if (error) return { ok: false, error: `escrow release failed: ${error.message}` }
  if (!updated || updated.length === 0) return { ok: true, replay: true }

  await admin
    .from('order_items')
    .update({ settlement_status: 'escrow_released' })
    .eq('id', orderItemId)
    .eq('settlement_status', 'escrow_held')

  await appendPaymentEvent(admin, {
    orderId: row.order_id,
    orderItemId,
    eventType: 'escrow_released',
    fromState: 'escrow_held',
    toState: 'escrow_released',
    amountAgorot: row.release_agorot,
    idempotencyKey: `escrow:${orderItemId}:release`,
    metadata: { platform_fee_agorot: row.platform_fee_agorot, supplier_id: row.supplier_id },
  })
  await appendPaymentEvent(admin, {
    orderId: row.order_id,
    orderItemId,
    eventType: 'platform_fee_recorded',
    amountAgorot: row.platform_fee_agorot,
    idempotencyKey: `escrow:${orderItemId}:fee`,
  })
  return { ok: true, replay: false }
}

/**
 * Closes the hold back toward the customer (voucher expiry / refund): the held
 * amount leaves escrow and the caller decides where it goes (wallet credit on
 * expiry, card refund on refund). No platform fee is kept on this leg.
 */
export async function refundEscrowForOrderItem(
  admin: AdminLike,
  orderItemId: string,
  reason: 'expired' | 'refunded',
): Promise<EscrowOutcome> {
  const { data: hold } = await admin
    .from('order_escrow_holds')
    .select('id, order_id, order_item_id, supplier_id, held_agorot, status')
    .eq('order_item_id', orderItemId)
    .maybeSingle()
  if (!hold) return { ok: false, error: 'escrow hold not found' }
  const row = hold as Pick<HoldRow, 'id' | 'order_id' | 'held_agorot' | 'status'>
  if (row.status === 'refunded') return { ok: true, replay: true }
  if (row.status !== 'held') {
    return { ok: false, error: `escrow hold not refundable from ${row.status}` }
  }

  const { data: updated, error } = await admin
    .from('order_escrow_holds')
    .update({ status: 'refunded', refunded_at: new Date().toISOString() })
    .eq('id', row.id)
    .eq('status', 'held')
    .select('id')
  if (error) return { ok: false, error: `escrow refund failed: ${error.message}` }
  if (!updated || updated.length === 0) return { ok: true, replay: true }

  await admin
    .from('order_items')
    .update({ settlement_status: 'refunded' })
    .eq('id', orderItemId)
    .eq('settlement_status', 'escrow_held')

  await appendPaymentEvent(admin, {
    orderId: row.order_id,
    orderItemId,
    eventType: 'escrow_refunded',
    fromState: 'escrow_held',
    toState: 'refunded',
    amountAgorot: row.held_agorot,
    idempotencyKey: `escrow:${orderItemId}:refund`,
    metadata: { reason },
  })
  return { ok: true, replay: false }
}
