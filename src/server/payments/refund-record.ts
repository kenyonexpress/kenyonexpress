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
 * SINCE 08.10.2026 THE ROW IS ALSO THE LOCK. Production carries
 * `refunds_one_open_per_order`, a UNIQUE index on `order_id` WHERE state IN
 * (`requested`, `approved`, `executing`). `refundOrder` writes the row in
 * `executing` BEFORE it asks Cardcom to move money, so two admins clicking the
 * same button, or one admin double-clicking, race on that index rather than on
 * the terminal: the loser gets `23505` and never reaches the provider. Before
 * this the only idempotency key was on the `payments` row written AFTER the
 * provider call, which blocked the second bookkeeping entry and not the second
 * credit. Measured, 08.10: `idempotency_keys` (the generic claim table in
 * `lib/idempotency.ts`) does not exist in production, so this index is the
 * only server-side mutex the refund path has.
 *
 * `settleRefundRecord` then closes the row as `completed` or `failed`, keyed
 * on (`order_id`, `executing`) because the index guarantees there is exactly
 * one such row.
 *
 * WHY THE SETTLE IS BEST EFFORT, LIKE THE CREDIT NOTE AND THE AUDIT ROW BESIDE
 * IT. By the time it is called the card has already been credited. A failure
 * to write the record must not turn a refund that SUCCEEDED into an error an
 * operator retries, because the retry would attempt a second credit. So it
 * logs loudly and returns, exactly as `enqueueRefundCreditNote` and the audit
 * insert in the same function already do. The OPEN is the opposite: it fails
 * closed, because nothing has moved yet and a refund with no record is the
 * thing this table exists to prevent.
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
  /** Where the money goes. Defaults to the card; `wallet` is store credit (148). */
  destination?: RefundDestination
  at: Date
}

type RefundRow = {
  order_id: string
  payment_id: string
  state: RefundState
  ground: RefundGround
  destination: RefundDestination
  requested_agorot: number
  granted_agorot: number | null
  cancellation_fee_agorot: number
  cancel_only: boolean
  reason_he: string
  requested_by: string | null
  decided_by: string | null
  requested_at: string
  decided_at: string | null
  completed_at: string | null
}

type RefundRowPatch = Partial<Pick<RefundRow, 'state' | 'granted_agorot' | 'completed_at'>>

type PgError = { message: string; code?: string }

/** `public.refund_destination` (148). */
export type RefundDestination = 'original_method' | 'wallet'

type RefundClaimPatch = {
  state: 'executing'
  ground: RefundGround
  payment_id: string | null
  granted_agorot: number
  cancellation_fee_agorot: number
  cancel_only: boolean
  decided_by: string | null
  decided_at: string
}

/** Minimal structural client shape; `src/types/database.ts` predates 131. */
export type RefundRecordAdmin = {
  from: (table: 'refunds') => {
    insert: (row: RefundRow) => Promise<{ error: PgError | null }>
    update: (patch: RefundRowPatch | RefundClaimPatch) => {
      eq: (
        column: 'order_id',
        value: string,
      ) => {
        eq: (column: 'state', value: RefundState) => Promise<{ error: PgError | null }>
        in: (
          column: 'state',
          values: readonly RefundState[],
        ) => {
          eq: (
            column: 'destination',
            value: RefundDestination,
          ) => {
            select: (
              columns: 'id',
            ) => Promise<{ data: { id: string }[] | null; error: PgError | null }>
          }
        }
      }
    }
  }
}

/** Postgres unique_violation: another open refund already holds this order. */
const UNIQUE_VIOLATION = '23505'

/** States that count as "decided": an admin chose, whether or not money has moved yet. */
const DECIDED_STATES: ReadonlySet<RefundState> = new Set(['executing', 'completed'])

export type RecordRefundResult = {
  error: string | null
  /**
   * True when the insert lost to `refunds_one_open_per_order`: a refund for
   * this order is already `requested`, `approved` or `executing`. The caller
   * must not reach the provider on this answer.
   */
  inFlight: boolean
}

/**
 * Write the notice. For an admin refund the state is `executing`, written
 * before the provider is asked, and the row is the lock described above.
 * `requested` is for a customer-initiated request; nothing writes that yet.
 */
