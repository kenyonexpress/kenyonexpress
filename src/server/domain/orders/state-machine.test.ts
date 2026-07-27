import { describe, expect, it } from 'vitest'
import {
  SETTLEMENT_EVENTS,
  SETTLEMENT_STATES,
  type SettlementEvent,
  type SettlementState,
  type SettlementTransitionError,
  canTransition,
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
