import { type Agorot, agorot, agorotToIls } from '@/lib/commerce/money'
import type { RefundGround, RefundState } from '@/server/payments/refund-record'

/**
 * The wallet refund, as a state machine over the states production actually has.
 *
 * WHY THE NAMES ARE NOT THE ONES IN THE BRIEF. The brief asks for
 * `pending -> authorized -> wallet_credited -> completed`. Production's
 * `refund_state` enum is `requested, approved, rejected, executing, completed,
 * failed`, applied in migration 131. Introducing a second vocabulary would mean
 * two spellings of one concept in one money path, and the database would refuse
 * to store three of the four brief names anyway (22P02 on the enum).
 *
 * So the brief's flow is expressed in the deployed vocabulary:
 *
 *   brief             here          meaning
 *   pending           requested     the notice exists; the 14-day clock starts
 *   authorized        approved      an admin decided it is owed
 *   wallet_credited   executing     fn_wallet_transfer has moved the money
 *   completed         completed     nothing further is owed
 *
 * `rejected` and `failed` are in the enum and not in the brief. They are kept,
 * because a money state machine without a failure path is not a state machine:
 * a refund that is refused and a refund whose credit threw are different
 * outcomes and both have to be recordable.
 *
 * WHY THIS FILE HOLDS NO DATABASE CALLS. Same split as `planOrderRefund`: the
 * decision is pure and testable, the IO lives in the action. Every transition
 * here is a fact about the machine, not about a connection.
 */

/** The brief's names, kept as an alias so its language still resolves in code. */
export const BRIEF_STATE_ALIASES = {
  pending: 'requested',
  authorized: 'approved',
  wallet_credited: 'executing',
  completed: 'completed',
} as const satisfies Record<string, RefundState>

/**
 * Legal moves. A wallet refund never touches a card, so there is no provider
 * round trip between `approved` and `executing` -- the credit is a database
 * transfer and either commits or does not.
 */
export const WALLET_REFUND_TRANSITIONS: Readonly<Record<RefundState, readonly RefundState[]>> = {
  requested: ['approved', 'rejected'],
  approved: ['executing', 'rejected'],
  executing: ['completed', 'failed'],
  // Terminal. A rejected or failed refund is reopened by filing a new one, not
  // by moving this row: the first attempt is part of the record.
  completed: [],
  rejected: [],
  failed: [],
}

export function isLegalWalletRefundTransition(from: RefundState, to: RefundState): boolean {
  if (from === to) return true
  return (WALLET_REFUND_TRANSITIONS[from] ?? []).includes(to)
}

export function terminalWalletRefundStates(): readonly RefundState[] {
  return (Object.keys(WALLET_REFUND_TRANSITIONS) as RefundState[]).filter(
    (s) => WALLET_REFUND_TRANSITIONS[s].length === 0,
  )
}

export type WalletRefundRefusal =
  | 'guest_order_has_no_wallet'
  | 'amount_not_positive'
  | 'fee_on_wallet_refund'
  | 'illegal_transition'

export type WalletCreditPlan =
  | {
      ok: true
      /** What to credit, in agorot. The ledger call takes shekels; see `amountIls`. */
      amountAgorot: Agorot
      /**
       * `fn_wallet_transfer` takes `p_amount_ils numeric`, so the conversion has
       * to happen somewhere. It happens HERE, once, through the money module,
       * rather than at the call site where it would be one more place for a
       * float to appear in the money path.
       */
      amountIls: number
      /** Stable across replays, so a retried refund cannot credit twice. */
      idempotencyKey: string
      nextState: RefundState
    }
  | { ok: false; reason: WalletRefusal }

type WalletRefusal = WalletRefundRefusal

export interface WalletCreditInput {
  orderId: string
  /** Null for a guest order, which has no wallet to credit. */
  userId: string | null
  refundAmountAgorot: number
  cancellationFeeAgorot: number
  fromState: RefundState
}

/**
 * Pure decision: may this wallet credit be made, and for how much?
 *
 * A WALLET REFUND CARRIES NO CANCELLATION FEE, and this refuses rather than
 * silently zeroing one. The fee is a deduction from money being returned to a
 * payment instrument; a goodwill credit that quietly withheld 5% would be a
 * worse product than refusing. Migration 148 says the same thing as a CHECK
 * (`refunds_wallet_has_no_fee`), and a caller that disagreed with the database
 * should find out here rather than at the INSERT.
 */
export function planWalletCredit(input: WalletCreditInput): WalletCreditPlan {
  // A guest has no wallet. Crediting one would mean inventing an account for
  // someone who never had one, and the money would be unreachable.
  if (!input.userId) return { ok: false, reason: 'guest_order_has_no_wallet' }

  if (!Number.isInteger(input.refundAmountAgorot) || input.refundAmountAgorot <= 0) {
    return { ok: false, reason: 'amount_not_positive' }
  }

  if (input.cancellationFeeAgorot !== 0) return { ok: false, reason: 'fee_on_wallet_refund' }

  if (!isLegalWalletRefundTransition(input.fromState, 'executing')) {
    return { ok: false, reason: 'illegal_transition' }
  }

  const amountAgorot = agorot(input.refundAmountAgorot)
  return {
    ok: true,
    amountAgorot,
    amountIls: agorotToIls(amountAgorot),
    // Derived from the order, not from a clock or a random: a replayed refund
    // produces the same key, and `fn_wallet_transfer` refuses the second one.
    idempotencyKey: `refund:${input.orderId}:wallet`,
    nextState: 'executing',
  }
}

/**
 * The ground a wallet refund is filed under.
 *
 * A wallet credit is the instrument for value that was already consumed -- a
 * voucher redeemed at the counter, or one that expired -- where pulling the card
 * money back would return value the customer received. That is `goodwill`, not
 * `distance_sale_14d`, and the distinction is not cosmetic: 131 forbids a fee on
 * `defect` and `duplicate_charge`, and a `goodwill` refund carries no fee here
 * either.
 */
export function walletRefundGround(input: { isDefectClaim?: boolean }): RefundGround {
  return input.isDefectClaim ? 'defect' : 'goodwill'
}