export async function recordRefund(
  admin: RefundRecordAdmin,
  record: RefundRecord,
): Promise<RecordRefundResult> {
  const at = record.at.toISOString()
  const closed = record.state === 'completed'
  const decided = DECIDED_STATES.has(record.state)
  try {
    const { error } = await admin.from('refunds').insert({
      order_id: record.orderId,
      payment_id: record.paymentId,
      state: record.state,
      ground: record.ground,
      destination: record.destination ?? 'original_method',
      requested_agorot: record.requestedAgorot,
      granted_agorot: record.grantedAgorot,
      cancellation_fee_agorot: record.cancellationFeeAgorot,
      cancel_only: record.cancelOnly,
      reason_he: record.reasonHe,
      requested_by: record.requestedBy ?? null,
      decided_by: record.decidedBy ?? null,
      requested_at: at,
      decided_at: decided ? at : null,
      completed_at: closed ? at : null,
    })
    if (error) {
      const inFlight = error.code === UNIQUE_VIOLATION
      if (inFlight) {
        log.warn('refund.record_already_open', {
          order_id: record.orderId,
          payment_id: record.paymentId,
        })
      } else {
        log.error('refund.record_not_written', {
          order_id: record.orderId,
          payment_id: record.paymentId,
          reason: error.message,
        })
      }
      return { error: error.message, inFlight }
    }
    return { error: null, inFlight: false }
  } catch (err) {
    log.error('refund.record_threw', { order_id: record.orderId, err })
    return { error: String(err), inFlight: false }
  }
}

export interface ClaimRefundInput {
  orderId: string
  destination: RefundDestination
  /** The ORIGINAL charge; null for an order with no card payment. */
  paymentId: string | null
  /** The admin's adjudication; overrides the customer's default ground. */
  ground: RefundGround
  grantedAgorot: number
  cancellationFeeAgorot: number
  cancelOnly: boolean
  decidedBy: string | null
  at: Date
}

export type ClaimRefundResult =
  | { claimed: true; refundId: string }
  | { claimed: false; error: string | null }

/**
 * Take over the customer's own notice (STEP 44).
 *
 * `submitReturnRequest` writes the row in `requested`. When an admin then
 * approves it, `recordRefund` above loses to `refunds_one_open_per_order`
 * (the request IS the open row), and the right move is not a second row but
 * this one: a compare-and-set from `requested` / `approved` to `executing`
 * on the same row, so the lock, the 14-day clock and the RMA all stay on
 * the notice the customer was given.
 *
 * It is a CAS, not a read-then-write: the UPDATE's WHERE names the states it
 * may leave, so two admins approving at once produce one `executing` row and
 * one empty result. `destination` is in the WHERE too: a wallet request must
 * not be claimed by the card path, which would credit a card the customer
 * asked not to be credited.
 *
 * The ground is the admin's. 131's `refunds_no_fee_when_our_fault` would
 * refuse a fee on a row whose ground is `defect`, so when the admin decides
 * the fee applies, the ground must say so on the same UPDATE.
 */
export async function claimOpenRefund(
  admin: RefundRecordAdmin,
  input: ClaimRefundInput,
): Promise<ClaimRefundResult> {
  try {
    const { data, error } = await admin
      .from('refunds')
      .update({
        state: 'executing',
        ground: input.ground,
        payment_id: input.paymentId,
        granted_agorot: input.grantedAgorot,
        cancellation_fee_agorot: input.cancellationFeeAgorot,
        cancel_only: input.cancelOnly,
        decided_by: input.decidedBy,
        decided_at: input.at.toISOString(),
      })
      .eq('order_id', input.orderId)
      .in('state', ['requested', 'approved'])
      .eq('destination', input.destination)
      .select('id')
    if (error) {
      log.error('refund.claim_failed', { order_id: input.orderId, reason: error.message })
      return { claimed: false, error: error.message }
    }
    const row = data?.[0]
    if (!row) return { claimed: false, error: null }
    return { claimed: true, refundId: row.id }
  } catch (err) {
    log.error('refund.claim_threw', { order_id: input.orderId, err })
    return { claimed: false, error: String(err) }
  }
}

export type SettleRefundInput =
  | { orderId: string; state: 'completed'; grantedAgorot: number; at: Date }
  | { orderId: string; state: 'failed'; at: Date }

/**
 * Close the `executing` row once the provider has answered.
 *
 * `completed` carries the money that went back and the completion time, both
 * of which `refunds_completed_has_money` requires. `failed` clears the granted
 * amount: nothing went back. Keyed on (`order_id`, `executing`) rather than an
 * id, because the partial unique index guarantees exactly one such row and the
 * insert above did not need to read anything back to know it won.
 */
export async function settleRefundRecord(
  admin: RefundRecordAdmin,
  input: SettleRefundInput,
): Promise<{ error: string | null }> {
  const patch: RefundRowPatch =
    input.state === 'completed'
      ? {
          state: 'completed',
          granted_agorot: input.grantedAgorot,
          completed_at: input.at.toISOString(),
        }
      : { state: 'failed', granted_agorot: null, completed_at: null }
  try {
    const { error } = await admin
      .from('refunds')
      .update(patch)
      .eq('order_id', input.orderId)
      .eq('state', 'executing')
    if (error) {
      log.error('refund.record_not_settled', {
        order_id: input.orderId,
        state: input.state,
        reason: error.message,
      })
      return { error: error.message }
    }
    return { error: null }
  } catch (err) {
    log.error('refund.record_settle_threw', { order_id: input.orderId, err })
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
