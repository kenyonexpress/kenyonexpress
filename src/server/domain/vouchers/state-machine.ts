/**
 * Voucher lifecycle. Authoritative document: ARCHITECTURE-VOUCHER-REDEMPTION.md
 *
 * Business model: the customer pays an absolute coupon_price online, the
 * business collects the balance at the counter on scan, and the platform keeps
 * everything it charged (platform_percent 100). There is no escrow and no
 * payout, so once a voucher leaves `issued` there is nothing left to move: the
 * value was consumed at the business or the money went back to the customer.
 *
 * That is why every non-issued state is terminal. This table is mirrored by the
 * predicates in supabase/migrations/051_voucher_redemption.sql; the SQL is the
 * arbiter under concurrency, this module is the arbiter of what is legal.
 */

export type VoucherState = 'issued' | 'redeemed' | 'expired' | 'cancelled' | 'refunded'

export type VoucherEvent = 'REDEEM' | 'EXPIRE' | 'CANCEL' | 'REFUND'

export const VOUCHER_STATES: readonly VoucherState[] = [
  'issued',
  'redeemed',
  'expired',
  'cancelled',
  'refunded',
]

export const VOUCHER_EVENTS: readonly VoucherEvent[] = ['REDEEM', 'EXPIRE', 'CANCEL', 'REFUND']

/** States from which no event is legal. */
export const TERMINAL_VOUCHER_STATES: readonly VoucherState[] = [
  'redeemed',
  'expired',
  'cancelled',
  'refunded',
]

export type VoucherGuardContext = {
  /** Supplier the voucher was sold against. */
  supplierId: string
  /** Supplier of the member performing the event, if any. */
  actingSupplierId?: string | null
  expiresAt: Date
  now: Date
}

type TransitionRule = {
  to: VoucherState
  /**
   * Extra condition beyond the from-state. Returning a code instead of a
   * boolean keeps the reason for the refusal in one place.
   */
  guard?: (context: VoucherGuardContext) => VoucherGuardFailure | null
}

export type VoucherGuardFailure = 'WRONG_SUPPLIER' | 'PAST_EXPIRY' | 'NOT_YET_EXPIRED'

/**
 * The single source of truth for legal transitions.
 *
 * REDEEM is legal only from `issued`, only for the voucher's own supplier and
 * only before expiry. CANCEL and REFUND are legal only before a scan: after
 * redemption the customer already consumed the value at the business and the
 * platform cannot un-consume it. A post-redemption goodwill refund is a wallet
 * credit, which is a different money movement and does not touch this row.
 */
const TRANSITIONS: Readonly<Record<VoucherState, Partial<Record<VoucherEvent, TransitionRule>>>> = {
  issued: {
    REDEEM: {
      to: 'redeemed',
      guard: (context) => {
        if (context.actingSupplierId !== context.supplierId) return 'WRONG_SUPPLIER'
        if (context.now.getTime() >= context.expiresAt.getTime()) return 'PAST_EXPIRY'
        return null
      },
    },
    EXPIRE: {
      to: 'expired',
      guard: (context) =>
        context.now.getTime() < context.expiresAt.getTime() ? 'NOT_YET_EXPIRED' : null,
    },
    CANCEL: { to: 'cancelled' },
    REFUND: { to: 'refunded' },
  },
  redeemed: {},
  expired: {},
  cancelled: {},
  refunded: {},
}

export type VoucherTransitionErrorCode = 'ILLEGAL_TRANSITION' | VoucherGuardFailure

export class VoucherTransitionError extends Error {
  readonly code: VoucherTransitionErrorCode
  readonly from: VoucherState
  readonly event: VoucherEvent

  constructor(code: VoucherTransitionErrorCode, from: VoucherState, event: VoucherEvent) {
    super(`${code}: ${event} from ${from}`)
    this.name = 'VoucherTransitionError'
    this.code = code
    this.from = from
    this.event = event
  }
}

export function isTerminalVoucherState(state: VoucherState): boolean {
  return TERMINAL_VOUCHER_STATES.includes(state)
}

/** Legal target of an event, ignoring the runtime guards. */
export function nextVoucherState(from: VoucherState, event: VoucherEvent): VoucherState | null {
  return TRANSITIONS[from][event]?.to ?? null
}

/** Every event legal from a state, ignoring the runtime guards. */
export function legalVoucherEvents(from: VoucherState): VoucherEvent[] {
  return VOUCHER_EVENTS.filter((event) => TRANSITIONS[from][event] !== undefined)
}

export function canTransition(
  from: VoucherState,
  event: VoucherEvent,
  context?: VoucherGuardContext,
): boolean {
  const rule = TRANSITIONS[from][event]
  if (!rule) return false
  if (!rule.guard) return true
  // A guarded transition cannot be judged without a context; refusing is the
  // safe answer, since every guarded event here burns or voids money.
  if (!context) return false
  return rule.guard(context) === null
}

/** Applies an event, throwing VoucherTransitionError when illegal. */
export function transition(
  from: VoucherState,
  event: VoucherEvent,
  context?: VoucherGuardContext,
): VoucherState {
  const rule = TRANSITIONS[from][event]
  if (!rule) throw new VoucherTransitionError('ILLEGAL_TRANSITION', from, event)

  if (rule.guard) {
    if (!context) throw new VoucherTransitionError('ILLEGAL_TRANSITION', from, event)
    const failure = rule.guard(context)
    if (failure) throw new VoucherTransitionError(failure, from, event)
  }

  return rule.to
}
