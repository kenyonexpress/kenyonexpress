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
  it('matches the full physical transition matrix', () => {
    for (const from of SETTLEMENT_STATES) {
      for (const event of SETTLEMENT_EVENTS) {
        const expected = PHYSICAL_TABLE[from][event]
        expect(canTransition(from, event, 'physical'), `physical ${from} + ${event}`).toBe(
          expected !== undefined,
        )
        if (expected !== undefined) {
          expect(transition(from, event, 'physical')).toBe(expected)
        }
      }
    }
  })

  it('matches the full coupon transition matrix', () => {
    for (const from of SETTLEMENT_STATES) {
      for (const event of SETTLEMENT_EVENTS) {
        const expected = COUPON_TABLE[from][event]
        expect(canTransition(from, event, 'coupon'), `coupon ${from} + ${event}`).toBe(
          expected !== undefined,
        )
        if (expected !== undefined) {
          expect(transition(from, event, 'coupon')).toBe(expected)
        }
      }
    }
  })

  it('walks the physical happy path', () => {
    let state: SettlementState = 'pending'
    state = transition(state, 'PAYMENT_CONFIRMED', 'physical')
    state = transition(state, 'EXECUTE_SPLIT', 'physical')
    expect(state).toBe('split_executed')
    expect(isTerminal(state)).toBe(false) // refund window still open
    expect(isSettled(state)).toBe(true)
  })

  it('settles a coupon line the moment it is paid: nothing is deferred', () => {
    let state: SettlementState = 'pending'
    state = transition(state, 'PAYMENT_CONFIRMED', 'coupon')
    state = transition(state, 'EXECUTE_SPLIT', 'coupon')
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
    for (const type of ['coupon', 'physical'] as const) {
      expect(transition('paid', 'EXECUTE_SPLIT', type)).toBe('split_executed')
    }
  })

  it('throws ILLEGAL_TRANSITION for consumed-value refunds', () => {
    try {
      transition('redeemed', 'REFUND', 'coupon')
      expect.unreachable('refund from redeemed must throw')
    } catch (error) {
      expect((error as SettlementTransitionError).code).toBe('ILLEGAL_TRANSITION')
    }
  })

  it('lets a held line be refunded while its vouchers are still outstanding', () => {
    expect(transition('split_executed', 'REFUND', 'coupon')).toBe('refunded')
  })

  it('has no escrow state left to reach', () => {
    // The regression guard: every reachable state must be one of the six the
    // model still has. An escrow_held or platform_settled slipping back in
    // would mean a coupon line deferring money to a supplier again.
    for (const from of SETTLEMENT_STATES) {
      for (const event of SETTLEMENT_EVENTS) {
        for (const type of ['coupon', 'physical'] as const) {
          if (!canTransition(from, event, type)) continue
          expect(SETTLEMENT_STATES).toContain(transition(from, event, type))
        }
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

describe('deriveOrderStatus rolls lines up to an order', () => {
  it('calls an order with no lines pending', () => {
    // Not an error and not settled: an order mid-creation has no lines yet, and
    // the rollup is read before the first one is written.
    expect(deriveOrderStatus([])).toBe('pending')
  })

  it('reports the least-advanced active line, not the most advanced', () => {
    // The order is only as far along as its slowest line. Reading the furthest
    // one would call an order paid while part of it had not been charged.
    expect(deriveOrderStatus(['pending', 'paid', 'split_executed'])).toBe('pending')
    expect(deriveOrderStatus(['paid', 'split_executed'])).toBe('paid')
    expect(deriveOrderStatus(['redeemed', 'split_executed'])).toBe('redeemed')
  })

  it('ranks pending over paid over redeemed', () => {
    // Pins the order of the three guards against each other. Swapping any two
    // changes what a mixed order reports, and each is checked here against a
    // state that would win under the wrong ordering.
    expect(deriveOrderStatus(['paid', 'pending'])).toBe('pending')
    expect(deriveOrderStatus(['redeemed', 'pending'])).toBe('pending')
    expect(deriveOrderStatus(['redeemed', 'paid'])).toBe('paid')
  })

  it('settles to cancelled only when every line was cancelled', () => {
    expect(deriveOrderStatus(['cancelled', 'cancelled'])).toBe('cancelled')
    // One refund among cancellations is a refunded order: money moved back.
    expect(deriveOrderStatus(['cancelled', 'refunded'])).toBe('refunded')
  })

  it('settles to refunded when every line was refunded or cancelled', () => {
    expect(deriveOrderStatus(['refunded'])).toBe('refunded')
    expect(deriveOrderStatus(['refunded', 'refunded'])).toBe('refunded')
  })

  it('settles to split_executed when any line kept its money', () => {
    expect(deriveOrderStatus(['split_executed'])).toBe('split_executed')
    // A partial refund leaves the order split_executed: the platform still
    // earned on the line that was not refunded, so calling the whole order
    // refunded would overstate what went back to the card.
    expect(deriveOrderStatus(['split_executed', 'refunded'])).toBe('split_executed')
    expect(deriveOrderStatus(['split_executed', 'cancelled'])).toBe('split_executed')
  })

  it('returns a state this machine knows, for every combination of line states', () => {
    // The guard against a seventh state sneaking in through the rollup: every
    // pair of line states must derive to something SETTLEMENT_STATES contains.
    for (const a of SETTLEMENT_STATES) {
      for (const b of SETTLEMENT_STATES) {
        expect(SETTLEMENT_STATES, `${a} + ${b}`).toContain(deriveOrderStatus([a, b]))
      }
    }
  })
})
