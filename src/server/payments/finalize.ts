import { agorot, agorotToIls } from '@/lib/commerce/money'
import { createAdminClient } from '@/lib/supabase/admin'
import { type VoucherIssueClient, issueVoucher } from '@/server/domain/vouchers/issue'
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
  cashback_amount_agorot: number | null
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

async function issueVouchersForItem(
  admin: AdminClient,
  item: OrderItemRow,
  userId: string,
  product: { couponExpiryDays: number; offerValidUntil: Date | null },
  now: Date,
): Promise<void> {
  if (!item.product_id || !item.supplier_id) {
    throw new Error(`coupon order item ${item.id} is missing product or supplier`)
  }

  const faceUnits = perUnit(item.face_value_agorot ?? 0, item.quantity)
  const paidUnits = perUnit(item.paid_on_site_agorot ?? 0, item.quantity)

  // Idempotency: never issue beyond quantity for this order_item (replay-safe).
  // The vouchers UNIQUE(code) plus this count cap make webhook replays no-ops.
  const { data: existing } = await admin.from('vouchers').select('id').eq('order_item_id', item.id)
  const alreadyIssued = existing?.length ?? 0
  if (alreadyIssued >= item.quantity) return

  // No offer deadline on the product means the rolling per-product window is
  // the only limit; feed the issuer that same date so it never widens the TTL.
  const fallbackDeadline = new Date(
    now.getTime() + Math.max(1, product.couponExpiryDays) * 24 * 60 * 60 * 1000,
  )
  const offerValidUntil = product.offerValidUntil ?? fallbackDeadline

  for (let unit = alreadyIssued; unit < item.quantity; unit += 1) {
    await issueVoucher(admin as unknown as VoucherIssueClient, {
      orderId: item.order_id,
      orderItemId: item.id,
      productId: item.product_id,
      supplierId: item.supplier_id,
      userId,
      priceIls: agorotToIls(agorot(faceUnits[unit] ?? 0)),
      couponPriceIls: agorotToIls(agorot(paidUnits[unit] ?? 0)),
      couponExpiryDays: product.couponExpiryDays,
      offerValidUntil,
      now,
    })
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

async function getOrCreateUserWalletAccount(
  admin: AdminClient,
  userId: string,
): Promise<{ id: string } | null> {
  const { data: existing } = await admin
    .from('wallet_accounts')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle()
  if (existing) return existing
  const { data: created } = await admin
    .from('wallet_accounts')
    .insert({ user_id: userId })
    .select('id')
    .maybeSingle()
  if (created) return created
  // unique-violation race: someone else created it, re-read
  const { data: reread } = await admin
    .from('wallet_accounts')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle()
  return reread ?? null
}

/**
 * Credits the order's cashback snapshot to the buyer's wallet from
 * platform:cashback_reserve. Idempotent via `order:<id>:cashback`.
 */
async function creditCashback(
  admin: AdminClient,
  orderId: string,
  userId: string,
  cashbackAgorot: number,
): Promise<void> {
  if (cashbackAgorot <= 0) return
  const [userAccount, { data: reserve }] = await Promise.all([
    getOrCreateUserWalletAccount(admin, userId),
    admin
      .from('wallet_accounts')
      .select('id')
      .eq('code', 'platform:cashback_reserve')
      .maybeSingle(),
  ])
  if (!userAccount || !reserve) {
    throw new Error('wallet accounts missing for cashback credit')
  }
  const { error } = await admin.rpc('fn_wallet_transfer', {
    p_debit_account: reserve.id,
    p_credit_account: userAccount.id,
    p_amount_ils: agorotToIls(agorot(cashbackAgorot)),
    p_reason: 'order_cashback',
    p_idempotency: `order:${orderId}:cashback`,
    p_order_id: orderId,
  })
  if (error) throw new Error(`cashback credit failed: ${error.message}`)
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
      'id, order_id, product_id, product_type, supplier_id, quantity, unit_price_ils, upfront_percent, commission_percent_snapshot, paid_on_site_agorot, commission_agorot, escrow_held_agorot, escrow_release_agorot, face_value_agorot, balance_due_agorot, supplier_immediate_agorot, cashback_amount_agorot, settlement_status',
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

    const productInfo = new Map<
      string,
      { couponExpiryDays: number; offerValidUntil: Date | null }
    >()
    const productIds = items
      .map((i) => i.product_id)
      .filter((id): id is string => typeof id === 'string')
    if (productIds.length > 0) {
      const { data: products } = await admin
        .from('products')
        .select('id, coupon_expiry_days, offer_valid_until')
        .in('id', productIds)
      for (const p of products ?? []) {
        productInfo.set(p.id, {
          couponExpiryDays: p.coupon_expiry_days ?? 90,
          offerValidUntil: p.offer_valid_until ? new Date(p.offer_valid_until) : null,
        })
      }
    }

    for (const item of items as OrderItemRow[]) {
      if (item.product_type === 'coupon') {
        const info = (item.product_id ? productInfo.get(item.product_id) : undefined) ?? {
          couponExpiryDays: 90,
          offerValidUntil: null,
        }
        await issueVouchersForItem(admin, item, order.user_id, info, now)
        // No escrow under the final rules: the on-site money is platform
        // revenue at paid-time; the item is simply settled once vouchers exist.
        await admin
          .from('order_items')
          .update({ settlement_status: 'platform_settled', item_status: 'issued' })
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

    const cashbackTotal = (items as OrderItemRow[]).reduce(
      (sum, item) => sum + (item.cashback_amount_agorot ?? 0),
      0,
    )
    await creditCashback(admin, order.id, order.user_id, cashbackTotal)

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

    // Best-effort: the purchased cart is done; leftovers confuse the header badge.
    await admin.from('carts').update({ items: [] }).eq('profile_id', order.user_id)

    return { ok: true, replay: false, orderId: order.id }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'finalize failed'
    return { ok: false, error: message, code: 'INTERNAL' }
  }
}
