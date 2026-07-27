import { describe, expect, it } from 'vitest'
import {
  SETTLEMENT_EVENTS,
  SETTLEMENT_STATES,
  type SettlementEvent,
  type SettlementState,
  SettlementTransitionError,
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
  platform_settled: { REFUND: 'refunded' },
  escrow_held: { REFUND: 'refunded' },
  redeemed: {},
  escrow_released: {},
  refunded: {},
  cancelled: {},
}

const COUPON_TABLE: Record<SettlementState, Expected> = {
  pending: { PAYMENT_CONFIRMED: 'paid', CANCEL: 'cancelled' },
  paid: { HOLD_ESCROW: 'escrow_held', REFUND: 'refunded' },
  escrow_held: { RELEASE_ESCROW: 'escrow_released', REFUND: 'refunded' },
  platform_settled: { REFUND: 'refunded' },
  redeemed: {},
  split_executed: { REFUND: 'refunded' },
  escrow_released: {},
  refunded: {},
  cancelled: {},
}

describe('settlement state machine (C11 version b: the coupon prepayment is held)', () => {
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

  it('walks the coupon happy path: held at paid-time, released at the scan', () => {
    let state: SettlementState = 'pending'
    state = transition(state, 'PAYMENT_CONFIRMED', 'coupon')
    state = transition(state, 'HOLD_ESCROW', 'coupon')
    expect(state).toBe('escrow_held')
    // The supplier's share is not settled while it is held, and the customer
    // can still be refunded, so this is neither terminal nor settled.
    expect(isSettled(state)).toBe(false)
    expect(isTerminal(state)).toBe(false)

    state = transition(state, 'RELEASE_ESCROW', 'coupon')
    expect(state).toBe('escrow_released')
    expect(isSettled(state)).toBe(true)
    expect(isTerminal(state)).toBe(true) // value consumed at the business
  })

  it('throws WRONG_PRODUCT_TYPE when a line tries the other type leg', () => {
    for (const [from, event, wrongType] of [
      ['paid', 'HOLD_ESCROW', 'physical'],
      ['paid', 'EXECUTE_SPLIT', 'coupon'],
      ['escrow_held', 'RELEASE_ESCROW', 'physical'],
    ] as const) {
      expect(() => transition(from, event, wrongType)).toThrowError(SettlementTransitionError)
      try {
        transition(from, event, wrongType)
      } catch (error) {
        expect((error as SettlementTransitionError).code).toBe('WRONG_PRODUCT_TYPE')
      }
    }
  })

  it('throws ILLEGAL_TRANSITION for consumed-value refunds (legacy states included)', () => {
    for (const from of ['redeemed', 'escrow_released'] as const) {
      try {
        transition(from, 'REFUND', 'coupon')
        expect.unreachable(`refund from ${from} must throw`)
      } catch (error) {
        expect((error as SettlementTransitionError).code).toBe('ILLEGAL_TRANSITION')
      }
    }
  })

  it('lets a held line be refunded while its vouchers are still outstanding', () => {
    expect(transition('escrow_held', 'REFUND', 'coupon')).toBe('refunded')
  })

  it('has no event leading into platform_settled: the C11(a) state is exit-only', () => {
    for (const from of SETTLEMENT_STATES) {
      for (const event of SETTLEMENT_EVENTS) {
        for (const type of ['coupon', 'physical'] as const) {
          if (!canTransition(from, event, type)) continue
          expect(
            transition(from, event, type),
            `${from} + ${event} (${type}) must not reach platform_settled`,
          ).not.toBe('platform_settled')
        }
      }
    }
    // Exit-only, not unreachable-and-stuck: a legacy row can still be unwound.
    expect(transition('platform_settled', 'REFUND', 'coupon')).toBe('refunded')
  })

  it('keeps refunded and cancelled terminal', () => {
    for (const from of ['refunded', 'cancelled'] as const) {
      expect(isTerminal(from)).toBe(true)
      for (const event of SETTLEMENT_EVENTS) {
        expect(canTransition(from, event, 'coupon')).toBe(false)
        expect(canTransition(from, event, 'physical')).toBe(false)
      }
    }
  })
})

describe('deriveOrderStatus', () => {
  it('is pending for empty or any-pending orders', () => {
    expect(deriveOrderStatus([])).toBe('pending')
    expect(deriveOrderStatus(['pending', 'platform_settled'])).toBe('pending')
  })

  it('shows the least-advanced active line', () => {
    expect(deriveOrderStatus(['paid', 'split_executed'])).toBe('paid')
    expect(deriveOrderStatus(['escrow_held', 'split_executed'])).toBe('escrow_held')
    expect(deriveOrderStatus(['redeemed', 'split_executed'])).toBe('redeemed')
  })

  it('resolves fully-settled orders', () => {
    expect(deriveOrderStatus(['cancelled', 'cancelled'])).toBe('cancelled')
    expect(deriveOrderStatus(['refunded', 'cancelled'])).toBe('refunded')
    expect(deriveOrderStatus(['split_executed', 'refunded'])).toBe('split_executed')
    expect(deriveOrderStatus(['platform_settled', 'split_executed'])).toBe('platform_settled')
    expect(deriveOrderStatus(['escrow_released', 'platform_settled'])).toBe('escrow_released')
  })
})
