'use server'

import { writeAuditLog } from '@/lib/admin/audit'
import { requireAdminSession } from '@/lib/admin/rbac'
import { agorotToIls, ilsToAgorot } from '@/lib/commerce/money'
import { withActionContext } from '@/lib/observability/action-context'
import { log } from '@/lib/observability/log'
import { capturePaymentError } from '@/lib/observability/sentry'
import { getPaymentProvider } from '@/lib/payments'
import {
  paymentMoneyWrite,
  readAmountAgorot,
  resolvePaymentMoneySchema,
} from '@/lib/payments/payment-money-columns'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  RefundError,
  type RefundLineInput,
  type RefundVoucherInput,
  describeRefundBlockers,
  planOrderRefund,
} from '@/server/domain/orders/refund'
import type { SettlementState } from '@/server/domain/orders/state-machine'
import { enqueueRefundCreditNote, issueQueuedInvoice } from '@/server/payments/invoices'
import { type RefundRecordAdmin, groundFor, recordRefund } from '@/server/payments/refund-record'
import {
  type SettlementEventRow,
  recordSettlementEvents,
} from '@/server/payments/settlement-events'
import type { Json } from '@/types/database'

export type RefundOutcome =
  | {
      ok: true
      replay: boolean
      orderId: string
      refundedIls: number
      feeIls: number
      /** The deal was cancelled before transmission rather than credited. */
      cancelOnly: boolean
    }
  | {
      ok: false
      error: string
      code:
        | 'NOT_FOUND'
        | 'STATE_INVALID'
        | 'PROVIDER_ERROR'
        | 'FORBIDDEN'
        | 'INTERNAL'
        | 'MANUAL_RESOLUTION'
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
type RefundInput = {
  orderId: string
  reason: string
  isDefectClaim?: boolean
  partialAmountIls?: number
  now?: Date
}

async function runRefundOrder(input: RefundInput): Promise<RefundOutcome> {
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
    // `user_id` is here only so the refund-done mail can find a recipient:
    // `orders` carries no customer email column, the address lives on the
    // profile, and a guest order has neither.
    .select('id, status, user_id')
    .eq('id', input.orderId)
    .maybeSingle()
  if (!order) return { ok: false, error: 'הזמנה לא נמצאה', code: 'NOT_FOUND' }
  if (order.status === 'refunded') {
    return {
      ok: true,
      replay: true,
      orderId: order.id,
      refundedIls: 0,
      feeIls: 0,
      cancelOnly: false,
    }
  }
  if (order.status !== 'paid') {
    return { ok: false, error: `לא ניתן לזכות הזמנה במצב ${order.status}`, code: 'STATE_INVALID' }
  }

  // WHICH MONEY COLUMNS THIS DATABASE HAS. The hosted project is pre-059 and
  // carries `amount_ils`; naming `amount_agorot` here raises 42703 and takes
  // down the whole select, which returns null data and reads as "no payment to
  // refund" — the refund then fails with NOT_FOUND on an order that has a
  // perfectly good charge against it. Probed once per process, same as the
  // three other money-path call sites.
  const money = await resolvePaymentMoneySchema((column) =>
    admin
      .from('payments')
      .select(column)
      .limit(0)
      .then(({ error }) => ({ error })),
  )

  const { data: payment } = await admin
    .from('payments')
    .select(
      // `succeeded_at` and NOT `paid_at`: `paid_at` is a column of `orders`.
      // `payments` records when the charge succeeded, which is the timestamp
      // the same-day cancellation decision turns on.
      `id, ${money.amountColumn}, cardcom_transaction_id, status, cardcom_account_id, succeeded_at`,
    )
    .eq('order_id', order.id)
    .eq('kind', 'charge')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle<Record<string, unknown>>()
  if (!payment) return { ok: false, error: 'לא נמצא תשלום לזיכוי', code: 'NOT_FOUND' }
  const paymentId = String(payment.id)
  const transactionId = payment.cardcom_transaction_id
  if (typeof transactionId !== 'string' || transactionId.length === 0) {
    return { ok: false, error: 'לתשלום אין מזהה עסקה ב-Cardcom', code: 'STATE_INVALID' }
  }

  const cardChargedAgorot = readAmountAgorot(money, payment)
  if (cardChargedAgorot === null) {
    return { ok: false, error: 'לתשלום אין סכום קריא', code: 'STATE_INVALID' }
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

  // A voucher that has been redeemed or has expired is not a refund the code
  // can decide. The value left the platform at the counter (or lapsed as
  // breakage), so pulling the card money back would return value that was
  // consumed. That is a commercial decision — goodwill wallet credit, a claim
  // against the supplier, or nothing — and it gets its own code so the admin
  // screen can say so instead of showing the generic "illegal state".
  const consumed = voucherInputs.filter((v) => v.status === 'redeemed' || v.status === 'expired')
  if (consumed.length > 0) {
    const blocker = describeRefundBlockers({ lines, vouchers: voucherInputs })[0]
    return {
      ok: false,
      error: blocker?.message ?? 'שוברים שכבר מומשו או פגו דורשים טיפול ידני',
      code: 'MANUAL_RESOLUTION',
    }
  }

  const chargedAt =
    typeof payment.succeeded_at === 'string' ? new Date(payment.succeeded_at) : undefined

  let plan: ReturnType<typeof planOrderRefund>
  try {
    plan = planOrderRefund({
      cardChargedAgorot,
      lines,
      vouchers: voucherInputs,
      isDefectClaim: input.isDefectClaim ?? false,
      now,
      // Omitted when the charge never recorded a success time, which reads as
      // "not the same day" and takes the credit path. Erring the other way
      // would ask Cardcom to cancel a deal that has already been transmitted.
      chargedAt: chargedAt && !Number.isNaN(chargedAt.getTime()) ? chargedAt : undefined,
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

  // A zero credit is not a refund, and `payments.amount_ils` carries a
  // CHECK (> 0), so it would be a provider round trip followed by a constraint
  // violation with the money already moved.
  if (plan.refundAmountAgorot <= 0) {
    return { ok: false, error: 'סכום הזיכוי הוא אפס', code: 'STATE_INVALID' }
  }

  // Cardcom refund (money moves back to the card). Refunding through any
  // terminal other than the one that took the money would either be rejected or
  // debit the wrong account, so the id is read off the original charge.
  const provider = getPaymentProvider(
    typeof payment.cardcom_account_id === 'string' ? payment.cardcom_account_id : null,
  )
  const refund = await provider.refundByTransactionId({
    transactionId,
    amountAgorot: plan.refundAmountAgorot,
    cancelOnly: plan.cancelOnly,
    description: `זיכוי הזמנה ${order.id.slice(0, 8)}: ${input.reason}`,
  })
  if (!refund.success) {
    // A refund the provider refuses leaves the customer owed money that our
    // own records may already show as returned.
    capturePaymentError(new Error(refund.failureMessage ?? 'cardcom refund declined'), {
      stage: 'cardcom_refund',
      orderId: order.id,
      paymentId,
      detail: { failure_code: refund.failureCode, cancel_only: plan.cancelOnly },
    })
    return {
      ok: false,
      error: refund.failureMessage ?? 'הזיכוי נדחה על ידי Cardcom',
      code: 'PROVIDER_ERROR',
    }
  }

  try {
    // Refund payment row (idempotency_key blocks a double refund of the same charge).
    //
    // `as never` for the same reason `recordSettlementEvents` uses it: the money
    // columns are chosen at runtime by the probe above, and `src/types/database.ts`
    // is a snapshot that predates 106 (and, measured on 2026-08-06, differs from
    // production by ~1200 lines in total). The shape is asserted in the tests
    // instead, against the payload this actually sends.
    // The id comes back because the credit note below is keyed on the REFUND
    // payment, not the charge: it is the row that records the money that moved
    // back, and it is what the document must be attributable to.
    const { data: refundPaymentRow } = await admin
      .from('payments')
      .insert({
        order_id: order.id,
        kind: 'refund',
        status: 'refunded',
        ...paymentMoneyWrite(money, {
          amountAgorot: plan.refundAmountAgorot,
          walletAppliedAgorot: 0,
        }),
        currency: 'ILS',
        cardcom_transaction_id: refund.refundTransactionId,
        refund_of_payment_id: paymentId,
        idempotency_key: `refund:${paymentId}`,
      } as never)
      .select('id')
      .maybeSingle()

    // THE STATUTORY RECORD, which this function has never written.
    //
    // `public.refunds` has been live since 131 with a state machine, a ground
    // classification, a fee cap and a trigger forcing `refund_due_by` to
    // `requested_at + 14 days`, and it held zero rows because nothing wrote it.
    // What was recorded instead was `audit_log.metadata`, which is a log line
    // rather than the record the Consumer Protection Law is about, and which
    // cannot answer "which refunds are past their deadline".
    //
    // Best effort, deliberately, for the same reason the credit note below is
    // queued rather than called: the card is already credited by the time this
    // line runs, and a failed insert must not turn a successful refund into an
    // error an operator retries -- the retry would attempt a second credit.
    await recordRefund(admin as unknown as RefundRecordAdmin, {
      orderId: order.id,
      paymentId,
      state: 'completed',
      ground: groundFor({ isDefectClaim: input.isDefectClaim }),
      // The charge being cancelled, not the sum handed back. The fee cap in 131
      // is computed against this figure and the planner computes the fee the
      // same way, so passing the post-fee amount would make a legal fee look
      // like it broke the cap.
      requestedAgorot: cardChargedAgorot,
      grantedAgorot: plan.refundAmountAgorot,
      cancellationFeeAgorot: plan.cancellationFeeAgorot,
      cancelOnly: plan.cancelOnly,
      reasonHe: input.reason,
      at: now,
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
      .eq('id', paymentId)
      .eq('status', payment.status as string)

    await admin
      .from('orders')
      .update({ status: 'refunded' })
      .eq('id', order.id)
      .eq('status', 'paid')

    await recordSettlementEvents(admin, buildRefundEvents(order.id, paymentId, plan, now))

    // The credit note. A tax invoice is never edited or deleted, so reversing
    // one is a second document, not an undo of the first. Queued rather than
    // called for the same reason the sale's invoice is: the card has already
    // been credited by the time this line runs, and a provider that is down is
    // not a reason to fail a refund that succeeded.
    const refundPaymentId = (refundPaymentRow as { id: string } | null)?.id ?? null
    if (refundPaymentId) {
      const queued = await enqueueRefundCreditNote(admin, {
        orderId: order.id,
        refundPaymentId,
        refundedAgorot: plan.refundAmountAgorot,
        reason: input.reason,
      })
      if (queued.enqueued && !queued.replay) await issueQueuedInvoice(admin, queued.invoiceId)
    } else {
      log.warn('refund.credit_note_not_queued', { order_id: order.id, payment_id: paymentId })
    }

    await admin.from('audit_log').insert({
      // requireAdminSession() proved WHO this is at the top of the action;
      // writing null here made the one log that justifies a money reversal
      // say "an admin, we don't know which" (BUSINESS-RULES §10, fixed
      // marathon step 11).
      actor_id: session.userId,
      actor_role: session.role,
      action: 'status_change',
      entity_type: 'order',
      entity_id: order.id,
      changes: { status: { from: 'paid', to: 'refunded' } } as unknown as Json,
      metadata: {
        source: 'refund_order',
        payment_id: paymentId,
        refund_transaction_id: refund.refundTransactionId,
        refunded_agorot: plan.refundAmountAgorot,
        cancellation_fee_agorot: plan.cancellationFeeAgorot,
        cancel_only: plan.cancelOnly,
        supplier_debits_agorot: plan.supplierDebits.reduce((sum, d) => sum + d.amountAgorot, 0),
        reason: input.reason,
      } as unknown as Json,
    })

    // Told last, and best-effort, for the same reason the credit note is
    // queued rather than called: the card has already been credited by the
    // time this line runs. A queue insert that fails must not turn a refund
    // that succeeded into an error the operator retries, so it is logged and
    // dropped. `refund:<order id>` as the dedupe key means a replayed refund
    // cannot mail twice.
    //
    // A guest order has no `user_id` and therefore no profile to read an
    // address off. That is silence by design, not a gap: there is nowhere to
    // send it, and inventing a recipient is worse than not writing.
    if (order.user_id) {
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
          refunded_agorot: plan.refundAmountAgorot,
          cancellation_fee_agorot: plan.cancellationFeeAgorot,
          cancel_only: plan.cancelOnly,
        },
        p_user_id: order.user_id,
      })
      if (notifyError) {
        log.warn('refund.notify_not_queued', { order_id: order.id, err: notifyError.message })
      }
    }

    await writeAuditLog({
      actorId: session.userId,
      actorRole: session.role,
      action: 'manual_override',
      entityType: 'orders',
      entityId: order.id,
      changes: {
        old: { status: 'paid' },
        new: {
          status: 'refunded',
          reason: input.reason,
          refunded_agorot: plan.refundAmountAgorot,
        },
      },
    })

    return {
      ok: true,
      replay: false,
      orderId: order.id,
      refundedIls: agorotToIls(plan.refundAmountAgorot),
      feeIls: agorotToIls(plan.cancellationFeeAgorot),
      cancelOnly: plan.cancelOnly,
    }
  } catch (error) {
    // The card has already been credited at this point. Everything below the
    // provider call is bookkeeping that has now diverged from the money, which
    // is the one failure on this path that has to reach a human.
    capturePaymentError(error instanceof Error ? error : new Error('refund persistence failed'), {
      stage: 'refund_persist',
      orderId: order.id,
      paymentId,
      detail: { refund_transaction_id: refund.refundTransactionId },
    })
    const message = error instanceof Error ? error.message : 'refund persistence failed'
    log.error('refund.persist_failed', { order_id: order.id, payment_id: paymentId, err: message })
    return { ok: false, error: message, code: 'INTERNAL' }
  }
}

/**
 * The journal rows a refund produces, per 094 and 106.
 *
 * One `refund_issued` for the order and one `supplier_debit` per supplier share
 * that was already released. Both carry POSITIVE amounts: 094's CHECK refuses
 * negatives on all four money columns on purpose, so the direction lives in the
 * `kind`, which is the column that is constrained to a known set.
 *
 * Keyed per payment and per line rather than per call, because this whole
 * action is replay-safe by design and `recordSettlementEvents` upserts on the
 * key — a second attempt adds nothing instead of double-counting a claw-back.
 */
function buildRefundEvents(
  orderId: string,
  paymentId: string,
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
      metadata: {
        payment_id: paymentId,
        cancellation_fee_agorot: plan.cancellationFeeAgorot,
        cancel_only: plan.cancelOnly,
      },
      idempotency_key: `refund_issued:${paymentId}`,
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
      metadata: { payment_id: paymentId, reason: 'refund' },
      idempotency_key: `supplier_debit:${debit.orderItemId}`,
      occurred_at: occurred,
    })
  }

  return events
}

export async function refundOrder(input: RefundInput): Promise<RefundOutcome> {
  return withActionContext('order.refund', () => runRefundOrder(input))
}
