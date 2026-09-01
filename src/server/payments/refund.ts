import { agorot } from '@/lib/commerce/money'
import type { RefundResult, VerifyLowProfileResult } from '@/lib/payments/types'
import { secretEquals } from '@/lib/security/constant-time'

/**
 * Money-path refund progress. Separate from the paperwork table in 131
 * (`refunds`: requested / approved / rejected / executing / completed).
 *
 * Wallet first so the statutory clock is met even if Cardcom is down. Then the
 * original method is reversed. Then bookkeeping closes.
 *
 *   pending -> wallet_credited -> method_reversed -> completed
 *
 * Cardcom does not sign callbacks. Authenticity is the unguessable `?s=`
 * compared with `secretEquals` (every accepted secret, no short circuit) plus
 * a server-to-server GetLpResult. The callback body's Amount is never trusted.
 */

export const REFUND_EXECUTION_STATES = [
  'pending',
  'wallet_credited',
  'method_reversed',
  'completed',
] as const

export type RefundExecutionState = (typeof REFUND_EXECUTION_STATES)[number]

export const REFUND_EVENTS = ['CREDIT_WALLET', 'REVERSE_METHOD', 'COMPLETE'] as const

export type RefundEvent = (typeof REFUND_EVENTS)[number]

/** Ledger reason written through `fn_wallet_transfer` for a refund credit. */
export const REFUND_WALLET_REASON = 'order_refund' as const

export type RefundErrorCode =
  | 'ILLEGAL_TRANSITION'
  | 'WALLET_TRANSFER_FAILED'
  | 'PROVIDER_REVERSE_FAILED'

export class RefundTransitionError extends Error {
  readonly code: RefundErrorCode
  readonly from: RefundExecutionState
  readonly event: RefundEvent

  constructor(
    code: RefundErrorCode,
    from: RefundExecutionState,
    event: RefundEvent,
    detail?: string,
  ) {
    super(
      detail === undefined
        ? `${code}: ${event} from ${from}`
        : `${code}: ${event} from ${from}: ${detail}`,
    )
    this.name = 'RefundTransitionError'
    this.code = code
    this.from = from
    this.event = event
  }
}

const TRANSITIONS: Readonly<
  Record<RefundExecutionState, Partial<Record<RefundEvent, RefundExecutionState>>>
> = {
  pending: { CREDIT_WALLET: 'wallet_credited' },
  wallet_credited: { REVERSE_METHOD: 'method_reversed' },
  method_reversed: { COMPLETE: 'completed' },
  completed: {},
}

export function canTransitionRefund(from: RefundExecutionState, event: RefundEvent): boolean {
  return TRANSITIONS[from][event] !== undefined
}

export function transitionRefund(
  from: RefundExecutionState,
  event: RefundEvent,
): RefundExecutionState {
  const next = TRANSITIONS[from][event]
  if (next === undefined) {
    throw new RefundTransitionError('ILLEGAL_TRANSITION', from, event)
  }
  return next
}

/**
 * Cardcom Low Profile `Operation` values that are a refund, not a charge.
 *
 * Compared case-insensitively. `ChargeOnly` / `ChargeAndCreateToken` stay on
 * the charge webhook path.
 */
export function isRefundOperation(operation: string | null | undefined): boolean {
  if (typeof operation !== 'string') return false
  const normalized = operation.trim().toLowerCase()
  return normalized === 'refund' || normalized === 'credit' || normalized === 'cancelonly'
}

/**
 * True when the callback presents the current secret OR the one being retired.
 *
 * Both are checked, always. Bailing early would make the response time say
 * which secret was presented.
 */
export function webhookSecretsMatch(provided: string, accepted: readonly string[]): boolean {
  let matched = false
  for (const secret of accepted) {
    if (secretEquals(provided, secret)) matched = true
  }
  return matched
}

export function refundWalletIdempotencyKey(orderId: string): string {
  return `refund:${orderId}:wallet`
}

export type RefundExecution = {
  id: string
  orderId: string
  paymentId: string | null
  chargeTransactionId: string
  refundTransactionId: string | null
  walletEntryId: string | null
  state: RefundExecutionState
  amountAgorot: number
  cancelOnly: boolean
  idempotencyKey: string
  lowProfileId: string | null
  walletCreditedAt: string | null
  methodReversedAt: string | null
  completedAt: string | null
}

