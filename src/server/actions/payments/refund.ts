'use server'

import { requireAdminSession } from '@/lib/admin/rbac'
import { agorotToIls, ilsToAgorot } from '@/lib/commerce/money'
import { getPaymentProvider, resolveAccountByKey } from '@/lib/payments'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  RefundError,
  type RefundLineInput,
  type RefundVoucherInput,
  planOrderRefund,
} from '@/server/domain/orders/refund'
import type { SettlementState } from '@/server/domain/orders/state-machine'
import type { Json } from '@/types/database'

export type RefundOutcome =
  | { ok: true; replay: boolean; orderId: string; refundedIls: number; feeIls: number }
  | {
      ok: false
      error: string
      code: 'NOT_FOUND' | 'STATE_INVALID' | 'PROVIDER_ERROR' | 'FORBIDDEN' | 'INTERNAL'
    }

type ProductType = 'physical' | 'coupon'

/**
 * Admin-initiated refund. Orchestration only — the money/state decision lives in
 * the pure `planOrderRefund`; the Cardcom call goes through the provider mock in
 * tests. Idempotent: a second call finds the order already `refunded` and no-ops.
 *
 * @param input.partialAmountIls optional partial refund (no cancellation fee)
 * @param input.isDefectClaim    defect/non-conformity => zero cancellation fee
 */
export async function refundOrder(input: {
  orderId: string
  reason: string
  isDefectClaim?: boolean
  partialAmountIls?: number
  now?: Date
}): Promise<RefundOutcome> {
  try {
    await requireAdminSession()
  } catch {
    return { ok: false, error: 'אין הרשאה', code: 'FORBIDDEN' }
  }

  const admin = createAdminClient()
  const now = input.now ?? new Date()

  const { data: order } = await admin
    .from('orders')
    .select('id, status')
    .eq('id', input.orderId)
    .maybeSingle()
  if (!order) return { ok: false, error: 'הזמנה לא נמצאה', code: 'NOT_FOUND' }
  if (order.status === 'refunded') {
    return { ok: true, replay: true, orderId: order.id, refundedIls: 0, feeIls: 0 }
  }
  if (order.status !== 'paid') {
    return { ok: false, error: `לא ניתן לזכות הזמנה במצב ${order.status}`, code: 'STATE_INVALID' }
  }

  const { data: payment } = await admin
    .from('payments')
    .select('id, amount_ils, cardcom_transaction_id, status, cardcom_account_key')
    .eq('order_id', order.id)
    .eq('kind', 'charge')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (!payment) return { ok: false, error: 'לא נמצא תשלום לזיכוי', code: 'NOT_FOUND' }
  if (!payment.cardcom_transaction_id) {
    return { ok: false, error: 'לתשלום אין מזהה עסקה ב-Cardcom', code: 'STATE_INVALID' }
  }

  const { data: items } = await admin
    .from('order_items')
    .select('id, product_type, settlement_status')
    .eq('order_id', order.id)
  if (!items || items.length === 0) {
    return { ok: false, error: 'להזמנה אין פריטים', code: 'STATE_INVALID' }
  }

  const { data: voucherRows } = await admin
    .from('vouchers')
    .select('id, status')
    .eq('order_id', order.id)

  const cardChargedAgorot = Math.round(Number(payment.amount_ils) * 100)
  const lines: RefundLineInput[] = items.map((i) => ({
    orderItemId: i.id,
    productType: i.product_type as ProductType,
    settlementStatus: i.settlement_status as SettlementState,
  }))
  const voucherInputs: RefundVoucherInput[] = (voucherRows ?? []).map((v) => ({
    voucherId: v.id,
    status: v.status,
  }))

  let plan: ReturnType<typeof planOrderRefund>
  try {
    plan = planOrderRefund({
      cardChargedAgorot,
      lines,
      vouchers: voucherInputs,
      isDefectClaim: input.isDefectClaim ?? false,
      now,
      partialAmountAgorot:
        input.partialAmountIls !== undefined
          ? ilsToAgorot(input.partialAmountIls.toFixed(2))
          : undefined,
    })
  } catch (error) {
    if (error instanceof RefundError) {
      return { ok: false, error: error.message, code: 'STATE_INVALID' }
    }
    throw error
  }

  // Cardcom refund (money moves back to the card), on the terminal that
  // charged: a deal can only be credited on its own account.
  const account = await resolveAccountByKey(admin, payment.cardcom_account_key as string | null)
  const provider = getPaymentProvider(account)
  const refund = await provider.refundByTransactionId({
    transactionId: payment.cardcom_transaction_id,
    amountAgorot: plan.refundAmountAgorot,
    description: `זיכוי הזמנה ${order.id.slice(0, 8)}: ${input.reason}`,
  })
  if (!refund.success) {
    return {
      ok: false,
      error: refund.failureMessage ?? 'הזיכוי נדחה על ידי Cardcom',
      code: 'PROVIDER_ERROR',
    }
  }

  try {
    // Refund payment row (idempotency_key blocks a double refund of the same charge).
    await admin.from('payments').insert({
      order_id: order.id,
      kind: 'refund',
      status: 'refunded',
      amount_ils: agorotToIls(plan.refundAmountAgorot),
      currency: 'ILS',
      cardcom_transaction_id: refund.refundTransactionId,
      refund_of_payment_id: payment.id,
      idempotency_key: `refund:${payment.id}`,
    })

    if (plan.voucherRefunds.length > 0) {
      // Conditional update mirrors the voucher state machine: REFUND is legal
      // only from `issued`; a voucher that raced into another state stays put.
      await admin
        .from('vouchers')
        .update({ status: 'refunded', refunded_at: now.toISOString(), status_reason: input.reason })
        .in('id', plan.voucherRefunds)
        .eq('status', 'issued')
    }

    for (const t of plan.lineTransitions) {
      await admin
        .from('order_items')
        .update({ settlement_status: 'refunded', item_status: 'refunded' })
        .eq('id', t.orderItemId)
        .eq('settlement_status', t.from)
    }

    await admin
      .from('payments')
      .update({ status: 'refunded' })
      .eq('id', payment.id)
      .eq('status', payment.status)

    await admin
      .from('orders')
      .update({ status: 'refunded' })
      .eq('id', order.id)
      .eq('status', 'paid')

    await admin.from('audit_log').insert({
      actor_id: null,
      actor_role: 'admin',
      action: 'status_change',
      entity_type: 'order',
      entity_id: order.id,
      changes: { status: { from: 'paid', to: 'refunded' } } as unknown as Json,
      metadata: {
        source: 'refund_order',
        payment_id: payment.id,
        refund_transaction_id: refund.refundTransactionId,
        refunded_agorot: plan.refundAmountAgorot,
        cancellation_fee_agorot: plan.cancellationFeeAgorot,
        reason: input.reason,
      } as unknown as Json,
    })

    return {
      ok: true,
      replay: false,
      orderId: order.id,
      refundedIls: agorotToIls(plan.refundAmountAgorot),
      feeIls: agorotToIls(plan.cancellationFeeAgorot),
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'refund persistence failed'
    return { ok: false, error: message, code: 'INTERNAL' }
  }
}
