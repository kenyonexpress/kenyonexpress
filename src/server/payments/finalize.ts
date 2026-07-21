import { issueCouponCode } from '@/lib/checkout/coupon-issue'
import { agorot, agorotToIls } from '@/lib/commerce/money'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Json } from '@/types/database'

export type FinalizeOutcome =
  | { ok: true; replay: boolean; orderId: string }
  | { ok: false; error: string; code: 'NOT_FOUND' | 'STATE_INVALID' | 'INTERNAL' }

type AdminClient = ReturnType<typeof createAdminClient>

type OrderItemRow = {
  id: string
  order_id: string
  product_id: string | null
  product_type: string
  supplier_id: string | null
  quantity: number
  unit_price_ils: number
  upfront_percent: number | null
  commission_percent_snapshot: number | null
  paid_on_site_agorot: number | null
  commission_agorot: number | null
  escrow_held_agorot: number | null
  escrow_release_agorot: number | null
  face_value_agorot: number | null
  balance_due_agorot: number | null
  supplier_immediate_agorot: number | null
  settlement_status: string
}

/**
 * Splits a line-level agorot amount into per-unit integers; the first unit
 * absorbs the remainder (mirrors settlement.splitEscrowPerUnit).
 */
function perUnit(total: number, quantity: number): number[] {
  const base = Math.floor(total / quantity)
  return Array.from({ length: quantity }, (_, i) =>
    i === 0 ? total - base * (quantity - 1) : base,
  )
}

async function issueCouponsForItem(
  admin: AdminClient,
  item: OrderItemRow,
  userId: string,
  couponExpiryDays: number,
  now: Date,
): Promise<void> {
  const heldUnits = perUnit(item.escrow_held_agorot ?? 0, item.quantity)
  const commissionUnits = perUnit(item.commission_agorot ?? 0, item.quantity)
  const faceUnits = perUnit(item.face_value_agorot ?? 0, item.quantity)
  const balanceUnits = perUnit(item.balance_due_agorot ?? 0, item.quantity)

  // Idempotency: never issue beyond quantity for this order_item (replay-safe).
  const { data: existingCodes } = await admin
    .from('coupon_codes')
    .select('id')
    .eq('order_item_id', item.id)
  const alreadyIssued = existingCodes?.length ?? 0
  if (alreadyIssued >= item.quantity) return

  for (let unit = alreadyIssued; unit < item.quantity; unit += 1) {
    const held = heldUnits[unit] ?? 0
    const commission = commissionUnits[unit] ?? 0

    let inserted: { id: string } | null = null
    for (let attempt = 0; attempt < 5 && !inserted; attempt += 1) {
      const issuedCode = issueCouponCode({
        orderItemId: item.id,
        userId,
        expiryDays: couponExpiryDays,
        now,
      })
      const { data, error } = await admin
        .from('coupon_codes')
        .insert({
          code: issuedCode.code,
          product_id: item.product_id,
          order_item_id: item.id,
          user_id: userId,
          supplier_id: item.supplier_id,
          status: 'issued',
          expires_at: issuedCode.expiresAt.toISOString(),
          qr_token: issuedCode.qrPayload,
          platform_percent: item.upfront_percent,
          face_value_ils: agorotToIls(agorot(faceUnits[unit] ?? 0)),
          platform_paid_ils: agorotToIls(agorot(held)),
          collect_amount_ils: agorotToIls(agorot(balanceUnits[unit] ?? 0)),
        })
        .select('id')
        .maybeSingle()
      if (!error && data) {
        inserted = data
      } else if (error && !`${error.message}`.includes('duplicate')) {
        throw new Error(`coupon insert failed: ${error.message}`)
      }
      // duplicate code collision: loop retries with a fresh random code
    }
    if (!inserted) throw new Error('coupon code generation exhausted retries')

    const { error: escrowError } = await admin.from('escrow_holds').insert({
      coupon_code_id: inserted.id,
      order_id: item.order_id,
      order_item_id: item.id,
      supplier_id: item.supplier_id as string,
      held_agorot: held,
      commission_agorot: commission,
      release_agorot: held - commission,
      status: 'held',
    })
    if (escrowError && !escrowError.message.includes('duplicate')) {
      throw new Error(`escrow hold failed: ${escrowError.message}`)
    }
  }
}

async function executeSplitForItem(
  admin: AdminClient,
  item: OrderItemRow,
  paymentId: string | null,
): Promise<void> {
  const { error } = await admin.from('split_executions').insert({
    order_item_id: item.id,
    order_id: item.order_id,
    supplier_id: item.supplier_id as string,
    face_value_agorot: item.face_value_agorot ?? 0,
    commission_agorot: item.commission_agorot ?? 0,
    supplier_agorot: item.supplier_immediate_agorot ?? 0,
    payment_id: paymentId,
  })
  // duplicate order_item_id => replay, fine
  if (error && !error.message.includes('duplicate')) {
    throw new Error(`split execution failed: ${error.message}`)
  }

  if (item.product_id) {
    const { data: product } = await admin
      .from('products')
      .select('stock_quantity')
      .eq('id', item.product_id)
      .maybeSingle()
    if (product && product.stock_quantity != null) {
      await admin
        .from('products')
        .update({ stock_quantity: Math.max(0, product.stock_quantity - item.quantity) })
        .eq('id', item.product_id)
    }
  }
}