export type RefundExecutionRow = {
  id: string
  order_id: string
  payment_id: string | null
  charge_transaction_id: string
  refund_transaction_id: string | null
  wallet_entry_id: string | null
  state: RefundExecutionState
  amount_agorot: number
  cancel_only: boolean
  idempotency_key: string
  low_profile_id: string | null
  wallet_credited_at: string | null
  method_reversed_at: string | null
  completed_at: string | null
}

export function refundExecutionFromRow(row: RefundExecutionRow): RefundExecution {
  return {
    id: row.id,
    orderId: row.order_id,
    paymentId: row.payment_id,
    chargeTransactionId: row.charge_transaction_id,
    refundTransactionId: row.refund_transaction_id,
    walletEntryId: row.wallet_entry_id,
    state: row.state,
    amountAgorot: row.amount_agorot,
    cancelOnly: row.cancel_only,
    idempotencyKey: row.idempotency_key,
    lowProfileId: row.low_profile_id,
    walletCreditedAt: row.wallet_credited_at,
    methodReversedAt: row.method_reversed_at,
    completedAt: row.completed_at,
  }
}

export function refundExecutionToPatch(execution: RefundExecution): {
  state: RefundExecutionState
  refund_transaction_id: string | null
  wallet_entry_id: string | null
  wallet_credited_at: string | null
  method_reversed_at: string | null
  completed_at: string | null
} {
  return {
    state: execution.state,
    refund_transaction_id: execution.refundTransactionId,
    wallet_entry_id: execution.walletEntryId,
    wallet_credited_at: execution.walletCreditedAt,
    method_reversed_at: execution.methodReversedAt,
    completed_at: execution.completedAt,
  }
}

export type RefundWalletTransferPort = (input: {
  orderId: string
  amountAgorot: number
  idempotencyKey: string
  reason: typeof REFUND_WALLET_REASON
}) => Promise<{ walletEntryId: string }>

export type RefundMethodReversePort = (input: {
  transactionId: string
  amountAgorot: ReturnType<typeof agorot>
  cancelOnly: boolean
  description: string
}) => Promise<RefundResult>

export type RefundHandlerPorts = {
  transferWallet: RefundWalletTransferPort
  refundByTransactionId: RefundMethodReversePort
  now: Date
}

function stamp(
  execution: RefundExecution,
  next: RefundExecutionState,
  now: Date,
  extra: Partial<RefundExecution>,
): RefundExecution {
  const iso = now.toISOString()
  return {
    ...execution,
    ...extra,
    state: next,
    walletCreditedAt: next === 'wallet_credited' ? iso : execution.walletCreditedAt,
    methodReversedAt: next === 'method_reversed' ? iso : execution.methodReversedAt,
    completedAt: next === 'completed' ? iso : execution.completedAt,
  }
}

export async function creditRefundWallet(
  execution: RefundExecution,
  ports: Pick<RefundHandlerPorts, 'transferWallet' | 'now'>,
): Promise<RefundExecution> {
  const next = transitionRefund(execution.state, 'CREDIT_WALLET')
  try {
    const { walletEntryId } = await ports.transferWallet({
      orderId: execution.orderId,
      amountAgorot: execution.amountAgorot,
      idempotencyKey: refundWalletIdempotencyKey(execution.orderId),
      reason: REFUND_WALLET_REASON,
    })
    return stamp(execution, next, ports.now, { walletEntryId })
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : 'wallet transfer failed'
    throw new RefundTransitionError(
      'WALLET_TRANSFER_FAILED',
      execution.state,
      'CREDIT_WALLET',
      detail,
    )
  }
}

