import { log } from '@/lib/observability/log'

/**
 * The statutory cancellation record, which existed as a table and nothing else.
 *
 * MEASURED against production on 2026-09-02: `public.refunds` is live with 19
 * columns, it holds ZERO rows, and no code anywhere writes it -- `grep` for
 * `from('refunds')` across `src` and `apps` returns nothing. Migration 131
 * built the whole thing: the `refund_state` machine, the `refund_ground`
 * classification, the 5%-capped-at-100 fee constraint, and a trigger forcing
 * `refund_due_by = requested_at + interval '14 days'` because Consumer
 * Protection Law section 14ה requires the money back inside 14 days.
 *
 * All of it was unreachable. `refundOrder` credited the card and recorded what
 * it had done in `audit_log.metadata`, which is a log line, not the record the
 * law is about. Nothing could answer "which refunds are past their deadline",
 * because there was no row to ask.
 *
 * WHY BEST EFFORT, LIKE THE CREDIT NOTE AND THE AUDIT ROW BESIDE IT. By the
 * time this is called the card has already been credited. A failure to write
 * the record must not turn a refund that SUCCEEDED into an error an operator
 * retries, because the retry would attempt a second credit. So it logs loudly
 * and returns, exactly as `enqueueRefundCreditNote` and the audit insert in the
 * same function already do.
 */

/** `public.refund_state`, as production declares it. */
export type RefundState =
  | 'requested'
  | 'approved'
  | 'rejected'
  | 'executing'
  | 'completed'
  | 'failed'

/** `public.refund_ground`, as production declares it. */
export type RefundGround =
  | 'distance_sale_14d'
  | 'defect'
  | 'service_not_provided'
  | 'duplicate_charge'
  | 'extended_window'
  | 'goodwill'

export interface RefundRecord {
  orderId: string
  /** The ORIGINAL charge. The money movement is `payments(kind=refund)`; this table is the notice. */
  paymentId: string
  state: RefundState
  ground: RefundGround
  /**
   * What was charged and is being cancelled, NOT what was handed back.
   *
   * This distinction is load-bearing: the fee constraint in 131 is
   * `cancellation_fee_agorot <= LEAST((requested_agorot + 19) / 20, 10000)`,
   * i.e. 5% capped at 100 shekels, computed against the REQUESTED amount. The
   * planner computes the fee against the full charge
   * (`computeCancellationFee(cardChargedAgorot)`), so passing the post-fee
   * figure here would make a legal fee look like it broke the cap and the
   * insert would fail its CHECK.
   */
  requestedAgorot: number
  /** What actually went back, after any fee. */
  grantedAgorot: number
  cancellationFeeAgorot: number
  cancelOnly: boolean
  reasonHe: string
  requestedBy?: string | null
  decidedBy?: string | null
  at: Date
}

type RefundRow = {
  order_id: string
  payment_id: string
  state: RefundState
  ground: RefundGround
  requested_agorot: number
  granted_agorot: number
  cancellation_fee_agorot: number
  cancel_only: boolean
  reason_he: string
  requested_by: string | null
  decided_by: string | null
  requested_at: string
  decided_at: string | null
  completed_at: string | null
}

/** Minimal structural client shape; `src/types/database.ts` predates 131. */
export type RefundRecordAdmin = {
  from: (table: 'refunds') => {
    insert: (row: RefundRow) => Promise<{ error: { message: string } | null }>
  }
}

/**
 * An admin-initiated refund is decided and executed in the same call, so the
 * row is written already closed: requested, decided and completed all carry the
 * same instant. A customer-initiated request would write `requested` here and
 * move through the machine later; nothing does that yet.
 */
export async function recordRefund(
  admin: RefundRecordAdmin,
  record: RefundRecord,
): Promise<{ error: string | null }> {
  const at = record.at.toISOString()
  const closed = record.state === 'completed'
  try {
    const { error } = await admin.from('refunds').insert({
      order_id: record.orderId,
      payment_id: record.paymentId,
      state: record.state,
      ground: record.ground,
      requested_agorot: record.requestedAgorot,
      granted_agorot: record.grantedAgorot,
      cancellation_fee_agorot: record.cancellationFeeAgorot,
      cancel_only: record.cancelOnly,
      reason_he: record.reasonHe,
      requested_by: record.requestedBy ?? null,
      decided_by: record.decidedBy ?? null,
      requested_at: at,
      decided_at: closed ? at : null,
      completed_at: closed ? at : null,
    })
    if (error) {
      log.error('refund.record_not_written', {
        order_id: record.orderId,
        payment_id: record.paymentId,
        reason: error.message,
      })
      return { error: error.message }
    }
    return { error: null }
  } catch (err) {
    log.error('refund.record_threw', { order_id: record.orderId, err })
    return { error: String(err) }
  }
}

/**
 * Which statutory ground this refund is being made on.
 *
 * `defect` and `duplicate_charge` are the two the fee constraint forbids a fee
 * on, which is the law rather than a preference: a trader may not charge a
 * cancellation fee when the fault is theirs. `refundOrder` already zeroes the
 * fee for a defect claim, so the two agree; this keeps them agreeing when the
 * caller passes a ground explicitly.
 */
export function groundFor(input: { isDefectClaim?: boolean }): RefundGround {
  return input.isDefectClaim ? 'defect' : 'distance_sale_14d'
}
