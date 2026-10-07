'use server'

import { requireAdminSession } from '@/lib/admin/rbac'
import { withActionContext } from '@/lib/observability/action-context'
import { log } from '@/lib/observability/log'
import { capturePaymentError } from '@/lib/observability/sentry'
import { createAdminClient } from '@/lib/supabase/admin'
import { pendingRestockRpc } from '@/lib/supabase/pending-restock'
import { trackServerEvent } from '@/server/analytics/track'
import {
  RefundError,
  type RefundLineInput,
  type RefundVoucherInput,
  planOrderRefund,
} from '@/server/domain/orders/refund'
import type { SettlementState } from '@/server/domain/orders/state-machine'
import {
  type RefundRecordAdmin,
  claimOpenRefund,
  recordRefund,
  settleRefundRecord,
} from '@/server/payments/refund-record'
import { planWalletCredit, walletRefundGround } from '@/server/payments/refund-wallet'
import {
  type SettlementEventRow,
  recordSettlementEvents,
} from '@/server/payments/settlement-events'
import { getOpenReturnForOrder } from '@/server/queries/returns'
import type { Json } from '@/types/database'

/**
 * Refund as store credit (STEP 44): the wallet half of "refund to original
 * payment or store credit".
 *
 * `planWalletCredit` and `walletRefundGround` existed with no caller; this is
 * the caller. The shape mirrors `refundOrder` step for step, with the ledger
 * RPC where the provider call was:
 *
 *   1. authorize           admin session
 *   2. load                order, lines, vouchers, the open wallet request
 *   3. guard               order status
 *   4. plan                planWalletCredit (pure); planOrderRefund for the
 *                          state moves when nothing was consumed
 *   5. lock                claim the customer's `requested` row, or open one
 *                          in `executing`; both race on refunds_one_open_per_order
 *   6. ledger              fn_wallet_transfer platform:revenue -> customer,
 *                          idempotent on refund:<order>:wallet
 *   7. settle              the row -> completed with the credited amount
 *   8. transition          vouchers, lines, order (full cancellation only)
 *   9. journal, audit, notify, track   best effort
 *
 * TWO SHAPES OF WALLET REFUND. When no voucher has been redeemed or expired
 * the credit is a full cancellation and the order's states move exactly as a
 * card refund moves them (vouchers -> refunded, lines -> refunded, order ->
 * refunded, stock back, supplier debits). When value WAS consumed at the
 * counter the credit is goodwill: the money lands in the wallet, the row is
 * recorded, and nothing else moves, because the customer kept what they
 * redeemed. `planOrderRefund` throws on the consumed case and that throw is
 * what selects the goodwill shape.
 *
 * NO FEE, EVER. 148's `refunds_wallet_has_no_fee` is a CHECK; the plan
 * refuses a fee before the row is touched.
 */

export type WalletRefundOutcome =
  | { ok: true; replay: boolean; orderId: string; creditedAgorot: number; goodwill: boolean }
  | {
      ok: false
      error: string
      code:
        | 'NOT_FOUND'
        | 'STATE_INVALID'
        | 'FORBIDDEN'
        | 'INTERNAL'
        | 'MANUAL_RESOLUTION'
        | 'NO_WALLET'
    }

type WalletRefundInput = {
  orderId: string
  reason: string
  /**
   * Agorot to credit. Defaults to the open request's `requested_agorot`.
   * Required when there is no open request (an admin goodwill credit).
   */
  amountAgorot?: number
  isDefectClaim?: boolean
  now?: Date
}

type ProductType = 'physical' | 'coupon'
type AdminClient = ReturnType<typeof createAdminClient>

const WALLET_REFUSALS = {
  guest_order_has_no_wallet: 'להזמנת אורח אין ארנק לזכות.',
  amount_not_positive: 'סכום הזיכוי חייב להיות חיובי.',
  fee_on_wallet_refund: 'זיכוי לארנק אינו נושא דמי ביטול.',
  illegal_transition: 'מצב הבקשה אינו מאפשר זיכוי.',
} as const satisfies Record<string, string>

async function walletAccountFor(
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
  const { data: reread } = await admin
    .from('wallet_accounts')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle()
  return reread ?? null
}