export async function reverseRefundMethod(
  execution: RefundExecution,
  ports: Pick<RefundHandlerPorts, 'refundByTransactionId' | 'now'>,
): Promise<RefundExecution> {
  const next = transitionRefund(execution.state, 'REVERSE_METHOD')
  let result: RefundResult
  try {
    result = await ports.refundByTransactionId({
      transactionId: execution.chargeTransactionId,
      amountAgorot: agorot(execution.amountAgorot),
      cancelOnly: execution.cancelOnly,
      description: `refund:${execution.orderId}`,
    })
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : 'provider reverse failed'
    throw new RefundTransitionError(
      'PROVIDER_REVERSE_FAILED',
      execution.state,
      'REVERSE_METHOD',
      detail,
    )
  }
  if (!result.success) {
    throw new RefundTransitionError(
      'PROVIDER_REVERSE_FAILED',
      execution.state,
      'REVERSE_METHOD',
      result.failureMessage ?? 'provider reverse failed',
    )
  }
  return stamp(execution, next, ports.now, {
    refundTransactionId: result.refundTransactionId,
  })
}

export function completeRefundExecution(
  execution: RefundExecution,
  ports: Pick<RefundHandlerPorts, 'now'>,
): RefundExecution {
  const next = transitionRefund(execution.state, 'COMPLETE')
  return stamp(execution, next, ports.now, {})
}

export async function applyRefundEvent(
  execution: RefundExecution,
  event: RefundEvent,
  ports: RefundHandlerPorts,
): Promise<RefundExecution> {
  switch (event) {
    case 'CREDIT_WALLET':
      return creditRefundWallet(execution, ports)
    case 'REVERSE_METHOD':
      return reverseRefundMethod(execution, ports)
    case 'COMPLETE':
      return completeRefundExecution(execution, ports)
  }
}

export type RefundWebhookFailureCode =
  | 'SECRET_INVALID'
  | 'NOT_REFUND_OPERATION'
  | 'VERIFY_FAILED'
  | 'AMOUNT_MISMATCH'
  | 'WALLET_NOT_CREDITED'

export type RefundWebhookResult =
  | { ok: true; replay: boolean; execution: RefundExecution }
  | { ok: false; code: RefundWebhookFailureCode; execution: RefundExecution }

export type RefundWebhookInput = {
  providedSecret: string
  acceptedSecrets: readonly string[]
  operation: string | null | undefined
  lowProfileId: string
  execution: RefundExecution
  verifyLowProfile: (lowProfileId: string) => Promise<VerifyLowProfileResult>
  now: Date
}

/**
 * Authenticated refund callback. Does not read the POST Amount.
 *
 * Wallet must already be credited. A callback that arrives while the execution
 * is still `pending` is refused so we never reverse the card before the
 * customer has the wallet credit. Replays from `method_reversed` / `completed`
 * are  success no-ops after GetLpResult still agrees.
 */
export async function handleRefundWebhook(input: RefundWebhookInput): Promise<RefundWebhookResult> {
  if (!webhookSecretsMatch(input.providedSecret, input.acceptedSecrets)) {
    return { ok: false, code: 'SECRET_INVALID', execution: input.execution }
  }
  if (!isRefundOperation(input.operation)) {
    return { ok: false, code: 'NOT_REFUND_OPERATION', execution: input.execution }
  }

  let verified: VerifyLowProfileResult
  try {
    verified = await input.verifyLowProfile(input.lowProfileId)
  } catch {
    return { ok: false, code: 'VERIFY_FAILED', execution: input.execution }
  }
  if (!verified.success || verified.amountAgorot === null) {
    return { ok: false, code: 'VERIFY_FAILED', execution: input.execution }
  }
  if (verified.amountAgorot !== input.execution.amountAgorot) {
    return { ok: false, code: 'AMOUNT_MISMATCH', execution: input.execution }
  }

  if (input.execution.state === 'pending') {
    return { ok: false, code: 'WALLET_NOT_CREDITED', execution: input.execution }
  }
  if (input.execution.state === 'method_reversed' || input.execution.state === 'completed') {
    return { ok: true, replay: true, execution: input.execution }
  }

  const reversed = stamp(
    input.execution,
    transitionRefund(input.execution.state, 'REVERSE_METHOD'),
    input.now,
    { refundTransactionId: verified.transactionId ?? input.execution.refundTransactionId },
  )
  return {
    ok: true,
    replay: false,
    execution: completeRefundExecution(reversed, { now: input.now }),
  }
}
