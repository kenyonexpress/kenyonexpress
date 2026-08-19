import { describe, expect, it } from 'vitest'
import {
  SETTLEMENT_EVENTS,
  SETTLEMENT_STATES,
  type SettlementEvent,
  type SettlementState,
  type SettlementTransitionError,
  canTransition,
  deriveOrderStatus,
  isSettled,
  isTerminal,
  transition,
} from './state-machine'

type Expected = Partial<Record<SettlementEvent, SettlementState>>

const PHYSICAL_TABLE: Record<SettlementState, Expected> = {
  pending: { PAYMENT_CONFIRMED: 'paid', CANCEL: 'cancelled' },
  paid: { EXECUTE_SPLIT: 'split_executed', REFUND: 'refunded' },
  split_executed: { REFUND: 'refunded' },
  redeemed: {},
  refunded: {},
  cancelled: {},
}

const COUPON_TABLE: Record<SettlementState, Expected> = {
  pending: { PAYMENT_CONFIRMED: 'paid', CANCEL: 'cancelled' },
  paid: { EXECUTE_SPLIT: 'split_executed', REFUND: 'refunded' },
  redeemed: {},
  split_executed: { REFUND: 'refunded' },
  refunded: {},
  cancelled: {},
}

describe('settlement state machine (the coupon prepayment stays with the platform)', () => {
  it('is the same machine for both product types', () => {
    // The two tables are kept apart on purpose. C11(a) gave coupon lines their
    // own path; C11(b) removed it, and the machine dropped the productType
    // argument with it. This is what asserts the merge really happened: the day
    // someone needs a type-exclusive move again, this fails first and they add
    // the discriminator back deliberately rather than by accident.
    expect(COUPON_TABLE).toEqual(PHYSICAL_TABLE)
  })

  it('matches the full transition matrix', () => {
    for (const from of SETTLEMENT_STATES) {
      for (const event of SETTLEMENT_EVENTS) {
        const expected = PHYSICAL_TABLE[from][event]
        expect(canTransition(from, event), `${from} + ${event}`).toBe(expected !== undefined)
        if (expected !== undefined) {
          expect(transition(from, event)).toBe(expected)
        }
      }
    }
  })

  it('walks the physical happy path', () => {
    let state: SettlementState = 'pending'
    state = transition(state, 'PAYMENT_CONFIRMED')
    state = transition(state, 'EXECUTE_SPLIT')
    expect(state).toBe('split_executed')
    expect(isTerminal(state)).toBe(false) // refund window still open
    expect(isSettled(state)).toBe(true)
  })

  it('settles a coupon line the moment it is paid: nothing is deferred', () => {
    let state: SettlementState = 'pending'
    state = transition(state, 'PAYMENT_CONFIRMED')
    state = transition(state, 'EXECUTE_SPLIT')
    expect(state).toBe('split_executed')
    // The whole prepayment is platform revenue at paid-time, so the line is
    // settled immediately. Refund is the only way out.
    expect(isSettled(state)).toBe(true)
    expect(isTerminal(state)).toBe(false)
  })

  it('lets both product types take the same split leg', () => {
    // Nothing is type-exclusive any more: a physical line splits by the
    // per-product percent and a coupon splits 100/0, but both land in
    // split_executed through the same event.
    expect(transition('paid', 'EXECUTE_SPLIT')).toBe('split_executed')
  })

  it('throws ILLEGAL_TRANSITION for consumed-value refunds', () => {
    try {
      transition('redeemed', 'REFUND')
      expect.unreachable('refund from redeemed must throw')
    } catch (error) {
      expect((error as SettlementTransitionError).code).toBe('ILLEGAL_TRANSITION')
    }
  })

  it('lets a held line be refunded while its vouchers are still outstanding', () => {
    expect(transition('split_executed', 'REFUND')).toBe('refunded')
  })

  it('has no escrow state left to reach', () => {
    // The regression guard: every reachable state must be one of the six the
    // model still has. An escrow_held or platform_settled slipping back in
    // would mean a coupon line deferring money to a supplier again.
    for (const from of SETTLEMENT_STATES) {
      for (const event of SETTLEMENT_EVENTS) {
        if (!canTransition(from, event)) continue
        expect(SETTLEMENT_STATES).toContain(transition(from, event))
      }
    }
    expect(SETTLEMENT_STATES).toHaveLength(6)
  })
})