async function runRefundToWallet(input: WalletRefundInput): Promise<WalletRefundOutcome> {
  let session: Awaited<ReturnType<typeof requireAdminSession>>
  try {
    session = await requireAdminSession()
  } catch {
    return { ok: false, error: 'אין הרשאה', code: 'FORBIDDEN' }
  }

  const admin = createAdminClient()
  const now = input.now ?? new Date()

  const { data: order } = await admin
    .from('orders')
    .select('id, status, user_id')
    .eq('id', input.orderId)
    .maybeSingle()
  if (!order) return { ok: false, error: 'הזמנה לא נמצאה', code: 'NOT_FOUND' }
  if (order.status === 'refunded') {
    return { ok: true, replay: true, orderId: order.id, creditedAgorot: 0, goodwill: false }
  }
  if (order.status !== 'paid') {
    return { ok: false, error: `לא ניתן לזכות הזמנה במצב ${order.status}`, code: 'STATE_INVALID' }
  }
  if (!order.user_id)
    return { ok: false, error: WALLET_REFUSALS.guest_order_has_no_wallet, code: 'NO_WALLET' }

  const request = await getOpenReturnForOrder(order.id)
  if (request && request.destination !== 'wallet') {
    return {
      ok: false,
      error: 'הבקשה הפתוחה להזמנה זו מבקשת החזר לכרטיס, לא לארנק.',
      code: 'MANUAL_RESOLUTION',
    }
  }
  if (request && request.state === 'executing') {
    return {
      ok: false,
      error: 'זיכוי להזמנה זו כבר בביצוע. יש לבדוק את מצבו לפני ניסיון נוסף.',
      code: 'MANUAL_RESOLUTION',
    }
  }
  const amountAgorot = input.amountAgorot ?? request?.requestedAgorot
  if (amountAgorot === undefined) {
    return { ok: false, error: 'אין בקשה פתוחה ולא צוין סכום לזיכוי.', code: 'STATE_INVALID' }
  }

  const { data: items } = await admin
    .from('order_items')
    .select('id, product_type, settlement_status, supplier_id, supplier_immediate_agorot')
    .eq('order_id', order.id)
  if (!items || items.length === 0) {
    return { ok: false, error: 'להזמנה אין פריטים', code: 'STATE_INVALID' }
  }
  const { data: voucherRows } = await admin
    .from('vouchers')
    .select('id, status')
    .eq('order_id', order.id)

  const lines: RefundLineInput[] = items.map((i) => ({
    orderItemId: i.id,
    productType: i.product_type as ProductType,
    settlementStatus: i.settlement_status as SettlementState,
    supplierId: i.supplier_id,
    supplierReleasedAgorot: Number(i.supplier_immediate_agorot ?? 0),
  }))
  const voucherInputs: RefundVoucherInput[] = (voucherRows ?? []).map((v) => ({
    voucherId: v.id,
    status: v.status,
  }))

  // Full cancellation when the planner accepts it; goodwill when it refuses
  // because value was consumed. Any OTHER refusal is a real one.
  let plan: ReturnType<typeof planOrderRefund> | null = null
  try {
    plan = planOrderRefund({
      cardChargedAgorot: amountAgorot,
      lines,
      vouchers: voucherInputs,
      isDefectClaim: true, // no fee on a wallet credit, ever
      now,
    })
  } catch (error) {
    if (!(error instanceof RefundError)) throw error
    if (error.code !== 'NOT_REFUNDABLE') {
      return { ok: false, error: error.message, code: 'STATE_INVALID' }
    }
    plan = null
  }
  const goodwill = plan === null

  const credit = planWalletCredit({
    orderId: order.id,
    userId: order.user_id,
    refundAmountAgorot: amountAgorot,
    cancellationFeeAgorot: 0,
    // The admin's approval IS the `approved` step; the claim below collapses
    // approved -> executing into the same UPDATE, so the machine is asked
    // about the edge that UPDATE takes.
    fromState: 'approved',
  })
  if (!credit.ok) {
    return { ok: false, error: WALLET_REFUSALS[credit.reason], code: 'STATE_INVALID' }
  }

  // THE LOCK, BEFORE THE MONEY. The customer's wallet request is the open
  // row: take it over. With no request, open one in `executing`.
  const refundRecordAdmin = admin as unknown as RefundRecordAdmin
  const ground = request?.ground ?? walletRefundGround({ isDefectClaim: input.isDefectClaim })
  const { data: charge } = await admin
    .from('payments')
    .select('id')
    .eq('order_id', order.id)
    .eq('kind', 'charge')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const paymentId = charge?.id ?? null

  if (request) {
    const claimed = await claimOpenRefund(refundRecordAdmin, {
      orderId: order.id,
      destination: 'wallet',
      paymentId,
      ground: goodwill ? 'goodwill' : ground,
      grantedAgorot: credit.amountAgorot,
      cancellationFeeAgorot: 0,
      cancelOnly: false,
      decidedBy: session.userId,
      at: now,
    })
    if (!claimed.claimed) {
      return {
        ok: false,
        error: claimed.error
          ? `לא ניתן לרשום את הזיכוי לפני ביצועו: ${claimed.error}`
          : 'הבקשה כבר טופלה על ידי מישהו אחר.',
        code: claimed.error ? 'INTERNAL' : 'MANUAL_RESOLUTION',
      }
    }
  } else {
    if (!paymentId) {
      return { ok: false, error: 'לא נמצא תשלום להזמנה', code: 'NOT_FOUND' }
    }
    const opened = await recordRefund(refundRecordAdmin, {
      orderId: order.id,
      paymentId,
      state: 'executing',
      ground: goodwill ? 'goodwill' : ground,
      destination: 'wallet',
      requestedAgorot: amountAgorot,
      grantedAgorot: credit.amountAgorot,
      cancellationFeeAgorot: 0,
      cancelOnly: false,
      reasonHe: input.reason,
      requestedBy: session.userId,
      decidedBy: session.userId,
      at: now,
    })
    if (opened.inFlight) {
      return {
        ok: false,
        error: 'זיכוי להזמנה זו כבר פתוח (בתהליך או ממתין להחלטה).',
        code: 'MANUAL_RESOLUTION',
      }
    }
    if (opened.error) {
      return {
        ok: false,
        error: `לא ניתן לרשום את הזיכוי לפני ביצועו: ${opened.error}`,
        code: 'INTERNAL',
      }
    }
  }

  // The ledger move. `platform:revenue` is the account the wallet spend
  // credited at checkout, so a refund debits it; a house account may go
  // negative (146).
  const [userAccount, platformResult] = await Promise.all([
    walletAccountFor(admin, order.user_id),
    admin.from('wallet_accounts').select('id').eq('code', 'platform:revenue').maybeSingle(),
  ])
  const platformAccount = platformResult.data
  if (!userAccount || !platformAccount) {
    await settleRefundRecord(refundRecordAdmin, { orderId: order.id, state: 'failed', at: now })
    return { ok: false, error: 'חשבונות הארנק לא נמצאו', code: 'INTERNAL' }
  }
  const { error: transferError } = await admin.rpc('fn_wallet_transfer', {
    p_debit_account: platformAccount.id,
    p_credit_account: userAccount.id,
    p_amount_ils: credit.amountIls,
    p_reason: 'refund_wallet',
    p_idempotency: credit.idempotencyKey,
    p_order_id: order.id,
  })
  if (transferError) {
    capturePaymentError(new Error(transferError.message), {
      stage: 'wallet_refund',
      orderId: order.id,
      paymentId: paymentId ?? undefined,
    })
    await settleRefundRecord(refundRecordAdmin, { orderId: order.id, state: 'failed', at: now })
    return { ok: false, error: `הזיכוי לארנק נכשל: ${transferError.message}`, code: 'INTERNAL' }
  }

  try {
    await settleRefundRecord(refundRecordAdmin, {
      orderId: order.id,
      state: 'completed',
      grantedAgorot: credit.amountAgorot,
      at: now,
    })

    let flipped = false
    if (plan) {
      if (plan.voucherRefunds.length > 0) {
        await admin
          .from('vouchers')
          .update({
            status: 'refunded',
            refunded_at: now.toISOString(),
            status_reason: input.reason,
          })
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
      const { data: flippedRow, error: flipError } = await admin
        .from('orders')
        .update({ status: 'refunded' })
        .eq('id', order.id)
        .eq('status', 'paid')
        .select('id')
        .maybeSingle()
      if (flipError) {
        log.warn('refund_wallet.status_flip_failed', { order_id: order.id, err: flipError.message })
      }
      flipped = Boolean(flippedRow)
      if (flipped) {
        const { error: restockError } = await admin.rpc(pendingRestockRpc(), {
          p_order_id: order.id,
        } as never)
        if (restockError) {
          log.warn('refund_wallet.restock_failed', {
            order_id: order.id,
            err: restockError.message,
          })
        }
      }
      await recordSettlementEvents(
        admin,
        buildWalletRefundEvents(order.id, credit.idempotencyKey, plan, now),
      )
    }

    await admin.from('audit_log').insert({
      actor_id: session.userId,
      actor_role: session.role,
      action: 'status_change',
      entity_type: 'order',
      entity_id: order.id,
      changes: (plan
        ? { status: { from: 'paid', to: 'refunded' } }
        : { wallet_credit: { from: null, to: credit.amountAgorot } }) as unknown as Json,
      metadata: {
        source: 'refund_to_wallet',
        payment_id: paymentId,
        credited_agorot: credit.amountAgorot,
        goodwill,
        rma: request?.rma ?? null,
        reason: input.reason,
      } as unknown as Json,
    })

    const { data: customer } = await admin
      .from('profiles')
      .select('email')
      .eq('id', order.user_id)
      .maybeSingle()
    const { error: notifyError } = await admin.rpc('fn_enqueue_notification', {
      p_kind: 'refund_completed',
      p_email: customer?.email ?? '',
      p_dedupe: `refund:${order.id}`,
      p_payload: {
        order_id: order.id,
        order_ref: order.id.slice(0, 8).toUpperCase(),
        refunded_agorot: credit.amountAgorot,
        cancellation_fee_agorot: 0,
        cancel_only: false,
        destination: 'wallet',
        rma: request?.rma ?? null,
      },
      p_user_id: order.user_id,
    })
    if (notifyError) {
      log.warn('refund_wallet.notify_not_queued', { order_id: order.id, err: notifyError.message })
    }

    await trackServerEvent({
      eventName: 'order_refunded',
      userId: order.user_id,
      props: {
        order_id: order.id,
        refunded_agorot: credit.amountAgorot,
        cancel_only: false,
        destination: 'wallet',
      },
    })

    return {
      ok: true,
      replay: false,
      orderId: order.id,
      creditedAgorot: credit.amountAgorot,
      goodwill,
    }
  } catch (error) {
    // The wallet is already credited. Everything below the RPC is
    // bookkeeping that has diverged from the money.
    capturePaymentError(
      error instanceof Error ? error : new Error('wallet refund persistence failed'),
      {
        stage: 'wallet_refund_persist',
        orderId: order.id,
        paymentId: paymentId ?? undefined,
      },
    )
    const message = error instanceof Error ? error.message : 'wallet refund persistence failed'
    log.error('refund_wallet.persist_failed', { order_id: order.id, err: message })
    return { ok: false, error: message, code: 'INTERNAL' }
  }
}

/** Same journal shape as a card refund (094/106), keyed on the ledger idempotency key. */
function buildWalletRefundEvents(
  orderId: string,
  ledgerKey: string,
  plan: ReturnType<typeof planOrderRefund>,
  occurredAt: Date,
): SettlementEventRow[] {
  const occurred = occurredAt.toISOString()
  const events: SettlementEventRow[] = [
    {
      order_id: orderId,
      order_item_id: null,
      supplier_id: null,
      kind: 'refund_issued',
      paid_on_site_agorot: plan.refundAmountAgorot,
      commission_agorot: 0,
      supplier_due_agorot: 0,
      discount_agorot: 0,
      platform_percent_snapshot: null,
      supplier_split_percent_snapshot: null,
      metadata: { destination: 'wallet', ledger_key: ledgerKey, cancellation_fee_agorot: 0 },
      idempotency_key: `refund_issued:${ledgerKey}`,
      occurred_at: occurred,
    },
  ]
  for (const debit of plan.supplierDebits) {
    events.push({
      order_id: orderId,
      order_item_id: debit.orderItemId,
      supplier_id: debit.supplierId,
      kind: 'supplier_debit',
      paid_on_site_agorot: 0,
      commission_agorot: 0,
      supplier_due_agorot: debit.amountAgorot,
      discount_agorot: 0,
      platform_percent_snapshot: null,
      supplier_split_percent_snapshot: null,
      metadata: { ledger_key: ledgerKey, reason: 'refund_wallet' },
      idempotency_key: `supplier_debit:${debit.orderItemId}`,
      occurred_at: occurred,
    })
  }
  return events
}

export async function refundToWallet(input: WalletRefundInput): Promise<WalletRefundOutcome> {
  return withActionContext('order.refund_wallet', () => runRefundToWallet(input))
}
