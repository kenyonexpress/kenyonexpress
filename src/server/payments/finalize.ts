import { agorot, agorotToIls } from '@/lib/commerce/money'
import { capturePaymentError } from '@/lib/observability/sentry'
import { createAdminClient } from '@/lib/supabase/admin'
import { type VoucherIssueClient, issueVoucher } from '@/server/domain/vouchers/issue'
import {
  type SettledLine,
  buildChargeSettledEvents,
  recordSettlementEvents,
} from '@/server/payments/settlement-events'
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
  unit_price_agorot: number | null
  platform_percent: number | null
  upfront_percent: number | null
  commission_percent_snapshot: number | null
  paid_on_site_agorot: number | null
  commission_agorot: number | null
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

/**
 * Issues one voucher per purchased unit. No custody row is written: the whole
 * on-site prepayment is platform revenue at paid-time, and the supplier is owed
 * nothing by us for the line. What they earn is the balance the customer pays
 * at their counter, which never passes through our clearing account.
 *
 * Issuing is capped at the purchased quantity and keyed on order_item_id, so a
 * webhook replay is a no-op rather than a second voucher for the same unit.
 */
async function issueVouchersForItem(
  admin: AdminClient,
  item: OrderItemRow,
  userId: string,
  product: { couponExpiryDays: number | null; offerValidUntil: Date | null },
  now: Date,
): Promise<void> {
  if (!item.product_id || !item.supplier_id) {
    throw new Error(`coupon order item ${item.id} is missing product or supplier`)
  }
  // CONTRADICTIONS C7: validity is a mandatory per-product field with no
  // default. This used to fall back to 90 days, which invents a consumer
  // promise nobody made and, on expiry, decides when we owe the customer their
  // money back (C6). Refusing here is loud and recoverable: the payment stands,
  // finalize retries, and an admin sets the field. Guessing is neither.
  const expiryDays = product.couponExpiryDays
  if (expiryDays === null || expiryDays === undefined || expiryDays < 1) {
    throw new Error(
      `coupon order item ${item.id}: product has no coupon_expiry_days; refusing to issue a voucher with an invented expiry`,
    )
  }
  if (item.platform_percent === null || item.platform_percent === undefined) {
    throw new Error(
      `coupon order item ${item.id} has no platform_percent snapshot; refusing to issue`,
    )
  }

  const faceUnits = perUnit(item.face_value_agorot ?? 0, item.quantity)
  const paidUnits = perUnit(item.paid_on_site_agorot ?? 0, item.quantity)

  // Idempotency: never issue beyond quantity for this order_item (replay-safe).
  // The vouchers UNIQUE(code) plus this count cap make webhook replays no-ops.
  const { data: existing } = await admin
    .from('vouchers')
    .select('id')
    .eq('order_item_id', item.id)
    .order('issued_at', { ascending: true })
  const issuedIds = (existing ?? []).map((row) => row.id)

  // No offer deadline on the product means the rolling per-product window is
  // the only limit; feed the issuer that same date so it never widens the TTL.
  const fallbackDeadline = new Date(now.getTime() + expiryDays * 24 * 60 * 60 * 1000)
  const offerValidUntil = product.offerValidUntil ?? fallbackDeadline

  for (let unit = issuedIds.length; unit < item.quantity; unit += 1) {
    const issued = await issueVoucher(admin as unknown as VoucherIssueClient, {
      orderId: item.order_id,
      orderItemId: item.id,
      productId: item.product_id,
      supplierId: item.supplier_id,
      userId,
      priceIls: agorotToIls(agorot(faceUnits[unit] ?? 0)),
      couponPriceIls: agorotToIls(agorot(paidUnits[unit] ?? 0)),
      platformPercent: item.platform_percent,
      couponExpiryDays: expiryDays,
      offerValidUntil,
      now,
    })
    issuedIds.push(issued.id)
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
    .select('id, user_id, status, paid_at, cashback_applied_agorot')
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
      'id, order_id, product_id, product_type, supplier_id, quantity, unit_price_agorot, platform_percent, upfront_percent, commission_percent_snapshot, paid_on_site_agorot, commission_agorot, face_value_agorot, balance_due_agorot, supplier_immediate_agorot, cashback_amount_agorot, settlement_status',
    )
    .eq('order_id', order.id)
  if (!items || items.length === 0) {
    return { ok: false, error: 'order has no items', code: 'STATE_INVALID' }
  }

  let walletApplied = 0
  let cardcomAccountId: string | null = null
  if (input.paymentId) {
    const { data: payment } = await admin
      .from('payments')
      .select('id, status, wallet_applied_ils, cardcom_account_id')
      .eq('id', input.paymentId)
      .maybeSingle()
    if (!payment) return { ok: false, error: 'payment not found', code: 'NOT_FOUND' }
    walletApplied = Number(payment.wallet_applied_ils ?? 0)
    cardcomAccountId = payment.cardcom_account_id

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
    // spendWallet speaks shekels (fn_wallet_transfer takes p_amount_ils), the
    // column has held agorot since 059. Reading it as shekels credited a
    // hundredth of what the customer actually spent from their wallet.
    walletApplied = Number(order.cashback_applied_agorot ?? 0) / 100
  }

  try {
    await spendWallet(admin, order.id, order.user_id, walletApplied)

    const productInfo = new Map<
      string,
      { couponExpiryDays: number | null; offerValidUntil: Date | null }
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
          couponExpiryDays: p.coupon_expiry_days,
          offerValidUntil: p.offer_valid_until ? new Date(p.offer_valid_until) : null,
        })
      }
    }

    for (const item of items as OrderItemRow[]) {
      if (item.product_type === 'coupon') {
        const info = (item.product_id ? productInfo.get(item.product_id) : undefined) ?? {
          couponExpiryDays: null,
          offerValidUntil: null,
        }
        await issueVouchersForItem(admin, item, order.user_id, info, now)
        // The coupon line is settled the moment it is paid: everything charged
        // online is ours, nothing is deferred, and scanning the voucher moves
        // no money. It shares split_executed with physical lines because the
        // split did happen, at 100/0.
        await admin
          .from('order_items')
          .update({ settlement_status: 'split_executed', item_status: 'issued' })
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
        // A token is only chargeable on the terminal that minted it, so the
        // saved card is useless without knowing which account that was.
        cardcom_account_id: cardcomAccountId,
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

    // The money journal (migration 094). Deliberately the last thing done and
    // deliberately incapable of throwing: the card is already charged and the
    // order already closed, and no journal entry is worth failing a finalize
    // that succeeded. While 094 is unapplied this logs once and records
    // nothing, and the system behaves exactly as it did before the journal
    // existed.
    await recordSettlementEvents(
      admin,
      buildChargeSettledEvents(order.id, items as SettledLine[], now, {
        paymentId: input.paymentId,
        cardcomAccountId,
      }),
    )

    return { ok: true, replay: false, orderId: order.id }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'finalize failed'
    // Past this point the customer's card has already been charged, so a throw
    // here is money taken against an order that never closed.
    capturePaymentError(error, {
      stage: 'finalize_order',
      orderId: order.id,
      paymentId: input.paymentId,
      detail: { message },
    })
    return { ok: false, error: message, code: 'INTERNAL' }
  }
}