describe('isSettled covers every state where the platform owes nobody', () => {
  // This block arrived from feat/ci-foundation naming `escrow_released` and
  // `escrow_held`, two states the model no longer has: the branch was cut on
  // 2026-07-27, before the no-escrow rule removed them. Left as written it did
  // not fail as a wrong assertion, it failed as a type error, which is a
  // coverage test that never ran. Rewritten against the six states that exist.
  //
  // These arms decide whether a line still shows up in the payout run. A false
  // negative pays a supplier twice, a false positive strands the money.
  it('reports the split, refund and cancellation outcomes as settled', () => {
    for (const state of ['split_executed', 'refunded', 'cancelled'] as const) {
      expect(isSettled(state), `${state} should be settled`).toBe(true)
    }
  })

  it('reports every state with money still in flight as unsettled', () => {
    for (const state of ['pending', 'paid', 'redeemed'] as const) {
      expect(isSettled(state), `${state} should not be settled`).toBe(false)
    }
  })

  it('classifies all six states and invents no seventh', () => {
    // The guard that makes the two lists above exhaustive rather than a
    // sample: adding a state without deciding its payout side fails here.
    const settled = SETTLEMENT_STATES.filter(isSettled)
    expect(settled).toEqual(['split_executed', 'refunded', 'cancelled'])
    expect(SETTLEMENT_STATES).toHaveLength(6)
  })
})

describe('deriveOrderStatus rolls lines up without inventing an outcome', () => {
  // Three production call sites read this and nothing tested it: the order
  // header in queries/orders.ts (twice) and the refund planner's projected
  // orderStatus. What it decides is what the customer is told their order is.

  it('calls an order with no lines pending, not settled', () => {
    // An order mid-write has no items yet. Falling through to the settled
    // branches below would report split_executed for an order nobody paid.
    expect(deriveOrderStatus([])).toBe('pending')
  })

  it('shows the least-advanced active line, in order', () => {
    expect(deriveOrderStatus(['split_executed', 'pending'])).toBe('pending')
    expect(deriveOrderStatus(['split_executed', 'paid'])).toBe('paid')
    expect(deriveOrderStatus(['split_executed', 'redeemed'])).toBe('redeemed')
  })

  it('prefers pending over paid, and paid over redeemed', () => {
    expect(deriveOrderStatus(['redeemed', 'paid', 'pending'])).toBe('pending')
    expect(deriveOrderStatus(['redeemed', 'paid'])).toBe('paid')
  })

  it('reports a wholly cancelled order as cancelled, not refunded', () => {
    // Nothing was ever charged, so there is no money to report as returned.
    expect(deriveOrderStatus(['cancelled', 'cancelled'])).toBe('cancelled')
  })

  it('reports refunded when refunds and cancellations are mixed', () => {
    expect(deriveOrderStatus(['refunded', 'cancelled'])).toBe('refunded')
    expect(deriveOrderStatus(['refunded', 'refunded'])).toBe('refunded')
  })

  it('falls through to split_executed only when a line actually split', () => {
    expect(deriveOrderStatus(['split_executed'])).toBe('split_executed')
    expect(deriveOrderStatus(['split_executed', 'refunded'])).toBe('split_executed')
    expect(deriveOrderStatus(['split_executed', 'cancelled'])).toBe('split_executed')
  })

  it('returns a state the enum actually has, for every settled combination', () => {
    const settledOnly: SettlementState[] = ['split_executed', 'refunded', 'cancelled']
    for (const a of settledOnly) {
      for (const b of settledOnly) {
        expect(SETTLEMENT_STATES).toContain(deriveOrderStatus([a, b]))
      }
    }
  })
})