async function spendWallet(
  admin: AdminClient,
  orderId: string,
  userId: string,
  walletAppliedIls: number,
): Promise<void> {
  if (walletAppliedIls <= 0) return
  const [{ data: userAccount }, { data: platformAccount }] = await Promise.all([
    admin.from('wallet_accounts').select('id').eq('user_id', userId).maybeSingle(),
    admin.from('wallet_accounts').select('id').eq('code', 'platform:revenue').maybeSingle(),
  ])
  if (!userAccount || !platformAccount) {
    throw new Error('wallet accounts missing for wallet spend')
  }
  const { error } = await admin.rpc('fn_wallet_transfer', {
    p_debit_account: userAccount.id,
    p_credit_account: platformAccount.id,
    p_amount_ils: walletAppliedIls,
    p_reason: 'order_spend',
    p_idempotency: `order:${orderId}:spend`,
    p_order_id: orderId,
  })
  if (error) throw new Error(`wallet spend failed: ${error.message}`)
}

/**
 * The single writer of the valuable transition (TS port of the future
 * checkout_finalize SQL function). Idempotent:
 * - paid_at guard makes replays no-ops
 * - coupon_codes count per order_item caps issuance
 * - escrow_holds.coupon_code_id / split_executions.order_item_id UNIQUE
 * - wallet transfer keyed `order:<id>:spend`
 *
 * Called only from the verified webhook handler / wallet-covers-all path /
 * reconcile — never from client-reachable code with unverified input.
 */
export async function finalizeOrder(input: {
  orderId: string
  paymentId: string | null
  transactionId: string | null
  token?: {
    token: string
    last4: string
    brand: string
    expiryMonth: number
    expiryYear: number
  }
  now?: Date
}): Promise<FinalizeOutcome> {
  const admin = createAdminClient()
  const now = input.now ?? new Date()

  const { data: order } = await admin
    .from('orders')
    .select('id, user_id, status, paid_at, cashback_applied_ils')
    .eq('id', input.orderId)
    .maybeSingle()
  if (!order) return { ok: false, error: 'order not found', code: 'NOT_FOUND' }
  if (order.paid_at) return { ok: true, replay: true, orderId: order.id }
  if (order.status !== 'pending') {
    return { ok: false, error: `order not finalizable from ${order.status}`, code: 'STATE_INVALID' }
  }

  const { data: items } = await admin
    .from('order_items')
    .select(
      'id, order_id, product_id, product_type, supplier_id, quantity, unit_price_ils, upfront_percent, commission_percent_snapshot, paid_on_site_agorot, commission_agorot, escrow_held_agorot, escrow_release_agorot, face_value_agorot, balance_due_agorot, supplier_immediate_agorot, settlement_status',
    )
    .eq('order_id', order.id)
  if (!items || items.length === 0) {
    return { ok: false, error: 'order has no items', code: 'STATE_INVALID' }
  }

  let walletApplied = 0
  if (input.paymentId) {
    const { data: payment } = await admin
      .from('payments')
      .select('id, status, wallet_applied_ils')
      .eq('id', input.paymentId)
      .maybeSingle()
    if (!payment) return { ok: false, error: 'payment not found', code: 'NOT_FOUND' }
    walletApplied = Number(payment.wallet_applied_ils ?? 0)

    const { error: payError } = await admin
      .from('payments')
      .update({
        status: 'succeeded',
        cardcom_transaction_id: input.transactionId,
        succeeded_at: now.toISOString(),
      })
      .eq('id', payment.id)
      .in('status', ['initiated', 'redirected'])
    if (payError) {
      return { ok: false, error: `payment update failed: ${payError.message}`, code: 'INTERNAL' }
    }
  } else {
    walletApplied = Number(order.cashback_applied_ils ?? 0)
  }

  try {
    await spendWallet(admin, order.id, order.user_id, walletApplied)

    const expiryByProduct = new Map<string, number>()
    const productIds = items
      .map((i) => i.product_id)
      .filter((id): id is string => typeof id === 'string')
    if (productIds.length > 0) {
      const { data: products } = await admin
        .from('products')
        .select('id, coupon_expiry_days')
        .in('id', productIds)
      for (const p of products ?? []) {
        expiryByProduct.set(p.id, p.coupon_expiry_days ?? 90)
      }
    }

    for (const item of items as OrderItemRow[]) {
      if (item.product_type === 'coupon') {
        const expiryDays = item.product_id ? (expiryByProduct.get(item.product_id) ?? 90) : 90
        await issueCouponsForItem(admin, item, order.user_id, expiryDays, now)
        await admin
          .from('order_items')
          .update({ settlement_status: 'escrow_held', item_status: 'issued' })
          .eq('id', item.id)
          .in('settlement_status', ['pending', 'paid'])
      } else {
        await executeSplitForItem(admin, item, input.paymentId)
        await admin
          .from('order_items')
          .update({ settlement_status: 'split_executed' })
          .eq('id', item.id)
          .in('settlement_status', ['pending', 'paid'])
      }
    }

    if (input.token) {
      await admin.from('payment_tokens').insert({
        profile_id: order.user_id,
        cardcom_token: input.token.token,
        last_4: input.token.last4,
        card_brand: input.token.brand,
        expiry_month: input.token.expiryMonth,
        expiry_year: input.token.expiryYear,
      })
    }

    const { error: orderError } = await admin
      .from('orders')
      .update({ status: 'paid', paid_at: now.toISOString() })
      .eq('id', order.id)
      .is('paid_at', null)
    if (orderError) {
      return { ok: false, error: `order update failed: ${orderError.message}`, code: 'INTERNAL' }
    }

    await admin.from('audit_log').insert({
      actor_id: null,
      actor_role: null,
      action: 'status_change',
      entity_type: 'order',
      entity_id: order.id,
      changes: { status: { from: 'pending', to: 'paid' } } as unknown as Json,
      metadata: { source: 'checkout_finalize', payment_id: input.paymentId } as unknown as Json,
    })

    return { ok: true, replay: false, orderId: order.id }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'finalize failed'
    return { ok: false, error: message, code: 'INTERNAL' }
  }
}
